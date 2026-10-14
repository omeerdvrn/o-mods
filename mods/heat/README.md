# heat

An NBA-Jam-style heat tracker for Claude Code. Each prompt heats you up, tool calls keep you warm, and idle time cools you down. Once you're hot, a fire burst rises above the prompt each time you send one.

```
                   % #  %% ##%%## # %# %#%#
                 %%###%%#@%@@@@@#@#@@#@@@#%@@#@@@@
──────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────
                                    🔥 warm 42°   Opus 5.5
```

## How heat works

| Event | Heat |
| --- | --- |
| A prompt | +2, plus up to +6 for a longer prompt and up to +6 for sending it soon after the last |
| A tool call that succeeds | +1 |
| A tool call that fails | −3 |
| Idle time | −1 every 30 seconds |
| A new session, or before compaction | Reset to 0 |

Heat runs from 0 to 100.

| Heat | Tier |
| --- | --- |
| 0–14 | ice cold |
| 15–39 | · lukewarm |
| 40–64 | 🔥 warm |
| 65–84 | 🔥🔥 heating up |
| 85–100 | 🔥🔥🔥 ON FIRE! 🔥🔥🔥 |

From 15, each prompt lights a fire burst in the band above the prompt. The hotter you are, the wider, taller and longer the fire. The tier and heat show in the footer, next to the mode labels. In the terminal the fire is drawn in colored cells. In the Claude desktop app it is the same burst as an animated SVG.

## Command

| Command | What it does |
| --- | --- |
| `/heat` or `/heat status` | Shows the heat, the tier, and whether heat is on |
| `/heat reset` | Sets heat to 0 |
| `/heat off` / `/heat on` | Turns heat off or on. The choice is kept across sessions. |

## Install

```
claude plugin marketplace add omeerdvrn/o-mods
claude plugin install heat@o-mods
```

## Development

```
claude --plugin-dir /path/to/o-mods/mods/heat
claude plugin validate .
claude plugin test .
```

| File | Contents |
| --- | --- |
| `hooks/register.tsx` | Hooks: heat on prompts and tool calls, `/heat`, the footer label, and the fire band |
| `hooks/heat.ts` | Bumps, decay and tiers |
| `hooks/fire.ts` | The particle burst: heat to fire parameters, frames, and Raster cell encoding |
| `types/index.d.ts` | The mod's state contract |
| `tests/heat.test.ts` | Tests for the heat math, the fire, and the hooks |
