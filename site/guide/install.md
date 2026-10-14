# Install a mod

In a terminal, run:

```
claude plugin marketplace add omeerdvrn/o-mods
claude plugin install <mod>@o-mods
```

For example:

```
claude plugin marketplace add omeerdvrn/o-mods
claude plugin install heat@o-mods
```

The first command adds the marketplace and is needed only once. Mods install at user scope, so they load in every session, including the desktop app's Code tab; add `--scope project` to install one for the current repository only. Run `/reload-plugins` in any open session to load it there.

Each mod's page lists what it needs and its settings, which you can change with `/plugin`.

## Requirements

Mods use Claude Code's function-hook mod API, which is in early access. They need Claude Code **2.1.29x or later**. Check `claude --version`, and check your mods after major Claude Code updates.

## Update

```
claude plugin update <mod>
```

Then run `/reload-plugins` in any open session.

## Remove

```
claude plugin uninstall <mod>
```
