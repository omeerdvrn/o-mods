# task-router

Every task gets labeled by a cheap classifier (Haiku), dispatched to a worker subagent on the right model tier,
and tracked in a registry, so you can see at any time what was decided, what runs, and on which model.

## Use

1. `/route init` in a project: writes `.claude/routing/rules.yaml` (yours to refine) and the execution rule into
   the project's CLAUDE.md.
2. `/route <task>` routes one task; `/route docs/superpowers/plans/<plan>.md` routes a whole plan in order;
   add `--dry-run` to classify and route without running workers.
3. `/route-status` opens the sidebar (each model as its Claude crab) and prints the table;
   `/route-status running|haiku|sonnet|opus|unrouted|<task_id>` filters or shows one task in full.

The footer shows live counts (`H:2▶ S:1▶ O:0▶ U:0 | done 7 | failed 1`). For Claude Code's status line instead,
set in settings.json: `"statusLine": { "type": "command", "command": "sh <plugin>/scripts/statusline.sh" }`.

## Pieces

| Piece | Where |
| --- | --- |
| Classifier (haiku, read-only) | `agents/task-classifier.md` |
| Workers: light (haiku), standard (sonnet), heavy (opus) | `agents/worker-*.md` |
| Routing rules: dimensions, rules (first match wins), default, escalation | `.claude/routing/rules.yaml` (default in `defaults/`) |
| Registry, the one writer (add, update, get, list, decide, escalate, review, plan, status) | `scripts/registry.py` |
| Registry and decision log | `.claude/routing/registry.json`, `.claude/routing/decisions.log` |
| Orchestrator and status skills | `skills/route`, `skills/route-status` |
| Hooks: subagent start (actual model), finish (status block), unrouted subagents, sidebar, footer | `hooks/register.tsx` |
