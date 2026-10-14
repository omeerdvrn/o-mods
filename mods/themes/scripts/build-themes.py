"""Writes themes/<slug>.json from the palettes below. Run: python3 scripts/build-themes.py"""
import json, os

# name, base, then: bg, surface0, surface1, overlay, text, subtext, red, orange, yellow, green, teal, sky, blue, lavender, mauve, pink, accent
PALETTES = {
    'catppuccin-mocha': ('Catppuccin Mocha', 'dark', '#1e1e2e #313244 #45475a #6c7086 #cdd6f4 #a6adc8 #f38ba8 #fab387 #f9e2af #a6e3a1 #94e2d5 #89dceb #89b4fa #b4befe #cba6f7 #f5c2e7 #cba6f7'),
    'catppuccin-macchiato': ('Catppuccin Macchiato', 'dark', '#24273a #363a4f #494d64 #6e738d #cad3f5 #a5adcb #ed8796 #f5a97f #eed49f #a6da95 #8bd5ca #91d7e3 #8aadf4 #b7bdf8 #c6a0f6 #f5bde6 #c6a0f6'),
    'catppuccin-frappe': ('Catppuccin Frappé', 'dark', '#303446 #414559 #51576d #737994 #c6d0f5 #a5adce #e78284 #ef9f76 #e5c890 #a6d189 #81c8be #99d1db #8caaee #babbf1 #ca9ee6 #f4b8e4 #ca9ee6'),
    'catppuccin-latte': ('Catppuccin Latte', 'light', '#eff1f5 #ccd0da #bcc0cc #9ca0b0 #4c4f69 #6c6f85 #d20f39 #fe640b #df8e1d #40a02b #179299 #04a5e5 #1e66f5 #7287fd #8839ef #ea76cb #8839ef'),
    'dracula': ('Dracula', 'dark', '#282a36 #44475a #4d5066 #6272a4 #f8f8f2 #c0c3d4 #ff5555 #ffb86c #f1fa8c #50fa7b #8be9fd #8be9fd #8be9fd #bd93f9 #bd93f9 #ff79c6 #bd93f9'),
    'nord': ('Nord', 'dark', '#2e3440 #3b4252 #434c5e #616e88 #eceff4 #d8dee9 #bf616a #d08770 #ebcb8b #a3be8c #8fbcbb #88c0d0 #81a1c1 #5e81ac #b48ead #b48ead #88c0d0'),
    'tokyo-night': ('Tokyo Night', 'dark', '#1a1b26 #24283b #414868 #565f89 #c0caf5 #a9b1d6 #f7768e #ff9e64 #e0af68 #9ece6a #73daca #7dcfff #7aa2f7 #2ac3de #bb9af7 #bb9af7 #7aa2f7'),
    'gruvbox-dark': ('Gruvbox Dark', 'dark', '#282828 #3c3836 #504945 #928374 #ebdbb2 #d5c4a1 #fb4934 #fe8019 #fabd2f #b8bb26 #8ec07c #83a598 #83a598 #83a598 #d3869b #d3869b #fe8019'),
    'rose-pine': ('Rosé Pine', 'dark', '#191724 #26233a #403d52 #6e6a86 #e0def4 #908caa #eb6f92 #ebbcba #f6c177 #9ccfd8 #9ccfd8 #9ccfd8 #9ccfd8 #c4a7e7 #c4a7e7 #ebbcba #c4a7e7'),
    'one-dark': ('One Dark', 'dark', '#282c34 #2c313a #3e4451 #5c6370 #abb2bf #9da5b4 #e06c75 #d19a66 #e5c07b #98c379 #56b6c2 #56b6c2 #61afef #61afef #c678dd #c678dd #61afef'),
    'solarized-dark': ('Solarized Dark', 'dark', '#002b36 #073642 #0f4a57 #657b83 #93a1a1 #839496 #dc322f #cb4b16 #b58900 #859900 #2aa198 #2aa198 #268bd2 #6c71c4 #6c71c4 #d33682 #268bd2'),
    'everforest': ('Everforest', 'dark', '#2d353b #343f44 #475258 #859289 #d3c6aa #9da9a0 #e67e80 #e69875 #dbbc7f #a7c080 #83c092 #7fbbb3 #7fbbb3 #7fbbb3 #d699b6 #d699b6 #a7c080'),
    'synthwave': ('Synthwave \'84', 'dark', '#262335 #34294f #495495 #848bbd #ffffff #c9c6e8 #fe4450 #f97e72 #fede5d #72f1b8 #36f9f6 #36f9f6 #2ee2fa #b893ce #ff7edb #ff7edb #ff7edb'),
    'kanagawa': ('Kanagawa', 'dark', '#1f1f28 #2a2a37 #363646 #727169 #dcd7ba #c8c093 #e46876 #ffa066 #e6c384 #98bb6c #7aa89f #7fb4ca #7e9cd8 #9cabca #957fb8 #d27e99 #7e9cd8'),
}

def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def mix(a, b, share):
    """`share` of color a over color b."""
    return '#' + ''.join(f'{round(x * share + y * (1 - share)):02x}' for x, y in zip(rgb(a), rgb(b)))

def theme(name, base, colors):
    bg, s0, s1, ov, text, sub, red, orange, yellow, green, teal, sky, blue, lav, mauve, pink, accent = colors.split()
    return {
        'name': name,
        'base': base,
        'overrides': {
            'claude': accent, 'claudeShimmer': mix(accent, text, 0.6),
            # The logo crab and the "Claude" label, which use keys of their own.
            'clawd_body': accent, 'briefLabelClaude': accent, 'briefLabelYou': blue,
            'text': text, 'inverseText': bg, 'inactive': ov, 'subtle': s1,
            'suggestion': blue, 'permission': lav, 'permissionShimmer': mix(lav, text, 0.6), 'remember': blue,
            'success': green, 'error': red, 'warning': yellow, 'warningShimmer': mix(yellow, text, 0.6), 'merged': mauve,
            'promptBorder': ov, 'promptBorderShimmer': sub, 'inactiveShimmer': sub,
            'planMode': teal, 'autoAccept': mauve, 'bashBorder': pink, 'ide': sky,
            'fastMode': orange, 'fastModeShimmer': mix(orange, text, 0.6),
            'diffAdded': mix(green, bg, 0.3), 'diffRemoved': mix(red, bg, 0.3),
            'diffAddedDimmed': mix(green, bg, 0.15), 'diffRemovedDimmed': mix(red, bg, 0.15),
            'diffAddedWord': mix(green, bg, 0.55), 'diffRemovedWord': mix(red, bg, 0.55),
            'userMessageBackground': s0, 'userMessageBackgroundHover': s1,
            'bashMessageBackgroundColor': s0, 'memoryBackgroundColor': s0, 'selectionBg': s1,
            'rate_limit_fill': accent, 'rate_limit_empty': s1,
            'red_FOR_SUBAGENTS_ONLY': red, 'blue_FOR_SUBAGENTS_ONLY': blue, 'green_FOR_SUBAGENTS_ONLY': green,
            'yellow_FOR_SUBAGENTS_ONLY': yellow, 'purple_FOR_SUBAGENTS_ONLY': mauve, 'orange_FOR_SUBAGENTS_ONLY': orange,
            'pink_FOR_SUBAGENTS_ONLY': pink, 'cyan_FOR_SUBAGENTS_ONLY': sky,
        },
    }

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'themes')
for slug, (name, base, colors) in PALETTES.items():
    with open(os.path.join(root, f'{slug}.json'), 'w') as out:
        json.dump(theme(name, base, colors), out, indent=2, ensure_ascii=False)
        out.write('\n')
print(len(PALETTES), 'themes')
