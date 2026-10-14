#!/usr/bin/env node
// Plays a demo.tape in a real kitty window and records it, for mods that draw
// pictures: Claude Code draws them with kitty's Unicode placeholders, which
// VHS's terminal cannot show. record.sh runs this instead of VHS when a tape's
// first line is `# recorder: kitty`.
//
// It understands the subset of VHS the demos use: Output, Source, Set Width/
// Height/FontSize/TypingSpeed, Hide, Show, Type, Sleep, Wait+Screen, keys
// (Enter, Tab, Escape, Space, Backspace, arrows, Ctrl+<key>) with a count.
// demo/session.tape is not played: the window starts in the same clean shell.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'

const [tapePath] = process.argv.slice(2)
const env = process.env
const root = env.OMODS_ROOT
const work = join(env.OMODS_CONFIG, 'kitty')
const frames = join(work, 'frames')
rmSync(work, { recursive: true, force: true })
mkdirSync(frames, { recursive: true })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const duration = text => (text.endsWith('ms') ? parseFloat(text) : parseFloat(text) * 1000)

// The tape, with Source inlined (session.tape left out) and comments dropped.
const lines = file =>
  readFileSync(join(root, file), 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .flatMap(line => {
      const source = /^Source\s+(\S+)/.exec(line)
      if (!source) return [line]
      return source[1].endsWith('session.tape') ? [] : lines(source[1])
    })
const tape = lines(tapePath)

const look = { Width: 1200, Height: 650, FontSize: 15, Padding: 24, TypingSpeed: 45 }
let output = 'preview.gif'
for (const line of tape) {
  const set = /^Set\s+(Width|Height|FontSize|Padding|TypingSpeed)\s+(\S+)/.exec(line)
  if (set) look[set[1]] = set[1] === 'TypingSpeed' ? duration(set[2]) : Number(set[2])
  const out = /^Output\s+(\S+)/.exec(line)
  if (out) output = out[1]
}
// The same terminal size in cells as VHS would give.
const cols = Math.round((look.Width - 2 * look.Padding) / (look.FontSize * 0.6))
const rows = Math.round((look.Height - 2 * look.Padding) / (look.FontSize * 1.3))

// The window: a clean shell like demo/session.tape's, but keeping what tells
// Claude Code it is in kitty, so it draws pictures.
const shell = [
  'exec env -i',
  `HOME="${env.OMODS_CONFIG}/home" PATH="${env.PATH}" LANG=en_US.UTF-8`,
  'TERM="$TERM" TERMINFO="$TERMINFO" KITTY_WINDOW_ID="$KITTY_WINDOW_ID" KITTY_PID="$KITTY_PID" KITTY_INSTALLATION_DIR="$KITTY_INSTALLATION_DIR" COLORTERM=truecolor',
  `OMODS_ROOT="${root}" OMODS_PORT="${env.OMODS_PORT}" OMODS_CONFIG="${env.OMODS_CONFIG}" OMODS_PROJECT="${env.OMODS_PROJECT}"`,
  `CLAUDE_CONFIG_DIR="${env.OMODS_CONFIG}" ANTHROPIC_BASE_URL="http://127.0.0.1:${env.OMODS_PORT}"`,
  'ANTHROPIC_API_KEY=sk-ant-demo-fake-key-for-local-mock-0000 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_AUTOUPDATER=1',
  `PS1='%F{173}❯%f ' zsh -f`,
].join(' ')
const kitty = existsSync('/Applications/kitty.app') ? '/Applications/kitty.app/Contents/MacOS/kitty' : 'kitty'
const socket = join(work, 'kitty.sock')
const gui = spawn(
  kitty,
  [
    '--config', join(root, 'demo/kitty.conf'),
    '-o', `initial_window_width=${cols}c`, '-o', `initial_window_height=${rows}c`,
    '-o', 'allow_remote_control=socket-only', '--listen-on', `unix:${socket}`,
    '--directory', env.OMODS_PROJECT, 'zsh', '-fc', shell,
  ],
  { stdio: 'ignore' },
)

// kitty's remote control, spoken over its socket: one short connection per
// command, no process started per keystroke.
const command = (cmd, payload, wantsReply) =>
  new Promise((resolve, reject) => {
    const connection = createConnection(socket)
    let reply = ''
    connection.on('error', reject)
    connection.on('data', chunk => {
      reply += chunk
      const done = /\x1bP@kitty-cmd([\s\S]*?)\x1b\\/.exec(reply)
      if (done) {
        connection.end()
        resolve(JSON.parse(done[1]))
      }
    })
    const message = { cmd, version: [0, 49, 2], payload, ...(wantsReply ? {} : { no_response: true }) }
    connection.write(`\x1bP@kitty-cmd${JSON.stringify(message)}\x1b\\`, () => {
      if (!wantsReply) {
        connection.end()
        resolve()
      }
    })
  })
const send = text => command('send-text', { data: `base64:${Buffer.from(text).toString('base64')}`, match: null }, false)
const screen = async () => (await command('get-text', { extent: 'screen' }, true)).data ?? ''

for (let i = 0; i < 100 && !existsSync(socket); i++) await sleep(100)
await sleep(1500)
// kitty stops drawing a window that is covered, and the capture then repeats
// a stale frame: keep the window in front while the tape is shown.
const raise = () => command('focus-window', { match: null }, false).catch(() => undefined)
await raise()

// The window's id, for capturing just it (it may be on another Space).
const finder = join(work, 'window.swift')
writeFileSync(
  finder,
  `import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
let mine = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == ${gui.pid} && ($0[kCGWindowLayer as String] as? Int) == 0 }
func area(_ w: [String: Any]) -> Double { let b = w[kCGWindowBounds as String] as! [String: Any]; return (b["Width"] as! Double) * (b["Height"] as! Double) }
let big = mine.max { area($0) < area($1) }
print(big?[kCGWindowNumber as String] ?? "")
`,
)
const windowId = execFileSync('swift', [finder], { encoding: 'utf8' }).trim()
if (!windowId) throw new Error('could not find the kitty window')

// Frames are taken by a few capture workers while the tape is shown.
let shown = false
let recording = true
let count = 0
const capture = async () => {
  while (recording) {
    if (!shown) {
      await sleep(20)
      continue
    }
    const at = Date.now()
    const file = join(frames, `${at}-${count++}.jpg`)
    await new Promise(resolve => spawn('screencapture', ['-x', '-o', '-t', 'jpg', `-l${windowId}`, file]).on('exit', resolve))
  }
}
const workers = Array.from({ length: 4 }, capture)
const cuts = [] // times the tape was hidden: no frame spans them

const KEYS = { Enter: '\r', Tab: '\t', Escape: '\x1b', Space: ' ', Backspace: '\x7f', Up: '\x1b[A', Down: '\x1b[B', Right: '\x1b[C', Left: '\x1b[D' }

for (const line of tape) {
  if (line.startsWith('Set ') || line.startsWith('Output ')) continue
  if (line === 'Hide') {
    shown = false
    cuts.push(Date.now())
    continue
  }
  if (line === 'Show') {
    await raise()
    await sleep(300)
    shown = true
    continue
  }
  const typed = /^Type(?:@(\S+))?\s+(["`])([\s\S]*)\2(\s+Enter)?$/.exec(line)
  if (typed) {
    const speed = typed[1] ? duration(typed[1]) : look.TypingSpeed
    for (const char of typed[3]) {
      await send(char)
      await sleep(speed)
    }
    if (typed[4]) await send('\r')
    continue
  }
  const pause = /^Sleep\s+(\S+)/.exec(line)
  if (pause) {
    await sleep(duration(pause[1]))
    continue
  }
  const wait = /^Wait(?:\+Screen)?(?:@(\S+))?\s+\/(.*)\/$/.exec(line)
  if (wait) {
    const until = Date.now() + (wait[1] ? duration(wait[1]) : 15_000)
    const pattern = new RegExp(wait[2], 'm')
    while (!pattern.test(await screen())) {
      if (Date.now() > until) throw new Error(`timed out waiting for /${wait[2]}/`)
      await sleep(200)
    }
    continue
  }
  const key = /^(Ctrl\+)?(\w+)(?:\s+(\d+))?$/.exec(line)
  if (key) {
    const text = key[1] ? String.fromCharCode(key[2].toUpperCase().charCodeAt(0) - 64) : KEYS[key[2]]
    if (text === undefined) throw new Error(`unknown key: ${line}`)
    for (let i = 0; i < Number(key[3] ?? 1); i++) {
      await send(text)
      await sleep(look.TypingSpeed)
    }
    continue
  }
  const shot = /^Screenshot\s+(\S+)/.exec(line)
  if (shot) {
    // The screen as text, beside the recording's work files, for debugging a tape.
    writeFileSync(join(work, `${shot[1]}.txt`), await screen())
    continue
  }
  throw new Error(`not supported in kitty recordings: ${line}`)
}

recording = false
await Promise.all(workers)
const end = Date.now()
gui.kill()

// Each frame lasts until the next one, or until the tape was hidden.
const shots = readdirSync(frames)
  .map(file => ({ file, at: Number(file.split('-')[0]) }))
  .sort((a, b) => a.at - b.at)
const list = shots.map((shot, i) => {
  const next = Math.min(shots[i + 1]?.at ?? end, ...cuts.filter(cut => cut > shot.at), end)
  return `file '${join(frames, shot.file)}'\nduration ${Math.max(0.01, (next - shot.at) / 1000).toFixed(3)}`
})
writeFileSync(join(work, 'frames.txt'), list.join('\n') + `\nfile '${join(frames, shots.at(-1).file)}'\n`)

const gif = join(root, output)
mkdirSync(dirname(gif), { recursive: true })
execFileSync('ffmpeg', [
  '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(work, 'frames.txt'),
  '-vf', `fps=15,scale=${look.Width}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
  gif,
])
console.log(`${shots.length} frames → ${output}`)
