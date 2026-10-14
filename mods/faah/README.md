# faah

Meme sounds when things happen. Out of the box:

| When | Sound |
| --- | --- |
| a test run fails | **FAAAH** |
| a test run passes | **anime wow** |
| Claude asks you something: a permission prompt, a question, a plan to approve | **bruh** |

Tests are any common runner (`npm test`, `pytest`, `vitest`, `go test`, `cargo test`, `claude plugin test`…). A
run counts as failed when it exits with an error or prints failures through `| tail`. Bruh plays only when a
dialog is on screen waiting for you: a call that auto mode or your rules settle by themselves stays quiet.

## More events

| Event | When | Sound |
| --- | --- | --- |
| `build-failed` | a build or type check fails (`npm run build`, `tsc`, `cargo build`, `make`…) | faah |
| `command-failed` | any other shell command fails | faah |
| `push-rejected` | `git push` is rejected | faah |
| `denied` | a tool call is denied | bruh |
| `turn-error` | a turn ends in an error | faah |
| `interrupted` | you stop Claude mid-turn | bruh |

The same event again within 2.5 seconds plays once.

## Commands

| Command | What it does |
| --- | --- |
| `/faah` | Shows each event, whether it's on, and its sound |
| `/faah test`, `/faah test bruh`, `/faah test tests-passed` | Plays a clip, or an event's sound, now |
| `/faah add build-failed` | Turns an event on (several at once: `add denied, turn-error`) |
| `/faah remove tests-passed` | Turns an event off |
| `/faah sound asking anime-wow` | Gives an event another clip: `faah`, `anime-wow` or `bruh` |
| `/faah sound asking ~/Downloads/clip.mp3` | Gives an event your own file (anything `afplay` plays) |
| `/faah sound asking default` | Back to the event's own clip |
| `/faah off` / `/faah on` | Mutes and unmutes everything |

The starting events and the volume (0 to 4) are also options: `/plugin configure faah@o-mods`.

## The sounds

The meme clips from [Remotion's sound library](https://www.remotion.dev/docs/sfx): `https://remotion.media/fah.wav`,
`anime-wow.wav` and `bruh.wav`, collected there from meme soundboards. They are not under a free license, so they
are not in this repository: the mod fetches each once into `~/Library/Caches/faah/` and plays it from there.

Sound plays through `afplay`, so on macOS only; elsewhere it stays silent.
