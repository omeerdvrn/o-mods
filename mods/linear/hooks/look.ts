import type { LinearIssue } from '../types'

/** Linear's default workflow colors; custom statuses come from the `statusColors` setting. */
const DEFAULT_STATUS_COLORS: Record<string, string> = {
  triage: '#FC7840',
  backlog: '#BEC2C8',
  todo: '#E2E2E2',
  'in progress': '#F2C94C',
  'in review': '#0F783C',
  done: '#5E6AD2',
  canceled: '#95A2B3',
}

const TYPE_FALLBACK_COLORS: Record<string, string> = {
  triage: '#FC7840',
  backlog: '#BEC2C8',
  unstarted: '#E2E2E2',
  started: '#F2C94C',
  completed: '#5E6AD2',
  canceled: '#95A2B3',
}

/** Parses "Blocked=#EB5757, Test=#26B5CE" into a lower-cased name -> hex map. */
export function parseStatusColors(setting: string): Record<string, string> {
  const colors: Record<string, string> = {}
  for (const pair of setting.split(',')) {
    const [name, hex] = pair.split('=').map(part => part.trim())
    if (name && hex && /^#[0-9a-f]{6}$/i.test(hex)) colors[name.toLowerCase()] = hex
  }
  return colors
}

export function statusColor(issue: LinearIssue, custom: Record<string, string>): string {
  const name = issue.status.toLowerCase()
  return custom[name] ?? DEFAULT_STATUS_COLORS[name] ?? TYPE_FALLBACK_COLORS[issue.statusType] ?? '#95A2B3'
}

/** Linear's status icons: dashed for backlog, empty for todo, filling up through the started states. */
export function statusGlyph(issue: LinearIssue): string {
  if (issue.statusType === 'backlog') return '◌'
  if (issue.statusType === 'triage') return '◇'
  if (issue.statusType === 'unstarted') return '○'
  if (issue.statusType === 'completed') return '✓'
  if (issue.statusType === 'canceled') return '⊘'
  const name = issue.status.toLowerCase()
  if (name === 'in progress') return '◐'
  if (name === 'in review') return '◕'
  return '◑'
}

export function isInProgress(issue: LinearIssue): boolean {
  return issue.status.toLowerCase() === 'in progress'
}

export function isInReview(issue: LinearIssue): boolean {
  return issue.status.toLowerCase() === 'in review'
}

const TYPE_RANK: Record<string, number> = { unstarted: 0, started: 1, triage: 2, backlog: 3, completed: 4 }
const STARTED_RANK: Record<string, number> = { 'in progress': 0, 'in review': 1 }

/** Groups issues by their Linear status, in workflow order: Todo, In Progress, In Review, other active states, Triage, Backlog, Done. */
export function statusGroups(issues: LinearIssue[]): { status: string; issues: LinearIssue[] }[] {
  const groups = new Map<string, LinearIssue[]>()
  for (const issue of issues) groups.set(issue.status, [...(groups.get(issue.status) ?? []), issue])
  const rank = (issue: LinearIssue) =>
    (TYPE_RANK[issue.statusType] ?? 9) * 100 + (STARTED_RANK[issue.status.toLowerCase()] ?? 50)

  return [...groups.entries()]
    .map(([status, members]) => ({ status, issues: members }))
    .sort((a, b) => rank(a.issues[0]!) - rank(b.issues[0]!) || a.status.localeCompare(b.status))
}

/** Linear's signal-bar priority icons. */
export function priorityLook(priority: string | null): { glyph: string; color: string } {
  switch (priority) {
    case 'Urgent':
      return { glyph: '[!]', color: '#F2994A' }
    case 'High':
      return { glyph: '▮▮▮', color: '#95A2B3' }
    case 'Medium':
      return { glyph: '▮▮▯', color: '#95A2B3' }
    case 'Low':
      return { glyph: '▮▯▯', color: '#95A2B3' }
    default:
      return { glyph: '---', color: '#6B6F76' }
  }
}

/** "8 Points" -> "8 pts", "1 Point" -> "1 pt"; other names (T-shirt sizes) kept. */
export function shortEstimate(estimate: string | null): string | null {
  if (estimate === null) return null
  const points = /^(\d+(?:\.\d+)?)\s*points?$/i.exec(estimate)
  if (!points) return estimate
  return `${points[1]} ${points[1] === '1' ? 'pt' : 'pts'}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-12" -> { text: "Oct 12", isOverdue } relative to `now`. */
export function dueLook(dueDate: string | null, now: number | null): { text: string; isOverdue: boolean } | null {
  if (dueDate === null) return null
  const [year, month, day] = dueDate.split('-').map(Number)
  if (!year || !month || !day) return { text: dueDate, isOverdue: false }
  const due = Date.UTC(year, month - 1, day, 23, 59)
  return { text: `${MONTHS[month - 1]} ${day}`, isOverdue: now !== null && due < now }
}

/** Plain-text preview: markdown marks stripped, whitespace folded, cut at a word. */
export function previewOf(description: string, max: number): string {
  const plain = description
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}
