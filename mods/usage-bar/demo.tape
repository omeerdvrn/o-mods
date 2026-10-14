Output mods/usage-bar/preview.gif
Source demo/setup.tape
Set Framerate 24

# Hidden: build a fake repository (mods/usage-bar/demo/make-repo.sh), trust it in the throwaway config,
# and start Claude Code in it.
Hide
Type `M="$OMODS_ROOT/mods" && sh $M/usage-bar/demo/make-repo.sh && P=/tmp/omods-usage/acme-api` Enter
Type `node -e 'const f=process.argv[1],p=process.argv[2],fs=require("fs"),c=JSON.parse(fs.readFileSync(f));for(const k of [p,fs.realpathSync(p)])c.projects[k]={hasTrustDialogAccepted:true,hasCompletedProjectOnboarding:true};Object.assign(c,{hasSeenAutoModeEntryWarning:true,lastReleaseNotesSeen:"2.1.300",lastClawdEntranceVersion:"2.1.300"});fs.writeFileSync(f,JSON.stringify(c))' "$OMODS_CONFIG/.claude.json" $P` Enter
Type `cd $P && clear && claude --plugin-dir $M/usage-bar` Enter
Sleep 6s
Show

Sleep 3.5s
Type "commit the staged tax fix"
Enter
Sleep 8s
Type "switch back to main"
Enter
Sleep 8s
Sleep 4s
Ctrl+C
Ctrl+C
