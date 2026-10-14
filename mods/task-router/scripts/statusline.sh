#!/bin/sh
# Status line for task-router: "H:2▶ S:1▶ O:0▶ U:0 | done 7 | failed 1", read from the project's registry.
# Claude Code passes the session as JSON on stdin; the project is its workspace's current_dir.
dir=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("workspace") or {}).get("current_dir") or d.get("cwd") or ".")' 2>/dev/null)
cd "${dir:-.}" 2>/dev/null && [ -d "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.claude/routing" ] || exit 0
python3 "$(dirname "$0")/registry.py" statusline
