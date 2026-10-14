/**
 * The receipt's type: block digits for the total, dotted leaders for line items, a two-row sparkline,
 * and a proportion bar. Everything is text, so it draws the same on every surface.
 */

/** The one accent, and its darker shades for proportions. */
export const ACCENT = '#8AB4F8'
export const SHADES = ['#8AB4F8', '#5B7FC4', '#3A5590', '#4A4A46']
/** Leaders and rules: present, never loud. */
export const LEADER = '#4A4A46'

/** A 3-row block font for the total: each glyph is 3 cells wide. */
const FONT: Record<string, [string, string, string]> = {
  '0': ['█▀█', '█ █', '▀▀▀'],
  '1': ['▀█ ', ' █ ', '▀▀▀'],
  '2': ['▀▀█', '█▀▀', '▀▀▀'],
  '3': ['▀▀█', ' ▀█', '▀▀▀'],
  '4': ['█ █', '▀▀█', '  ▀'],
  '5': ['█▀▀', '▀▀█', '▀▀▀'],
  '6': ['█▀▀', '█▀█', '▀▀▀'],
  '7': ['▀▀█', '  █', '  ▀'],
  '8': ['█▀█', '█▀█', '▀▀▀'],
  '9': ['█▀█', '▀▀█', '▀▀▀'],
  '.': [' ', ' ', '▀'],
  ',': [' ', ' ', '▀'],
  B: ['█▀▄', '█▀▄', '▀▀ '],
  M: ['█▄█', '█ █', '▀ ▀'],
  k: ['█  ', '█▄▀', '▀ ▀'],
  ' ': ['   ', '   ', '   '],
}

/** `text` in block digits, three rows, one column between glyphs. */
export function bigText(text: string): [string, string, string] {
  const glyphs = [...text].map(char => FONT[char] ?? FONT[' ']!)
  return [0, 1, 2].map(row => glyphs.map(glyph => glyph[row]).join(' ')) as [string, string, string]
}

/** A receipt line: name, dotted leader, then right-aligned columns, `width` cells in all. */
export function leaderLine(name: string, columns: string[], width: number): { name: string; leader: string; tail: string } {
  const tail = columns.map(column => column.padStart(6)).join(' ')
  const room = Math.max(6, width - tail.length - 1)
  const shown = name.length > room - 3 ? `${name.slice(0, room - 4)}…` : name
  const dots = Math.max(1, room - shown.length - 2)
  return { name: `${shown} `, leader: '·'.repeat(dots), tail: ` ${tail}` }
}

const RISE = ' ▁▂▃▄▅▆▇█'

/** A sparkline `rows` tall, one column per value, eighth-block tops. Top row first. */
export function sparkRows(values: number[], rows: number): string[] {
  const max = Math.max(0, ...values)
  const heights = values.map(value => (max > 0 && value > 0 ? Math.max(1, Math.round((value / max) * rows * 8)) : 0))
  const out: string[] = []
  for (let row = rows - 1; row >= 0; row--) {
    out.push(heights.map(height => RISE[Math.max(0, Math.min(8, height - row * 8))]!).join(''))
  }
  return out
}

/** Repeats each value so the series spans `width` cells: a short range still fills the receipt. */
export function stretch(values: number[], width: number): number[] {
  if (values.length === 0 || values.length >= width) return values
  const each = Math.floor(width / values.length)
  return values.flatMap(value => Array.from({ length: each }, () => value))
}

/** Squeezes `values` into at most `width` buckets by summing neighbours, so a long range still fits. */
export function bucket(values: number[], width: number): number[] {
  if (values.length <= width) return values
  const size = Math.ceil(values.length / width)
  const out: number[] = []
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size).reduce((sum, value) => sum + value, 0))
  }
  return out
}

/** Cell counts for a proportion bar of `width` cells: every non-zero share gets at least one. */
export function proportions(values: number[], width: number): number[] {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return values.map(() => 0)
  const cells = values.map(value => (value > 0 ? Math.max(1, Math.round((value / total) * width)) : 0))
  // Give or take from the largest share so the bar is exactly `width`.
  const largest = cells.indexOf(Math.max(...cells))
  cells[largest]! += width - cells.reduce((sum, count) => sum + count, 0)
  return cells
}
