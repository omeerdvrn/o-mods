/**
 * The v1 heat-scaled particle burst, ported from heat-fire.py: a flame-shaped fan of particles rising
 * from the bottom centre, aging from white-hot through orange and red to ember while their glyphs thin
 * out. Drawn into a band of cells instead of straight onto the terminal.
 */
import { COLD } from './heat'

const ASPECT_Y = 0.5
/** Flame palette: white-hot core, yellow, orange, red, ember. */
const RAMP = [0xffffdc, 0xffe682, 0xffb43c, 0xff8219, 0xeb500f, 0xb4280a, 0x6e1908, 0x370f05]
const GLYPHS = ['@', '#', '%', '*', 'o', '+', '.', ' ']
const DEFAULT_COLOR = 0x01000000
const SPACE = 0x20
/** heat-fire.py lit the flames under a full-height terminal; this is the height its speeds were tuned for. */
const SCREEN_ROWS = 40

export type FireConfig = {
  count: number
  velocityMin: number
  velocityMax: number
  spreadDegrees: number
  gravity: number
  spawnShare: number
  edgeVelocityScale: number
  turbulenceAmp: number
  turbulenceFreq: number
  durationMs: number
}

/** Heat to particle parameters, as heat-fire.py maps them; null below the cold threshold. */
export function fireConfig(heat: number): FireConfig | null {
  if (heat < COLD) return null
  const t = Math.max(0, Math.min(1, (heat - COLD) / (100 - COLD)))
  return {
    count: Math.round(60 + t * 840),
    velocityMin: 4 + t * 10,
    velocityMax: 10 + t * 50,
    spreadDegrees: 28,
    gravity: 10 - t * 8,
    // Spawn width: a narrow ember at low heat, the full band at max.
    spawnShare: 0.2 + 0.8 * t,
    edgeVelocityScale: 0.5 - t * 0.32,
    turbulenceAmp: 1 + t * 1.4,
    turbulenceFreq: 6,
    durationMs: Math.round(280 + t * 1020),
  }
}

/** The band's height for a heat: a few rows of ember up to a tall blaze. */
export function fireRows(heat: number, maxRows: number): number {
  const t = Math.max(0, Math.min(1, (heat - COLD) / (100 - COLD)))
  return Math.max(3, Math.min(maxRows, Math.round(4 + t * 10)))
}

type Particle = { vx: number; vy: number; x0: number; y0: number; spawn: number; phase: number }

/** A small seeded generator, so every frame of one burst replays the same particles. */
function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

export function particles(config: FireConfig, columns: number, seed: number): Particle[] {
  const next = random(seed)
  const between = (low: number, high: number) => low + next() * (high - low)
  const spread = (config.spreadDegrees * Math.PI) / 180
  const duration = config.durationMs / 1000
  const radius = Math.max(2, (columns / 2 - 2) * config.spawnShare)

  return Array.from({ length: config.count }, () => {
    const speed = between(config.velocityMin, config.velocityMax)
    const angle = -Math.PI / 2 + between(-spread / 2, spread / 2)
    const x0 = between(-radius, radius)
    const scale = 1 - (Math.abs(x0) / radius) * (1 - config.edgeVelocityScale)
    return {
      vx: speed * Math.cos(angle) * scale,
      vy: speed * Math.sin(angle) * ASPECT_Y * scale,
      x0,
      y0: between(-0.5, 0.5),
      spawn: between(0, duration * 0.4),
      phase: between(0, 2 * Math.PI),
    }
  })
}

/** One frame at `elapsedMs`, as Raster cells: little-endian u32 triplets [codePoint, foreground, background]. */
export function frame(
  config: FireConfig,
  burst: readonly Particle[],
  elapsedMs: number,
  columns: number,
  rows: number,
): Uint32Array {
  const words = new Uint32Array(columns * rows * 3)
  for (let cell = 0; cell < columns * rows; cell++) {
    words[cell * 3] = SPACE
    words[cell * 3 + 1] = DEFAULT_COLOR
    words[cell * 3 + 2] = DEFAULT_COLOR
  }
  const duration = config.durationMs / 1000
  const elapsed = elapsedMs / 1000
  // Speeds were tuned for a full screen; squeeze the rise into the band's height.
  const lift = rows / SCREEN_ROWS
  const gravity = config.gravity * ASPECT_Y
  const bottom = rows - 1
  const centre = Math.floor(columns / 2)

  for (const particle of burst) {
    const age = elapsed - particle.spawn
    if (age < 0) continue
    const share = age / duration
    if (share >= 1) continue
    const sway = Math.sin(age * config.turbulenceFreq + particle.phase) * config.turbulenceAmp
    const x = particle.x0 + particle.vx * age + sway
    const y = (particle.y0 + particle.vy * age + 0.5 * gravity * age * age) * lift * 2.5
    const column = centre + Math.round(x)
    const row = bottom + Math.round(y)
    if (row < 0 || row >= rows || column < 0 || column >= columns) continue
    const glyph = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(share * GLYPHS.length))]!
    if (glyph === ' ') continue
    const at = (row * columns + column) * 3
    words[at] = glyph.charCodeAt(0)
    words[at + 1] = RAMP[Math.min(RAMP.length - 1, Math.floor(share * RAMP.length))]!
  }

  return words
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

/** The burst's colors as CSS, white-hot first. */
const RAMP_CSS = RAMP.map(color => `#${color.toString(16).padStart(6, '0')}`)
/** An SVG burst stays light: at most this many particles. */
const SVG_PARTICLES = 120

/**
 * The same burst as an animated SVG, for the desktop app, which draws vectors but no cells: each particle
 * is a small square that rises along the burst's path, sways, and cools from white-hot to ember with SMIL,
 * so the surface plays it at its own frame rate. `width` and `height` are the drawing's units.
 */
export function fireSvg(config: FireConfig, seed: number, width: number, height: number): string {
  const all = particles(config, width, seed)
  const step = Math.max(1, Math.ceil(all.length / SVG_PARTICLES))
  const burst = all.filter((_, index) => index % step === 0)
  const duration = config.durationMs / 1000
  const lift = (height / SCREEN_ROWS) * 2.5
  const gravity = config.gravity * ASPECT_Y
  const centre = width / 2
  const bottom = height - 1
  const keys = [0, 0.25, 0.5, 0.75, 1]
  const keyTimes = keys.join(';')

  const squares = burst.map(particle => {
    const life = duration - particle.spawn
    if (life <= 0) return ''
    const at = (share: number) => {
      const age = share * life
      const sway = Math.sin(age * config.turbulenceFreq + particle.phase) * config.turbulenceAmp
      return {
        x: (centre + particle.x0 + particle.vx * age + sway).toFixed(1),
        y: (bottom + (particle.y0 + particle.vy * age + 0.5 * gravity * age * age) * lift).toFixed(1),
      }
    }
    const path = keys.map(at)
    const colors = keys.map(share => RAMP_CSS[Math.min(RAMP_CSS.length - 1, Math.floor(((share * life + particle.spawn) / duration) * RAMP_CSS.length))])
    const begin = `${particle.spawn.toFixed(2)}s`
    const dur = `${life.toFixed(2)}s`
    const animate = (attribute: string, values: string) =>
      `<animate attributeName="${attribute}" values="${values}" keyTimes="${keyTimes}" begin="${begin}" dur="${dur}" fill="freeze"/>`

    return (
      `<rect width="1" height="1" opacity="0" fill="${RAMP_CSS[0]}">` +
      `<set attributeName="opacity" to="1" begin="${begin}"/>` +
      animate('x', path.map(point => point.x).join(';')) +
      animate('y', path.map(point => point.y).join(';')) +
      animate('fill', colors.join(';')) +
      animate('opacity', '1;1;0.85;0.5;0') +
      '</rect>'
    )
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${squares.join('')}</svg>`
}
