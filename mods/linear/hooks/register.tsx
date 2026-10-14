import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { IssueFilter, LinearIssue, StartState } from '../types'
import {
  ISSUE_FIELDS,
  branchFor,
  cleanDescription,
  implementationBrief,
  openIssues,
  parseMcpJson,
  toIssue,
  worktreePathFor,
} from './linear'
import {
  dueLook,
  isInProgress,
  isInReview,
  parseStatusColors,
  previewOf,
  priorityLook,
  shortEstimate,
  statusColor,
  statusGlyph,
  statusGroups,
} from './look'

const PANE = 'linear-issues'
const TITLE = 'Linear: my issues'
const REFRESH_MS = 5 * 60 * 1000
const PAGE_SIZE = 50
const MAX_PAGES = 4
const DONE_WINDOW = '-P30D'
const OPEN_STATE_TYPES = ['started', 'unstarted', 'triage', 'backlog']
const ACCENT = '#5E6AD2'
const CONNECT_RETRY_MS = 3000
const CONNECT_TRIES = 20

const issues = atom({ plugin: 'linear', key: 'issues' } as const, [])
const doneIssues = atom({ plugin: 'linear', key: 'done' } as const, [])
const isLoading = atom({ plugin: 'linear', key: 'isLoading' } as const, false)
const error = atom({ plugin: 'linear', key: 'error' } as const, null)
const fetchedAt = atom({ plugin: 'linear', key: 'fetchedAt' } as const, null)
const expanded = atom({ plugin: 'linear', key: 'expanded' } as const, {})
const fullDescriptions = atom({ plugin: 'linear', key: 'fullDescriptions' } as const, {})
const starts = atom({ plugin: 'linear', key: 'starts' } as const, {})
const filter = atom({ plugin: 'linear', key: 'filter' } as const, 'all' as IssueFilter)
const selected = atom({ plugin: 'linear', key: 'selected' } as const, null as string | null)
const isConnecting = atom({ plugin: 'linear', key: 'isConnecting' } as const, false)

type Options = {
  repoPath: string
  baseRef: string
  startMode: 'session' | 'agent'
  moveToInProgress: boolean
  linearServer: string
  statusColors?: string
}

function isFinished(issue: LinearIssue): boolean {
  return issue.statusType === 'completed' || issue.statusType === 'canceled'
}

function fit(text: string, room: number): string {
  return text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1)).trimEnd()}…`
}

/**
 * The names a Linear MCP server goes by: the claude.ai connector in the CLI, `linear` when it was added
 * with `claude mcp add`, as is common in the desktop app. The configured name is tried first.
 */
const SERVER_NAMES = ['claude.ai Linear', 'linear', 'Linear']
let connected: string | null = null

function serversFor(o: Options): string[] {
  return [...new Set([connected, o.linearServer, ...SERVER_NAMES].filter((name): name is string => Boolean(name)))]
}

/** Calls a Linear tool on the first server that has it connected, and remembers which one answered. */
async function linearCall($: EngineInterface, o: Options, tool: string, args: Record<string, unknown>) {
  const tried = serversFor(o)
  for (const server of tried) {
    try {
      const result = await $.mcp.call(server, tool, args)
      connected = server
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/no connected MCP/i.test(message)) throw err
      if (connected === server) connected = null
    }
  }
  throw new Error(
    `No connected MCP server has Linear's ${tool} (tried ${tried.map(name => `"${name}"`).join(', ')}). ` +
      'Connect Linear in /mcp, or set linearServer in /config to its name.',
  )
}

/** One state type's issues, paged in small batches so no single reply passes the MCP output cap. */
const CALL_TIMEOUT_MS = 20_000

/**
 * A Linear call that gives up after 20 seconds, so a connection that never answers (a desktop session
 * whose connector is still starting, or waiting on a sign-in) ends in a message instead of waiting forever.
 */
async function withTimeout<T>($: EngineInterface, call: Promise<T>): Promise<T> {
  const startedAt = await $.clock.now()
  return new Promise<T>((resolve, reject) => {
    // Gives up only once the time has truly passed, whenever the timer itself fires.
    const timer = $.clock.after(CALL_TIMEOUT_MS, () =>
      void $.clock.now().then(now => {
        if (now - startedAt < CALL_TIMEOUT_MS) return
        reject(new Error('Linear did not answer within 20 seconds. Check /mcp: the Linear connection may need you to sign in.'))
      }),
    )
    call.then(
      value => {
        timer.cancel()
        resolve(value)
      },
      error => {
        timer.cancel()
        reject(error)
      },
    )
  })
}

async function listByState(
  $: EngineInterface,
  o: Options,
  state: string,
  extra: Record<string, unknown> = {},
  pages = MAX_PAGES,
): Promise<LinearIssue[]> {
  const found: LinearIssue[] = []
  let cursor: string | undefined
  for (let page = 0; page < pages; page++) {
    const result = await withTimeout($, linearCall($, o, 'list_issues', {
      assignee: 'me',
      state,
      limit: PAGE_SIZE,
      orderBy: 'updatedAt',
      fields: ISSUE_FIELDS,
      ...extra,
      ...(cursor ? { cursor } : {}),
    }))
    const data = parseMcpJson(result) as { issues?: Record<string, unknown>[]; hasNextPage?: boolean; cursor?: string }
    found.push(...(data.issues ?? []).map(toIssue))
    if (!data.hasNextPage || !data.cursor) break
    cursor = data.cursor
  }
  return found
}

async function refresh($: EngineInterface, o: Options) {
  await update($, isLoading, () => true)
  try {
    const all: LinearIssue[] = []
    for (const state of OPEN_STATE_TYPES) all.push(...(await listByState($, o, state)))
    const list = openIssues(all)
    await update($, issues, () => list)
    // Done work is only the recent past: one page of what was finished in the last 30 days.
    const done = await listByState($, o, 'completed', { updatedAt: DONE_WINDOW }, 1)
    await update($, doneIssues, () => done)
    await update($, error, () => null)
    const now = await $.clock.now()
    await update($, fetchedAt, () => now)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, error, () => message)
  } finally {
    await update($, isLoading, () => false)
  }
}

async function fullDescription($: EngineInterface, o: Options, issue: LinearIssue): Promise<string> {
  const cached = (await read($, fullDescriptions))[issue.id]
  if (cached !== undefined) return cached
  try {
    const result = await linearCall($, o, 'get_issue', { id: issue.id, fields: ['id', 'description'] })
    const data = parseMcpJson(result) as { description?: string; issue?: { description?: string } }
    const text = data.description ?? data.issue?.description ?? issue.description
    await update($, fullDescriptions, all => ({ ...all, [issue.id]: text }))
    return text
  } catch {
    return issue.description
  }
}

async function setStart($: EngineInterface, o: Options, id: string, state: StartState) {
  await update($, starts, all => ({ ...all, [id]: state }))
}

async function git($: EngineInterface, o: Options, args: string[], cwd: string) {
  return $.process.run(['git', ...args], { cwd, timeoutMs: 120_000 })
}

async function createWorktree($: EngineInterface, o: Options, issue: LinearIssue) {
  const base = o.repoPath || (await $.session.cwd())
  const top = await git($, o, ['rev-parse', '--show-toplevel'], base)
  if (top.exitCode !== 0) {
    throw new Error(`${base} is not a git repository. Set repoPath in /config (linear).`)
  }
  const root = top.stdout.trim()
  const path = worktreePathFor(root, issue)
  const branch = branchFor(issue)

  const listed = await git($, o, ['worktree', 'list', '--porcelain'], root)
  if (listed.stdout.split('\n').includes(`worktree ${path}`)) {
    return { path, branch, isNew: false }
  }

  const hasBranch = await git($, o, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], root)
  const add =
    hasBranch.exitCode === 0
      ? await git($, o, ['worktree', 'add', path, branch], root)
      : await git($, o, ['worktree', 'add', '-b', branch, path, o.baseRef || 'HEAD'], root)
  if (add.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${add.stderr.trim()}`)
  }

  return { path, branch, isNew: true }
}

async function start($: EngineInterface, o: Options, issue: LinearIssue) {
  const current = (await read($, starts))[issue.id]
  if (current?.phase === 'working') return

  await setStart($, o, issue.id, { phase: 'working', message: 'Creating worktree...' })
  try {
    const tree = await createWorktree($, o, issue)
    const description = await fullDescription($, o, issue)
    const brief = implementationBrief(issue, description, tree.path, tree.branch)

    if (o.moveToInProgress && issue.statusType !== 'started') {
      await linearCall($, o, 'save_issue', { id: issue.id, state: 'In Progress' }).catch(() => undefined)
    }

    if (o.startMode === 'agent') {
      await $.agent.spawn({
        prompt: brief,
        cwd: tree.path,
        subagentType: 'general-purpose',
        description: `Implement ${issue.id}`,
      })
    } else {
      await $.prompt.submit({
        text: `First call the EnterWorktree tool with path "${tree.path}" to switch this session into the issue's worktree. Then do the task below.\n\n${brief}`,
      })
    }

    const verb = tree.isNew ? 'Created' : 'Reused'
    const who = o.startMode === 'agent' ? 'background agent started' : 'session will start'
    await setStart($, o, issue.id, { phase: 'started', message: `${verb} worktree; ${who}`, worktree: tree.path })
    $.ui.toast(`${issue.id}: ${verb.toLowerCase()} worktree ${tree.branch}`)
    void refresh($, o)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setStart($, o, issue.id, { phase: 'error', message })
  }
}

/** The claude.ai connectors attach a few seconds after start: keep trying until Linear answers. */
async function syncWhenConnected($: EngineInterface, o: Options, triesLeft: number) {
  await update($, isConnecting, () => true)
  await refresh($, o)
  const failed = await read($, error)
  if (failed !== null && /no connected MCP/i.test(failed) && triesLeft > 0) {
    $.clock.after(CONNECT_RETRY_MS, () => void syncWhenConnected($, o, triesLeft - 1))
    return
  }
  await update($, isConnecting, () => false)
}

export const register: Register = (on, rawOptions) => {
  const options = rawOptions as unknown as Options

  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command (~0.7 s), which would hold startup.
    // Typed as /linear in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'linear',
      description: 'Show your assigned Linear issues in a sidebar (`/linear refresh` to reload)',
      argumentHint: '[refresh]',
    }).catch(() => undefined)
    void $.ui.open({ id: PANE, title: TITLE })
    void syncWhenConnected($, options, CONNECT_TRIES)
    $.clock.every(REFRESH_MS, () => void refresh($, options))

    return next(e)
  })

  on('command.run', { command: ['linear', 'linear:linear'] }, async ($, e) => {
    if (e.args.trim() === 'refresh') {
      await refresh($, options)
      const count = (await read($, issues)).length
      const failed = await read($, error)
      return { text: failed ? `Linear refresh failed: ${failed}` : `Loaded ${count} open Linear issues.` }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    void refresh($, options)

    return { text: 'Linear issues sidebar opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link, Markdown } = $.ui.resolve(e)
    const all = await read($, issues)
    const done = await read($, doneIssues)
    const shown = await read($, filter)
    const isTodo = (issue: LinearIssue) => issue.statusType === 'unstarted'
    const list =
      shown === 'started'
        ? all.filter(isInProgress)
        : shown === 'review'
          ? all.filter(isInReview)
          : shown === 'todo'
            ? all.filter(isTodo)
            : shown === 'done'
              ? done
              : all
    const loading = await read($, isLoading)
    const connecting = await read($, isConnecting)
    const failed = await read($, error)
    const at = await read($, fetchedAt)
    const open = await read($, expanded)
    const full = await read($, fullDescriptions)
    const started = await read($, starts)
    const focus = await read($, selected)
    const columns = Math.max(30, e.props.bodyColumns)
    const time = at === null ? '' : new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const inProgress = all.filter(isInProgress).length
    const custom = parseStatusColors(options.statusColors ?? '')
    // inside a card: border and padding take two columns each side
    const titleRoom = columns - 4

    const field = (name: string, value: RenderChildren) => (
      <Box flexDirection="row">
        <Box width={10} flexShrink={0}>
          <Text dimColor>{name}</Text>
        </Box>
        {value}
      </Box>
    )

    const card = (issue: LinearIssue) => {
      const color = statusColor(issue, custom)
      const priority = priorityLook(issue.priority)
      const estimate = shortEstimate(issue.estimate)
      const due = dueLook(issue.dueDate, at)
      const state = started[issue.id]
      const isFull = open[issue.id] === true
      const description = cleanDescription(full[issue.id] ?? issue.description)

      return (
        <Box
          key={`card:${issue.id}`}
          flexDirection="column"
          borderStyle="round"
          borderColor={state?.phase === 'error' ? 'error' : state?.phase === 'started' ? 'success' : ACCENT}
          paddingX={1}
        >
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={ACCENT}>{issue.id}</Text>
            <Button
              key={`close:${issue.id}`}
              label="✕"
              plain
              dimColor
              onPress={() => update($, selected, () => null)}
            />
          </Box>
          <Text bold wrap="wrap">
            {issue.title}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {field('Status', <Text color={color}>{`${statusGlyph(issue)} ${issue.status}`}</Text>)}
            {field('Priority', <Text>{issue.priority ?? 'No priority'}</Text>)}
            {estimate !== null && field('Estimate', <Text>{estimate}</Text>)}
            {field('Project', <Text dimColor={issue.project === null}>{issue.project ?? 'No project'}</Text>)}
            {issue.team !== null && field('Team', <Text>{issue.team}</Text>)}
            {due !== null &&
              field(
                'Due',
                <Text color={due.isOverdue ? 'error' : 'text'}>
                  {due.isOverdue ? `${due.text}, overdue` : due.text}
                </Text>,
              )}
            {issue.labels.length > 0 && field('Labels', <Text color="ide">{issue.labels.join('  ')}</Text>)}
            {issue.branch !== null && field('Branch', <Text dimColor>{issue.branch}</Text>)}
          </Box>
          {description !== '' && (
            <Box flexDirection="column" marginTop={1}>
              {isFull ? (
                <Markdown text={description} />
              ) : (
                <Text dimColor wrap="wrap">
                  {previewOf(description, (columns - 4) * 4)}
                </Text>
              )}
            </Box>
          )}
          {state !== undefined && (
            <Box marginTop={1}>
              <Text
                color={state.phase === 'error' ? 'error' : state.phase === 'started' ? 'success' : 'warning'}
                wrap="wrap"
              >
                {state.phase === 'error' ? '✕ ' : state.phase === 'started' ? '✓ ' : '⟳ '}
                {state.message}
                {state.worktree ? `\n⎇ ${state.worktree}` : ''}
              </Text>
            </Box>
          )}
          <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
            {!isFinished(issue) && (
              <Button
                key={`start:${issue.id}`}
                label={
                  state?.phase === 'working'
                    ? '⟳ Starting…'
                    : state?.phase === 'started'
                      ? '▶ Start again'
                      : '▶ Start in worktree'
                }
                variant="primary"
                autoFocus
                onPress={() => start($, options, issue)}
              />
            )}
            {description.length > (columns - 4) * 4 && (
              <Button
                key={`more:${issue.id}`}
                label={isFull ? 'Less' : 'Full description'}
                plain
                dimColor
                onPress={async () => {
                  if (!isFull) await fullDescription($, options, issue)
                  await update($, expanded, all => ({ ...all, [issue.id]: !all[issue.id] }))
                }}
              />
            )}
            <Link href={issue.url} label="Open in Linear ↗" />
          </Box>
        </Box>
      )
    }

    const row = (issue: LinearIssue) => {
      const priority = priorityLook(issue.priority)
      const estimate = shortEstimate(issue.estimate)
      const state = started[issue.id]
      const color = statusColor(issue, custom)
      const where = issue.project ?? issue.team
      const canStart = !isFinished(issue)
      const startLabel = !canStart
        ? ''
        : state?.phase === 'working'
          ? '⟳'
          : state?.phase === 'started'
            ? '✓ Started'
            : '▶ Start'

      return (
        <Box
          key={`row:${issue.id}`}
          flexDirection="column"
          borderStyle="round"
          borderColor={state?.phase === 'error' ? 'error' : state?.phase === 'started' ? 'success' : color}
          borderDimColor
          hover={{ borderDimColor: false }}
          paddingX={1}
        >
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row" gap={1}>
              <Text color={priority.color}>{priority.glyph}</Text>
              <Text dimColor>{issue.id}</Text>
            </Box>
            {estimate !== null && <Text dimColor>{estimate}</Text>}
          </Box>
          <Button
            key={`pick:${issue.id}`}
            label={fit(issue.title, titleRoom)}
            plain
            hover={{ color: ACCENT }}
            onPress={() => update($, selected, () => issue.id)}
          />
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={color}>
              {fit(
                `${statusGlyph(issue)} ${issue.status}${where ? `  ${where}` : ''}`,
                titleRoom - startLabel.length - 2,
              )}
            </Text>
            {canStart && (
              <Button
                key={`quick:${issue.id}`}
                label={startLabel}
                plain
                dimColor={state?.phase !== 'started'}
                hover={{ color: ACCENT }}
                onPress={() => start($, options, issue)}
              />
            )}
          </Box>
          {state?.phase === 'error' && (
            <Text color="error" wrap="wrap">
              ✕ {state.message}
            </Text>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>My issues</Text>
          <Box flexDirection="row" gap={1}>
            {connecting && <Text dimColor>connecting…</Text>}
            {!connecting && loading && <Text dimColor>syncing…</Text>}
            {!connecting && !loading && time !== '' && <Text dimColor>{time}</Text>}
            <Button key="refresh" label="⟳" plain dimColor onPress={() => refresh($, options)} />
          </Box>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={3} marginTop={1}>
          <Button
            key="filter:all"
            label={`All ${all.length}`}
            plain
            variant={shown === 'all' ? 'primary' : undefined}
            dimColor={shown !== 'all'}
            onPress={() => update($, filter, () => 'all')}
          />
          <Button
            key="filter:todo"
            label={`Todo ${all.filter(isTodo).length}`}
            plain
            variant={shown === 'todo' ? 'primary' : undefined}
            dimColor={shown !== 'todo'}
            onPress={() => update($, filter, () => 'todo')}
          />
          <Button
            key="filter:started"
            label={`In progress ${inProgress}`}
            plain
            variant={shown === 'started' ? 'primary' : undefined}
            dimColor={shown !== 'started'}
            onPress={() => update($, filter, () => 'started')}
          />
          <Button
            key="filter:review"
            label={`In review ${all.filter(isInReview).length}`}
            plain
            variant={shown === 'review' ? 'primary' : undefined}
            dimColor={shown !== 'review'}
            onPress={() => update($, filter, () => 'review')}
          />
          <Button
            key="filter:done"
            label={`Done ${done.length}`}
            plain
            variant={shown === 'done' ? 'primary' : undefined}
            dimColor={shown !== 'done'}
            onPress={() => update($, filter, () => 'done')}
          />
        </Box>

        {failed !== null && !connecting && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="error">Couldn't sync with Linear.</Text>
            <Text dimColor wrap="wrap">
              {failed}
            </Text>
            <Text dimColor>Check /mcp, then press ⟳.</Text>
          </Box>
        )}
        {(connecting || (loading && all.length === 0)) && (
          <Box marginTop={1}>
            <Text dimColor>Loading your issues from Linear…</Text>
          </Box>
        )}
        {!loading && !connecting && failed === null && all.length === 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color="success">Nothing assigned to you.</Text>
            <Text dimColor>New assignments show up here on the next sync.</Text>
          </Box>
        )}
        {!loading && failed === null && all.length > 0 && list.length === 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>
              {shown === 'review'
                ? 'Nothing is waiting for review.'
                : shown === 'done'
                ? 'Nothing finished in the last 30 days.'
                : shown === 'todo'
                  ? 'No Todo issues. Your queue is clear.'
                  : 'Nothing is in the In Progress status. Pick an issue under All and start it.'}
            </Text>
          </Box>
        )}

        {statusGroups(list).map(group => (
          <Box key={`section:${group.status}`} flexDirection="column" marginTop={1}>
            <Box flexDirection="row" gap={1}>
              <Text color={statusColor(group.issues[0]!, custom)}>{statusGlyph(group.issues[0]!)}</Text>
              <Text bold>{group.status}</Text>
              <Text dimColor>{group.issues.length}</Text>
            </Box>
            {group.issues.map(issue => (issue.id === focus ? card(issue) : row(issue)))}
          </Box>
        ))}
      </Box>
    )
  })
}
