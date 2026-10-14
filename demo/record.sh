#!/usr/bin/env bash
# Records a mod's demo GIF in the real Claude Code CLI against the mock API.
#   demo/record.sh <mod> [<mod>…]     writes mods/<mod>/preview.gif
# OMODS_PORT picks the mock API's port (default 8787), so several recordings
# can run at once.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
base="${OMODS_CONFIG_BASE:-$HOME/.o-mods-demo}"
port="${OMODS_PORT:-8787}"
key="sk-ant-demo-fake-key-for-local-mock-0000"

command -v vhs >/dev/null || { echo "Install VHS first: brew install vhs" >&2; exit 1; }

for mod in "$@"; do
  dir="$root/mods/$mod"
  [[ -f "$dir/demo.tape" ]] || { echo "skip $mod: no demo.tape" >&2; continue; }

  # A fresh throwaway Claude Code config per mod: onboarding done, the repo
  # trusted, the mock's fake key approved, and no state from other demos.
  config="$base/$mod"
  # The fake project the demo runs in, trusted up front: /tmp/omods-<mod>/acme-app.
  # The tape cds into $OMODS_PROJECT and fills it.
  project="/private/tmp/omods-$mod/acme-app"
  mkdir -p "$project"

  rm -rf "$config" && mkdir -p "$config/home"
  # The demo also gets its own HOME, whose .claude is this config: a mod that
  # writes ~/.claude directly can never touch your real one.
  ln -s "$config" "$config/home/.claude"
  node -e '
    const fs = require("fs"); const [file, root, key, project] = process.argv.slice(1)
    fs.writeFileSync(file, JSON.stringify({
      hasCompletedOnboarding: true, lastOnboardingVersion: "9.9.9", theme: "dark", hasSeenTasksHint: true, numStartups: 50, hasSeenAutoDefaultNudge: true, hasResetAutoModeOptInForDefaultOffer: true, officialMarketplaceAutoInstallAttempted: true,
      customApiKeyResponses: { approved: [key.slice(-20)], rejected: [] },
      hasSeenAutoModeEntryWarning: true, lastReleaseNotesSeen: "9.9.9", lastClawdEntranceVersion: "9.9.9",
      projects: Object.fromEntries([root, project].map(dir => [dir, { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true }])),
    }, null, 2))
  ' "$config/.claude.json" "$root" "$key" "$project"
  # A mod can seed its config (fake transcripts, settings) from demo/config/.
  [[ -d "$dir/demo/config" ]] && cp -R "$dir/demo/config/." "$config/"
  # Base settings, under any the mod brought: scripted tools run without
  # prompts or the auto-mode classifier (which the mock can't answer), and no
  # spinner tips in frame.
  node -e '
    const fs = require("fs"); const file = process.argv[1]
    let own = {}; try { own = JSON.parse(fs.readFileSync(file, "utf8")) } catch {}
    const base = { spinnerTipsEnabled: false, permissions: { defaultMode: "default", allow: ["Bash", "Edit", "Write", "Read", "Glob", "Grep"] } }
    fs.writeFileSync(file, JSON.stringify({ ...base, ...own, permissions: { ...base.permissions, ...own.permissions, allow: [...new Set([...base.permissions.allow, ...(own.permissions?.allow ?? [])])] } }, null, 2))
  ' "$config/settings.json"

  rm -f "$dir/preview.gif" "$dir/preview.mp4"
  script="$dir/demo.json"; [[ -f "$script" ]] || script="$root/demo/empty.json"
  OMODS_LOG=1 OMODS_HOME="$config/home" OMODS_PROJECT="$project" node "$root/demo/mock-api.mjs" "$script" "$port" >/dev/null 2>"$config/mock.log" &
  mock=$!
  sleep 0.5
  echo "recording $mod…"
  # Mods that draw pictures record in a real kitty window; the rest in VHS.
  recorder=(vhs)
  head -1 "$dir/demo.tape" | grep -q 'recorder: kitty' && recorder=(node "$root/demo/kitty-tape.mjs")
  (cd "$root" && OMODS_ROOT="$root" OMODS_PORT="$port" OMODS_CONFIG="$config" OMODS_PROJECT="$project" "${recorder[@]}" "mods/$mod/demo.tape" >"$config/record.log" 2>&1) || echo "  ✘ recording failed for $mod: see $config/record.log" >&2
  kill $mock 2>/dev/null; wait $mock 2>/dev/null || true
  [[ -s "$dir/preview.gif" ]] || { echo "  ✘ no GIF for $mod" >&2; continue; }
  # Smaller GIF for READMEs, and an MP4 the site plays (a fraction of the size).
  command -v gifsicle >/dev/null && gifsicle -O3 --lossy=80 --colors 64 --batch "$dir/preview.gif" 2>/dev/null || true
  ffmpeg -v error -y -i "$dir/preview.gif" -movflags +faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 26 -preset slow "$dir/preview.mp4"
  echo "  → mods/$mod/preview.gif ($(du -h "$dir/preview.gif" | cut -f1)), preview.mp4 ($(du -h "$dir/preview.mp4" | cut -f1))"
done
