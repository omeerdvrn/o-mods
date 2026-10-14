# Contributing to o-mods

o-mods is a registry of mods for Claude Code: panes, sidebars, bands, status lines and hooks that run inside your sessions. New mods and improvements to existing ones are welcome.

## Ways to help

- **Build a new mod.** Open a [mod idea](https://github.com/omeerdvrn/o-mods/issues/new?template=mod-idea.yml) issue first if you want feedback, or go straight to a pull request.
- **Improve a mod.** Fix a bug, add an option, support another terminal or forge. Keep the mod's existing style.
- **Report a bug.** Use the [bug template](https://github.com/omeerdvrn/o-mods/issues/new?template=bug.yml) and include `claude --version`.
- **Improve the site.** The showcase lives in `site/` (VitePress).

## Add a mod

1. Create `mods/<mod>/`. The folder name is the mod's install name: lowercase, words joined by `-`.

   ```
   mods/<mod>/
   ├── .claude-plugin/plugin.json   # name, version, description, author, keywords
   ├── hooks/                       # hooks.json and the hooks module
   ├── commands/                    # slash commands, if any
   ├── types/                       # the mod's state contract
   ├── tests/
   ├── preview.png                  # optional: screenshot or GIF for the site
   └── README.md
   ```

2. Fill in `plugin.json`. The site reads it:

   ```json
   {
     "name": "<mod>",
     "version": "0.1.0",
     "description": "One sentence: what the user sees and when.",
     "author": { "name": "<your GitHub username>", "url": "https://github.com/<you>" },
     "keywords": ["fun", "statusline"]
   }
   ```

   `author` is how you get credit on the site. `keywords` become the mod's tags.

3. Add the mod to the `plugins` list in `.claude-plugin/marketplace.json`:

   ```json
   { "name": "<mod>", "source": "./mods/<mod>", "description": "<one line>" }
   ```

4. Add a row to the table in `README.md`.

5. Run the checks:

   ```
   node scripts/check-registry.mjs
   claude plugin validate .
   claude plugin validate mods/<mod>
   claude plugin test mods/<mod>
   ```

6. Open a pull request. CI runs the registry check and builds the site.

## Write the README

Each mod's `README.md` becomes its page on the site, as is. Follow the shape the existing mods use:

1. `# <mod>` and one paragraph on what it does.
2. **A preview right after the first paragraph.** A fenced code block that draws what the mod looks like in the terminal (see `mods/heat` or `mods/usage-bar`). The site shows this preview on the mod's card. A `preview.png`, `preview.gif` or `preview.webp` in the mod folder is used instead when present.
3. Features or how it works, commands, requirements, settings.
4. `## Install` with `/plugin install <mod> --marketplace omeerdvrn/o-mods`.

Links to files inside the mod (`hooks/register.tsx`) are turned into GitHub links on the site.

## Develop a mod

Add your clone as a local marketplace and install from it. Claude Code then reads each mod straight from its folder:

```
claude plugin marketplace add /path/to/o-mods
claude plugin install <mod>@o-mods --scope user
```

After you edit a mod, run `/reload-plugins` in any open session. To run one mod in one session only, with reload on save:

```
claude --plugin-dir mods/<mod>
```

The mod API is in early access. Mods need Claude Code 2.1.29x or later.

## Record a demo

Every mod should show itself running in the Claude Code CLI. Demos are recorded with [VHS](https://github.com/charmbracelet/vhs), so anyone can re-record one after a change:

```
brew install vhs
vhs mods/<mod>/demo.tape
```

`demo.tape` writes `mods/<mod>/preview.gif`, which the site shows on the mod's card and page. Copy the tape of a mod close to yours and change the steps. Keep demos short (10–25 seconds), 1200×650, and record in a session with only your mod loaded:

- Start Claude with `--plugin-dir mods/<mod>` and `CLAUDE_CONFIG_DIR` pointed at a throwaway config, so other plugins stay out of frame.
- Keep the welcome banner out of the GIF: start under `Hide`, run `/clear`, then `Show`.
- Use example data only. No real tickets, repos, names or org details on screen.

## Preview the site

```
cd site
npm install
npm run dev
```

The site rebuilds mod pages from `mods/*/README.md` each time it starts.

## Rules

- No secrets, tokens, personal data, or employer or client names in code, tests, READMEs or screenshots. Use `acme`, `example.com` and `ENG-123` in examples.
- Mods must not send data off the machine unless that is their purpose and the README says so up front.
- Bundled sounds, images and fonts must be yours or under a license that allows redistribution. Name the source in the README.
- By contributing you agree your work is released under the [MIT License](https://github.com/omeerdvrn/o-mods/blob/main/LICENSE).
