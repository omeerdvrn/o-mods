import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Row } from '../types'
import { ACCENT, DEFAULT_MODELS, TIER_NAMES, crabRuns, crabSvg, modelName } from './crabs'
import type { Tier } from './crabs'

const PANE = 'task-router'
const TITLE = 'Task router'
const REFRESH_MS = 5_000
const REAP_MS = 20_000
const TIERS: Tier[] = ['haiku', 'sonnet', 'opus', 'unrouted']
const STATUS_GLYPH: Record<string, string> = {
  queued: '·', classifying: '◌', routed: '○', running: '▶', done: '✓', failed: '✗', escalated: '↑', blocked: '■',
}
const STATUS_COLOR: Record<string, string> = {
  running: 'warning', done: 'success', failed: 'error', blocked: 'error', escalated: 'permission',
}
/** Statuses waiting for a worker. */
const WAITING = ['queued', 'classifying', 'routed']
const DONE_SHOWN = 2

/** The tier's model by full name: the one its workers last ran on, else the one it runs on today. */
function tierModel(all: Row[], tier: Tier): string {
  if (tier === 'unrouted') return 'Unrouted'
  const ran = all.filter(row => tierOf(row) === tier && row.ran_on?.startsWith('claude-')).map(row => row.ran_on!)
  return modelName(ran.at(-1) ?? DEFAULT_MODELS[tier])
}

/** What a tier is doing, in words: "1 running, 3 queued"; "idle" when nothing is. */
function stateLine(mine: Row[]): string {
  const count = (statuses: string[]) => mine.filter(row => statuses.includes(row.status)).length
  const parts = [
    [count(['running']), 'running'],
    [count(WAITING), 'queued'],
    [count(['failed', 'blocked']), 'failed'],
    [count(['done']), 'done'],
  ].filter(([n]) => (n as number) > 0).map(([n, word]) => `${n} ${word}`)
  return parts.length > 0 ? parts.join(', ') : 'idle'
}

const rows = atom({ plugin: 'task-router', key: 'rows' } as const, [] as Row[])

function scriptOf($: EngineInterface): string {
  return `${$.plugin.root.replace(/\/\.claude-plugin\/?$/, '')}/scripts/registry.py`
}

/** Runs the registry script in the session's project; every registry write goes through it. */
async function registry($: EngineInterface, args: string[]) {
  const cwd = await $.session.cwd()
  return $.process.run(['python3', scriptOf($), ...args], { cwd, timeoutMs: 15_000 })
}

/** Whether this project uses the router: `/route init` or a first `/route` made its folder. */
async function isOptedIn($: EngineInterface): Promise<boolean> {
  const cwd = await $.session.cwd()
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd, timeoutMs: 5_000 }).catch(() => null)
  const root = top?.exitCode === 0 ? top.stdout.trim() : cwd
  return Boolean(await $.fs.stat(`${root}/.claude/routing`).catch(() => undefined))
}

async function refresh($: EngineInterface) {
  const ran = await registry($, ['summary-json']).catch(() => null)
  if (ran?.exitCode !== 0) return
  const all = JSON.parse(ran.stdout || '[]') as Row[]
  await update($, rows, () => all)
}

function tierOf(row: Row): Tier | null {
  const group = row.group.toLowerCase()
  return group === 'haiku' || group === 'sonnet' || group === 'opus' || group === 'unrouted' ? group : null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // /route and /route-status are the plugin's skills; the mod answers /route-status itself (below).
    // Projects that do not use the router get no polling at all; /route-status and the hooks still work there.
    if (!(await isOptedIn($).catch(() => false))) return next(e)
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))
    // Background subagents end without a tool result: close their tasks once their loop is gone.
    $.clock.every(REAP_MS, () => {
      void (async () => {
        if (!(await read($, rows)).some(row => row.status === 'running')) return
        const agents = await $.agent.list()
        await registry($, ['reap', JSON.stringify(agents.map(agent => ({ id: agent.id, status: agent.status })))])
        await refresh($)
      })()
    })

    return next(e)
  })

  // Every subagent start: the registry learns which model it really runs on, and registers anything unrouted.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if ('deny' in started && started.deny) return started
    void registry($, [
      'started',
      JSON.stringify({
        subagentType: e.subagentType,
        description: e.description,
        prompt: e.prompt.slice(0, 2000),
        model: 'model' in started ? started.model : undefined,
        agentId: 'agentId' in started ? started.agentId : undefined,
      }),
    ]).then(() => refresh($)).catch(() => undefined)

    return started
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // A subagent's answer: the worker's closing status block moves its task to done, failed or blocked.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const result = await next(e)
    const record = 'result' in result ? (result.result as { agentId?: string; content?: { text?: string }[]; resolvedModel?: string } | undefined) : undefined
    const text = (record?.content ?? []).map(block => block.text ?? '').join('\n')
    if (record?.agentId && text.trim() !== '') {
      const isError = 'isError' in result && result.isError === true
      void registry($, ['stopped', JSON.stringify({ agentId: record.agentId, text: text.slice(-4000), isError, model: record.resolvedModel })])
        .then(() => refresh($))
        .catch(() => undefined)
    }

    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // The execution rule, for projects that use the router; their CLAUDE.md carries it too (/route init).
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await isOptedIn($).catch(() => false))) return composed
    const text = [
      '# task-router',
      'This project routes execution through task-router. When executing an approved implementation plan, run the task-router:route skill in batch mode on the plan file instead of superpowers:subagent-driven-development or superpowers:executing-plans. Superpowers still owns brainstorming, planning, worktrees, debugging and finishing the branch.',
      `Task state lives in .claude/routing/registry.json and changes only through: python3 "${scriptOf($)}"`,
    ].join('\n\n')

    return { sections: [...composed.sections, { id: 'task-router:rule', text, scope: 'session' }] }
  })

  // The skill's command, answered here without a model turn: the table, and the sidebar with the crabs.
  on('command.run', { command: ['route-status', 'task-router:route-status'] }, async ($, e) => {
    const filter = e.args.trim()
    await refresh($)
    const ran = await registry($, ['status', ...(filter ? [filter] : [])])
    // The engine leads with the plugin's name; the table starts on the next line.
    const text = '\n' + (ran.stdout || ran.stderr).trimEnd()
    if (filter === '') {
      // The sidebar with the crabs, where the surface places panes; the table prints either way.
      await $.ui.open({ id: PANE, title: TITLE })
    }
    return { text }
  })

  // The footer: what runs now, in words, and only while something runs or failed.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const all = await read($, rows)
    const running = all.filter(row => row.status === 'running').length
    const failed = all.filter(row => row.status === 'failed' || row.status === 'blocked').length
    if (running + failed === 0) return next(e)
    const label = ['router', running > 0 && `${running} running`, failed > 0 && `${failed} failed`].filter(Boolean).join(' ')
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })

  // The sidebar: a lane per model, its crab in full color while it works and faded while idle.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Svg } = $.ui.resolve(e)
    const all = await read($, rows)
    const isDesktop = e.surface === 'desktop'

    const crab = (tier: Tier, isIdle: boolean) =>
      isDesktop && Svg ? (
        <Svg source={crabSvg(tier, isIdle)} width={64} height={32} alt={`${TIER_NAMES[tier]} crab`} />
      ) : (
        <Box flexDirection="column" width={16} flexShrink={0}>
          {crabRuns(tier, isIdle).map((runs, index) => (
            <Box key={`crab-${tier}-${index}`} flexDirection="row">
              {runs.map(run => (
                <Text color={run.color} backgroundColor={run.background}>{run.text}</Text>
              ))}
            </Box>
          ))}
        </Box>
      )

    const taskRow = (row: Row) => (
      <Box key={`row-${row.task_id}`} flexDirection="row" columnGap={1}>
        <Box width={1} flexShrink={0}>
          <Text color={STATUS_COLOR[row.status] ?? 'inactive'}>{STATUS_GLYPH[row.status] ?? '?'}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end" dimColor={row.status === 'done'}>{row.title}</Text>
        </Box>
        <Box width={6} flexShrink={0}>
          <Text dimColor>{row.task_id}</Text>
        </Box>
        <Box width={4} flexShrink={0} justifyContent="flex-end">
          <Text dimColor>{row.elapsed}</Text>
        </Box>
      </Box>
    )

    const attention = all.filter(row => !row.parent_id && (['failed', 'blocked', 'escalated'].includes(row.status) || row.mismatch || row.group === 'Unrouted'))
    const why = (row: Row) => {
      if (row.group === 'Unrouted') return 'started without /route'
      if (row.mismatch) return 'ran on a different model than decided'
      if (row.status === 'escalated') {
        const chain = [row]
        for (let child = all.find(one => one.parent_id === row.task_id); child; child = all.find(one => one.parent_id === child!.task_id)) chain.push(child)
        const last = chain.at(-1)!
        return `${tierModel(all, tierOf(row) ?? 'sonnet')} failed, ${last.status} on ${tierModel(all, tierOf(last) ?? 'opus')}`
      }
      return row.status
    }

    if (all.length === 0) {
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text wrap="wrap">Nothing routed in this project yet.</Text>
          <Text dimColor wrap="wrap">Run /route init once, then /route with a task or a plan file.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" rowGap={1}>
        {attention.length > 0 && (
          <Box flexDirection="column">
            <Text color="error" bold>Needs attention</Text>
            {attention.map(row => (
              <Box key={`need-${row.task_id}`} flexDirection="row" columnGap={1}>
                <Box width={1} flexShrink={0}>
                  <Text color={row.status === 'escalated' ? 'permission' : 'error'}>{row.group === 'Unrouted' ? '?' : row.status === 'escalated' ? '↑' : '!'}</Text>
                </Box>
                <Box flexDirection="column" flexGrow={1}>
                  <Text wrap="truncate-end">{row.title}</Text>
                  <Text dimColor wrap="truncate-end">{why(row)}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        )}
        {TIERS.map(tier => {
          const mine = all.filter(row => tierOf(row) === tier)
          if (tier === 'unrouted' && mine.length === 0) return null
          const isIdle = !mine.some(row => row.status === 'running')
          const active = mine.filter(row => row.status === 'running' || WAITING.includes(row.status) || row.status === 'failed' || row.status === 'blocked')
          const done = mine.filter(row => row.status === 'done')
          const shown = [...active.sort((a, b) => (a.status === 'running' ? -1 : 0) - (b.status === 'running' ? -1 : 0)), ...done.slice(-DONE_SHOWN)]
          return (
            <Box key={`tier-${tier}`} flexDirection="row" columnGap={2}>
              {crab(tier, isIdle)}
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text color={isIdle ? undefined : ACCENT[tier]} bold>{tierModel(all, tier)}</Text>
                <Text dimColor>{stateLine(mine)}</Text>
                {shown.map(taskRow)}
                {done.length > DONE_SHOWN && <Text dimColor>{`and ${done.length - DONE_SHOWN} more done`}</Text>}
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
