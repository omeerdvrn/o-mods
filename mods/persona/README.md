# persona

Sets the role Claude works for on this machine. Each persona adds a role prompt to the system prompt and denies edits and shell commands outside its scope. A denied call never runs. Claude is told to explain the change that's needed instead of working around the block.

![persona running in Claude Code](preview.gif)

## Personas

| Id | Name | May edit | Blocked |
| --- | --- | --- | --- |
| `ui-ux` | UI/UX Designer | Components, pages, styles, assets, stories, Tailwind and PostCSS config | API, server, database, migrations, `.sql`/`.prisma`/`.graphql`, secrets, infra, DB and deploy commands |
| `backend` | Backend Developer | Everything except UI | `.tsx`/`.jsx`/`.vue`/`.svelte`, stylesheets, `components/`, `public/`, secrets, deploy commands |
| `dev` | Developer | All application code | Secrets, CI workflows, Docker, Terraform, Kubernetes, Helm, deploy commands |
| `qa` | QA Engineer | Tests, specs, fixtures, mocks, snapshots, test config | Application code, secrets, migrations, deploy commands |
| `docs` | Technical Writer | Markdown, MDX, `docs/`, READMEs, changelogs | Code, secrets, DB and deploy commands |
| `pm` | Product Manager | Nothing in the project | Every write, `git commit`/`push`/`reset`, package installs, DB and deploy commands |

## Use

```
/persona            # status and list
/persona ui-ux      # switch (names work too: /persona designer)
/persona off        # clear
```

The choice is saved on this machine and applies to every session and project. The persona shows at the end of the hint line under the prompt.

- In terminals that show pictures through the kitty graphics protocol (kitty, Ghostty, and others with it on), it is the Claude crab dressed for the role, one row tall, then the role's name.
- In the Claude desktop app, which shows no hint line, the role's name joins the footer's mode labels, beside the model.
- In every other terminal, including inside tmux and other multiplexers, it is the role's name alone.

The mod finds out which by trying once: it draws the picture, and when the terminal shows the picture's placeholder text instead, it switches to the name.

### Showing the crab in WezTerm and herdr

kitty and Ghostty show the crab with no setup. WezTerm, and herdr in front of it, need three settings. persona sets them for you:

| Command | What it does |
| --- | --- |
| `/persona pictures` | Lists what this machine needs, file by file. Changes nothing. |
| `/persona pictures fix` | Makes those changes, keeping a backup of each file, and says what to restart. |

The changes:

- **WezTerm config:** `config.enable_kitty_graphics = true`.
- **herdr config, before herdr 0.9:** `[experimental] kitty_graphics = true`. From 0.9, herdr has this on by default.
- **Shell profile (zsh, bash or fish):** inside herdr only, `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`. herdr calls itself tmux, and its terminal (libghostty) is not on Claude Code's list of terminals that show pictures, so Claude Code needs telling.

After the fix, quit WezTerm and open it again, then start Claude Code from a new herdr pane.

When the crab cannot show but the terminal can be set up for it, persona says so once, in a notification. `/persona status` says whether the picture showed, and why not when it did not.

persona never changes these files on its own. They are your terminal's and shell's settings, so they change only when you run `/persona pictures fix`.

| Persona | The crab |
| --- | --- |
| Developer | headphones, a laptop in front |
| UI/UX Designer | a beret, a brush held up and a palette |
| Backend Developer | a hard hat with a lamp, a server rack |
| QA Engineer | a detective's cap, a magnifying glass |
| Technical Writer | a pencil behind the ear, an open book |
| Product Manager | a clipboard |

A persona you define in a file gets the crab alone. The crab is 16×8 pixel art, drawn as a picture four cells wide and one row tall.

To pin a persona without the command, set `CLAUDE_PERSONA` in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_PERSONA": "ui-ux" } }
```

`CLAUDE_PERSONA` wins over the saved choice. `CLAUDE_PERSONA=off` disables personas for that shell.

## What it checks

- `Edit`, `Write` and `NotebookEdit`: the target path, and the real path when it is a symbolic link.
- `Bash`: each persona's blocked command patterns, plus the files a command visibly writes: redirects (`>`, `>>`), `tee`, `sed -i`, `perl -i`, `rm`, `mv`, `touch`, `mkdir`, copy destinations, and `git checkout`/`restore`/`rm`/`mv`. `patch` and `git apply` are denied under a restricted persona because their target files can't be checked.
- Rules apply to files inside the session's working directory. Outside it, for example scratch files, memory and plans, only the blocked list applies.

The Bash check is best effort. A script that writes files on its own (`python -c`, `node -e`, a build step) isn't read.

## Customize

Add a JSON file per persona in `~/.claude/personas/` for this machine, or in `<project>/.claude/personas/` for one repository. Both are read at session start and on every `/persona` call, and the project file wins. A file with a built-in id changes that persona. Any other id adds a new persona.

```json
{
  "id": "ui-ux",
  "extraAllow": ["src/hooks/use*.ts"],
  "extraDeny": ["src/lib/api-client/**"],
  "extraBashDeny": ["\\bnpm\\s+run\\s+db:"]
}
```

| Field | Meaning |
| --- | --- |
| `id`, `name`, `summary`, `prompt` | Identity and the text added to the system prompt |
| `writes` | `"none"`, or `{ "allow": [globs], "deny": [globs] }`. Without `allow`, any path that isn't denied may be written. A deny match always wins. |
| `bashDeny` | Regular expressions for blocked commands |
| `extraAllow`, `extraDeny`, `extraBashDeny` | Added to the existing lists instead of replacing them |

Globs are matched against the path relative to the project. `**` spans folders, `*` and `?` match within one folder, and `{a,b}` matches either.

## Develop

```
claude plugin validate mods/persona
claude plugin test mods/persona
```
