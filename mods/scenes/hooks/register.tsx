import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Activity, Burst, Tool } from './engine'
import { LOOP_MS, encodeCells, toCells } from './engine'
import { SCENES, composeFrame, desktopSvg, findScene, pickScene, sceneById } from './scenes'

const FRAME_MS = 70
const ROWS = 10
const KEY = 'scenes'
/** After a turn ends the scene stays a moment: food falls, the crab eats, a heart pops. */
const LINGER_MS = 1800

type Mode = 'random' | 'pinned' | 'off'

const showing = atom({ plugin: 'scenes', key: 'showing' } as const, false)
const sceneId = atom({ plugin: 'scenes', key: 'sceneId' } as const, 'night-drive')

// The turn as the scenes read it.
let turnStartedAt = 0
let finishedAt: number | null = null
let tool: Tool = 'think'
let toolCalls = 0
let bursts: Burst[] = []
let usagePercent: number | null = null
let fed = { day: '', count: 0 }
let mode: Mode = 'random'
let pinned: string | null = null
let withCrab = true
let lastScene: string | null = null

let band: { requestId: string; columns: number; rows: number } | null = null
let animation: { cancel: () => void } | null = null
let hideTimer: { cancel: () => void } | null = null

function today(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function activity(now: number): Activity {
  return {
    elapsedMs: now - turnStartedAt,
    finishingMs: finishedAt === null ? null : now - finishedAt,
    tool,
    toolCalls,
    usagePercent,
    hour: new Date(now).getHours(),
    fedToday: fed.day === today(now) ? fed.count : 0,
    bursts,
    now,
  }
}

/** What a tool call is, as the crab acts it out. */
function toolOf(name: string, command: string): Tool {
  if (name === 'Read' || name === 'NotebookRead') return 'read'
  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit' || name === 'MultiEdit') return 'edit'
  if (name === 'Grep' || name === 'Glob' || name === 'LS' || name === 'ToolSearch') return 'search'
  if (name === 'WebFetch' || name === 'WebSearch') return 'web'
  if (name === 'Agent' || name === 'Task') return 'agent'
  if (name === 'Bash') return TEST_COMMAND.test(command) ? 'test' : 'bash'
  return 'think'
}

const TEST_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(jest|vitest|pytest|mocha|rspec|phpunit)\b|\b(go|cargo|deno|bun)\s+test\b|\bclaude\s+plugin\s+test\b|\bmake\s+test\b/

async function paint($: EngineInterface) {
  if (band === null) return
  const now = await $.clock.now()
  const scene = sceneById(await read($, sceneId)) ?? SCENES[0]!
  const { requestId, columns, rows } = band
  const phase = ((now - turnStartedAt) % LOOP_MS) / LOOP_MS
  const cells = encodeCells(toCells(composeFrame(scene, columns, rows * 2, phase, activity(now), withCrab)))
  await $.ui.blit({ requestId, key: KEY, columns, rows, cells }).catch(() => undefined)
}

async function hide($: EngineInterface) {
  animation?.cancel()
  animation = null
  band = null
  await update($, showing, () => false)
}

async function readUsage($: EngineInterface) {
  const usage = await $.session.usage().catch(() => null)
  const window = usage?.rateLimits.find(limit => limit.kind === 'five_hour')
  usagePercent = window ? window.percentUsed : null
}

async function savePrefs($: EngineInterface) {
  await $.store.set('prefs', { mode, pinned, withCrab })
}

function listText(current: string): string {
  const how = mode === 'off' ? 'Scenes are off.' : mode === 'pinned' ? `Pinned to ${sceneById(pinned ?? '')?.name ?? pinned}.` : 'A random scene each time Claude works.'
  return [
    `${how} The crab is ${withCrab ? 'on' : 'off'}.`,
    '',
    ...SCENES.map(scene => `${scene.id === (mode === 'pinned' ? pinned : current) ? '●' : '○'} ${scene.id.padEnd(14)}${scene.name}${scene.id === 'weather' ? ' (follows your 5-hour usage)' : ''}`),
    '',
    '/scenes <name> pins one · /scenes random · /scenes crab on|off · /scenes off · /scenes on',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command, which would hold startup.
    // Typed as /scenes in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'scenes',
      description: 'Pixel scenes while Claude works: list, pin one, random, crab, off',
      argumentHint: '[<scene>|random|crab on|off|off|on]',
    }).catch(() => undefined)
    const prefs = (await $.store.get('prefs')) as { mode?: Mode; pinned?: string | null; withCrab?: boolean } | undefined
    if (prefs?.mode) mode = prefs.mode
    if (prefs?.pinned !== undefined) pinned = prefs.pinned
    if (prefs?.withCrab !== undefined) withCrab = prefs.withCrab
    const stored = (await $.store.get('fed')) as { day: string; count: number } | undefined
    if (stored) fed = stored
    void readUsage($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    void readUsage($)
    return next(e)
  })

  // Claude starts working: a scene comes up, random or the pinned one.
  on('turn.start', async ($, e, next) => {
    if (mode !== 'off') {
      hideTimer?.cancel()
      const now = await $.clock.now()
      turnStartedAt = now
      finishedAt = null
      tool = 'think'
      toolCalls = 0
      bursts = bursts.filter(burst => now - burst.at < 4000)
      const scene = mode === 'pinned' && pinned && sceneById(pinned) ? sceneById(pinned)! : pickScene(activity(now), lastScene, Math.random())
      lastScene = scene.id
      await update($, sceneId, () => scene.id)
      await update($, showing, () => true)
      animation?.cancel()
      animation = $.clock.every(FRAME_MS, () => void paint($))
    }
    return next(e)
  })

  // Each tool call: the crab acts it out; tests, commits and pushes set off a burst.
  on('tool.call', async ($, e, next) => {
    const command = e.tool === 'Bash' ? String((e as { command?: string }).command ?? '') : ''
    tool = toolOf(e.tool, command)
    toolCalls += 1
    const result = await next(e)
    const failed = 'deny' in result || ('isError' in result && result.isError === true)
    const now = await $.clock.now()
    if (e.tool === 'Bash') {
      if (TEST_COMMAND.test(command)) bursts.push({ kind: failed ? 'tests-fail' : 'tests-pass', at: now })
      else if (!failed && /\bgit\s+push\b/.test(command)) bursts.push({ kind: 'push', at: now })
      else if (!failed && /\bgit\s+commit\b/.test(command)) bursts.push({ kind: 'commit', at: now })
    }
    tool = 'think'
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // The turn ends: the crab eats (a heart for today), the scene lingers a moment, then goes.
  on('turn.complete', async ($, e, next) => {
    if (await read($, showing)) {
      const now = await $.clock.now()
      finishedAt = now
      fed = { day: today(now), count: (fed.day === today(now) ? fed.count : 0) + 1 }
      void $.store.set('fed', fed)
      hideTimer = $.clock.after(LINGER_MS, () => void hide($))
    }
    return next(e)
  })

  on('command.run', { command: ['scenes', 'scenes:scenes'] }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    const current = await read($, sceneId)
    if (verb === '' || verb === 'list') return { text: listText(current) }
    if (verb === 'off') {
      mode = 'off'
      await savePrefs($)
      await hide($)
      return { text: 'Scenes off.' }
    }
    if (verb === 'on' || verb === 'random') {
      mode = 'random'
      await savePrefs($)
      return { text: 'A random scene each time Claude works.' }
    }
    if (verb === 'crab') {
      withCrab = rest[0] !== 'off'
      await savePrefs($)
      return { text: withCrab ? 'The crab is back.' : 'The crab is resting.' }
    }
    const scene = findScene([verb, ...rest].join(' '))
    if (!scene) return { text: `No scene "${[verb, ...rest].join(' ')}". Run /scenes to see them.` }
    mode = 'pinned'
    pinned = scene.id
    await savePrefs($)
    return { text: `Pinned: ${scene.name} plays each time Claude works. /scenes random to mix them again.` }
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // The band above the prompt, only while Claude works (and a moment after). Whatever else draws there stays above it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, showing)) || e.props.hasSurvey) return next(e)
    const { Box, Raster, Svg } = $.ui.resolve(e)
    const scene = sceneById(await read($, sceneId)) ?? SCENES[0]!
    const rows = Math.max(3, Math.min(ROWS, e.props.maxRows))
    const columns = Math.max(20, e.props.bodyColumns)
    const now = await $.clock.now()
    const act = activity(now)
    const above = await next(e)

    if (e.surface === 'desktop' && Svg) {
      const svg = desktopSvg(scene, columns, rows * 2, act, withCrab)
      return (
        <Box flexDirection="column">
          {above}
          <Svg key={`${KEY}-${scene.id}`} source={svg} height={rows * 18} alt={scene.name} isInteractive />
        </Box>
      )
    }
    if (e.surface !== 'terminal' || !Raster) return above

    band = { requestId: e.requestId, columns, rows }
    const phase = ((now - turnStartedAt) % LOOP_MS) / LOOP_MS
    return (
      <Box flexDirection="column">
        {above}
        <Raster key={KEY} columns={columns} rows={rows} cells={encodeCells(toCells(composeFrame(scene, columns, rows * 2, phase, act, withCrab)))} />
      </Box>
    )
  })
}

