Output mods/snippets/preview.gif
Source demo/setup.tape
Set Framerate 24

# Hidden: the fake Linear server from the linear demo, for the ticket typeahead.
Hide
Type `claude mcp add -s user linear -- node "$OMODS_ROOT/mods/linear/demo/linear-mcp.mjs" >/dev/null 2>&1; clear` Enter
Sleep 3s
Type `cd "$OMODS_PROJECT" && claude --plugin-dir "$OMODS_ROOT/mods/snippets"`
Enter
Wait+Screen@40s /mode on/
Sleep 4s
Ctrl+L
Show
Sleep 1s
Type "/snippets"
Sleep 1s
Enter
Sleep 3.5s
Set TypingSpeed 45ms
Type "fix the expiry bug in src/auth/session.ts for ENG-13"
Sleep 3s
Tab
Sleep 1s
Type ", cc @sam "
Sleep 1.5s
Type ";;"
Sleep 2.5s
Type "plan"
Sleep 1.2s
Tab
Sleep 300ms
Type " "
Sleep 3.5s
Enter
Sleep 5s
Type "and test it on staging with AKIAIOSFODNN7EXAMPLE"
Sleep 4.5s
Hide
Ctrl+C
Ctrl+C
