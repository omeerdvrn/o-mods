Output mods/persona/preview.gif
Source demo/setup.tape
Set Framerate 24

# Hidden: build a fake project (mods/persona/demo/make-project.sh), trust it in the throwaway config,
# and start Claude Code in it.
Hide
Type `M="$OMODS_ROOT/mods" && sh $M/persona/demo/make-project.sh && P=/tmp/omods-persona/acme-shop` Enter
Type `node -e 'const f=process.argv[1],p=process.argv[2],fs=require("fs"),c=JSON.parse(fs.readFileSync(f));for(const k of [p,fs.realpathSync(p)])c.projects[k]={hasTrustDialogAccepted:true,hasCompletedProjectOnboarding:true};Object.assign(c,{hasSeenAutoModeEntryWarning:true,lastReleaseNotesSeen:"2.1.300",lastClawdEntranceVersion:"2.1.300"});fs.writeFileSync(f,JSON.stringify(c))' "$OMODS_CONFIG/.claude.json" $P` Enter
Type `cd $P && clear && claude --plugin-dir $M/persona` Enter
Sleep 6s
Show

Sleep 1.5s
Type "/persona ui-ux"
Sleep 600ms
Enter
Sleep 3s
Type "make the button corners rounded"
Enter
Sleep 7s
Type "add a discount field to orders"
Enter
Sleep 10s
Sleep 3s
Ctrl+C
Ctrl+C
