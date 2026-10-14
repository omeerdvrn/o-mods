#!/usr/bin/env python3
"""
Typesets an answer (Markdown) as a page for the reader's sidebar: real fonts, line spacing, headings, drawn by a
headless browser and cut into strips the sidebar shows one under the other.

Reads JSON on stdin: {"markdown": "...", "title": "...", "page": "light"|"dark", "columns": n, "cell": [w, h]}:
the sidebar's width in columns and a terminal cell's size in device pixels. The page is drawn at exactly that
many pixels across and cut into strips a whole number of cells tall, so the terminal shows it 1:1, unscaled.
Prints JSON: {"strips": [png paths], "width": px, "heights": [px], "problem": text|null}.
Only a cache is written (~/Library/Caches/huh); nothing opens.
"""
import hashlib, html, json, os, re, shutil, struct, subprocess, sys, tempfile, zlib

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.expanduser('~/Library/Caches/huh')
SCALE = 2  # device pixels per CSS pixel: crisp text on a Retina screen
STRIP = 1400  # device pixels per strip
BROWSERS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser',
]


# ---------------------------------------------------------------- Markdown to HTML

def inline(text):
    parts = re.split(r'(`[^`]+`)', text)
    out = []
    for part in parts:
        if part.startswith('`') and part.endswith('`') and len(part) > 1:
            out.append(f'<code>{html.escape(part[1:-1])}</code>')
            continue
        part = html.escape(part)
        part = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'<a>\1</a>', part)
        part = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', part)
        part = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', part)
        out.append(part)
    return ''.join(out)


def fallback_html(markdown):
    """Markdown to HTML for when pandoc is not installed: the shapes Claude's answers use."""
    lines = markdown.replace('\r\n', '\n').split('\n')
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        fence = re.match(r'^\s*(```|~~~)', line)
        if fence:
            body, i = [], i + 1
            while i < len(lines) and not lines[i].strip().startswith(fence.group(1)):
                body.append(lines[i])
                i += 1
            out.append(f'<pre><code>{html.escape(chr(10).join(body))}</code></pre>')
            i += 1
            continue
        heading = re.match(r'^(#{1,6})\s+(.*)', line)
        if heading:
            level = len(heading.group(1))
            out.append(f'<h{level}>{inline(heading.group(2).strip())}</h{level}>')
            i += 1
            continue
        if re.match(r'^\s*(-{3,}|\*{3,}|_{3,})\s*$', line):
            out.append('<hr>')
            i += 1
            continue
        if line.strip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|?\s*:?-{2,}', lines[i + 1]):
            cells = lambda row: [cell.strip() for cell in row.strip().strip('|').split('|')]
            head, rows, i = cells(line), [], i + 2
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(cells(lines[i]))
                i += 1
            out.append('<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in row) + '</tr>' for row in rows) + '</tbody></table>')
            continue
        if line.startswith('>'):
            quote = []
            while i < len(lines) and lines[i].startswith('>'):
                quote.append(lines[i][1:].lstrip())
                i += 1
            out.append(f'<blockquote>{fallback_html(chr(10).join(quote))}</blockquote>')
            continue
        if re.match(r'^(\s*)([-*+]|\d+[.)])\s+', line):
            stack, chunk = [], []
            while i < len(lines):
                found = re.match(r'^(\s*)([-*+]|\d+[.)])\s+(.*)', lines[i])
                if not found:
                    if lines[i].startswith('  ') and lines[i].strip() and chunk:
                        chunk[-1] += ' ' + inline(lines[i].strip())
                        i += 1
                        continue
                    break
                depth = len(found.group(1).replace('\t', '    ')) // 2
                kind = 'ol' if found.group(2)[0].isdigit() else 'ul'
                while len(stack) > depth + 1 or (stack and len(stack) == depth + 1 and stack[-1] != kind):
                    chunk.append(f'</li></{stack.pop()}>')
                if len(stack) < depth + 1:
                    stack.append(kind)
                    chunk.append(f'<{kind}><li>')
                else:
                    chunk.append('</li><li>')
                chunk.append(inline(found.group(3)))
                i += 1
            while stack:
                chunk.append(f'</li></{stack.pop()}>')
            out.append(''.join(chunk))
            continue
        if not line.strip():
            i += 1
            continue
        paragraph = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,6}\s|\s*```|\s*~~~|>|\s*([-*+]|\d+[.)])\s|\|)', lines[i]):
            paragraph.append(lines[i].strip())
            i += 1
        out.append(f'<p>{inline(" ".join(paragraph))}</p>')
    return '\n'.join(out)


def to_html(markdown):
    pandoc = shutil.which('pandoc') or ('/opt/homebrew/bin/pandoc' if os.path.exists('/opt/homebrew/bin/pandoc') else None)
    if pandoc:
        ran = subprocess.run([pandoc, '-f', 'gfm', '-t', 'html5', '--no-highlight'], input=markdown, capture_output=True, text=True, timeout=30)
        if ran.returncode == 0:
            return ran.stdout
    return fallback_html(markdown)


def document(markdown, title, page, width):
    css = open(os.path.join(HERE, 'scripts', 'page.css')).read()
    body = to_html(markdown)
    # "In short: ..." opening the answer gets its own panel.
    body = re.sub(r'^\s*<p><strong>In short:?</strong>:?(.*?)</p>', r'<aside class="short"><strong>In short</strong>\1</aside>', body, count=1, flags=re.S)
    return (f'<!doctype html><html class="{page}"><head><meta charset="utf-8"><style>{css}</style>'
            f'<style>body{{width:{width}px}}</style></head>'
            f'<body><h1 class="title">{html.escape(title)}</h1>{body}<div id="end"></div></body></html>')


# ---------------------------------------------------------------- PNG: read, crop to the content, cut into strips

def read_png(path):
    data = open(path, 'rb').read()
    pos, chunks = 8, []
    width = height = color = 0
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            width, height, _, color = struct.unpack('>IIBB', body[:10])
        elif kind == b'IDAT':
            chunks.append(body)
        pos += 12 + length
    channels = {2: 3, 6: 4}[color]
    raw = zlib.decompress(b''.join(chunks))
    stride = width * channels
    rows, previous = [], bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        kind = raw[start]
        line = bytearray(raw[start + 1:start + 1 + stride])
        if kind == 1:
            for x in range(channels, stride):
                line[x] = (line[x] + line[x - channels]) & 255
        elif kind == 2:
            for x in range(stride):
                line[x] = (line[x] + previous[x]) & 255
        elif kind == 3:
            for x in range(stride):
                left = line[x - channels] if x >= channels else 0
                line[x] = (line[x] + ((left + previous[x]) >> 1)) & 255
        elif kind == 4:
            for x in range(stride):
                a = line[x - channels] if x >= channels else 0
                b = previous[x]
                c = previous[x - channels] if x >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line))
        previous = line
    return width, channels, rows


def read_pixels(path):
    """The screenshot's rows. macOS's sips turns it into a raw bitmap in a few milliseconds, where unfiltering
    the PNG in Python takes seconds; read_png is the fallback where sips is missing."""
    sips = shutil.which('sips') or ('/usr/bin/sips' if os.path.exists('/usr/bin/sips') else None)
    if sips:
        bmp = path + '.bmp'
        ran = subprocess.run([sips, '-s', 'format', 'bmp', path, '--out', bmp], capture_output=True, timeout=30)
        if ran.returncode == 0 and os.path.exists(bmp):
            data = open(bmp, 'rb').read()
            os.remove(bmp)
            offset, = struct.unpack('<I', data[10:14])
            width, height, _, bits = struct.unpack('<iiHH', data[18:30])
            if bits in (24, 32) and struct.unpack('<I', data[30:34])[0] in (0, 3):
                channels = bits // 8
                stride = (width * channels + 3) & ~3
                rows = []
                for y in range(abs(height)):
                    row = data[offset + y * stride:offset + y * stride + width * channels]
                    rgb = bytearray(width * 3)
                    rgb[0::3], rgb[1::3], rgb[2::3] = row[2::channels], row[1::channels], row[0::channels]
                    rows.append(bytes(rgb))
                if height > 0:
                    rows.reverse()  # a positive height is stored bottom-up
                return width, 3, rows
    return read_png(path)


def write_png(path, width, channels, rows):
    raw = b''.join(b'\x00' + row for row in rows)
    chunk = lambda kind, body: struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))
    color = {3: 2, 4: 6}[channels]
    with open(path, 'wb') as out:
        out.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, len(rows), 8, color, 0, 0, 0))
                  + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))


def browser():
    for candidate in BROWSERS:
        path = candidate if os.path.isabs(candidate) else shutil.which(candidate)
        if path and os.path.exists(path):
            return path
    return None


def main():
    job = json.load(sys.stdin)
    cell_width, cell_height = (int(value) for value in (job.get('cell') or [17, 37]))
    columns = int(job.get('columns') or 64)
    target = columns * cell_width
    width = -(-target // SCALE)  # CSS pixels, rounded up; the extra device pixel is trimmed off
    page = job.get('page') if job.get('page') in ('light', 'dark') else 'light'
    key = hashlib.sha1(json.dumps([job['markdown'], job.get('title'), page, width, cell_height, open(os.path.join(HERE, 'scripts', 'page.css')).read()]).encode()).hexdigest()[:16]
    folder = os.path.join(CACHE, key)
    done = os.path.join(folder, 'strips.json')
    if os.path.exists(done):
        print(open(done).read())
        return
    found = browser()
    if not found:
        print(json.dumps({'strips': [], 'width': 0, 'heights': [], 'problem': 'no Chrome, Chromium, Edge or Brave to typeset with'}))
        return
    os.makedirs(folder, exist_ok=True)
    page_path = os.path.join(folder, 'page.html')
    with open(page_path, 'w') as out:
        out.write(document(job['markdown'], job.get('title', ''), page, width))
    # Tall enough for the whole answer; the empty page below the text is cropped off.
    estimate = max(1200, int(len(job['markdown']) / max(20, width / 11) * 34 + 1600))
    shot = os.path.join(folder, 'shot.png')
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run([found, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', f'--user-data-dir={profile}',
                        f'--force-device-scale-factor={SCALE}', f'--window-size={width},{estimate}', f'--screenshot={shot}', 'file://' + page_path],
                       capture_output=True, timeout=90)
    if not os.path.exists(shot):
        print(json.dumps({'strips': [], 'width': 0, 'heights': [], 'problem': 'the browser did not draw the page'}))
        return
    pixel_width, channels, rows = read_pixels(shot)
    if pixel_width > target:
        rows = [row[:target * channels] for row in rows]
        pixel_width = target
    background = rows[-1][:channels]
    blank = background * pixel_width
    last = len(rows) - 1
    while last > 0 and rows[last] == blank:
        last -= 1
    rows = rows[:min(len(rows), last + 1 + 24 * SCALE)]
    # Whole cells tall: pad the bottom with page to the next row of cells.
    rows += [blank] * ((-len(rows)) % cell_height)
    strip = (STRIP // cell_height) * cell_height
    # Cut between lines of text: at the empty band nearest each strip's end, so no line is split.
    cuts, start = [], 0
    while len(rows) - start > strip:
        cut = start + strip
        # Back up a whole cell at a time to a band between lines, so every strip stays whole cells tall.
        for back in range(0, strip // 3, cell_height):
            if rows[cut - back] == blank and rows[cut - back - 1] == blank:
                cut -= back
                break
        cuts.append((start, cut))
        start = cut
    cuts.append((start, len(rows)))
    strips, heights = [], []
    for index, (start, end) in enumerate(cuts):
        part = rows[start:end]
        path = os.path.join(folder, f'strip-{index + 1}.png')
        write_png(path, pixel_width, channels, part)
        strips.append(path)
        heights.append(len(part))
    os.remove(shot)
    result = json.dumps({'strips': strips, 'width': pixel_width, 'heights': heights, 'problem': None})
    with open(done, 'w') as out:
        out.write(result)
    print(result)


if __name__ == '__main__':
    main()
