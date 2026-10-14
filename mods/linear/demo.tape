Output mods/linear/preview.gif
# Inlined copy of demo/setup.tape (VHS ignores Width/Height/FontSize set
# after Source), widened so the docked sidebar fits (it needs >=144 columns).
# It starts a clean shell (nothing from your own environment leaks
# into the recording) and points Claude Code at the mock API.
Set Shell zsh
Set FontFamily "JetBrainsMono NFM"
Set FontSize 13
Set Width 1500
Set Height 800
Set Framerate 20
Set Padding 24
Set TypingSpeed 45ms
Set Theme { "name": "o-mods", "black": "#1a1714", "red": "#e5786d", "green": "#9ccc8c", "yellow": "#e5c07b", "blue": "#7aa2f7", "magenta": "#c49bd9", "cyan": "#7fc8c8", "white": "#e8e0d6", "brightBlack": "#6b635b", "brightRed": "#f08a7f", "brightGreen": "#b5dea5", "brightYellow": "#f0d394", "brightBlue": "#94b6ff", "brightMagenta": "#d6b0e8", "brightCyan": "#9adada", "brightWhite": "#ffffff", "background": "#1a1714", "foreground": "#e8e0d6", "selection": "#3a342e", "cursor": "#d97757" }

Hide
Type `exec env -i HOME="$OMODS_CONFIG/home" PATH="$PATH" TERM=xterm-256color LANG=en_US.UTF-8 OMODS_ROOT="$OMODS_ROOT" OMODS_PORT="$OMODS_PORT" OMODS_CONFIG="$OMODS_CONFIG" zsh -f` Enter
Sleep 500ms
Type `cd "$OMODS_ROOT" && export CLAUDE_CONFIG_DIR="$OMODS_CONFIG" ANTHROPIC_BASE_URL="http://127.0.0.1:$OMODS_PORT" ANTHROPIC_API_KEY=sk-ant-demo-fake-key-for-local-mock-0000 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_AUTOUPDATER=1 PS1='%F{173}❯%f ' && clear` Enter
Sleep 500ms
Show

# Hidden: register the fake Linear MCP server (demo/linear-mcp.mjs) in the
# throwaway config, make a throwaway git repo to work in (so the header shows
# ~/webapp), then start Claude Code and wait for the sidebar to sync.
Hide
Type `claude mcp add -s user linear -- node "$OMODS_ROOT/mods/linear/demo/linear-mcp.mjs" >/dev/null 2>&1; "$OMODS_ROOT/mods/linear/demo/make-repo.sh" "$HOME/webapp" && cd "$HOME/webapp" && clear` Enter
Sleep 4s
Type `claude --plugin-dir "$OMODS_ROOT/mods/linear"`
Enter
Wait+Screen@90s /All 7/
Sleep 1s
Show

Sleep 5s
Type "which issue should I pick up next?"
Enter
Wait+Screen@90s /ENG-128 dark mode\./
Sleep 6s
