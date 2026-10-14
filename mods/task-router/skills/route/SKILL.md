---
name: route
description: Route a task, or every task of an approved Superpowers plan, to a worker subagent on the right model tier, tracked in the task-router registry. Use when executing an approved plan, or when asked to /route a task.
argument-hint: "<task description> | <plan file> [--dry-run] | init"
---

# /route

You are the dispatcher: subagents cannot start subagents, so every dispatch below happens from this session.
All task state goes through the registry script; never edit `.claude/routing/*.json` yourself.

`R` below means: `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/registry.py"` (run from the project root).

Arguments: `$ARGUMENTS`

- `init`: run `R init` and report what it wrote. Stop.
- A path to an existing `.md` plan file: **batch mode**. Otherwise: **one task**, the arguments being its description.
- `--dry-run` anywhere: classify and route, but dispatch no worker (stop after step 4).

## One task

1. **Register.** `R add --title "<short summary, under 60 chars>" --description "<the full task>"`. It prints the task id, `t-xxxx`.
2. **Classify.** Dispatch `task-router:task-classifier` with description `classify [t-xxxx]` and this prompt:
   `Rules file: <project>/.claude/routing/rules.yaml (if it does not exist: ${CLAUDE_PLUGIN_ROOT}/defaults/rules.yaml). Task [t-xxxx]: <the full task>`.
3. **Record the labels.** Pass the classifier's whole answer on stdin: `R classified t-xxxx - <<'JSON'` … `JSON`.
   A parse failure is handled by the script (the default worker, reason "classifier parse failure").
4. **Decide.** `R decide t-xxxx`. It evaluates rules.yaml, applies the confidence escalation, records the
   decision and prints the routing line. Print that line to the person exactly.
5. **Dispatch** (not in a dry run). Use the Agent tool, in the foreground, with `subagent_type`
   `task-router:<worker from the line>`, description `[t-xxxx] <title>`, and a prompt holding the task id, the
   full task, and any plan context (Global Constraints, file paths). Do not pass a `model`: the worker's own
   model is the routed one. The mod's hooks mark the task running and record the model it really ran on.
6. **Read the result.** For a worker that answered in the foreground, the hooks set done / failed / blocked from
   its closing JSON status block. A worker that ran in the background reports in its completion notice: wait
   for it, then check `R get t-xxxx`; while the status is still `running`, set it from the status block:
   `R update t-xxxx --status done|failed|blocked --set 'result_summary="<one sentence>"'`.
7. **Review a success.** Use the superpowers:requesting-code-review skill on the task's changes. Dispatch its
   reviewer with a description starting `review [t-xxxx]`. Then record the outcome:
   `R review t-xxxx passed` (no issues, or minor only), `R review t-xxxx issues --note "<important issues>"`, or
   `R review t-xxxx blocked --note "<critical issues>"` (this blocks the task: stop and tell the person).
8. **Escalate a failure.** `R escalate t-xxxx`. If it prints a routing line, a child task was created one tier
   up: print the line and run steps 5 to 7 for the child (once; a failed child is not escalated again). If it
   prints "no escalation", report the failure and stop.

## Batch mode (a plan)

1. `R plan <plan file>`: one registry entry per `### Task N:` heading, in plan order, each with `plan_ref`
   `<file>#Task N`. It prints `task_id <tab> plan_ref <tab> title` lines.
2. Read the plan's header and Global Constraints once; include them in every worker prompt.
3. For each task in order: `R get <id>` for its description, then steps 2 to 8 of One task. Finish a task
   (including its review) before starting the next: plan tasks build on each other. Stop at a blocked task.
4. At the end, run `R status` and show it.
