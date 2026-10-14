/**
 * The Claude crab for each persona: pixel art in half blocks, four rows tall. Each cell is two pixels,
 * the upper half block's color over its background, so any two colors can share a cell (a hat on the
 * head, a laptop in front of the body) and the pixels come out square. Half blocks are in every font,
 * so the crab draws the same in every terminal.
 */

const COLORS: Record<string, string> = {
  o: '#D4826A', // the crab
  e: '#1B1B1B', // its eyes
  h: '#3A3A3F', // headphone band
  u: '#8C86E8', // headphone cups
  L: '#C9CCD3', // laptop
  p: '#8C86E8', // laptop logo
  r: '#C9505A', // beret
  b: '#B08A5A', // brush handle
  B: '#4E9BE8', // brush tip
  P: '#E8DCC0', // palette
  d: '#E05F5F', // paint
  y: '#E8B931', // hard hat
  a: '#C98500', // its lamp
  s: '#4A4F57', // server rack
  g: '#4FD17A', // server lights
  k: '#8A6A4A', // detective cap
  l: '#5BC0DE', // lens
  m: '#9AA0A6', // magnifier handle
  n: '#E8C547', // pencil
  w: '#F2EFE6', // paper
  c: '#B07A48', // clipboard
  t: '#4E8DE0', // book
}

/** The crab, 16×8 pixels: room for a hat in row 0, the head with its eyes, arms out, four legs. */
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

/** Each persona's hat and prop over the crab: `.` leaves the crab as it is. */
const DRESS: Record<string, string[]> = {
  // Headphones, and a laptop held in front.
  dev: [
    '...hhhhhhhhhh...',
    '..h..........h..',
    '..u..........u..',
    '..u..........u..',
    '....LLLLLLLL....',
    '....LLLpLLLL....',
    '....LLLLLLLL....',
    '................',
  ],
  // A beret; a brush held up, a palette in the other hand.
  'ui-ux': [
    '.....rrrrrr....B',
    '...rrrrrrrrrr.bB',
    '..............b.',
    '..............b.',
    'Pd..............',
    'PP..............',
    '................',
    '................',
  ],
  // A hard hat with its lamp, and a server rack with its lights on.
  backend: [
    '.....yyayyy.....',
    '..yyyyyyyyyyyy..',
    '..............ss',
    '..............gs',
    '..............ss',
    '..............gs',
    '..............ss',
    '................',
  ],
  // A detective's cap, and a magnifying glass.
  qa: [
    '....kkkkkkk.....',
    '...kkkkkkkkkk...',
    '.............lll',
    '.............l.l',
    '............mlll',
    '................',
    '................',
    '................',
  ],
  // A pencil behind the ear, and an open book.
  docs: [
    '...............n',
    '..............n.',
    '.............n..',
    '................',
    '....tttttttt....',
    '....twwwtwwt....',
    '....tttttttt....',
    '................',
  ],
  // A clipboard with a checklist.
  pm: [
    '................',
    '................',
    '................',
    '.....cccccc.....',
    '.....cwwwwc.....',
    '.....cwccwc.....',
    '.....cwwwwc.....',
    '................',
  ],
}

/** One cell of a drawn row: its glyph, the glyph's color and, when both halves are painted, the background. */
export type Run = { text: string; color?: string; background?: string }

/** The crab dressed for a persona; a persona from a file gets the crab alone. */
export function dressedArt(id: string): string[] {
  const dress = DRESS[id]
  if (!dress) return CRAB

  return CRAB.map((line, row) =>
    [...line].map((pixel, column) => {
      const over = dress[row]?.[column] ?? '.'
      return over === '.' ? pixel : over
    }).join(''),
  )
}

/** Pixel art to rows of cells: each cell is a column's two pixels, top and bottom. */
export function toRuns(art: string[], colors: Record<string, string>): Run[][] {
  const width = Math.max(...art.map(line => line.length))
  const rows: Run[][] = []
  for (let top = 0; top < art.length; top += 2) {
    const runs: Run[] = []
    for (let column = 0; column < width; column++) {
      const upper = colors[art[top]?.[column] ?? '.']
      const lower = colors[art[top + 1]?.[column] ?? '.']
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

/** The persona's crab as four rows of cells. */
export function crabFor(id: string): Run[][] {
  return toRuns(dressedArt(id), COLORS)
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
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

/** The persona's crab as a picture: 16×8 RGBA pixels, transparent around it, for an `Image`. */
export function crabPicture(id: string): { rgba: string; width: number; height: number } {
  const art = dressedArt(id)
  const width = Math.max(...art.map(line => line.length))
  const height = art.length
  const bytes = new Uint8Array(width * height * 4)
  art.forEach((line, row) =>
    [...line].forEach((pixel, column) => {
      const color = COLORS[pixel]
      if (!color) return
      const at = (row * width + column) * 4
      bytes[at] = Number.parseInt(color.slice(1, 3), 16)
      bytes[at + 1] = Number.parseInt(color.slice(3, 5), 16)
      bytes[at + 2] = Number.parseInt(color.slice(5, 7), 16)
      bytes[at + 3] = 255
    }),
  )

  return { rgba: toBase64(bytes), width, height }
}

/**
 * The persona's crab as SVG, for surfaces without pictures over the terminal (the desktop app): the same
 * 16×8 pixels, one square each, drawn crisp at any size.
 */
export function crabSvg(id: string): string {
  const art = dressedArt(id)
  const width = Math.max(...art.map(line => line.length))
  const squares = art.flatMap((line, row) =>
    [...line].map((pixel, column) => {
      const color = COLORS[pixel]
      return color ? `<rect x="${column}" y="${row}" width="1" height="1" fill="${color}"/>` : ''
    }),
  )

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${art.length}" shape-rendering="crispEdges">${squares.join('')}</svg>`
}
