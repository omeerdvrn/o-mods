import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Closed, Range, Scan } from '../types'
import { ACCENT, LEADER, SHADES, bigText, bucket, leaderLine, proportions, sparkRows, stretch } from './charts'
import { receiptText } from './receipt'
import { compact, dayKey, rangeStart, summarize, topWithOther } from './stats'

const PANE = 'usage-stats'
const TITLE = 'Usage stats'
const SCAN_TIMEOUT_MS = 600_000
const RECEIPT_WIDTH = 60
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const RANGE_KEY = 'range'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LINEAR_PAGES = 6

const scan = atom({ plugin: 'usage-stats', key: 'scan' } as const, null as Scan | null)
const closed = atom({ plugin: 'usage-stats', key: 'closed' } as const, null as Closed[] | null)
const isScanning = atom({ plugin: 'usage-stats', key: 'isScanning' } as const, false)
const error = atom({ plugin: 'usage-stats', key: 'error' } as const, null as string | null)
const linearError = atom({ plugin: 'usage-stats', key: 'linearError' } as const, null as string | null)
const range = atom({ plugin: 'usage-stats', key: 'range' } as const, '30d' as Range)

type Options = { linearServer: string }

const RANGES: { range: Range; label: string }[] = [
  { range: '7d', label: '7d' },
  { range: '30d', label: '30d' },
  { range: 'all', label: 'All' },
]

/** Runs the bundled scanner over ~/.claude/projects; it caches per log file, so a rescan is quick. */
async function runScan($: EngineInterface) {
  if (await read($, isScanning)) return
  await update($, isScanning, () => true)
  try {
    const root = $.plugin.root.replace(/\/\.claude-plugin\/?$/, '')
    const result = await $.process.run(['python3', '-I', `${root}/scanner/scan.py`], { timeoutMs: SCAN_TIMEOUT_MS })
    if (result.exitCode !== 0) throw new Error(result.stderr.trim().split('\n').pop() || `scanner exited ${result.exitCode}`)
    const data = JSON.parse(result.stdout) as Scan
    await update($, scan, () => data)
    await update($, error, () => null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, error, () => `Couldn't read the session logs: ${message}`)
  } finally {
    await update($, isScanning, () => false)
  }
}

/** The configured Linear server first, then the names it usually goes by (claude.ai connector, `claude mcp add`). */
const SERVER_NAMES = ['claude.ai Linear', 'linear', 'Linear']
let connected: string | null = null

async function linearCall($: EngineInterface, o: Options, args: Record<string, unknown>) {
  const tried = [...new Set([connected, o.linearServer, ...SERVER_NAMES].filter((name): name is string => Boolean(name)))]
  for (const server of tried) {
    try {
      const result = await $.mcp.call(server, 'list_issues', args)
      connected = server
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/no connected MCP/i.test(message)) throw err
      if (connected === server) connected = null
    }
  }
  throw new Error(`no connected MCP server has Linear (tried ${tried.join(', ')})`)
}

/** Issues assigned to you and completed in the last 120 days, from Linear. */
async function loadClosed($: EngineInterface, o: Options) {
  if (!o.linearServer) return
  try {
    const found: Closed[] = []
    let cursor: string | undefined
    for (let page = 0; page < LINEAR_PAGES; page++) {
      const result = await linearCall($, o, {
        assignee: 'me',
        state: 'completed',
        updatedAt: '-P120D',
        limit: 50,
        fields: ['id', 'completedAt', 'estimate'],
        ...(cursor ? { cursor } : {}),
      })
      const text = result.content.map(block => block.text ?? '').join('')
      if (result.isError) throw new Error(text)
      const data = JSON.parse(text) as {
        issues?: { id: string; completedAt?: string | null; estimate?: { value?: number } | null }[]
        hasNextPage?: boolean
        cursor?: string
      }
      for (const issue of data.issues ?? []) {
        if (!issue.completedAt) continue
        found.push({ id: issue.id, day: dayKey(Date.parse(issue.completedAt)), points: issue.estimate?.value ?? 0 })
      }
      if (!data.hasNextPage || !data.cursor) break
      cursor = data.cursor
    }
    await update($, closed, () => found)
    await update($, linearError, () => null)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, linearError, () => linearProblem(message))
  }
}

/** Shows another range and remembers it for next time. */
async function pickRange($: EngineInterface, next: Range) {
  await update($, range, () => next)
  await $.store.set(RANGE_KEY, next)
}

/** A Linear failure in words: not connected, unavailable for now, or its own message. */
function linearProblem(message: string): string {
  if (/no connected MCP/i.test(message)) return 'Linear is not connected. Connect it in /mcp to see issues closed.'
  try {
    const body = JSON.parse(message) as { message?: string; status?: number }
    if (body.status !== undefined && body.status >= 500) return 'Linear is unavailable right now. Press Refresh to try again.'
    if (body.message) return body.message
  } catch {
    // Not JSON: the server's own words.
  }
  return message.length > 160 ? `${message.slice(0, 159)}…` : message
}

async function refresh($: EngineInterface, o: Options) {
  await Promise.all([runScan($), loadClosed($, o)])
}

export const register: Register = (on, rawOptions) => {
  const options = rawOptions as unknown as Options

  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command (~0.7 s), which would hold startup.
    // Typed as /usage-stats in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'usage-stats',
      description: "Show your Claude Code usage on this machine: tokens, prompts, sessions, issues closed",
    }).catch(() => undefined)
    const stored = await $.store.get(RANGE_KEY)
    if (stored === '7d' || stored === '30d' || stored === 'all') await update($, range, () => stored)

    return next(e)
  })

  // The view opens only when asked for.
  on('command.run', { command: ['usage-stats', 'usage-stats:usage-stats'] }, async $ => {
    // Focused, so it comes to the front where a surface shows one pane at a time (the desktop app).
    const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })
    if (opened.isPlaced) {
      void refresh($, options)
      return { text: 'Usage stats opened.' }
    }
    // No pane here (a desktop app that places none): print the receipt into the conversation instead.
    await refresh($, options)
    const data = await read($, scan)
    if (data === null) return { text: `Couldn't open the usage view: ${opened.reason}. ${(await read($, error)) ?? ''}`.trim() }
    const shown = await read($, range)
    const sum = summarize(data, (await read($, closed)) ?? [], shown, Date.now())
    const period = shown === 'all' ? 'all time' : shown === '7d' ? 'the last 7 days' : 'the last 30 days'
    const linearFailed = await read($, linearError)
    const footer = `${data.files.toLocaleString('en-US')} session logs · shown here because ${opened.reason}`

    return { text: receiptText(sum, period, linearFailed === null ? String(sum.closed.length) : '–', footer) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const data = await read($, scan)
    const issues = (await read($, closed)) ?? []
    const scanning = await read($, isScanning)
    const failed = await read($, error)
    const linearFailed = await read($, linearError)
    const shown = await read($, range)
    // A receipt is narrow: cap the width so lines stay easy to follow on a wide pane.
    const width = Math.max(36, Math.min(RECEIPT_WIDTH, e.props.bodyColumns - 2))
    const now = Date.now()

    const title = (
      <Box flexDirection="row" justifyContent="space-between" width={width}>
        <Text bold>Usage</Text>
        <Box flexDirection="row" columnGap={2}>
          {RANGES.map(item => (
            <Button
              key={`range:${item.range}`}
              label={item.label}
              plain
              variant={shown === item.range ? 'primary' : undefined}
              dimColor={shown !== item.range}
              onPress={() => pickRange($, item.range)}
            />
          ))}
          <Button key="refresh" label={scanning ? '…' : '⟳'} plain dimColor onPress={() => refresh($, options)} />
        </Box>
      </Box>
    )

    if (data === null) {
      return (
        <Box flexDirection="column" rowGap={1}>
          {title}
          {failed !== null ? (
            <Text color="error" wrap="wrap">
              {failed}
            </Text>
          ) : (
            <Text dimColor>Reading your session logs…</Text>
          )}
        </Box>
      )
    }

    const sum = summarize(data, issues, shown, now)
    const line = (name: string, columns: string[], isStrong = false) => {
      const parts = leaderLine(name, columns, width)
      return (
        <Box key={`line:${name}`} flexDirection="row">
          <Text>{parts.name}</Text>
          <Text color={LEADER}>{parts.leader}</Text>
          <Text bold={isStrong}>{parts.tail}</Text>
        </Box>
      )
    }
    const share = (value: number) => `${Math.round((value / Math.max(1, sum.tokens)) * 100)}%`
    const dateLabel = (day: string) => {
      const [, month, date] = day.split('-').map(Number)
      return `${MONTHS[month! - 1]} ${date}`
    }

    // The total, in block digits: the one loud thing on the page.
    const hero = bigText(compact(sum.tokens))
    const period = shown === 'all' ? 'all time' : shown === '7d' ? 'the last 7 days' : 'the last 30 days'

    // The range at a glance: tokens per day, squeezed to the receipt's width.
    const spark = sparkRows(stretch(bucket(sum.daily.map(day => day.tokens), width), width), 2)
    const firstDay = sum.daily[0]?.day ?? ''
    const lastDay = sum.daily[sum.daily.length - 1]?.day ?? ''

    // Projects: the top four, the rest as one line.
    const projects = topWithOther(sum.byProject, 5)

    // Models: one proportion bar in shades of the accent; the labels carry the names.
    const models = topWithOther(sum.byModel, 4)
    const cells = proportions(
      models.map(slice => slice.value),
      width,
    )

    // The busiest moments.
    const busiestDay = sum.daily.reduce((best, day) => (day.tokens > best.tokens ? day : best), { day: '', tokens: 0, prompts: 0 })
    let hotDay = 0
    let hotHour = 0
    sum.weekHours.forEach((hours, day) =>
      hours.forEach((count, hour) => {
        if (count > (sum.weekHours[hotDay]![hotHour] ?? 0)) {
          hotDay = day
          hotHour = hour
        }
      }),
    )
    const hasHours = (sum.weekHours[hotDay]![hotHour] ?? 0) > 0
    const topIssue = sum.byIssue[0]

    return (
      <Box flexDirection="column">
        {title}

        <Box flexDirection="column" marginTop={1}>
          {hero.map(row => (
            <Text color={ACCENT} bold>
              {row}
            </Text>
          ))}
          <Text dimColor>{`tokens in ${period}`}</Text>
        </Box>

        <Box flexDirection="row" columnGap={3} marginTop={1}>
          <Text>
            <Text bold>{compact(sum.prompts)}</Text>
            <Text dimColor> prompts</Text>
          </Text>
          <Text>
            <Text bold>{compact(sum.sessions)}</Text>
            <Text dimColor> sessions</Text>
          </Text>
          <Text>
            <Text bold>{linearFailed === null ? String(sum.closed.length) : '–'}</Text>
            <Text dimColor> issues closed</Text>
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {spark.map(row => (
            <Text color={ACCENT}>{row}</Text>
          ))}
          <Box flexDirection="row" justifyContent="space-between" width={Math.max(spark[0]?.length ?? 0, 20)}>
            <Text dimColor>{firstDay === '' ? '' : dateLabel(firstDay)}</Text>
            <Text dimColor>{lastDay === '' ? '' : dateLabel(lastDay)}</Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Projects</Text>
          {projects.map(slice => line(slice.label, [compact(slice.value), share(slice.value)]))}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Models</Text>
          <Box flexDirection="row">
            {models.map((slice, index) => (
              <Text color={SHADES[slice.label === 'other' ? 3 : Math.min(index, 2)]}>{'█'.repeat(cells[index] ?? 0)}</Text>
            ))}
          </Box>
          <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
            {models.map((slice, index) => (
              <Text key={`model:${slice.label}`}>
                <Text color={SHADES[slice.label === 'other' ? 3 : Math.min(index, 2)]}>■ </Text>
                <Text>{slice.label}</Text>
                <Text dimColor>{` ${share(slice.value)}`}</Text>
              </Text>
            ))}
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          {busiestDay.tokens > 0 && line('Busiest day', [dateLabel(busiestDay.day)])}
          {hasHours && line('Busiest hour', [`${WEEKDAYS[hotDay]} ${String(hotHour).padStart(2, '0')}:00`])}
          {topIssue !== undefined && line('Top issue', [topIssue.label])}
          {linearFailed === null && sum.closedPoints > 0 && line('Points closed', [String(sum.closedPoints)])}
        </Box>

        <Box marginTop={1} width={width}>
          <Text dimColor wrap="wrap">
            {`${data.files.toLocaleString('en-US')} session logs since ${dateLabel(rangeStart('all', now, data))}` +
              (linearFailed === null ? '' : ` · ${linearFailed}`)}
          </Text>
        </Box>
      </Box>
    )
  })
}
