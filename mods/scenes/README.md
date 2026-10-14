# scenes

Animated pixel scenes above the prompt while Claude works. Each time Claude starts working, a scene comes up (a
random one, never the same twice in a row) and plays until the turn ends. Everything is drawn pixel by pixel, two
pixels per terminal cell, in every terminal; the desktop app gets the same scene as an animated SVG.

## Scenes

| Scene | What it does |
| --- | --- |
| Night drive | Synthwave: a striped neon sun behind a skyline, grid and streetlights rushing at you, your car |
| Rainy window | Rain on the glass over a city out of focus; it rains harder while tools run |
| Fish tank | Fish and swaying weed; a bubble stream per tool call; food drops when the task is done and the fish swarm to it |
| Space flight | Warp stars, a ringed planet sliding by; the engine burns hotter the longer Claude works |
| Lo-fi room | A desk lamp, steaming coffee, a cat on the sill, rain outside; code scrolls on the monitor while Claude edits |
| Campfire | Pines under the stars; the fire grows on long turns and throws a shower of sparks when tests pass |
| Ocean sunset | Waves, gulls, the sun's reflection shimmering; a sailboat crosses over the turn |
| Matrix rain | Green code raining down |
| Usage weather | A village whose sky follows your 5-hour usage: clear, cloudy, rain, a thunderstorm near the limit |

## Over any scene

- **Matrix rain** sweeps over the scene while Claude searches (Grep, Glob).
- **Bursts:** confetti when tests pass, a rain cloud when they fail, a rocket on `git push`, a check stamp on commit.
- **The companion crab** in the corner acts out what Claude does: reads a book (Read), types on a laptop (Edit),
  digs (Grep), runs a terminal (Bash), spins a globe (web), sends radio waves (subagents), thinks in a bubble,
  and juggles on long runs. When a task finishes it eats, and a heart joins today's row; late at night it is sleepy.

## Commands

| Command | Does |
| --- | --- |
| `/scenes` | Lists the scenes |
| `/scenes <name>` | Plays that one every time (`/scenes fish`, `/scenes lofi`) |
| `/scenes random` | A random one each time (the default) |
| `/scenes crab on\|off` | Shows or hides the crab |
| `/scenes off` / `/scenes on` | Stops or starts the scenes |

## Adding a scene

A scene is one file in `hooks/scenes/` exporting `{ id, name, draw(canvas, phase, act) }`: draw a frame onto the
canvas for `phase` (0 to 1 over a 2.4-second loop) and what Claude is doing (`act`). Add it to `SCENES` in
`hooks/scenes/index.ts`.
