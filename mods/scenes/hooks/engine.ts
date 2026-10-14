/**
 * The drawing engine every scene shares: a canvas of pixels, color helpers, sprites, and the two ways a canvas
 * reaches the screen (half-block cells in the terminal, an animated SVG on the desktop). Nothing is loaded:
 * every pixel is computed.
 */

/** What Claude is doing, as the scenes and the crab read it. */
export type Tool = 'think' | 'read' | 'edit' | 'search' | 'bash' | 'test' | 'web' | 'agent'

export type Burst = { kind: 'tests-pass' | 'tests-fail' | 'push' | 'commit'; at: number }

export type Activity = {
  /** Milliseconds since the turn started. */
  elapsedMs: number
  /** Milliseconds since the turn ended (the scene lingers a moment to finish); null while it runs. */
  finishingMs: number | null
  tool: Tool
  /** Tool calls in this turn. */
  toolCalls: number
  /** The 5-hour limit, percent used; null when unknown. */
  usagePercent: number | null
  /** The local hour, 0 to 23. */
  hour: number
  /** Tasks finished today: the crab's hearts. */
  fedToday: number
  bursts: Burst[]
  now: number
}

export const NO_ACTIVITY: Activity = {
  elapsedMs: 0, finishingMs: null, tool: 'think', toolCalls: 0, usagePercent: null, hour: 12, fedToday: 0, bursts: [], now: 0,
}

export class Canvas {
  readonly colors: Uint32Array
  constructor(readonly width: number, readonly height: number, background = 0) {
    this.colors = new Uint32Array(width * height).fill(background)
  }
  put(x: number, y: number, color: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.colors[y * this.width + x] = color
  }
  get(x: number, y: number): number {
    return this.colors[Math.max(0, Math.min(this.height - 1, y)) * this.width + Math.max(0, Math.min(this.width - 1, x))]!
  }
  fill(x0: number, y0: number, x1: number, y1: number, color: number) {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(this.height, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(this.width, Math.round(x1)); x++) this.colors[y * this.width + x] = color
    }
  }
  /** A vertical gradient over rows y0..y1, in fixed steps. */
  gradient(y0: number, y1: number, stops: Stops, steps = 12) {
    for (let y = y0; y < y1; y++) this.fill(0, y, this.width, y + 1, ramp(stops, (y - y0) / Math.max(1, y1 - y0 - 1), steps))
  }
  disc(cx: number, cy: number, radius: number, color: number | ((x: number, y: number) => number | null)) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue
        const value = typeof color === 'number' ? color : color(x, y)
        if (value !== null) this.put(x, y, value)
      }
    }
  }
  /** A line that stays unbroken however steep. */
  line(x0: number, y0: number, x1: number, y1: number, color: number) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let step = 0; step <= steps; step++) this.put(x0 + ((x1 - x0) * step) / steps, y0 + ((y1 - y0) * step) / steps, color)
  }
  /** Pixel art: one string per row, each character a color from `palette`; others are see-through. */
  sprite(art: readonly string[], palette: Record<string, number>, x: number, y: number, flip = false) {
    const width = Math.max(...art.map(row => row.length))
    art.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const color = palette[row[dx]!]
        if (color !== undefined) this.put(x + (flip ? width - 1 - dx : dx), y + dy, color)
      }
    })
  }
}

export type Stops = [number, string][]

export const hex = (value: string) => parseInt(value.slice(1), 16)

export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const channel = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * k)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

export function ramp(stops: Stops, t: number, steps = 12): number {
  const at = Math.round(Math.max(0, Math.min(1, t)) * steps) / steps
  for (let index = 1; index < stops.length; index++) {
    const [a, from] = stops[index - 1]!
    const [b, to] = stops[index]!
    if (at <= b) return mix(hex(from), hex(to), b > a ? (at - a) / (b - a) : 0)
  }
  return hex(stops[stops.length - 1]![1])
}

/** A stable hash in 0..1, so things sit in the same place on every frame. */
export function noise(seed: number): number {
  let x = (Math.imul(seed | 0, 374761393) ^ 0x5bd1e995) | 0
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

/** x wrapped into 0..1. */
export const wrap = (x: number) => ((x % 1) + 1) % 1

const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const FULL = 0x2588

/** A canvas twice as tall as `rows` as Raster cells: each a half block, its top pixel over its bottom one. */
export function toCells(canvas: Canvas): Uint32Array {
  const { width, colors } = canvas
  const rows = Math.floor(canvas.height / 2)
  const words = new Uint32Array(width * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < width; column++) {
      const top = colors[row * 2 * width + column]!
      const bottom = colors[(row * 2 + 1) * width + column]!
      const at = (row * width + column) * 3
      words[at] = top === bottom ? FULL : UPPER_HALF
      words[at + 1] = top
      words[at + 2] = top === bottom ? DEFAULT_COLOR : bottom
    }
  }
  return words
}

/** Frames as an animated SVG: one `<g>` per frame shown in turn, each row drawn as runs of one color. */
export function toSvg(frames: Canvas[], seconds: number): string {
  const { width, height } = frames[0]!
  const groups = frames.map((canvas, frame) => {
    const runs: string[] = []
    for (let y = 0; y < height; y++) {
      let start = 0
      for (let x = 1; x <= width; x++) {
        if (x === width || canvas.colors[y * width + x] !== canvas.colors[y * width + start]) {
          runs.push(`<rect x="${start}" y="${y}" width="${x - start}" height="1" fill="#${canvas.colors[y * width + start]!.toString(16).padStart(6, '0')}"/>`)
          start = x
        }
      }
    }
    const values = frames.map((_, index) => (index === frame ? 'inline' : 'none')).join(';')
    return `<g display="${frame === 0 ? 'inline' : 'none'}"><animate attributeName="display" values="${values}" dur="${seconds}s" calcMode="discrete" repeatCount="indefinite"/>${runs.join('')}</g>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">${groups.join('')}</svg>`
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 of the words' little-endian bytes, as RasterProps' `cells` takes. */
export function encodeCells(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength)
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!
    const b = bytes[index + 1]
    const c = bytes[index + 2]
    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : ALPHABET[c & 63]
  }
  return out
}

/** A scene: draws one frame. `phase` runs 0 to 1 over one loop (LOOP_MS); `act` is what Claude is doing. */
export type Scene = {
  id: string
  name: string
  /** Only offered when this holds (the weather needs a usage figure). */
  isAvailable?: (act: Activity) => boolean
  draw: (canvas: Canvas, phase: number, act: Activity) => void
}

export const LOOP_MS = 2400
