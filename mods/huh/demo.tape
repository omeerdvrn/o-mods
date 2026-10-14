# recorder: kitty (the readable page is a typeset picture, which VHS's terminal cannot show)
Output mods/huh/preview.gif
Source demo/style.tape
Set Height 800
Source demo/session.tape

# Hidden: install huh from this repo into the throwaway config, with the cell
# size of the recording terminal (kitty, JetBrains Mono 14 pt, Retina) so the
# typeset page is drawn 1:1.
Hide
Type `claude plugin marketplace add "$OMODS_ROOT" >/dev/null && claude plugin install huh@o-mods >/dev/null` Enter
Wait+Screen@60s /❯\s*$/
Type `echo '{"cellSize":"17x33"}' | claude plugin configure huh@o-mods --values-stdin >/dev/null && clear` Enter
Wait+Screen@30s /❯\s*$/
Type "claude" Enter
Wait+Screen@40s /mode on/
Sleep 1s
Show

Sleep 1s
Type "why is checkout slow?"
Sleep 500ms
Enter
Wait+Screen@30s /Let me know/
Sleep 2.5s
Type "/huh"
Sleep 600ms
Enter
Wait+Screen@40s /In short/
Sleep 3s
Type "/huh light"
Sleep 600ms
Enter
# The typeset page is picture strips; kitty shows them as U+10EEEE placeholders.
Wait+Screen@90s /\uDBFB\uDEEE/
Sleep 6s
Hide
Ctrl+C
Ctrl+C
