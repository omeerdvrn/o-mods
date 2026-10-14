#!/usr/bin/env bash
# A throwaway git repository for the linear demo to run in (Start makes
# worktrees in the session's repo), trusted in the throwaway config only.
#   make-repo.sh <dir>
set -euo pipefail
dir="$1"
rm -rf "$dir" && mkdir -p "$dir" && cd "$dir"
git init -q -b main
git config user.name "Demo" && git config user.email "demo@example.com"
echo "# webapp" > README.md && printf '.claude/worktrees/\n' > .gitignore
git add -A && git commit -qm "chore: initial commit"
node -e '
  const fs = require("fs"); const [file, dir] = process.argv.slice(1)
  const c = JSON.parse(fs.readFileSync(file, "utf8"))
  c.projects[dir] = { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true }
  fs.writeFileSync(file, JSON.stringify(c, null, 2))
' "$CLAUDE_CONFIG_DIR/.claude.json" "$dir"
