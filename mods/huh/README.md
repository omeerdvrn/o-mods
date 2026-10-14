# huh

`/huh` opens Claude's last answer in the sidebar, made easy to read. The answer shows at once, formatted for
the terminal; meanwhile Claude (Haiku, low effort) rewrites it for reading, and the sidebar switches to that:

- **In short:** one to three sentences up top, in a panel: what happened, and what you need to do.
- Short sections under clear headings, short paragraphs, lists for steps.
- Every fact, path, command and code block kept as it was; nothing added.

Nothing is spent until you ask: the rewrite runs only when you call `/huh`. A long answer is rewritten in parts
at the same time, with the summary beside them, so it takes about as long as a short one.

**Show original** switches back to the answer as Claude wrote it. Nothing is saved anywhere and nothing else
opens: it all stays in the sidebar, in the terminal and in the desktop app.

## How it is drawn

On the **light** and **dark** pages, where the terminal shows pictures (WezTerm, kitty, Ghostty, iTerm2, herdr
with pictures on), the answer is **typeset like a web page**: a real proportional font at about the terminal's
size, 1.65 line spacing, larger headings with rules, the "In short" in a tinted panel, clean tables and code.
A headless browser (Chrome, Chromium, Edge or Brave) draws it; it shows in the sidebar as picture strips, cut
between lines, and the pane scrolls through them. Only a cache is written (`~/Library/Caches/huh`); nothing
opens. It follows the sidebar's width and redraws when you switch page or version.

On **terminal colors**, in the desktop app, and wherever pictures do not show, the answer is drawn as text:
Claude Code's own Markdown renderer on terminal colors, the page's own colors on light and dark.

The page is drawn at exactly the sidebar's size in screen pixels and cut into strips a whole number of rows
tall, so the terminal shows it 1:1 and it stays sharp. That needs a terminal cell's size in pixels, which a mod
cannot read: the `cellSize` option (default `17x37`, JetBrains Mono 14 pt on a Retina screen) sets it. If the
page looks soft or stretched, measure one cell (a screenshot at full size, a column's width and a line's
height) and set it.

Switch with the page button, or `/huh light`, `/huh dark`, `/huh terminal`; the choice is kept. The page
design is `scripts/page.css`.
