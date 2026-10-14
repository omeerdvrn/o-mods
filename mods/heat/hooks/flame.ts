/**
 * The "flame" style: a solid fire instead of the classic particle burst (fire.ts).
 *
 * In the terminal, a heat field rises and cools a row at a time (the classic demo-scene fire), drawn with
 * half blocks, so every cell holds two pixels: a solid body from white-hot to deep red that flickers and
 * burns out. On the desktop, flame tongues in an animated SVG, softened with blur, with sparks rising.
 */
import { COLD } from './heat'

const DEFAULT_COLOR = 0x01000000
const SPACE = 0x20
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
/** Field values at or below this draw nothing, so the fire fades into the terminal's own background. */
const CUTOFF = 0.07
const STEP_MS = 16

/** Heat 0 to 1 over the range that lights a fire. */
function intensity(heat: number): number {
  return Math.max(0, Math.min(1, (heat - COLD) / (100 - COLD)))
}

/** How long a flame burst lasts: longer than the classic one, so it can build, roar and die down. */
export function flameDuration(heat: number): number {
  return Math.round(900 + intensity(heat) * 1600)
}

/** A small seeded generator, so every frame of one burst replays the same fire. */
function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

/** Field value 0 to 1 to color: ember red through orange and yellow to white-hot. */
const STOPS: [number, number][] = [
  [0, 0x2a0603],
  [0.12, 0x5c0d04],
  [0.25, 0x9a1c06],
  [0.4, 0xd63a0a],
  [0.55, 0xf26914],
  [0.7, 0xffa128],
  [0.84, 0xffd257],
  [1, 0xfff6d6],
]
const PALETTE = Array.from({ length: 64 }, (_, index) => {
  const value = index / 63
  const upper = STOPS.findIndex(([at]) => at >= value)
  if (upper <= 0) return STOPS[0]![1]
  const [a, from] = STOPS[upper - 1]!
  const [b, to] = STOPS[upper]!
  const mix = (value - a) / (b - a)
  const channel = (shift: number) =>
    Math.round(((from >> shift) & 255) + (((to >> shift) & 255) - ((from >> shift) & 255)) * mix)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
})

function colorOf(value: number): number {
  return PALETTE[Math.max(0, Math.min(63, Math.round(value * 63)))]!
}

type Spark = { x0: number; spawn: number; speed: number; life: number; phase: number }

type Fire = {
  key: string
  width: number
  height: number
  field: Float32Array
  steps: number
  phase: number
  next: () => number
  sparks: Spark[]
}

let fire: Fire | null = null

/** Where the burst's source burns at `share` of its life: kindles, holds, then is starved and dies down. */
function envelope(share: number): number {
  if (share < 0.08) return share / 0.08
  if (share < 0.5) return 1
  if (share < 0.7) return 1 - (share - 0.5) / 0.2
  return 0
}

function kindle(seed: number, heat: number, width: number, height: number, key: string): Fire {
  const t = intensity(heat)
  const next = random(seed)
  const duration = flameDuration(heat) / 1000
  const half = Math.max(2, (width * (0.2 + 0.8 * t)) / 2)
  const sparks = Array.from({ length: Math.round(3 + t * 22) }, () => ({
    x0: width / 2 + (next() * 2 - 1) * half * 0.8,
    spawn: next() * duration * 0.6,
    speed: height * (1.2 + next() * 1.4),
    life: 0.35 + next() * 0.5,
    phase: next() * Math.PI * 2,
  }))
  return { key, width, height, field: new Float32Array(width * height), steps: 0, phase: next() * Math.PI * 2, next, sparks }
}

/** One step: the source row burns, and every row takes the row below it, shifted a little and cooled. */
function step(state: Fire, heat: number, share: number) {
  const { width, height, field, next } = state
  const t = intensity(heat)
  const half = Math.max(2, (width * (0.2 + 0.8 * t)) / 2)
  const centre = width / 2
  const burn = envelope(share)
  const bottom = (height - 1) * width
  // Hot spots wander along the source, so the fire rises in tongues instead of one even wall.
  const time = state.steps * (STEP_MS / 1000)
  for (let x = 0; x < width; x++) {
    const reach = 1 - ((x + 0.5 - centre) / half) ** 2
    const spots = 0.5 + 0.5 * Math.sin(x * 0.55 + time * 6 + state.phase) * Math.sin(x * 0.21 - time * 3.7)
    field[bottom + x] = reach <= 0 ? 0 : burn * Math.min(1, reach * 1.8) * (0.45 + 0.55 * spots) * (0.85 + 0.15 * next())
  }
  // A hotter fire cools slower, so it climbs higher before it fades; tongues lean with a slow wind.
  const cooling = 1 / ((0.45 + 0.5 * t) * height)
  const wind = Math.sin(time * 2.3 + state.phase) * 0.35
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = field[y * width + x]!
      const roll = next() + wind
      const shift = roll < 0.2 ? -1 : roll > 0.8 ? 1 : 0
      const drift = Math.min(width - 1, Math.max(0, x + shift))
      // Hot cores carry further; thin edges cool off fast and break into licks.
      const loss = next() * 2 * cooling * (source < 0.35 ? 1.6 : 1)
      field[(y - 1) * width + drift] = Math.max(0, source - loss)
    }
  }
  state.steps += 1
}

/** Pixel color at (x, y), or null where the fire leaves the background showing. */
function pixel(state: Fire, x: number, y: number, sparks: Map<number, number>): number | null {
  const value = state.field[y * state.width + x]!
  if (value > CUTOFF) return colorOf(value)
  return sparks.get(y * state.width + x) ?? null
}

/** One frame of the flame at `elapsedMs`, as Raster cells: little-endian u32 triplets [codePoint, fg, bg]. */
export function flameFrame(seed: number, heat: number, elapsedMs: number, columns: number, rows: number): Uint32Array {
  const width = columns
  const height = rows * 2
  const key = `${seed}:${heat}:${width}x${height}`
  const target = Math.floor(elapsedMs / STEP_MS)
  if (fire === null || fire.key !== key || fire.steps > target) fire = kindle(seed, heat, width, height, key)
  const duration = flameDuration(heat)
  while (fire.steps < target) step(fire, heat, (fire.steps * STEP_MS) / duration)

  // Sparks: single bright pixels flying up out of the flame, cooling as they go.
  const lit = new Map<number, number>()
  const age = elapsedMs / 1000
  for (const spark of fire.sparks) {
    const own = age - spark.spawn
    if (own < 0 || own > spark.life) continue
    const y = Math.round(height - 1 - spark.speed * own)
    const x = Math.round(spark.x0 + Math.sin(own * 9 + spark.phase) * 1.5)
    if (y < 0 || y >= height || x < 0 || x >= width) continue
    lit.set(y * width + x, colorOf(0.95 - (own / spark.life) * 0.5))
  }

  const words = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const at = (row * columns + column) * 3
      const top = pixel(fire, column, row * 2, lit)
      const bottom = pixel(fire, column, row * 2 + 1, lit)
      if (top === null && bottom === null) {
        words[at] = SPACE
        words[at + 1] = DEFAULT_COLOR
        words[at + 2] = DEFAULT_COLOR
      } else if (top === null) {
        words[at] = LOWER_HALF
        words[at + 1] = bottom!
        words[at + 2] = DEFAULT_COLOR
      } else {
        words[at] = UPPER_HALF
        words[at + 1] = top
        words[at + 2] = bottom ?? DEFAULT_COLOR
      }
    }
  }
  return words
}

const n = (value: number) => value.toFixed(2)

/**
 * The flame as an animated SVG for the desktop app: a glow, flame tongues and a white-hot core, each tongue
 * flickering and swaying on its own clock, the whole fire kindling, roaring and dying down over the burst,
 * with sparks rising out of it. `width` and `height` are the drawing's units (a cell is about 1 by 2).
 */
export function flameSvg(heat: number, seed: number, width: number, height: number): string {
  const t = intensity(heat)
  const next = random(seed)
  const between = (low: number, high: number) => low + next() * (high - low)
  const duration = flameDuration(heat) / 1000
  const id = `f${seed.toString(36)}`
  const half = Math.max(3, (width * (0.2 + 0.8 * t)) / 2)
  const tall = height * (0.55 + 0.4 * t)
  const count = Math.round(5 + t * 15)
  const spacing = (half * 2) / count

  const tongue = (fill: string, widthScale: number, heightScale: number) => {
    const parts: string[] = []
    for (let index = 0; index < count; index++) {
      const x = -half + spacing * (index + 0.5) + between(-0.3, 0.3) * spacing
      const centred = 1 - Math.abs(x) / half
      const h = tall * heightScale * (0.45 + 0.55 * centred) * between(0.8, 1.05)
      const w = spacing * 1.25 * widthScale * between(0.85, 1.15)
      const d =
        `M${n(-w)} 0C${n(-w)} ${n(-h * 0.45)} ${n(-w * 0.35)} ${n(-h * 0.7)} 0 ${n(-h)}` +
        `C${n(w * 0.35)} ${n(-h * 0.7)} ${n(w)} ${n(-h * 0.45)} ${n(w)} 0Z`
      const sway = between(4, 12)
      parts.push(
        `<g transform="translate(${n(x)} 0)"><g>` +
          `<animateTransform attributeName="transform" type="skewX" values="0;${n(sway)};${n(-sway * 0.7)};0" dur="${n(between(0.5, 0.9))}s" repeatCount="indefinite"/>` +
          `<path d="${d}" fill="url(#${id}${fill})">` +
          `<animateTransform attributeName="transform" type="scale" values="1 1;0.9 1.12;1.06 0.88;1 1" dur="${n(between(0.22, 0.42))}s" repeatCount="indefinite"/>` +
          `</path></g></g>`,
      )
    }
    return parts.join('')
  }

  const sparks = Array.from({ length: Math.round(4 + t * 26) }, () => {
    const x = between(-half * 0.8, half * 0.8)
    const rise = height * between(0.7, 1.15)
    const begin = `${n(between(0, duration * 0.6))}s`
    const dur = `${n(between(0.45, 0.9))}s`
    const drift = between(-2, 2)
    return (
      `<circle cx="${n(x)}" cy="0" r="${n(between(0.25, 0.45))}" fill="#fff1a8" opacity="0">` +
      `<animate attributeName="cy" values="0;${n(-rise)}" begin="${begin}" dur="${dur}" fill="freeze"/>` +
      `<animate attributeName="cx" values="${n(x)};${n(x + drift)};${n(x - drift * 0.5)}" begin="${begin}" dur="${dur}" fill="freeze"/>` +
      `<animate attributeName="fill" values="#fff1a8;#ffb43c;#ff5a14" begin="${begin}" dur="${dur}" fill="freeze"/>` +
      `<animate attributeName="opacity" values="0;1;0.8;0" keyTimes="0;0.08;0.6;1" begin="${begin}" dur="${dur}" fill="freeze"/>` +
      `</circle>`
    )
  })

  const life = `dur="${n(duration)}s" fill="freeze" keyTimes="0;0.12;0.5;0.72;1"`
  const defs =
    `<defs>` +
    `<linearGradient id="${id}b" x1="0" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#fff3c4"/><stop offset="0.25" stop-color="#ffc23a"/>` +
    `<stop offset="0.55" stop-color="#ff7a1a"/><stop offset="0.8" stop-color="#e0400c" stop-opacity="0.85"/>` +
    `<stop offset="1" stop-color="#a01e06" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${id}c" x1="0" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#fff1a8"/>` +
    `<stop offset="1" stop-color="#ffd04a" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${id}g" x1="0" y1="1" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#ff9a2a" stop-opacity="0.8"/><stop offset="1" stop-color="#ff3d0a" stop-opacity="0"/></linearGradient>` +
    `<filter id="${id}s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.35"/></filter>` +
    `<filter id="${id}w" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
    `</defs>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMax meet" overflow="hidden">${defs}` +
    `<g transform="translate(${n(width / 2)} ${height})" opacity="0">` +
    `<animate attributeName="opacity" values="0;1;1;0.8;0" ${life}/>` +
    `<g transform="scale(1 0)">` +
    `<animateTransform attributeName="transform" type="scale" values="1 0;1 1.08;1 1;1 0.55;1 0" ${life}/>` +
    `<g filter="url(#${id}w)" opacity="0.7">${tongue('g', 1.4, 1.1)}</g>` +
    `<g filter="url(#${id}s)">${tongue('b', 1, 1)}</g>` +
    `<g filter="url(#${id}s)">${tongue('c', 0.5, 0.55)}</g>` +
    `</g>` +
    sparks.join('') +
    `</g></svg>`
  )
}
