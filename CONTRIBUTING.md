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
   ├── demo.tape, demo.json         # the recorded demo (see "Record a demo")
   ├── preview.gif, preview.mp4     # written by demo/record.sh
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
2. **A preview right after the first paragraph.** A fenced code block that draws what the mod looks like in the terminal (see `mods/heat` or `mods/usage-bar`). The site plays the recorded demo on the mod's card and page; this drawing is the fallback until one exists.
3. Features or how it works, commands, requirements, settings.
4. `## Install` with `claude plugin marketplace add omeerdvrn/o-mods` and `claude plugin install <mod>@o-mods`.

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

Every mod shows itself running in the Claude Code CLI: a `preview.gif`, and a `preview.mp4` the site plays. Demos are scripted and recorded against a local mock of the Claude API, so they need no account and cost nothing:

```
brew install vhs gifsicle ffmpeg
demo/record.sh <mod>
```

Mods that draw pictures also need kitty (`brew install --cask kitty`).

Add `mods/<mod>/demo.tape` (what is typed) and `mods/<mod>/demo.json` (what Claude answers). Copy them from a mod close to yours. [demo/README.md](https://github.com/omeerdvrn/o-mods/blob/main/demo/README.md) covers the format, isolation, fake services, and what to check before you open a pull request.

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
