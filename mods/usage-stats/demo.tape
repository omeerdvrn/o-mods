Output mods/usage-stats/preview.gif
# Inlined copy of demo/setup.tape (VHS ignores Set after Source), widened so the
# side pane fits. HOME is the throwaway config's home, so the scanner's
# ~/.claude/projects is the fake logs gen-logs.mjs writes, nothing real.
Set Shell zsh
Set FontFamily "JetBrainsMono NFM"
Set FontSize 13
Set Width 1500
Set Height 800
Set Padding 24
Set TypingSpeed 45ms
Set Theme { "name": "o-mods", "black": "#1a1714", "red": "#e5786d", "green": "#9ccc8c", "yellow": "#e5c07b", "blue": "#7aa2f7", "magenta": "#c49bd9", "cyan": "#7fc8c8", "white": "#e8e0d6", "brightBlack": "#6b635b", "brightRed": "#f08a7f", "brightGreen": "#b5dea5", "brightYellow": "#f0d394", "brightBlue": "#94b6ff", "brightMagenta": "#d6b0e8", "brightCyan": "#9adada", "brightWhite": "#ffffff", "background": "#1a1714", "foreground": "#e8e0d6", "selection": "#3a342e", "cursor": "#d97757" }

Hide
Type `exec env -i HOME="$OMODS_CONFIG/home" PATH="$PATH" TERM=xterm-256color LANG=en_US.UTF-8 OMODS_ROOT="$OMODS_ROOT" OMODS_PORT="$OMODS_PORT" OMODS_CONFIG="$OMODS_CONFIG" zsh -f` Enter
Sleep 500ms
Type `cd "$OMODS_ROOT" && export CLAUDE_CONFIG_DIR="$OMODS_CONFIG" ANTHROPIC_BASE_URL="http://127.0.0.1:$OMODS_PORT" ANTHROPIC_API_KEY=sk-ant-demo-fake-key-for-local-mock-0000 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_AUTOUPDATER=1 PS1='%F{173}❯%f ' && clear` Enter
Sleep 500ms
Show
Set Framerate 24

Hide
Type `node mods/usage-stats/demo/gen-logs.mjs "$OMODS_CONFIG" >/dev/null && claude mcp add -s user linear -- node "$OMODS_ROOT/mods/usage-stats/demo/linear-mcp.mjs" >/dev/null 2>&1; mkdir -p "$HOME/src/webapp" && node -e 'const f=process.argv[1],p=process.argv[2],fs=require("fs"),c=JSON.parse(fs.readFileSync(f));c.projects[p]={hasTrustDialogAccepted:true,hasCompletedProjectOnboarding:true};fs.writeFileSync(f,JSON.stringify(c))' "$OMODS_CONFIG/.claude.json" "$HOME/src/webapp" && cd "$HOME/src/webapp" && clear` Enter
Sleep 4s
Type `claude --plugin-dir "$OMODS_ROOT/mods/usage-stats"`
Enter
Sleep 7s
Show

Type "/usage-stats"
Sleep 800ms
Enter
Sleep 12s
Hide
Ctrl+C
Sleep 500ms
Ctrl+C
