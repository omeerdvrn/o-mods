# o-mods

Mods for Claude Code: panes, sidebars and hooks that run inside your Claude Code sessions. This repository is a plugin marketplace, so you can install each mod with one command.

**Browse them with previews at [omeerdvrn.github.io/o-mods](https://omeerdvrn.github.io/o-mods/).**

## Mods

| Mod | What it does |
| --- | --- |
| [faah](mods/faah) | Meme sounds: **FAAAH** when tests fail, **anime wow** when they pass, **bruh** when Claude asks you something. `/faah add` turns on more events (failed builds, rejected pushes, denials…); `/faah sound` gives any event another clip or your own file. |
| [heat](mods/heat) | NBA-Jam-style heat tracker. Prompts and tool calls heat you up, idle time cools you down, and a fire burst rises above the prompt once you're hot. |
| [linear](mods/linear) | Shows your assigned Linear issues in a sidebar. **Start** creates a git worktree for an issue and has Claude implement it. |
| [persona](mods/persona) | `/persona ui-ux` (or backend, dev, qa, docs, pm) sets the role Claude works for on this machine. Edits and shell commands outside the role are denied. The role shows under the prompt, with the Claude crab dressed for it in terminals that show pictures. |
| [pr-status](mods/pr-status) | Shows the current branch's PR and its CI checks (passed, running, queued, failed) above the prompt, live. `/pr-status 123` pins any PR instead. Detects GitHub, GitLab, Gitea/Forgejo, Bitbucket and Azure DevOps. While checks fail, the empty input bar suggests fixing them (Tab to take). |
| [themes](mods/themes) | Color themes for the Claude UI: Catppuccin (Mocha, Macchiato, Frappé, Latte), Tokyo Night, Gruvbox, Nord, Dracula, Rosé Pine, Everforest, Kanagawa, One Dark, Solarized. Each new session opens in the next theme; `/themes <name>` switches, `/themes pin <name>` uses one everywhere, `/themes off` restores yours. |
| [task-router](mods/task-router) | Routes every task to a worker subagent on the right model tier (Haiku, Sonnet, Opus) by rules in `.claude/routing/rules.yaml`, tracks it in a registry, escalates failures one tier up, and shows each model as a Claude crab in a `/route-status` sidebar. Works with Superpowers: it plans, the router executes. |
| [scenes](mods/scenes) | Animated pixel scenes above the prompt while Claude works, a random one each turn: night drive, rainy window, fish tank, space flight, lo-fi room, campfire, ocean sunset, matrix rain, and weather that follows your 5-hour usage. Confetti when tests pass, a rocket on push, and a companion crab that acts out what Claude does. `/scenes`. Drawn, no images. |
| [huh](mods/huh) | `/huh` opens Claude's last answer in the sidebar, rewritten by Claude to be easy to read: a short summary first, clear sections, lists, every fact and code block kept. The original is one click away. |
| [snippets](mods/snippets) | The input bar, smarter: your Linear tickets in the typeahead as you type an id, live highlighting (tickets, paths, @mentions, and secrets in red before you send them), `;;snippets` that expand as you type (`;;mmi`, `;;plan`, `;;review`…), and small previews of pasted images above the input. `/snippets` to manage them. |
| [usage-bar](mods/usage-bar) | Shows your 5-hour and weekly plan limits (used or remaining, `/usage-bar`), the session's git branch or worktree, the model, context use and cost under the prompt. |
| [usage-stats](mods/usage-stats) | `/usage-stats` opens a receipt of your Claude Code usage on this machine: total tokens, prompts, sessions and issues closed, daily activity, and tokens by project and model. |

## Install a mod

In a Claude Code terminal session, run:

```
/plugin install <mod> --marketplace omeerdvrn/o-mods
```

For example:

```
/plugin install linear --marketplace omeerdvrn/o-mods
```

1. Type `y` to add the marketplace. Claude Code asks only the first time.
2. Select a scope. The user scope makes the mod load in every session.
3. Set the mod's options, or keep the defaults.

The mod is active immediately. Each mod's README lists what it needs and its settings.

To get updates, run `claude plugin update <mod>`, then `/reload-plugins`.

## Repository layout

```
o-mods/
├── .claude-plugin/
│   └── marketplace.json   # lists every mod in this repository
└── mods/
    └── <mod>/
        ├── .claude-plugin/plugin.json
        ├── hooks/          # hooks.json and the hooks module
        ├── types/          # the mod's state contract
        ├── tests/
        └── README.md
```

## Contribute

New mods and improvements are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers adding a mod, writing its README (which becomes its page on the site), developing against a local clone, and recording a demo GIF.

## License

[MIT](LICENSE). Not affiliated with Anthropic.
