/**
 * Markdown read into blocks the sidebar's reading view draws: headings, paragraphs, list items, code, quotes,
 * table rows, rules. Inline text becomes spans (plain, bold, code), so emphasis survives without the markers.
 */

export type Span = { text: string; bold?: boolean; code?: boolean }

export type Block =
  | { kind: 'heading'; level: number; spans: Span[] }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'item'; depth: number; marker: string; spans: Span[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'quote'; spans: Span[] }
  | { kind: 'row'; cells: Span[][]; isHeader: boolean }
  | { kind: 'rule' }

export function spans(text: string): Span[] {
  const out: Span[] = []
  for (const part of text.split(/(`[^`]+`)/)) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      out.push({ text: part.slice(1, -1), code: true })
      continue
    }
    for (const piece of part.split(/(\*\*[^*]+\*\*)/)) {
      if (piece === '') continue
      const plain = piece.replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1').replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1$2')
      if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) out.push({ text: piece.slice(2, -2), bold: true })
      else out.push({ text: plain })
    }
  }
  return out
}

export function blocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      const body: string[] = []
      for (index++; index < lines.length && !lines[index]!.trim().startsWith(fence[1]!); index++) body.push(lines[index]!)
      out.push({ kind: 'code', lines: body })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)/.exec(line)
    if (heading) {
      out.push({ kind: 'heading', level: heading[1]!.length, spans: spans(heading[2]!.trim()) })
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ kind: 'rule' })
      continue
    }
    if (line.trim().startsWith('|')) {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => spans(cell.trim()))
      const next = lines[index + 1] ?? ''
      out.push({ kind: 'row', cells, isHeader: /^\s*\|?\s*:?-{2,}/.test(next) })
      continue
    }
    if (line.startsWith('>')) {
      out.push({ kind: 'quote', spans: spans(line.replace(/^>\s?/, '')) })
      continue
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)/.exec(line)
    if (item) {
      const marker = /\d/.test(item[2]![0]!) ? item[2]!.replace(')', '.') : '•'
      out.push({ kind: 'item', depth: Math.floor(item[1]!.replace(/\t/g, '    ').length / 2), marker, spans: spans(item[3]!) })
      continue
    }
    if (line.trim() === '') continue
    // A paragraph runs to the next blank line or block.
    const paragraph = [line.trim()]
    while (index + 1 < lines.length && lines[index + 1]!.trim() !== '' && !/^(#{1,6}\s|\s*```|\s*~~~|>|\s*([-*+]|\d+[.)])\s|\s*\|)/.test(lines[index + 1]!)) {
      paragraph.push(lines[++index]!.trim())
    }
    out.push({ kind: 'paragraph', spans: spans(paragraph.join(' ')) })
  }
  return out
}

/** The answer's title: its first heading, else its first sentence, short. */
export function titleOf(markdown: string): string {
  const heading = /^#{1,3}\s+(.+)$/m.exec(markdown)
  const plain = (heading ? heading[1]! : markdown.split('\n').find(line => line.trim() !== '') ?? 'Claude’s answer')
    .replace(/[`*_#>[\]]/g, '')
    .trim()
  const sentence = plain.split(/(?<=[.!?:])\s/)[0]!
  return sentence.length > 70 ? `${sentence.slice(0, 67).trimEnd()}…` : sentence
}

/**
 * The answer cut at its headings: the "In short" summary when it opens the answer, then each heading with the
 * text under it. Headings inside code blocks stay in the code.
 */
export function sections(markdown: string): { summary: string | null; sections: { heading: { level: number; text: string } | null; body: string }[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: { heading: { level: number; text: string } | null; body: string[] }[] = [{ heading: null, body: [] }]
  let inCode = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode
    const heading = inCode ? null : /^(#{1,3})\s+(.*)/.exec(line)
    if (heading) out.push({ heading: { level: heading[1]!.length, text: heading[2]!.trim() }, body: [] })
    else out[out.length - 1]!.body.push(line)
  }
  // "**In short:** ..." as the opening paragraph becomes the summary.
  let summary: string | null = null
  const first = out[0]!
  const opening = first.body.join('\n').trim()
  const found = /^\*\*In short:?\*\*:?\s*([\s\S]*?)(\n\s*\n|$)/i.exec(opening)
  if (found) {
    summary = `**In short:** ${found[1]!.trim()}`
    first.body = opening.slice(found[0].length).split('\n')
  }
  return {
    summary,
    sections: out
      .map(section => ({ heading: section.heading, body: section.body.join('\n').trim() }))
      .filter(section => section.heading !== null || section.body !== ''),
  }
}

/**
 * The answer cut into parts of about `limit` characters at its headings, or at blank lines when a section is longer,
 * never inside a code block.
 */
export function partsOf(markdown: string, limit: number): string[] {
  const pieces: string[] = []
  let current: string[] = []
  let inCode = false
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const size = current.join('\n').length
    const breaks = !inCode && current.length > 0 && ((/^#{1,3}\s/.test(line) && size > limit / 2) || (line.trim() === '' && size > limit))
    if (breaks) {
      pieces.push(current.join('\n').trim())
      current = []
    }
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode
    current.push(line)
  }
  pieces.push(current.join('\n').trim())
  return pieces.filter(piece => piece !== '')
}
