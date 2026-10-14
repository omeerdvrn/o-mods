# recorder: kitty (the crab is a picture, which VHS's terminal cannot show)
Output mods/persona/preview.gif
Source demo/setup.tape

Hide
Type `sh "$OMODS_ROOT/mods/persona/demo/make-project.sh" && clear` Enter
Type `claude --plugin-dir "$OMODS_ROOT/mods/persona"` Enter
Wait+Screen@40s /mode on/
Sleep 1s
Show

Sleep 1s
Type "/persona ui-ux"
Sleep 600ms
Enter
Wait+Screen@20s /UI\/UX Designer\s*$/
Sleep 2s
Type "make the button corners rounded"
Enter
Wait+Screen@40s /soft rounded-lg corners/
Wait+Screen@20s /for shortcuts/
Sleep 2s
Type "add a discount field to orders"
Enter
Wait+Screen@40s /checkout card/
Wait+Screen@20s /for shortcuts/
Sleep 3s
Type "/persona backend"
Sleep 500ms
Enter
Wait+Screen@20s /Backend Developer\s*$/
Sleep 2s
Type "/persona qa"
Sleep 500ms
Enter
Wait+Screen@20s /QA Engineer\s*$/
Sleep 2s
Type "/persona docs"
Sleep 500ms
Enter
Wait+Screen@20s /Technical Writer\s*$/
Sleep 3s
Hide
Ctrl+C
Ctrl+C
