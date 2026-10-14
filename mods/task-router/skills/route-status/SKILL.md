---
name: route-status
description: Show the task-router registry: what was routed, what is running, on which model, and what needs attention.
argument-hint: "[running|done|failed|...|haiku|sonnet|opus|unrouted|<task_id>]"
---

Run `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/registry.py" status $ARGUMENTS` from the project root and show its
output to the person as is, in a code block. Do not change anything.
