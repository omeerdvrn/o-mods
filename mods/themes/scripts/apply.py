#!/usr/bin/env python3
"""
Applies a themes theme the way Claude Code reads custom themes.

  apply.py use <slug>        write ~/.claude/themes/themes.json from themes/<slug>.json and point the
                             theme setting at custom:themes (once; settings.json is backed up first)
  apply.py restore <theme>   set the theme setting back to <theme> (the person's own, e.g. dark)

Claude Code watches ~/.claude/themes and reloads a changed theme file live, so switching themes is a rewrite
of that one file. Prints what it changed, one line each.
"""
import json, os, shutil, sys, tempfile

HOME = os.path.expanduser('~')
THEMES = os.path.join(HOME, '.claude', 'themes')
TARGET = os.path.join(THEMES, 'themes.json')
SETTINGS = os.path.join(HOME, '.claude', 'settings.json')
SETTING = 'custom:themes'
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def write_atomic(path, text):
    handle, temp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.themes.')
    with os.fdopen(handle, 'w') as out:
        out.write(text)
    os.replace(temp, path)


def set_theme_setting(value):
    settings = json.load(open(SETTINGS)) if os.path.exists(SETTINGS) else {}
    if settings.get('theme') == value:
        return False
    backup = SETTINGS + '.themes.bak'
    if os.path.exists(SETTINGS) and not os.path.exists(backup):
        shutil.copy(SETTINGS, backup)
    settings['theme'] = value
    write_atomic(SETTINGS, json.dumps(settings, indent=2, ensure_ascii=False) + '\n')
    return True


def main(argv):
    if argv[:1] == ['use'] and len(argv) == 2:
        theme = json.load(open(os.path.join(HERE, 'themes', f'{argv[1]}.json')))
        created = not os.path.isdir(THEMES)
        os.makedirs(THEMES, exist_ok=True)
        theme['name'] = f"{theme['name']} (themes)"
        text = json.dumps(theme, indent=2, ensure_ascii=False) + '\n'
        if not os.path.exists(TARGET) or open(TARGET).read() != text:
            # In place, not by rename: Claude Code's watcher on the theme file sees a write, and can miss a swap.
            with open(TARGET, 'w') as out:
                out.write(text)
            print('wrote theme')
        if created:
            print('created themes folder')
        if set_theme_setting(SETTING):
            print('set theme setting')
        return 0
    if argv[:1] == ['restore'] and len(argv) == 2:
        if set_theme_setting(argv[1]):
            print('set theme setting')
        return 0
    print(__doc__)
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
