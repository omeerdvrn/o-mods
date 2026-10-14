Output mods/themes/preview.gif
Source demo/setup.tape
Set Framerate 24

# Hidden: the themes mod writes $HOME/.claude/themes, so HOME points at the throwaway config (nothing real
# is touched), and the session runs in a fake trusted project instead of the repo.
Hide
Type `mkdir -p "$OMODS_CONFIG/home" && ln -sfn "$OMODS_CONFIG" "$OMODS_CONFIG/home/.claude" && export HOME="$OMODS_CONFIG/home"` Enter
Type `P=/tmp/omods-themes/acme-app && rm -rf /tmp/omods-themes && mkdir -p $P/src/app $P/src/components $P/src/checkout $P/tests && touch $P/package.json $P/README.md` Enter
Type `node -e 'const f=process.argv[1],p=process.argv[2],fs=require("fs"),c=JSON.parse(fs.readFileSync(f));for(const k of [p,fs.realpathSync(p)])c.projects[k]={hasTrustDialogAccepted:true,hasCompletedProjectOnboarding:true};Object.assign(c,{hasSeenAutoDefaultNudge:true,hasSeenAutoModeEntryWarning:true,hasResetAutoModeOptInForDefaultOffer:true,lastReleaseNotesSeen:"2.1.300",lastClawdEntranceVersion:"2.1.300"});fs.writeFileSync(f,JSON.stringify(c))' "$OMODS_CONFIG/.claude.json" $P` Enter
Type `M="$OMODS_ROOT/mods" && cd $P && clear && claude --plugin-dir $M/themes` Enter
Sleep 6s
Show

Sleep 2s
Type "what's in this repo"
Enter
Sleep 4s
Type "/themes dracula"
Sleep 600ms
Enter
Sleep 2.5s
Type "/themes gruvbox"
Sleep 600ms
Enter
Sleep 2.5s
Type "/themes synthwave"
Sleep 600ms
Enter
Sleep 2.5s
Type "/themes nord"
Sleep 600ms
Enter
Sleep 4s
Ctrl+C
Ctrl+C
