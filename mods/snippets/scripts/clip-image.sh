#!/bin/sh
# Saves the image on the clipboard as a small PNG thumbnail: <out.png> <max-px>; prints "<width> <height>".
# `--build` only builds the helper (the mod does that at session start, so the first paste is fast too).
# Uses a tiny compiled helper (built once from clipthumb.swift, a few seconds, then milliseconds per paste);
# without swiftc it falls back to AppleScript and sips, which take about two seconds.
out="$1"; max="${2:-360}"
here="$(cd "$(dirname "$0")" && pwd)"
bin="$HOME/Library/Caches/snippets/clipthumb"
if [ ! -x "$bin" ] || [ "$here/clipthumb.swift" -nt "$bin" ]; then
  mkdir -p "$(dirname "$bin")"
  xcrun swiftc -O "$here/clipthumb.swift" -o "$bin" >/dev/null 2>&1 || swiftc -O "$here/clipthumb.swift" -o "$bin" >/dev/null 2>&1
fi
[ "$out" = "--build" ] && exit 0
if [ -x "$bin" ]; then
  exec "$bin" "$out" "$max"
fi
mkdir -p "$(dirname "$out")"
full="${out%.png}-full.png"
osascript -e "set imgData to (the clipboard as «class PNGf»)" \
          -e "set f to open for access (POSIX file \"$full\") with write permission" \
          -e "set eof of f to 0" -e "write imgData to f" -e "close access f" >/dev/null 2>&1 || exit 1
sips -Z "$max" -s format png "$full" --out "$out" >/dev/null 2>&1 || exit 1
rm -f "$full"
sips -g pixelWidth -g pixelHeight "$out" 2>/dev/null | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w, h}'
