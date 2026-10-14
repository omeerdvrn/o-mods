import type { LinearIssue } from '../types'

export const ISSUE_FIELDS = [
  'id',
  'title',
  'description',
  'estimate',
  'priority',
  'status',
  'statusType',
  'project',
  'team',
  'url',
  'gitBranchName',
  'labels',
  'dueDate',
]

const OPEN_TYPES = ['started', 'unstarted', 'backlog', 'triage']
const TYPE_ORDER: Record<string, number> = { started: 0, unstarted: 1, triage: 2, backlog: 3 }
const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

type McpText = { content: { type: string; text?: string }[]; isError: boolean }

/** Joins an MCP result's text blocks and parses them as JSON; throws with the server's words on error. */
export function parseMcpJson(result: McpText): unknown {
  const text = result.content.map(block => block.text ?? '').join('')
  if (result.isError) throw new Error(text || 'Linear call failed')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Linear returned non-JSON: ${text.slice(0, 200)}`)
  }
}

function nameOf(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'name' in value) return String((value as { name: unknown }).name)
  return null
}

export function toIssue(raw: Record<string, unknown>): LinearIssue {
  const labels = Array.isArray(raw.labels) ? raw.labels.map(nameOf).filter((l): l is string => !!l) : []

  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    estimate: nameOf(raw.estimate),
    priority: nameOf(raw.priority),
    status: String(raw.status ?? ''),
    statusType: String(raw.statusType ?? ''),
    project: nameOf(raw.project),
    team: nameOf(raw.team),
    url: String(raw.url ?? ''),
    branch: typeof raw.gitBranchName === 'string' ? raw.gitBranchName : null,
    labels,
    dueDate: typeof raw.dueDate === 'string' ? raw.dueDate : null,
  }
}

/** Open issues only (not done or canceled), in progress first, then by priority. */
export function openIssues(issues: LinearIssue[]): LinearIssue[] {
  const seen = new Set<string>()
  return issues
    .filter(issue => OPEN_TYPES.includes(issue.statusType) && !seen.has(issue.id) && !!seen.add(issue.id))
    .sort(
      (a, b) =>
        (TYPE_ORDER[a.statusType] ?? 9) - (TYPE_ORDER[b.statusType] ?? 9) ||
        (PRIORITY_ORDER[a.priority ?? ''] ?? 4) - (PRIORITY_ORDER[b.priority ?? ''] ?? 4),
    )
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function branchFor(issue: LinearIssue): string {
  return issue.branch ?? `${issue.id.toLowerCase()}-${slug(issue.title)}`
}

export function worktreePathFor(repoRoot: string, issue: LinearIssue): string {
  return `${repoRoot}/.claude/worktrees/${issue.id.toLowerCase()}`
}

/** Strips Linear's `<issue href>` tags down to their link text. */
export function cleanDescription(text: string): string {
  return text.replace(/<issue[^>]*href="([^"]*)"[^>]*>([^<]*)<\/issue>/g, '[$2]($1)')
}

export function implementationBrief(issue: LinearIssue, description: string, worktree: string, branch: string): string {
  const facts = [
    `Status: ${issue.status}`,
    issue.priority && `Priority: ${issue.priority}`,
    issue.estimate && `Estimate: ${issue.estimate}`,
    issue.project && `Project: ${issue.project}`,
    issue.labels.length > 0 && `Labels: ${issue.labels.join(', ')}`,
    `Link: ${issue.url}`,
  ].filter(Boolean)

  return [
    `Implement Linear issue ${issue.id}: ${issue.title}`,
    '',
    facts.join('\n'),
    '',
    `Worktree: ${worktree}`,
    `Branch: ${branch}`,
    '',
    '## Description',
    '',
    cleanDescription(description) || '(no description)',
    '',
    '## How to work',
    '',
    '- Work only inside the worktree above.',
    '- Read the codebase and plan before editing; follow the repository CLAUDE.md.',
    '- Implement the issue, add or update tests, and run them.',
    '- Commit on the branch with messages that reference the issue id. Do not push or open a PR unless asked.',
    '- Finish with a short summary of what changed and anything left open.',
  ].join('\n')
}
