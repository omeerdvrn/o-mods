import type { GitPlace, Limit } from '../types'

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }
const ORDER: Record<string, number> = { five_hour: 0, seven_day: 1 }
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 86_400_000 }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Cell colors from an empty bar to a full one: green, through amber, to red. */
const GRADIENT = ['#3FB950', '#56C24A', '#8CC63F', '#C9C33A', '#E3B341', '#F0883E', '#F06A3E', '#F85149']

/**
 * A window whose reset time has passed starts over at 0%, though the engine only reports the fresh figure
 * after the next turn: the bar shows the reset as it happens instead of the old window's usage.
 */
export function currentLimits(limits: readonly Limit[], now: number): Limit[] {
  return limits.map(limit => {
    const at = limit.resetsAt ? Date.parse(limit.resetsAt) : Number.NaN
    return !Number.isNaN(at) && at <= now ? { kind: limit.kind, percentUsed: 0 } : limit
  })
}

/** The 5-hour window first, then the weekly one, then anything else the account reports. */
export function orderLimits(limits: readonly Limit[]): Limit[] {
  return [...limits].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))
}

export function labelOf(kind: string): string {
  return LABELS[kind] ?? kind.replace(/_/g, ' ')
}

/** Color for a figure by how close it is to its limit. */
export function levelColor(percent: number): string {
  if (percent >= 90) return '#F85149'
  if (percent >= 70) return '#E3B341'
  return '#3FB950'
}

/** Background of a cell the fill has not reached. */
export const TRACK = '#30363D'
/** The pace tick, drawn over whatever cell it falls in. */
const TICK = '#E6EDF3'

export type Cell = { glyph: string; color: string; background: string; isFilled: boolean }

/**
 * The bar's cells, drawn as solid blocks: filled cells take the gradient color of their position, the rest
 * the track color. The cell where the window's elapsed time falls carries a pace tick, so a fill that runs
 * past the tick is burning faster than the window.
 */
export function barCells(percent: number, cells: number, elapsed: number | null, solid?: string): Cell[] {
  const share = Math.round((percent / 100) * cells)
  // Any use at all lights the first cell, so 2% never reads as an empty bar.
  const full = Math.max(percent > 0 ? 1 : 0, Math.min(cells, share))
  const pace = elapsed === null ? -1 : Math.min(cells - 1, Math.max(0, Math.floor(elapsed * cells)))

  return Array.from({ length: cells }, (_, index) => {
    const isFilled = index < full
    const background = isFilled
      ? solid ?? GRADIENT[Math.min(GRADIENT.length - 1, Math.floor((index / cells) * GRADIENT.length))]!
      : TRACK
    return { glyph: index === pace ? '▏' : ' ', color: TICK, background, isFilled }
  })
}

/** How far through its window the clock is, 0 to 1; null when the window's length or reset is unknown. */
export function elapsedShare(kind: string, resetsAt: string | undefined, now: number): number | null {
  const length = WINDOW_MS[kind]
  if (!length || !resetsAt) return null
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return null
  return Math.min(1, Math.max(0, 1 - (at - now) / length))
}

/**
 * When a window resets, short: "47m" or "2h13m" within a day, otherwise the weekday and hour ("Thu 14:00").
 * Times are local to the machine.
 */
export function resetLabel(resetsAt: string | undefined, now: number): string | null {
  if (!resetsAt) return null
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return null
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  if (minutes < 60) return `${minutes}m`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
  const date = new Date(at)
  return `${DAYS[date.getDay()]} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** "claude-opus-5-5" -> "Opus 5.5"; "claude-sonnet-5-5[1m]" -> "Sonnet 5.5 1M"; other names unchanged. */
export function modelName(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?(\[1m\])?$/i.exec(model)
  if (!match) return model
  const [, family, major, minor, wide] = match
  const name = `${family![0]!.toUpperCase()}${family!.slice(1)} ${major}${minor ? `.${minor}` : ''}`
  return wide ? `${name} 1M` : name
}

/**
 * Reads `git rev-parse --path-format=absolute --git-dir --git-common-dir --show-toplevel` and
 * `git status --porcelain=v2 --branch`. A linked worktree has its own git dir, apart from the common one.
 */
export function parseGitStatus(revParse: string, status: string): GitPlace | null {
  const [gitDir, commonDir, top] = revParse.trim().split('\n')
  if (!gitDir || !commonDir || !top) return null

  let head = 'HEAD'
  let oid = ''
  let ahead = 0
  let behind = 0
  let staged = 0
  let modified = 0
  let untracked = 0
  for (const line of status.split('\n')) {
    if (line.startsWith('# branch.head ')) head = line.slice('# branch.head '.length)
    else if (line.startsWith('# branch.oid ')) oid = line.slice('# branch.oid '.length)
    else if (line.startsWith('# branch.ab ')) {
      const [a, b] = line.slice('# branch.ab '.length).split(' ')
      ahead = Math.abs(Number(a) || 0)
      behind = Math.abs(Number(b) || 0)
    } else if (line.startsWith('? ')) untracked += 1
    else if (/^[12u] /.test(line)) {
      const xy = line.split(' ')[1] ?? '..'
      if (xy[0] !== '.') staged += 1
      if (xy[1] !== '.') modified += 1
    }
  }
  const branch = head === '(detached)' ? `detached ${oid.slice(0, 7)}` : head
  const place: GitPlace = { branch, staged, modified, untracked, ahead, behind }
  if (gitDir !== commonDir) place.worktree = top.split('/').pop() ?? top

  return place
}
