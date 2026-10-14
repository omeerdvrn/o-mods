import { hex, mix, noise } from './engine'
import type { Activity, Burst, Canvas } from './engine'

/** How long a burst plays over the scene. */
export const BURST_MS = 3500

const CONFETTI = [hex('#ff5f7a'), hex('#ffd34d'), hex('#4fd1ff'), hex('#7dff8a'), hex('#c58aff'), hex('#ffffff')]
const CLOUD = hex('#7a8296')
const CLOUD_DARK = hex('#5a6276')
const DROP = hex('#8ab8ff')
const ROCKET = hex('#e8ecf5')
const ROCKET_TIP = hex('#ff4a5a')
const WINDOW = hex('#4fd1ff')
const FLAME = [hex('#fff3b0'), hex('#ffb33a'), hex('#ff5a2a')]
const SMOKE = hex('#9a9aa8')
const STAMP = hex('#3ad17a')
const STAMP_DARK = hex('#1f8a4c')

/** Tests passed: confetti bursts up from the bottom and flutters down. */
function confetti(canvas: Canvas, t: number) {
  const { width, height } = canvas
  for (let index = 0; index < Math.round(width * 0.7); index++) {
    const x0 = noise(index * 3 + 1) * width
    const up = 0.6 + noise(index * 3 + 2) * 0.8
    // Up fast, then down slowly, swaying.
    const y = height - (up * height * 1.6 * t - height * 1.1 * t * t)
    const x = x0 + Math.sin(t * 12 + index) * 2
    if (t > 0.85 && noise(index + 7) < (t - 0.85) * 6) continue
    canvas.put(x, y, CONFETTI[index % CONFETTI.length]!)
  }
}

/** Tests failed: a grey cloud drifts over and rains. */
function rainCloud(canvas: Canvas, t: number) {
  const { width, height } = canvas
  const x = width * 0.15 + t * width * 0.25
  const y = height * 0.15
  for (const [dx, dy, r] of [[0, 1, 2.5], [3, 0, 3.2], [7, 0.5, 3], [10, 1.5, 2.2]] as const) canvas.disc(x + dx, y + dy, r, CLOUD)
  canvas.fill(x - 2, y + 2, x + 12, y + 3, CLOUD_DARK)
  for (let index = 0; index < 12; index++) {
    const fall = (t * 4 + noise(index)) % 1
    canvas.put(x - 1 + noise(index + 30) * 13, y + 4 + fall * (height - y - 4), DROP)
  }
}

/** Pushed: a rocket lifts off from the bottom, flame and smoke behind it. */
function rocket(canvas: Canvas, t: number) {
  const { width, height } = canvas
  const x = Math.round(width * 0.82)
  const y = height - 2 - t * t * (height + 14)
  canvas.sprite(['..t..', '.rrr.', '.rwr.', '.rrr.', 'rrrrr', 'r...r'], { t: ROCKET_TIP, r: ROCKET, w: WINDOW }, x - 2, y - 6)
  for (let step = 0; step < 6; step++) {
    canvas.put(x, y + step, FLAME[Math.min(2, Math.floor(step / 2))]!)
    if (step > 1) canvas.put(x + (step % 2 ? 1 : -1), y + step, FLAME[2]!)
  }
  for (let puff = 0; puff < 10; puff++) {
    const age = noise(puff) * t
    canvas.put(x + (noise(puff + 20) - 0.5) * 8 * age * 3, height - 1 - age * 4, mix(SMOKE, hex('#000000'), age))
  }
}

/** Committed: a green check stamps down and fades. */
function stamp(canvas: Canvas, t: number) {
  const { width, height } = canvas
  const size = Math.round(Math.max(4, height * 0.4) * (t < 0.15 ? 1.6 - t * 4 : 1))
  const cx = Math.round(width * 0.82)
  const cy = Math.round(height / 2)
  if (t > 0.8 && Math.floor(t * 30) % 2) return
  canvas.disc(cx, cy, size, STAMP_DARK)
  canvas.disc(cx, cy, size - 1, STAMP)
  canvas.line(cx - size * 0.45, cy, cx - size * 0.1, cy + size * 0.4, hex('#ffffff'))
  canvas.line(cx - size * 0.1, cy + size * 0.4, cx + size * 0.5, cy - size * 0.4, hex('#ffffff'))
}

const DRAW: Record<Burst['kind'], (canvas: Canvas, t: number) => void> = {
  'tests-pass': confetti,
  'tests-fail': rainCloud,
  push: rocket,
  commit: stamp,
}

/** Every burst still playing, over whatever scene is drawn. */
export function drawBursts(canvas: Canvas, act: Activity) {
  for (const burst of act.bursts) {
    const age = act.now - burst.at
    if (age >= 0 && age < BURST_MS) DRAW[burst.kind](canvas, age / BURST_MS)
  }
}
