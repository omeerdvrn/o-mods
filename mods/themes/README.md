# themes

Color themes for the Claude Code interface, applied automatically when a session starts.

Themes: Catppuccin Mocha, Macchiato, Frappé and Latte, Tokyo Night, Gruvbox Dark, Nord, Dracula, Rosé Pine,
Everforest, Kanagawa, One Dark, Solarized Dark, Synthwave '84 (pairs with night-drive).

## How it works

- Each new session opens in the next theme of the rotation, so side-by-side sessions are easy to tell apart.
  The footer names the session's theme (`◐ Tokyo Night`). Catppuccin Latte, a light theme, is left out of the
  rotation; pick it by name.
- Claude Code's config API takes only its built-in themes, so the switcher works the way custom themes do: it
  writes one theme file, `~/.claude/themes/themes.json`, and points the `theme` setting in
  `~/.claude/settings.json` at `custom:themes` (once; the old file is kept as
  `settings.json.themes.bak`). Claude Code reloads that file live when it changes. The very first time,
  when `~/.claude/themes` did not exist yet, restart Claude Code once.
- Claude Code keeps one theme setting for the whole machine. When another session changes it, the session you
  type in takes its own theme back on your next prompt.
- The themes color Claude's interface (text, accents, borders, diffs, message backgrounds). The terminal's own
  background stays as your terminal sets it.

## Commands

| Command | Does |
| --- | --- |
| `/themes` | Lists the themes and shows this session's |
| `/themes <name>` | Switches this session (`/themes mocha`, `/themes tokyo night`) |
| `/themes pin <name>` | Every new session opens in that theme |
| `/themes rotate` | Back to a new theme for each session (the default) |
| `/themes off` | Stops switching and restores the theme you had before |

The themes also appear in `/theme`, marked as from themes.

## Editing the themes

Palettes live in `scripts/build-themes.py`; run `python3 scripts/build-themes.py` to rewrite `themes/*.json`.
