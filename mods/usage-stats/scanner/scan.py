"""Scans Claude Code's session logs (~/.claude/projects) and prints usage aggregates as JSON.

Each log file's aggregates are cached by its size and modification time in
~/.claude/usage-stats/cache.json, so only new or changed sessions are parsed again.
Prints nothing but the JSON document on stdout.
"""
import json
import os
import re
import sys
import time
from datetime import datetime

ROOT = os.path.expanduser("~/.claude/projects")
CACHE_DIR = os.path.expanduser("~/.claude/usage-stats")
CACHE = os.path.join(CACHE_DIR, "cache.json")
CACHE_VERSION = 2
ISSUE = re.compile(r"(?:^|/)([a-z]{2,8})-(\d{1,6})(?:-|$)", re.I)
WRAPPED = ("<command-name>", "<local-command-", "<bash-input>", "<bash-stdout>", "<task-notification>", "Caveat:")

_repo_names = {}


def repo_of(cwd):
    """The repository a folder belongs to: the nearest ancestor holding .git; a linked worktree's main repo."""
    if cwd in _repo_names:
        return _repo_names[cwd]
    name = os.path.basename(cwd.rstrip("/")) or cwd
    path = cwd
    while path and path != "/":
        git = os.path.join(path, ".git")
        if os.path.isdir(git):
            name = os.path.basename(path)
            break
        if os.path.isfile(git):
            try:
                with open(git) as handle:
                    target = handle.read().strip().removeprefix("gitdir:").strip()
                # gitdir: /repo/.git/worktrees/<name>
                name = os.path.basename(target.split("/.git/")[0]) if "/.git/" in target else os.path.basename(path)
            except OSError:
                name = os.path.basename(path)
            break
        path = os.path.dirname(path)
    else:
        # The folder is gone: a removed worktree keeps its repo in the path.
        if "/.claude/worktrees/" in cwd:
            name = os.path.basename(cwd.split("/.claude/worktrees/")[0])
        elif "/worktrees/" in cwd:
            name = "removed worktrees"
    _repo_names[cwd] = name
    return name


def issue_of(cwd, branch):
    for text in (branch or "", os.path.basename(cwd or "")):
        match = ISSUE.search(text)
        if match and match.group(1).lower() not in ("claude", "opus", "sonnet", "haiku", "fable", "pb"):
            return f"{match.group(1).upper()}-{match.group(2)}"
    return ""


def local(ts):
    try:
        moment = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()
    except (ValueError, AttributeError):
        return None, None
    return moment.strftime("%Y-%m-%d"), moment.hour


def is_prompt(record):
    if record.get("isMeta") or record.get("isSidechain") or record.get("userType") not in (None, "external"):
        return False
    content = (record.get("message") or {}).get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        if any(block.get("type") == "tool_result" for block in content if isinstance(block, dict)):
            return False
        text = " ".join(block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text")
    else:
        return False
    text = text.lstrip()
    return bool(text) and not text.startswith(WRAPPED)


def scan_file(path):
    """One log file's aggregates: token rows, prompt rows, hour rows, and its sessions."""
    tokens = {}
    prompts = {}
    hours = {}
    sessions = {}
    seen = set()
    with open(path, errors="ignore") as handle:
        for line in handle:
            if '"type":"assistant"' not in line and '"type":"user"' not in line:
                continue
            try:
                record = json.loads(line)
            except ValueError:
                continue
            kind = record.get("type")
            day, hour = local(record.get("timestamp", ""))
            if day is None:
                continue
            cwd = record.get("cwd") or ""
            project = repo_of(cwd) if cwd else "unknown"
            issue = issue_of(cwd, record.get("gitBranch"))
            session = record.get("sessionId") or ""
            if session and not record.get("isSidechain"):
                first = sessions.get(session)
                if first is None or day < first[0]:
                    sessions[session] = [day, project]
            if kind == "assistant":
                message = record.get("message") or {}
                usage = message.get("usage") or {}
                model = message.get("model") or ""
                if not usage or model.startswith("<"):
                    continue
                # One API response is logged once per content block: count it once.
                key = (message.get("id"), record.get("requestId"))
                if key in seen:
                    continue
                seen.add(key)
                parts = [
                    usage.get("input_tokens") or 0,
                    usage.get("output_tokens") or 0,
                    usage.get("cache_creation_input_tokens") or 0,
                    usage.get("cache_read_input_tokens") or 0,
                    1,
                ]
                row = tokens.setdefault("\t".join((day, project, model, issue)), [0, 0, 0, 0, 0])
                for index, value in enumerate(parts):
                    row[index] += value
                cell = hours.setdefault(f"{day}\t{hour}", [0, 0])
                cell[0] += sum(parts[:4])
            elif is_prompt(record):
                key = "\t".join((day, project, issue))
                prompts[key] = prompts.get(key, 0) + 1
                cell = hours.setdefault(f"{day}\t{hour}", [0, 0])
                cell[1] += 1
    return {"tokens": tokens, "prompts": prompts, "hours": hours, "sessions": sessions}


def main():
    started = time.time()
    try:
        with open(CACHE) as handle:
            cache = json.load(handle)
        if cache.get("version") != CACHE_VERSION:
            cache = {}
    except (OSError, ValueError):
        cache = {}
    files = cache.get("files", {})
    fresh = {}
    parsed = 0
    for directory, _, names in os.walk(ROOT):
        for name in names:
            if not name.endswith(".jsonl"):
                continue
            path = os.path.join(directory, name)
            try:
                stat = os.stat(path)
            except OSError:
                continue
            stamp = f"{stat.st_size}:{int(stat.st_mtime)}"
            known = files.get(path)
            if known and known.get("stamp") == stamp:
                fresh[path] = known
                continue
            try:
                fresh[path] = {"stamp": stamp, **scan_file(path)}
                parsed += 1
            except OSError:
                continue
    os.makedirs(CACHE_DIR, exist_ok=True)
    temporary = CACHE + ".tmp"
    with open(temporary, "w") as handle:
        json.dump({"version": CACHE_VERSION, "files": fresh}, handle)
    os.replace(temporary, CACHE)

    tokens, prompts, hours, sessions = {}, {}, {}, {}
    for entry in fresh.values():
        for key, row in entry["tokens"].items():
            total = tokens.setdefault(key, [0, 0, 0, 0, 0])
            for index, value in enumerate(row):
                total[index] += value
        for key, count in entry["prompts"].items():
            prompts[key] = prompts.get(key, 0) + count
        for key, cell in entry["hours"].items():
            total = hours.setdefault(key, [0, 0])
            total[0] += cell[0]
            total[1] += cell[1]
        for session, first in entry["sessions"].items():
            known = sessions.get(session)
            if known is None or first[0] < known[0]:
                sessions[session] = first

    out = {
        "generatedAt": int(time.time() * 1000),
        "files": len(fresh),
        "parsed": parsed,
        "seconds": round(time.time() - started, 1),
        # [day, project, model, issue, input, output, cacheWrite, cacheRead, replies]
        "tokens": [key.split("\t") + row for key, row in tokens.items()],
        # [day, project, issue, prompts]
        "prompts": [key.split("\t") + [count] for key, count in prompts.items()],
        # [day, hour, tokens, prompts]
        "hours": [[key.split("\t")[0], int(key.split("\t")[1])] + cell for key, cell in hours.items()],
        # [day, project], one per session
        "sessions": list(sessions.values()),
    }
    json.dump(out, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
