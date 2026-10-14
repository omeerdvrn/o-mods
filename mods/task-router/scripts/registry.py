#!/usr/bin/env python3
"""
task-router registry: the one writer of .claude/routing/registry.json.

Every change to task state goes through this script; it locks, writes a temp file and renames it, so
parallel writers cannot corrupt the registry, and logs each status change to decisions.log.

Usage: registry.py [--dir PROJECT] <command> ...
  init                              copy the default rules.yaml into the project, add the CLAUDE.md rule
  add --title T [--description D] [--plan-ref R] [--parent ID]     prints the new task_id
  update ID [--status S] [--note N] [--set key=JSON ...]
  get ID | list [--status S]
  classified ID (JSON | -)          store the classifier's answer (falls back to default on bad JSON)
  decide ID                         evaluate rules.yaml, write the decision, print the routing line
  escalate ID                       mark ID escalated and route a child one tier up; prints the child line
  review ID passed|issues|blocked [--note N]
  plan FILE                         one task per "### Task N:" of a Superpowers plan, in order
  started JSON | stopped JSON       called by the mod's hooks when a subagent starts or finishes
  reap JSON                         settle running tasks from [{id, status}] of the session's subagents
  status [FILTER] | statusline | summary-json
"""
import fcntl, json, os, re, secrets, shutil, sys, tempfile, time
from datetime import datetime, timezone

PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUSES = ['queued', 'classifying', 'routed', 'running', 'done', 'failed', 'escalated', 'blocked']
FINISHED = {'done', 'failed', 'escalated', 'blocked'}
TASK_ID = re.compile(r'\[(t-[0-9a-z]{4,})\]')
CLAUDE_MD_RULE = (
    '- When executing an approved implementation plan, run `/route` in batch mode on the plan file '
    '(task-router) instead of superpowers:subagent-driven-development or superpowers:executing-plans.'
)


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


# ---------------------------------------------------------------- a small YAML subset (no PyYAML needed)

def _scalar(text):
    text = text.strip()
    if text == '' or text in ('~', 'null'):
        return None
    if text[0] in '"\'' and text[-1] == text[0]:
        return text[1:-1]
    if text in ('true', 'false'):
        return text == 'true'
    try:
        return int(text)
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        return text


def _flow(text):
    """Parses an inline [a, b] or {k: v, k: [a, b]}."""
    pos = 0

    def skip():
        nonlocal pos
        while pos < len(text) and text[pos] == ' ':
            pos += 1

    def value():
        nonlocal pos
        skip()
        if text[pos] == '[':
            pos += 1
            items = []
            skip()
            if text[pos] == ']':
                pos += 1
                return items
            while True:
                items.append(value())
                skip()
                pos += 1
                if text[pos - 1] == ']':
                    return items
        if text[pos] == '{':
            pos += 1
            out = {}
            skip()
            if text[pos] == '}':
                pos += 1
                return out
            while True:
                skip()
                end = text.index(':', pos)
                key = text[pos:end].strip()
                pos = end + 1
                out[key] = value()
                skip()
                pos += 1
                if text[pos - 1] == '}':
                    return out
        start = pos
        while pos < len(text) and text[pos] not in ',]}':
            pos += 1
        return _scalar(text[start:pos])

    return value()


def _strip_comment(line):
    quote = None
    for i, ch in enumerate(line):
        if ch in '"\'':
            quote = None if quote == ch else (quote or ch)
        elif ch == '#' and quote is None and (i == 0 or line[i - 1] == ' '):
            return line[:i].rstrip()
    return line.rstrip()


def load_yaml(text):
    lines = []
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if line.strip():
            lines.append((len(line) - len(line.lstrip(' ')), line.strip()))

    def parse(index, indent):
        if lines[index][1].startswith('- '):
            items = []
            while index < len(lines) and lines[index][0] == indent and lines[index][1].startswith('- '):
                body = lines[index][1][2:]
                if ':' in body and not body.startswith(('[', '{')) and not re.match(r'^["\']', body):
                    # A mapping that starts on the dash line: re-read it as if indented.
                    lines[index] = (indent + 2, body)
                    item, index = parse(index, indent + 2)
                else:
                    item, index = (_flow(body) if body.startswith(('[', '{')) else _scalar(body)), index + 1
                items.append(item)
            return items, index
        out = {}
        while index < len(lines) and lines[index][0] == indent:
            key, _, rest = lines[index][1].partition(':')
            rest = rest.strip()
            index += 1
            if rest:
                out[key.strip()] = _flow(rest) if rest.startswith(('[', '{')) else _scalar(rest)
            elif index < len(lines) and lines[index][0] > indent:
                out[key.strip()], index = parse(index, lines[index][0])
            elif index < len(lines) and lines[index][0] == indent and lines[index][1].startswith('- '):
                out[key.strip()], index = parse(index, indent)
            else:
                out[key.strip()] = None
        return out, index

    return parse(0, lines[0][0])[0] if lines else {}


# ---------------------------------------------------------------- project files

def project_dir(given):
    if given:
        return os.path.abspath(given)
    here = os.getcwd()
    probe = here
    while True:
        if os.path.exists(os.path.join(probe, '.git')):
            return probe
        parent = os.path.dirname(probe)
        if parent == probe:
            return here
        probe = parent


class Store:
    def __init__(self, root):
        self.root = root
        self.dir = os.path.join(root, '.claude', 'routing')
        self.registry = os.path.join(self.dir, 'registry.json')
        self.log = os.path.join(self.dir, 'decisions.log')
        self.rules_path = os.path.join(self.dir, 'rules.yaml')

    def rules(self):
        path = self.rules_path if os.path.exists(self.rules_path) else os.path.join(PLUGIN_ROOT, 'defaults', 'rules.yaml')
        with open(path) as handle:
            return load_yaml(handle.read())

    def __enter__(self):
        os.makedirs(self.dir, exist_ok=True)
        self.lock = open(os.path.join(self.dir, '.registry.lock'), 'w')
        fcntl.flock(self.lock, fcntl.LOCK_EX)
        self.tasks = json.load(open(self.registry)) if os.path.exists(self.registry) else []
        self.dirty = False
        return self

    def __exit__(self, *_):
        if self.dirty:
            handle, temp = tempfile.mkstemp(dir=self.dir, prefix='.registry.', suffix='.json')
            with os.fdopen(handle, 'w') as out:
                json.dump(self.tasks, out, indent=2)
                out.write('\n')
            os.replace(temp, self.registry)
        fcntl.flock(self.lock, fcntl.LOCK_UN)
        self.lock.close()

    def find(self, task_id):
        for task in self.tasks:
            if task['task_id'] == task_id:
                return task
        raise SystemExit(f'no task {task_id}')

    def write_log(self, task, before, after, note):
        model = (task.get('actual') or {}).get('model') or (task.get('decision') or {}).get('model')
        with open(self.log, 'a') as out:
            out.write(json.dumps({'timestamp': now(), 'task_id': task['task_id'], 'from_status': before,
                                  'to_status': after, 'model': model, 'note': note}) + '\n')

    def set_status(self, task, status, note=''):
        if status not in STATUSES:
            raise SystemExit(f'unknown status {status}')
        before = task['status']
        task['status'] = status
        stamps = task['timestamps']
        if status == 'routed':
            stamps['routed'] = stamps.get('routed') or now()
        if status == 'running':
            stamps['started'] = stamps.get('started') or now()
        if status in FINISHED:
            stamps['finished'] = now()
        self.dirty = True
        if before != status:
            self.write_log(task, before, status, note)

    def add(self, title, description='', plan_ref=None, parent=None, status='queued'):
        ids = {task['task_id'] for task in self.tasks}
        task_id = 't-' + secrets.token_hex(2)
        while task_id in ids:
            task_id = 't-' + secrets.token_hex(2)
        task = {
            'task_id': task_id, 'title': title[:80], 'description': description, 'plan_ref': plan_ref,
            'parent_id': parent, 'labels': {}, 'confidence': 0.0, 'reasoning': None,
            'decision': None, 'actual': None, 'mismatch': False, 'agent_id': None,
            'status': None, 'review': None,
            'timestamps': {'created': now(), 'routed': None, 'started': None, 'finished': None},
            'result_summary': None,
        }
        self.tasks.append(task)
        self.set_status(task, status, 'registered')
        return task


# ---------------------------------------------------------------- workers and models

def worker_model(worker):
    """A worker's model, as its agent file's frontmatter sets it."""
    path = os.path.join(PLUGIN_ROOT, 'agents', f'{worker}.md')
    if not os.path.exists(path):
        return None
    match = re.search(r'^model:\s*(\S+)', open(path).read(), re.M)
    return match.group(1) if match else None


def family(model):
    """'claude-haiku-4-5' and 'haiku' are both haiku; None when it is none of the three."""
    text = (model or '').lower()
    for name in ('haiku', 'sonnet', 'opus'):
        if name in text:
            return name
    return None


def matches(labels, when):
    for key, wanted in (when or {}).items():
        allowed = wanted if isinstance(wanted, list) else [wanted]
        if labels.get(key) not in allowed:
            return False
    return True


def decide(rules, labels, confidence):
    worker, rule_name = None, 'default'
    for rule in rules.get('rules') or []:
        if matches(labels, rule.get('when')):
            worker, rule_name = rule['worker'], rule['name']
            break
    worker = worker or rules.get('default')
    escalation = rules.get('escalation') or {}
    ladder = escalation.get('ladder') or []
    escalated, reason = False, f'matched {rule_name}'
    threshold = escalation.get('min_confidence')
    if threshold is not None and confidence < threshold and worker in ladder and ladder.index(worker) < len(ladder) - 1:
        worker = ladder[ladder.index(worker) + 1]
        escalated = True
        reason += f'; confidence {confidence:.2f} < {threshold}, one tier up'
    return {'worker': worker, 'model': worker_model(worker), 'matched_rule': rule_name,
            'escalated': escalated, 'reason': reason}


def route_line(task):
    decision = task['decision']
    labels = ', '.join(f'{k}={v}' for k, v in task['labels'].items()) or 'no labels'
    return (f"[{task['task_id']}] {task['title']} → {labels} → {decision['worker']} "
            f"({decision['model']}) via {decision['matched_rule']}")


# ---------------------------------------------------------------- status views

def elapsed(task):
    """How long a task has run (or ran): 40s, 15m, 1h05."""
    stamps = task['timestamps']
    start = stamps.get('started') or stamps.get('created')
    end = stamps.get('finished')
    if not start:
        return ''
    parse = lambda s: datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
    seconds = max(0, int((parse(end) if end else time.time()) - parse(start)))
    if seconds < 60:
        return f'{seconds}s'
    if seconds < 3600:
        return f'{seconds // 60}m'
    return f'{seconds // 3600}h{(seconds % 3600) // 60:02d}'


DEFAULT_MODELS = {'Haiku': 'claude-haiku-5-5', 'Sonnet': 'claude-sonnet-5-5', 'Opus': 'claude-opus-5-5'}


def model_name(model):
    """'claude-opus-5-5' -> 'Opus 5.5'; an alias (opus) names today's model of that tier."""
    if (model or '').lower() in ('haiku', 'sonnet', 'opus'):
        model = DEFAULT_MODELS[model.capitalize()]
    match = re.match(r'^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?(\[1m\])?$', model or '', re.I)
    if not match:
        return model or ''
    family_name, major, minor, wide = match.groups()
    name = f"{family_name.capitalize()} {major}{'.' + minor if minor else ''}"
    return name + (' 1M' if wide else '')


def group_title(tasks, group):
    """A tier by the model it really ran on most recently, else the one it runs on today."""
    ran = [t['actual']['model'] for t in tasks if group_of(t) == group and (t.get('actual') or {}).get('model', '') .startswith('claude-')]
    return model_name(ran[-1] if ran else DEFAULT_MODELS.get(group, group)) if group in DEFAULT_MODELS else group


def fit(text, width):
    text = text or ''
    return text if len(text) <= width else text[:width - 1] + '…'


GLYPHS = {'queued': '·', 'classifying': '◌', 'routed': '○', 'running': '▶', 'done': '✓', 'failed': '✗', 'escalated': '↑', 'blocked': '■'}


def group_of(task):
    decision = task.get('decision') or {}
    if decision.get('worker') == 'unrouted':
        return 'Unrouted'
    name = family((task.get('actual') or {}).get('model') or decision.get('model'))
    return name.capitalize() if name else 'Unrouted' if not decision else 'Pending'


def needs_attention(task):
    return (task['status'] in ('failed', 'blocked', 'escalated') or task.get('mismatch')
            or (task.get('decision') or {}).get('worker') == 'unrouted')


def chain(tasks, task):
    by_parent = {t['parent_id']: t for t in tasks if t.get('parent_id')}
    links = [task]
    while links[-1]['task_id'] in by_parent:
        links.append(by_parent[links[-1]['task_id']])
    return ' → '.join(f"{t['task_id']} {group_title(tasks, group_of(t))} {t['status']}" for t in links)


def summary(tasks):
    counts = {status: 0 for status in STATUSES}
    models = {}
    for task in tasks:
        counts[task['status']] += 1
        models[group_of(task)] = models.get(group_of(task), 0) + 1
    return counts, models


def status_text(tasks, flt):
    if flt and TASK_ID.fullmatch(f'[{flt}]'):
        task = next((t for t in tasks if t['task_id'] == flt), None)
        if task is None:
            return f'No task {flt}. Run /route-status to see them all.'
        decision, actual = task.get('decision') or {}, task.get('actual') or {}
        rows = [
            ('Status', task['status'] + (f", review {task['review']}" if task['review'] else '')),
            ('Plan', task['plan_ref'] or '-'),
            ('Escalated from', task['parent_id'] or '-'),
            ('Labels', ', '.join(f'{k} {v}' for k, v in task['labels'].items()) or '-'),
            ('Confidence', f"{task['confidence']:.2f}"),
            ('Why', task.get('reasoning') or '-'),
            ('Decided', f"{decision.get('worker') or '-'} on {model_name(decision.get('model')) or '-'}, rule {decision.get('matched_rule') or '-'}"
                        + (' (one tier up)' if decision.get('escalated') else '')),
            ('Ran on', f"{model_name(actual.get('model')) or '-'} (from {actual.get('source') or '-'})"
                       + ('  does not match the decision' if task.get('mismatch') else '')),
            ('Created', task['timestamps'].get('created') or '-'),
            ('Finished', task['timestamps'].get('finished') or '-'),
            ('Result', task.get('result_summary') or '-'),
        ]
        return '\n'.join([f"{task['task_id']}  {task['title']}", ''] + [f'  {label:<16}{value}' for label, value in rows])

    shown = tasks
    if flt in STATUSES:
        shown = [t for t in tasks if t['status'] == flt]
    elif flt and flt.lower() in ('haiku', 'sonnet', 'opus', 'unrouted', 'pending'):
        shown = [t for t in tasks if group_of(t).lower() == flt.lower()]
    elif flt:
        return f'No filter "{flt}". Use a status, haiku, sonnet, opus, unrouted, or a task id.'
    if not tasks:
        return 'No tasks yet. Route one with /route <task>, or a plan with /route <plan file>.'

    counts, _ = summary(tasks)
    out = [', '.join(f'{v} {k}' for k, v in counts.items() if v)]
    has_plan = any(t['plan_ref'] for t in shown)
    has_review = any(t['review'] for t in shown)
    title_width = min(36, max([len(t['title']) for t in shown] + [5]))
    rule_width = max([len((t.get('decision') or {}).get('matched_rule') or '') for t in shown] + [4])

    def row(glyph, task_id, title, status, review, plan, rule, conf, spent):
        cells = [f'{glyph} {task_id:<6}', f'{fit(title, title_width):<{title_width}}', f'{status:<10}']
        if has_review:
            cells.append(f'{review:<7}')
        if has_plan:
            cells.append(f'{plan:<7}')
        cells += [f'{rule:<{rule_width}}', f'{conf:>4}', f'{spent:>4}']
        return '  ' + '  '.join(cells)

    out += ['', row(' ', 'id', 'task', 'status', 'review', 'plan', 'rule', 'conf', 'time')]
    for group in ('Haiku', 'Sonnet', 'Opus', 'Unrouted', 'Pending'):
        rows = [t for t in shown if group_of(t) == group]
        if not rows:
            continue
        out += ['', f'{group_title(tasks, group)}  ({len(rows)})']
        for t in rows:
            out.append(row(GLYPHS.get(t['status'], '?'), t['task_id'], t['title'], t['status'], t['review'] or '',
                           (t['plan_ref'] or '').split('#')[-1].replace('Task ', 'task '), (t.get('decision') or {}).get('matched_rule') or '',
                           f"{t['confidence']:.2f}" if t['labels'] else '', elapsed(t)))

    attention = [t for t in shown if needs_attention(t) and not t.get('parent_id')]
    if attention:
        out += ['', 'Needs attention']
        for t in attention:
            if (t.get('decision') or {}).get('worker') == 'unrouted':
                out.append(f"  ?  {t['task_id']}  {t['title']}: started without /route")
            elif t['status'] == 'escalated':
                out.append(f"  ↑  {chain(tasks, t)}  {t['title']}")
            elif t.get('mismatch'):
                out.append(f"  !  {t['task_id']}  {t['title']}: decided {model_name(t['decision'].get('model'))}, "
                           f"ran on {model_name(t['actual'].get('model'))}")
            else:
                out.append(f"  {GLYPHS.get(t['status'], '?')}  {t['task_id']}  {t['title']}: {t['status']}")
    return '\n'.join(out)


def statusline(tasks):
    running = {g: sum(1 for t in tasks if t['status'] == 'running' and group_of(t) == g) for g in ('Haiku', 'Sonnet', 'Opus')}
    unrouted = sum(1 for t in tasks if group_of(t) == 'Unrouted' and t['status'] == 'running')
    done = sum(1 for t in tasks if t['status'] == 'done')
    failed = sum(1 for t in tasks if t['status'] in ('failed', 'blocked'))
    return f"H:{running['Haiku']}▶ S:{running['Sonnet']}▶ O:{running['Opus']}▶ U:{unrouted} | done {done} | failed {failed}"


# ---------------------------------------------------------------- hook events

def last_status_block(text):
    """The worker's closing JSON status block: the last {...} holding a "result"."""
    for match in reversed(list(re.finditer(r'\{[^{}]*"result"[^{}]*\}', text or '', re.S))):
        try:
            block = json.loads(match.group(0))
            if block.get('result') in ('success', 'failed', 'blocked'):
                return block
        except ValueError:
            continue
    return None


def on_started(store, payload):
    kind = payload.get('subagentType') or ''
    actual = payload.get('model')
    text = f"{payload.get('description') or ''} {payload.get('prompt') or ''}"
    found = TASK_ID.search(text)
    task = next((t for t in store.tasks if found and t['task_id'] == found.group(1)), None)
    if task and kind.endswith('task-classifier'):
        if task['status'] == 'queued':
            store.set_status(task, 'classifying', 'classifier started')
        return
    if task and (payload.get('description') or '').lower().startswith('review'):
        task['review'] = 'pending'
        store.dirty = True
        return
    if task and kind.split(':')[-1].startswith('worker-'):
        decision = task.get('decision') or {}
        task['actual'] = {'model': actual or decision.get('model'), 'source': 'hook' if actual else 'frontmatter'}
        task['mismatch'] = bool(decision.get('model')) and family(task['actual']['model']) != family(decision.get('model'))
        task['agent_id'] = payload.get('agentId')
        store.set_status(task, 'running', f"{kind} started on {task['actual']['model']}")
        return
    # Nothing routed this subagent: register it, so nothing runs invisibly.
    task = store.add(payload.get('description') or kind or 'subagent', description=(payload.get('prompt') or '')[:500],
                     status='running')
    task['decision'] = {'worker': 'unrouted', 'model': None, 'matched_rule': 'unrouted', 'escalated': False,
                        'reason': f'{kind or "a subagent"} started without /route'}
    task['actual'] = {'model': actual, 'source': 'hook' if actual else 'unknown'}
    task['agent_id'] = payload.get('agentId')
    task['subagent_type'] = kind


def on_stopped(store, payload):
    task = next((t for t in store.tasks if payload.get('agentId') and t.get('agent_id') == payload['agentId']), None)
    if task is None or task['status'] in FINISHED:
        return
    block = last_status_block(payload.get('text'))
    if block:
        status = {'success': 'done', 'failed': 'failed', 'blocked': 'blocked'}[block['result']]
        task['result_summary'] = block.get('summary')
    else:
        status = 'failed' if payload.get('isError') else 'done'
        task['result_summary'] = (payload.get('text') or '').strip().splitlines()[-1][:200] if (payload.get('text') or '').strip() else None
    if payload.get('model') and task.get('actual'):
        task['actual']['model'] = payload['model']
    store.set_status(task, status, 'subagent finished' + ('' if block else ' (no status block)'))


# ---------------------------------------------------------------- commands

def parse_plan(path):
    text = open(path).read()
    heads = list(re.finditer(r'^### Task (\d+):\s*(.+)$', text, re.M))
    tasks = []
    for i, head in enumerate(heads):
        body = text[head.end(): heads[i + 1].start() if i + 1 < len(heads) else len(text)].strip()
        tasks.append((int(head.group(1)), head.group(2).strip(), body))
    return tasks


def take_flags(args, names):
    flags, rest = {}, []
    i = 0
    while i < len(args):
        if args[i].startswith('--') and args[i][2:] in names:
            key = args[i][2:]
            if key == 'set':
                flags.setdefault('set', []).append(args[i + 1])
            else:
                flags[key] = args[i + 1]
            i += 2
        else:
            rest.append(args[i])
            i += 1
    return flags, rest


def main(argv):
    root = None
    if argv[:1] == ['--dir']:
        root, argv = argv[1], argv[2:]
    if not argv:
        print(__doc__)
        return 1
    command, args = argv[0], argv[1:]
    store = Store(project_dir(root))

    if command == 'init':
        os.makedirs(store.dir, exist_ok=True)
        if not os.path.exists(store.rules_path):
            shutil.copy(os.path.join(PLUGIN_ROOT, 'defaults', 'rules.yaml'), store.rules_path)
            print(f'wrote {store.rules_path}')
        claude_md = os.path.join(store.root, 'CLAUDE.md')
        existing = open(claude_md).read() if os.path.exists(claude_md) else ''
        if CLAUDE_MD_RULE not in existing:
            with open(claude_md, 'a') as out:
                out.write(('\n' if existing and not existing.endswith('\n') else '') +
                          ('\n## Task routing\n\n' if '## Task routing' not in existing else '') + CLAUDE_MD_RULE + '\n')
            print(f'added the execution rule to {claude_md}')
        print(f'task-router is set up in {store.dir}')
        return 0

    if command in ('get', 'list', 'status', 'statusline', 'summary-json'):
        if not os.path.exists(store.registry):
            tasks = []
        else:
            with store:
                tasks = store.tasks
        if command == 'get':
            print(json.dumps(next((t for t in tasks if t['task_id'] == args[0]), None), indent=2))
        elif command == 'list':
            flags, _ = take_flags(args, {'status'})
            print(json.dumps([t for t in tasks if not flags.get('status') or t['status'] == flags['status']], indent=2))
        elif command == 'status':
            print(status_text(tasks, args[0] if args else None))
        elif command == 'statusline':
            print(statusline(tasks))
        else:
            print(json.dumps([{k: t.get(k) for k in ('task_id', 'title', 'status', 'review', 'plan_ref', 'parent_id', 'mismatch')}
                              | {'group': group_of(t), 'model': (t.get('actual') or {}).get('model') or (t.get('decision') or {}).get('model'),
                                 'rule': (t.get('decision') or {}).get('matched_rule'), 'elapsed': elapsed(t),
                                 'ran_on': (t.get('actual') or {}).get('model')} for t in tasks]))
        return 0

    # The hooks track subagents only in projects that use the router (/route init or a first /route).
    if command in ('started', 'stopped', 'reap') and not os.path.isdir(store.dir):
        return 0

    with store:
        if command == 'add':
            flags, _ = take_flags(args, {'title', 'description', 'plan-ref', 'parent'})
            print(store.add(flags['title'], flags.get('description', ''), flags.get('plan-ref'), flags.get('parent'))['task_id'])
        elif command == 'update':
            flags, rest = take_flags(args, {'status', 'note', 'set'})
            task = store.find(rest[0])
            for pair in flags.get('set', []):
                key, _, value = pair.partition('=')
                try:
                    task[key] = json.loads(value)
                except ValueError:
                    task[key] = value
                store.dirty = True
            if flags.get('status'):
                store.set_status(task, flags['status'], flags.get('note', ''))
            print(json.dumps(task))
        elif command == 'classified':
            task = store.find(args[0])
            raw = sys.stdin.read() if args[1:] == ['-'] else ' '.join(args[1:])
            try:
                found = re.search(r'\{.*\}', raw, re.S)
                answer = json.loads(found.group(0))
                task['labels'] = answer['labels']
                task['confidence'] = float(answer.get('confidence', 0))
                task['reasoning'] = answer.get('reasoning')
                print('ok')
            except (ValueError, KeyError, AttributeError, TypeError):
                task['labels'], task['confidence'] = {}, 0.0
                task['reasoning'] = 'classifier parse failure'
                print('parse failure: the task will take the default worker')
            store.dirty = True
        elif command == 'decide':
            task = store.find(args[0])
            if task['reasoning'] == 'classifier parse failure':
                rules = store.rules()
                worker = rules.get('default')
                task['decision'] = {'worker': worker, 'model': worker_model(worker), 'matched_rule': 'default',
                                    'escalated': False, 'reason': 'classifier parse failure'}
            else:
                task['decision'] = decide(store.rules(), task['labels'], task['confidence'])
            store.set_status(task, 'routed', task['decision']['reason'])
            print(route_line(task))
        elif command == 'escalate':
            task = store.find(args[0])
            rules = store.rules()
            escalation = rules.get('escalation') or {}
            ladder = escalation.get('ladder') or []
            worker = (task.get('decision') or {}).get('worker')
            if not escalation.get('retry_failed_on_next_tier') or worker not in ladder or ladder.index(worker) == len(ladder) - 1:
                print('no escalation: it is off, or the task already ran on the top tier')
                return 2
            store.set_status(task, 'escalated', 'retry one tier up')
            child = store.add(task['title'], task.get('description', ''), task.get('plan_ref'), task['task_id'])
            child['labels'], child['confidence'], child['reasoning'] = task['labels'], task['confidence'], task.get('reasoning')
            up = ladder[ladder.index(worker) + 1]
            child['decision'] = {'worker': up, 'model': worker_model(up), 'matched_rule': 'escalation',
                                 'escalated': True, 'reason': f"{task['task_id']} failed on {worker}"}
            store.set_status(child, 'routed', child['decision']['reason'])
            print(route_line(child))
        elif command == 'review':
            task = store.find(args[0])
            flags, _ = take_flags(args[2:], {'note'})
            task['review'] = args[1]
            store.dirty = True
            if args[1] == 'blocked':
                store.set_status(task, 'blocked', flags.get('note', 'critical review issues'))
            print(f"{task['task_id']} review: {args[1]}")
        elif command == 'plan':
            for number, title, body in parse_plan(args[0]):
                task = store.add(title, body, f'{os.path.relpath(args[0], store.root)}#Task {number}')
                print(f"{task['task_id']}\t{task['plan_ref']}\t{title}")
        elif command == 'started':
            on_started(store, json.loads(args[0]))
        elif command == 'stopped':
            on_stopped(store, json.loads(args[0]))
        elif command == 'reap':
            # Subagents that ran in the background end without a tool result: settle them from their loop's state.
            states = {agent['id']: agent['status'] for agent in json.loads(args[0])}
            for task in store.tasks:
                state = states.get(task.get('agent_id') or '')
                if task['status'] != 'running' or state in (None, 'pending', 'running', 'waiting', 'idle'):
                    continue
                if (task.get('decision') or {}).get('worker') == 'unrouted' or state in ('failed', 'killed'):
                    task['result_summary'] = task.get('result_summary') or f'subagent {state} in the background'
                    store.set_status(task, 'done' if state == 'completed' else 'failed', f'subagent {state}')
                elif not task.get('ended'):
                    # A routed worker's status block reaches the dispatching session, which records it (/route step 6).
                    task['ended'] = True
                    store.dirty = True
        else:
            print(__doc__)
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
