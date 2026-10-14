# Recording mod demos

Every mod's `preview.gif` (and the `preview.mp4` the site plays) is recorded in the real Claude Code CLI, scripted, so anyone can re-record it after a change. No Claude account is needed and nothing is billed: Claude Code talks to a local mock of the Messages API that streams scripted replies, and runs every tool call for real.

```
brew install vhs gifsicle ffmpeg
demo/record.sh heat                 # one mod
demo/record.sh heat themes linear   # several
```

`record.sh` writes `mods/<mod>/preview.gif` and `preview.mp4`. Run recordings one at a time on a quiet machine: under heavy load VHS drops frames and timings drift. To run several at once, give each its own `OMODS_PORT`.

## What a recording is made of

| File | What it does |
| --- | --- |
| `mods/<mod>/demo.tape` | The [VHS](https://github.com/charmbracelet/vhs) script: what is typed and when |
| `mods/<mod>/demo.json` | What "Claude" answers, for the mock API |
| `mods/<mod>/demo/` | Anything else the demo needs: fixture projects, fake services, `config/` |
| `demo/mock-api.mjs` | The mock Messages API |
| `demo/style.tape`, `demo/session.tape` | Shared look, and the clean shell every demo starts in |
| `demo/record.sh` | Sets up a throwaway config, starts the mock, runs VHS, writes the GIF and MP4 |

## Isolation

Each recording gets a fresh, throwaway everything, so a demo can't read or change anything of yours, and nothing of yours appears on screen:

- **Shell:** started with `env -i`, so none of your environment leaks in.
- **Claude Code config:** `~/.o-mods-demo/<mod>/`, with onboarding done, the project trusted, and the mock's fake key approved. Tool calls run without permission prompts, and spinner tips are off.
- **HOME:** `~/.o-mods-demo/<mod>/home`, whose `.claude` is that config. A mod that writes to `~/.claude` directly writes there.
- **Project:** `/tmp/omods-<mod>/acme-app`, trusted, and the shell starts in it (`$OMODS_PROJECT`). Fill it in a hidden step of the tape.

`demo/config/` in a mod folder is copied into the config first: seed `settings.json` (for example `"tui": "fullscreen"` for sidebars), fake data, or files the mod reads. Its `permissions.allow` entries are added to the defaults.

## demo.tape

```
Output mods/<mod>/preview.gif
Source demo/setup.tape
Set Framerate 24

Hide
Type `mkdir -p src && touch package.json && clear` Enter
Type `claude --plugin-dir "$OMODS_ROOT/mods/<mod>"` Enter
Wait+Screen@40s /mode on/
Ctrl+L
Show

Type "run the tests"
Enter
Sleep 4s
…
Sleep 3s
```

- Launch Claude while hidden, then `Show`, so the GIF starts at a ready prompt.
- Wait on screen text (`Wait+Screen /…/`) rather than long fixed sleeps where you can.
- End on a 3-second hold so the last state can be read.
- Keep it to 10–25 seconds.
- For another size, replace `Source demo/setup.tape` with:

  ```
  Source demo/style.tape
  Set Width 1500
  Set Height 800
  Source demo/session.tape
  ```

## demo.json

```json
{
  "thinkDelay": 400,
  "wordDelay": 30,
  "turns": [
    { "prompt": "run the tests", "steps": [
      { "text": "Running them." },
      { "tool": "Bash", "input": { "command": "npm test", "description": "Run tests" } },
      { "text": "All 12 pass." }
    ] }
  ],
  "side": [
    { "match": "rewrite", "text": "The reply to the mod's own model call" }
  ]
}
```

- A turn is picked when what you type contains its `prompt`. Its steps are cut into replies at each tool call: Claude Code runs the tool for real, sends the result back, and the next reply streams.
- `side` answers model calls a mod makes itself (requests without tools), matched against their text.
- `{{HOME}}` and `{{PROJECT}}` are replaced with the throwaway home and project, so tool inputs can use absolute paths without containing yours.
- `"pause": <ms>` on a step waits before it; `thinkDelay` and `wordDelay` set the pace.

## Fake services

A mod that talks to an outside service gets a local fake that answers in the real shape, never the real service:

- **MCP servers** (Linear): a small stdio server in `mods/<mod>/demo/`, registered while hidden with `claude mcp add` into the throwaway config. See `mods/linear/demo/linear-mcp.mjs`.
- **CLIs** (`gh`): a script in `mods/<mod>/demo/bin/` put first on `PATH`. It handles only the commands the demo uses and exits with an error for anything else. See `mods/pr-status/demo/bin/gh`.

## Before you open a pull request

Watch the whole GIF. On screen there must be only example data: `acme`, `example.com`, `ENG-123`, no real names, emails, organisations, paths, repos or tickets. `node scripts/check-registry.mjs` catches real home paths and keys in the demo files, not in the pictures.
