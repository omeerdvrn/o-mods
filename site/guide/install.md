---
title: Install a mod
description: Add the o-mods collection once, then install any mod by its name.
aside: false
---

# Install a mod

You need Claude Code 2.1.29x or later. Add the o-mods collection once, then install any mod by its name.

<InstallCommand steps :lines="['claude plugin marketplace add omeerdvrn/o-mods', 'claude plugin install heat@o-mods']" />

<!-- TODO: content review needed (builder-written, not in Copy) -->
Replace `heat` with the name of any mod. A mod you install loads in every session. Add `--scope project` to install one for the current repository only.

Check your version with `claude --version`. Update with `claude update`.

## Update a mod

<!-- TODO: content review needed -->

```
claude plugin update <mod>
```

Then run `/reload-plugins` in any open session.

## Remove a mod

<!-- TODO: content review needed -->

```
claude plugin uninstall <mod>
```

o-mods is a community project. It is not affiliated with or endorsed by Anthropic.
