# usage-stats

A Claude Code mod that shows your Claude Code usage on this machine. Type `/usage-stats` to open it. It never opens on its own. It opens as a side pane, brought to the front; where no pane can be shown, the same receipt is printed into the conversation.

![usage-stats running in Claude Code](preview.gif)

```
Usage                                        7d  30d  All  ⟳

▀█  ▀▀█   █▀█ █▀▄
 █    █   █▀█ █▀▄
▀▀▀   ▀ ▀ ▀▀▀ ▀▀
tokens in the last 30 days

816 prompts   104 sessions   71 issues closed

          ▄▄▄▄  ▃▃                          ▅▅          ██▅▅
▄▄▃▃▃▃  ▃▃████▅▅██▆▆    ▇▇██▂▂▆▆▁▁  ▁▁██▄▄████▅▅    ▁▁▆▆████
Sep 9                                                  Oct 8

Projects
webapp ······································  10.8B    61%
shop-api ····································   3.8B    21%

Models
████████████████████████████████████████████████████████████
■ Opus 5 45%   ■ Opus 5.5 42%   ■ Sonnet 5 7%   ■ other 7%

Busiest day ········································  Oct 7
Busiest hour ···································· Thu 15:00
Top issue ··········································· ENG-4
```

It reads like a receipt:

- **The total:** tokens in the range, in large block digits, then prompts, sessions and Linear issues closed.
- **The range:** tokens per day across the range.
- **Projects:** tokens and share per repository. A worktree counts toward its repository.
- **Models:** each model's share of tokens.
- **Busiest moments:** the busiest day, the busiest hour of the week, the issue with the most tokens, and the points you closed.

Press **7d**, **30d** or **All** to change the range; the choice is kept. Press `⟳` to read the logs again.

## Where the numbers come from

- **Tokens, prompts, sessions:** Claude Code's session logs in `~/.claude/projects`, read by `scanner/scan.py`. Each API response is counted once, and subagents' logs are included.
  - The first scan reads every log, which takes a few seconds. After that, only new or changed logs are read.
  - The scanner caches its results in `~/.claude/usage-stats/cache.json`.
- **Issues closed:** your Linear connection (`claude.ai Linear` by default). Set `linearServer` in `/config` to use another server, or leave it empty to hide the section.
- Claude Code removes old session logs, so "All time" goes back as far as the logs on this machine.

Nothing leaves your machine except the Linear request.

## Requirements

- Python 3, as `python3`
- Linear connected to Claude, for the issues closed section

## Install

```
claude plugin marketplace add omeerdvrn/o-mods
claude plugin install usage-stats@o-mods
```

## Development

```
claude --plugin-dir /path/to/o-mods/mods/usage-stats
claude plugin validate .
claude plugin test .
python3 scanner/scan.py | head -c 400
```

| File | Contents |
| --- | --- |
| `hooks/register.tsx` | The `/usage-stats` command, the scan and Linear calls, and the view |
| `hooks/stats.ts` | Ranges, totals and rankings from the scan |
| `hooks/charts.ts` | Block digits, dotted leaders, the sparkline and the proportion bar |
| `scanner/scan.py` | Reads the session logs and prints aggregates as JSON |
| `types/index.d.ts` | The mod's state contract |
| `tests/usage-stats.test.ts` | Tests with the scanner and Linear faked |
