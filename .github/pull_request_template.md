## What this changes

<!-- New mod, or a change to an existing one? One or two sentences. -->

## Checklist

- [ ] The mod lives in `mods/<mod>/` with `.claude-plugin/plugin.json` and a `README.md`
- [ ] New mods: added to `.claude-plugin/marketplace.json` and the table in `README.md`
- [ ] `node scripts/check-registry.mjs` passes
- [ ] `claude plugin validate mods/<mod>` and `claude plugin test mods/<mod>` pass
- [ ] Tried it in a real session (`claude --plugin-dir mods/<mod>`)
- [ ] No secrets, personal data, or employer/client names in code, tests or screenshots
