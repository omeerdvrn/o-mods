import type { Closed, Range, Scan } from '../types'

export type Slice = { label: string; value: number }

export type Summary = {
  tokens: number
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
  replies: number
  prompts: number
  sessions: number
  byProject: Slice[]
  byModel: Slice[]
  byIssue: Slice[]
  /** One entry per day of the range, oldest first, empty days included. */
  daily: { day: string; tokens: number; prompts: number }[]
  /** Tokens per hour of the day, 0 to 23. */
  hourly: number[]
  /** Prompts by weekday (0 = Monday) and hour: when you work. */
  weekHours: number[][]
  closed: Closed[]
  closedPoints: number
  /** Issues closed per ISO week, oldest first. */
  weekly: Slice[]
}

const DAY_MS = 86_400_000

export function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The first day a range covers, as YYYY-MM-DD; for `all`, the earliest day in the scan. */
export function rangeStart(range: Range, now: number, scan: Scan): string {
  if (range === '7d') return dayKey(now - 6 * DAY_MS)
  if (range === '30d') return dayKey(now - 29 * DAY_MS)
  const days = scan.tokens.map(row => row[0]).concat(scan.prompts.map(row => row[0]))
  return days.length > 0 ? days.reduce((low, day) => (day < low ? day : low)) : dayKey(now)
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value)
}

function ranked(map: Map<string, number>): Slice[] {
  return [...map.entries()]
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

/** "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5". */
export function modelName(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?/i.exec(model)
  if (!match) return model
  const [, family, major, minor] = match
  return `${family![0]!.toUpperCase()}${family!.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

/** Monday-first weekday of a day: 0 = Monday ... 6 = Sunday. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return (new Date(year!, month! - 1, date!).getDay() + 6) % 7
}

/** The same-length period just before the range, for comparisons; none for `all`. */
export function previousNow(range: Range, now: number): number | null {
  if (range === '7d') return now - 7 * DAY_MS
  if (range === '30d') return now - 30 * DAY_MS
  return null
}

/** Change from `before` to `now` as a whole percentage; null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null
  return Math.round(((now - before) / before) * 100)
}

/** Every model ranked by its all-time tokens, so its color stays the same whatever range is shown. */
export function modelOrder(scan: Scan): string[] {
  const totals = new Map<string, number>()
  for (const [, , model, , input, output, cacheWrite, cacheRead] of scan.tokens) {
    add(totals, modelName(model), input + output + cacheWrite + cacheRead)
  }
  return ranked(totals).map(slice => slice.label)
}

/** ISO week label of a day: "W41". */
export function weekOf(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const time = Date.UTC(year!, month! - 1, date!)
  const target = new Date(time)
  const weekday = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - weekday + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `W${week}`
}

export function summarize(scan: Scan, closed: Closed[], range: Range, now: number): Summary {
  const from = rangeStart(range, now, scan)
  const to = dayKey(now)
  const inRange = (day: string) => day >= from && day <= to
  const byProject = new Map<string, number>()
  const byModel = new Map<string, number>()
  const byIssue = new Map<string, number>()
  const perDay = new Map<string, { tokens: number; prompts: number }>()
  const totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, replies: 0 }

  for (const [day, project, model, issue, input, output, cacheWrite, cacheRead, replies] of scan.tokens) {
    if (!inRange(day)) continue
    const tokens = input + output + cacheWrite + cacheRead
    totals.input += input
    totals.output += output
    totals.cacheWrite += cacheWrite
    totals.cacheRead += cacheRead
    totals.replies += replies
    add(byProject, project, tokens)
    add(byModel, modelName(model), tokens)
    if (issue !== '') add(byIssue, issue, tokens)
    const entry = perDay.get(day) ?? { tokens: 0, prompts: 0 }
    entry.tokens += tokens
    perDay.set(day, entry)
  }
  let prompts = 0
  for (const [day, , , count] of scan.prompts) {
    if (!inRange(day)) continue
    prompts += count
    const entry = perDay.get(day) ?? { tokens: 0, prompts: 0 }
    entry.prompts += count
    perDay.set(day, entry)
  }
  const hourly = Array.from({ length: 24 }, () => 0)
  const weekHours = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const [day, hour, tokens, count] of scan.hours) {
    if (!inRange(day)) continue
    hourly[hour] = (hourly[hour] ?? 0) + tokens
    weekHours[weekdayOf(day)]![hour]! += count
  }

  const daily: Summary['daily'] = []
  const [year, month, date] = from.split('-').map(Number)
  for (let time = new Date(year!, month! - 1, date!).getTime(); dayKey(time) <= to; time += DAY_MS) {
    const day = dayKey(time)
    daily.push({ day, ...(perDay.get(day) ?? { tokens: 0, prompts: 0 }) })
  }

  const done = closed.filter(issue => inRange(issue.day))
  const weekly = new Map<string, number>()
  for (const day of daily.map(entry => entry.day)) if (!weekly.has(weekOf(day))) weekly.set(weekOf(day), 0)
  for (const issue of done) add(weekly, weekOf(issue.day), 1)

  return {
    tokens: totals.input + totals.output + totals.cacheWrite + totals.cacheRead,
    ...totals,
    prompts,
    sessions: scan.sessions.filter(([day]) => inRange(day)).length,
    byProject: ranked(byProject),
    byModel: ranked(byModel),
    byIssue: ranked(byIssue),
    daily,
    hourly,
    weekHours,
    closed: done,
    closedPoints: done.reduce((sum, issue) => sum + issue.points, 0),
    weekly: [...weekly.entries()].map(([label, value]) => ({ label, value })),
  }
}

/** 26_607_881_459 -> "26.6B", 22_499_414 -> "22.5M", 1_174 -> "1,174". */
export function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e4) return `${(value / 1e3).toFixed(1)}k`
  return value.toLocaleString('en-US')
}

/** The top `count` slices, the rest folded into one "other" slice. */
export function topWithOther(slices: Slice[], count: number): Slice[] {
  if (slices.length <= count) return slices
  const rest = slices.slice(count - 1).reduce((sum, slice) => sum + slice.value, 0)
  return [...slices.slice(0, count - 1), { label: 'other', value: rest }]
}
