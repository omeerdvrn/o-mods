#!/usr/bin/env bash
# Builds the throwaway repository the pr-status demo runs in: a branch with an
# open (fake) PR on github.com/acme/webapp. Fetch URL is GitHub's, so the mod
# detects GitHub; pushes go to a local bare repository, never to the network.
#   make-repo.sh <dir>
set -euo pipefail
dir="$1"
rm -rf "$dir" "$dir.git" && mkdir -p "$dir/src"
cd "$dir"
git init -q -b main
git config user.name "Demo" && git config user.email "demo@example.com"
cat > src/theme.ts <<'TS'
export type Theme = 'light' | 'dark'

export const themes: Theme[] = ['light']

export const defaultTheme = (prefersDark: boolean): Theme => (prefersDark ? 'dark' : 'light')
TS
cat > src/theme.test.ts <<'TS'
import { themes } from './theme'

test('themes', () => {
  // includes dark
  expect(themes).toContain('dark')
})
TS
git add -A && git commit -qm "chore: initial commit"
git checkout -q -b feature/eng-128-dark-mode
git commit -q --allow-empty -m "feat(ENG-128): add dark mode toggle"
git init -q --bare "$dir.git"
git remote add origin https://github.com/acme/webapp.git
git remote set-url --push origin "$dir.git"
git push -q origin feature/eng-128-dark-mode
git branch -q --set-upstream-to=origin/feature/eng-128-dark-mode 2>/dev/null || {
  git config branch.feature/eng-128-dark-mode.remote origin
  git config branch.feature/eng-128-dark-mode.merge refs/heads/feature/eng-128-dark-mode
}
# Trust the folder in the throwaway Claude Code config only.
node -e '
  const fs = require("fs"); const [file, dir] = process.argv.slice(1)
  const c = JSON.parse(fs.readFileSync(file, "utf8"))
  c.projects[dir] = { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true }
  fs.writeFileSync(file, JSON.stringify(c, null, 2))
' "$CLAUDE_CONFIG_DIR/.claude.json" "$dir"
