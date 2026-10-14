# snippets

The input bar, smarter.

![snippets running in Claude Code](preview.gif)

- **Ticket typeahead:** type a ticket id (`ENG-`, `ENG-34`) and your Linear issues show in the typeahead with
  their titles and status; take one with Tab or Enter. Your open issues, kept fresh every ten minutes.
- **Live highlighting** as you type: your tickets bold in blue, other ticket ids in cyan, file paths in green,
  `@mentions` in purple, `;;snippets` in amber, and anything that looks like a secret (API keys, tokens,
  private keys, `password=…`) in red, with a warning, before you send it.
- **Pasted image previews:** paste an image and a small thumbnail shows above the input, labeled with its
  `[Image #N]` number; delete the tag and it goes, send and the row clears. Claude Code keeps pasted images to
  itself, so the mod saves a small copy from the clipboard the moment the tag appears, with a tiny helper
  compiled once from `scripts/clipthumb.swift` (about 0.15 s a paste; AppleScript fallback without Swift) into
  `~/Library/Caches/snippets/pasted`. Pictures need a terminal that shows them (WezTerm,
  kitty, Ghostty, iTerm2); elsewhere it shows the tag as text.
- **Snippets:** type `;;name` and a space, and it expands. `;;` alone lists them in the typeahead. Sent without
  the space, it expands too.

| Snippet | Expands to |
| --- | --- |
| `;;mmi` | Merge origin main into this branch and resolve conflicts. |
| `;;plan` | A short plan first: files, approach, risks; wait for the go. |
| `;;review` | Review this branch for bugs, edge cases and missing tests, by severity. |
| `;;tests` | Run the tests and fix failures the changes caused. |
| `;;pr` | Open a PR with a clear title and a summary of what and why. |
| `;;explain` | Explain how this works, step by step, naming files and functions. |
| `;;tldr` | Summarize the last answer in three bullets. |
| `;;cont` | Continue where you left off. |

`/snippets` lists them; `/snippets add <name> <text>` adds or changes one; `/snippets remove <name>` drops one.
