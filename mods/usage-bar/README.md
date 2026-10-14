# usage-bar

A Claude Code mod that shows your plan limits and where the session is working, under the prompt.

![A footer bar under the prompt shows the git branch, 5-hour and 7-day limit bars with percentages, and cost. /usage-bar switches them to what is left.](preview.gif)

```
                     ⎇ feature/eng-1930 +1 ~2 ↑2   5h ████▏░░░░░ 42% ↻ 2h13m   7d ██░░░░░▏░░ 18% ↻ Sun 00:00
                                                        🔥 warm 42°   Opus 5.5   ctx 31%   $1.24
```

## What it shows

- **5h and 7d limits**: how much of your 5-hour and weekly limits you have used, and when each resets.
  - The bar's cells go from green to red along its length, and the percentage turns amber at 70% and red at 90%.
  - The `┃` tick marks how much of the window's time has passed. If the fill reaches past the tick, you are using the limit faster than it resets.
- **Git**: the branch (`⎇`), or the worktree folder (`⌂`) when the session is in a linked worktree. Then staged (`+`), modified (`~`) and untracked (`?`) files, and commits ahead (`↑`) of and behind (`↓`) the upstream. Outside a repository, it shows the folder name.
- **Session**: the model, how full the context window is, and the session's cost. Labels other mods add to the footer, such as the heat mod's tier and persona's role, show here too, in whatever order the mods were installed.

The limit readings come from Claude Code itself: each API response reports them, so they appear after the session's first reply. API-key and gateway sessions without plan limits show no bars. Git is read when the session starts, after each turn, and every 15 seconds.

## Used or remaining

Type `/usage-bar` to switch the limit bars between what you've used (`42%`) and what's left (`58% left`). `/usage-bar used` and `/usage-bar remaining` pick one. The choice is kept across sessions.

In remaining mode, the bar drains as you use the limit, in one color for how close you are to it. The tick marks how much of the window's time is left: a bar shorter than the tick is running out before the window resets.

## Install

```
claude plugin marketplace add omeerdvrn/o-mods
claude plugin install usage-bar@o-mods
```

It replaces a `statusLine` command for these figures: remove `statusLine` from `~/.claude/settings.json` if you used one for them.

## Development

```
claude --plugin-dir /path/to/o-mods/mods/usage-bar
claude plugin validate .
claude plugin test .
```

| File | Contents |
| --- | --- |
| `hooks/register.tsx` | Reads usage and git; draws the footer |
| `hooks/meter.ts` | Bars, pace, reset times, model names, and git status parsing |
| `types/index.d.ts` | The mod's state contract |
| `tests/usage-bar.test.ts` | Tests with the session and git faked |
