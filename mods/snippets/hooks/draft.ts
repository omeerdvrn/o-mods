/**
 * What the snippets mod reads in a draft: ticket ids, paths, @mentions, ;;snippets and things that look like secrets,
 * as runs to paint; and the snippet expansions. Pure functions, so the hooks stay small and the rules testable.
 */

export type Issue = { id: string; title: string; status: string }

export type Paint = { start: number; end: number; color: string; bold?: boolean; underline?: boolean }

export const DEFAULT_SNIPPETS: Record<string, string> = {
  mmi: 'Merge origin main into this branch and resolve conflicts.',
  plan: 'Before writing any code, write a short plan: the files you will touch, the approach, and the risks. Wait for my go.',
  review: 'Review the changes on this branch for bugs, edge cases and missing tests. List the findings by severity.',
  tests: 'Run the tests and fix any failures your changes caused.',
  pr: 'Open a pull request for this branch: a clear title, and a summary of what changed and why.',
  explain: 'Explain how this works, step by step, naming the files and functions involved.',
  tldr: 'Summarize your last answer in three bullet points.',
  cont: 'Continue where you left off.',
}

const TICKET = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g
const MENTION = /(^|\s)(@[\w./~-]+)/g
const PATH = /(^|[\s(])((?:~|\.{1,2})?\/?(?:[\w.-]+\/)+[\w.-]+)/g
const SNIPPET = /;;[a-z0-9-]+/gi

/** Shapes of keys and tokens that should not go to a model. */
const SECRETS: RegExp[] = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,}/gi,
]

function runs(text: string, pattern: RegExp, group = 0): { start: number; end: number; match: string }[] {
  const out: { start: number; end: number; match: string }[] = []
  for (const found of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
    const match = found[group]!
    const start = found.index! + found[0].indexOf(match)
    out.push({ start, end: start + match.length, match })
  }
  return out
}

/** Where a draft holds something that looks like a secret. */
export function secretsIn(text: string): { start: number; end: number }[] {
  return SECRETS.flatMap(pattern => runs(text, pattern))
}

/**
 * The runs to paint over a draft: known tickets bold in blue, other ticket-shaped ids in cyan, paths, @mentions,
 * ;;snippets waiting to expand, and secrets in red. Later runs win, so secrets are painted last.
 */
export function paint(text: string, known: ReadonlySet<string>, snippets: Record<string, string>): Paint[] {
  const out: Paint[] = []
  for (const run of runs(text, PATH, 2)) if (!/^\d/.test(run.match)) out.push({ start: run.start, end: run.end, color: '#7ec699' })
  for (const run of runs(text, MENTION, 2)) out.push({ start: run.start, end: run.end, color: '#c792ea' })
  for (const run of runs(text, TICKET)) {
    out.push(known.has(run.match) ? { start: run.start, end: run.end, color: '#5fb3ff', bold: true } : { start: run.start, end: run.end, color: '#89ddff' })
  }
  for (const run of runs(text, SNIPPET)) {
    const isKnown = snippets[run.match.slice(2).toLowerCase()] !== undefined
    out.push({ start: run.start, end: run.end, color: isKnown ? '#ffcb6b' : '#8a8f98', bold: isKnown })
  }
  for (const run of secretsIn(text)) out.push({ start: run.start, end: run.end, color: '#ff5370', bold: true, underline: true })
  return out
}

/**
 * Expands the ;;snippet that ends right before the cursor, once a space or Tab has been typed after it.
 * Returns the new draft and cursor, or null when there is nothing to expand.
 */
export function expandAtCursor(text: string, cursor: number, snippets: Record<string, string>): { text: string; cursor: number } | null {
  const before = text.slice(0, cursor)
  const found = /;;([a-z0-9-]+)(\s)$/i.exec(before)
  if (!found) return null
  const expansion = snippets[found[1]!.toLowerCase()]
  if (expansion === undefined) return null
  const start = before.length - found[0].length
  const head = text.slice(0, start) + expansion + found[2]!
  return { text: head + text.slice(cursor), cursor: head.length }
}

/** Every known ;;snippet left in a prompt, expanded: for one sent right after the snippet, with no space. */
export function expandAll(text: string, snippets: Record<string, string>): string {
  return text.replace(/;;([a-z0-9-]+)/gi, (whole, name: string) => snippets[name.toLowerCase()] ?? whole)
}

/** The typeahead rows for a token: tickets for an id being typed, snippets after ;;. */
export function suggestions(
  token: string,
  issues: readonly Issue[],
  snippets: Record<string, string>,
): { text: string; label: string; description: string }[] {
  if (token.startsWith(';;')) {
    const typed = token.slice(2).toLowerCase()
    return Object.entries(snippets)
      .filter(([name]) => name.startsWith(typed))
      .slice(0, 8)
      .map(([name, expansion]) => ({ text: expansion, label: `;;${name}`, description: expansion }))
  }
  const ticket = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d*)$/.exec(token)
  if (!ticket) return []
  const prefix = token.toUpperCase()
  return issues
    .filter(issue => issue.id.startsWith(prefix))
    .slice(0, 8)
    .map(issue => ({ text: issue.id, label: `${issue.id}  ${issue.title}`, description: issue.status }))
}
