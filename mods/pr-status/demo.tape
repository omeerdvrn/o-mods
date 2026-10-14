Output mods/pr-status/preview.gif
Source demo/setup.tape
Set Framerate 24

# Hidden: put the fake gh first on PATH, build the throwaway repo (branch with
# an open fake PR #42; pushes go to a local bare repo), and start Claude Code.
Hide
Type `export PATH="$OMODS_ROOT/mods/pr-status/demo/bin:$PATH" FAKE_GH_STATE="$HOME/webapp/.git/fake-gh" && "$OMODS_ROOT/mods/pr-status/demo/make-repo.sh" "$HOME/webapp" && cd "$HOME/webapp" && clear` Enter
Sleep 2s
Type `claude --plugin-dir "$OMODS_ROOT/mods/pr-status"`
Enter
Wait+Screen@90s /PR #42/
Show

Sleep 1s
Wait+Screen@60s /failing: CI/
Wait+Screen@30s /Fix the failing/
Sleep 3s
Tab
Sleep 1s
Enter
Wait+Screen@90s /running again/
Wait+Screen@60s /5 passed/
Sleep 4s
