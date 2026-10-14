# Starts the demo shell, hidden: a clean environment (nothing from your own
# leaks in), HOME and Claude Code config pointed at the throwaway ones, and
# the CLI pointed at the mock API.
Hide
Type `exec env -i HOME="$OMODS_CONFIG/home" PATH="$PATH" TERM=xterm-256color LANG=en_US.UTF-8 OMODS_ROOT="$OMODS_ROOT" OMODS_PORT="$OMODS_PORT" OMODS_CONFIG="$OMODS_CONFIG" OMODS_PROJECT="$OMODS_PROJECT" zsh -f` Enter
Sleep 500ms
Type `cd "$OMODS_PROJECT" && export CLAUDE_CONFIG_DIR="$OMODS_CONFIG" ANTHROPIC_BASE_URL="http://127.0.0.1:$OMODS_PORT" ANTHROPIC_API_KEY=sk-ant-demo-fake-key-for-local-mock-0000 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_AUTOUPDATER=1 PS1='%F{173}❯%f ' && clear` Enter
Sleep 500ms
Show
