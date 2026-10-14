# Install a mod

In a Claude Code terminal session, run:

```
/plugin install <mod> --marketplace omeerdvrn/o-mods
```

For example:

```
/plugin install heat --marketplace omeerdvrn/o-mods
```

1. Type `y` to add the marketplace. Claude Code asks only the first time.
2. Select a scope. The user scope makes the mod load in every session.
3. Set the mod's options, or keep the defaults.

The mod is active immediately. Each mod's page lists what it needs and its settings.

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
