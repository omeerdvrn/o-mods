/**
 * A Claude crab for each model tier, in half-block pixel art (four rows tall, every terminal font has
 * them) and as SVG for the desktop app. 16×8 pixels: row 0 for a hat, the head with its eyes, arms out,
 * four legs; each tier dresses it up.
 */

export type Tier = 'haiku' | 'sonnet' | 'opus' | 'unrouted'

const CRAB = [
  '................',
  '...oooooooooo...',
  '...ooeooooeoo...',
  '...oooooooooo...',
  '.oooooooooooooo.',
  '...oooooooooo...',
  '....o.o..o.o....',
  '....o.o..o.o....',
]

/** Each tier's look over the crab; `.` leaves the crab as it is. */
const DRESS: Record<Tier, string[]> = {
  // Haiku: the quick one. A headband with its tails flying, speed lines behind.
  haiku: [
    '................',
    '.b.bbbbbbbbbb...',
    'bb..............',
    's...............',
    '................',
    's...............',
    'ss..............',
    '................',
  ],
  // Sonnet: the writer. Round glasses and a quill.
  sonnet: [
    '...............w',
    '.....g....g...ww',
    '....g.gggg.g..w.',
    '..............n.',
    '................',
    '................',
    '................',
    '................',
  ],
  // Opus: the heavyweight. A jewelled crown and a royal cape.
  opus: [
    '....y..yy..y....',
    '....yjyyyyjy....',
    '................',
    '..v..........v..',
    '................',
    '..v..........v..',
    '.vv..........vv.',
    '.vv..........vv.',
  ],
  // Unrouted: nobody sent it. A grey crab with a question mark.
  unrouted: [
    '.............kkk',
    '...............k',
    '..............k.',
    '................',
    '..............k.',
    '................',
    '................',
    '................',
  ],
}

const BASE: Record<string, string> = { o: '#D4826A', e: '#1B1B1B' }

const COLORS: Record<Tier, Record<string, string>> = {
  haiku: { ...BASE, b: '#5BC8E8', s: '#A9E4F5' },
  sonnet: { ...BASE, g: '#F2D27A', w: '#F4F1EA', n: '#3A3A44' },
  opus: { ...BASE, y: '#F2C230', j: '#E0475A', v: '#7B3FA8' },
  unrouted: { o: '#8D9299', e: '#1B1B1B', k: '#F2C230' },
}

/** The tier's own color, for its name and counts next to the crab. */
export const ACCENT: Record<Tier, string> = { haiku: '#5BC8E8', sonnet: '#A99BF0', opus: '#F2C230', unrouted: '#9AA0A6' }

export const TIER_NAMES: Record<Tier, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', unrouted: 'Unrouted' }

/** The models each tier runs on today, until a worker reports the one it really ran on. */
export const DEFAULT_MODELS: Record<Exclude<Tier, 'unrouted'>, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

/** "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5", "claude-sonnet-5-5[1m]" -> "Sonnet 5.5 1M". */
export function modelName(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?(\[1m\])?$/i.exec(model)
  if (!match) return model
  const [, family, major, minor, wide] = match
  const name = `${family![0]!.toUpperCase()}${family!.slice(1)} ${major}${minor ? `.${minor}` : ''}`
  return wide ? `${name} 1M` : name
}

export function crabArt(tier: Tier): string[] {
  const dress = DRESS[tier]
  return CRAB.map((line, row) =>
    [...line].map((pixel, column) => {
      const over = dress[row]?.[column] ?? '.'
      return over === '.' ? pixel : over
    }).join(''),
  )
}

/** One cell of a drawn row: its glyph, the glyph's color and, when both halves are painted, the background. */
export type Run = { text: string; color?: string; background?: string }

/** A color pulled most of the way to a quiet grey: an idle tier's crab sits back, a busy one stands out. */
function faded(hex: string): string {
  const mix = (at: number, toward: number) => Math.round(parseInt(hex.slice(at, at + 2), 16) * 0.35 + toward * 0.65)
  return `#${[mix(1, 0x4a), mix(3, 0x4c), mix(5, 0x55)].map(value => value.toString(16).padStart(2, '0')).join('')}`
}

/** The crab as four rows of half-block cells: each cell holds a column's top and bottom pixel. */
export function crabRuns(tier: Tier, isIdle = false): Run[][] {
  const art = crabArt(tier)
  const colors = isIdle ? Object.fromEntries(Object.entries(COLORS[tier]).map(([key, hex]) => [key, faded(hex)])) : COLORS[tier]
  const rows: Run[][] = []
  for (let top = 0; top < art.length; top += 2) {
    const runs: Run[] = []
    for (let column = 0; column < 16; column++) {
      const upper = colors[art[top]![column]!]
      const lower = colors[art[top + 1]![column]!]
      if (!upper && !lower) runs.push({ text: ' ' })
      else if (!upper) runs.push({ text: '▄', color: lower })
      else if (!lower) runs.push({ text: '▀', color: upper })
      else if (upper === lower) runs.push({ text: '█', color: upper })
      else runs.push({ text: '▀', color: upper, background: lower })
    }
    rows.push(runs)
  }
  return rows
}

/** The crab as SVG, one square per pixel, for the desktop app. */
export function crabSvg(tier: Tier, isIdle = false): string {
  const art = crabArt(tier)
  const colors = isIdle ? Object.fromEntries(Object.entries(COLORS[tier]).map(([key, hex]) => [key, faded(hex)])) : COLORS[tier]
  const squares: string[] = []
  art.forEach((line, y) =>
    [...line].forEach((pixel, x) => {
      const fill = colors[pixel]
      if (fill) squares.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`)
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 8" shape-rendering="crispEdges">${squares.join('')}</svg>`
}
