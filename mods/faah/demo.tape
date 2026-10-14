Output mods/faah/preview.gif
Source demo/setup.tape
Set Framerate 24

Hide
Type `cd "$OMODS_PROJECT" && cp -R "$OMODS_ROOT/mods/faah/demo/acme/." . && claude --plugin-dir "$OMODS_ROOT/mods/faah"`
Enter
Wait+Screen@40s /mode on/
Sleep 4s
Ctrl+L
Show
Sleep 1s
Set TypingSpeed 50ms
Type "/faah"
Sleep 800ms
Enter
Sleep 4.5s
Type "run the tests"
Sleep 500ms
Enter
Wait+Screen@30s /fix them/
Sleep 3s
Type "/faah test"
Sleep 800ms
Enter
Wait+Screen@30s /Played/
Sleep 4s
Hide
Ctrl+C
Ctrl+C
