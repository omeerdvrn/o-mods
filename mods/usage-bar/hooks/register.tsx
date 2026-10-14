import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Show, Snapshot } from '../types'
import { barCells, currentLimits, elapsedShare, labelOf, levelColor, modelName, orderLimits, parseGitStatus, resetLabel } from './meter'

const GIT_EVERY_MS = 60_000
const CLOCK_EVERY_MS = 60_000
const BAR_CELLS = 10

const limits = atom({ plugin: 'usage-bar', key: 'limits' } as const, [] as Limit[])
const snapshot = atom({ plugin: 'usage-bar', key: 'snapshot' } as const, null as Snapshot | null)
const git = atom({ plugin: 'usage-bar', key: 'git' } as const, null as Snapshot['git'])
const now = atom({ plugin: 'usage-bar', key: 'now' } as const, 0)
const folder = atom({ plugin: 'usage-bar', key: 'folder' } as const, '')
const show = atom({ plugin: 'usage-bar', key: 'show' } as const, 'used' as Show)
const SHOW_KEY = 'show'

async function readGit($: EngineInterface) {
  const cwd = await $.session.cwd()
  await update($, folder, () => cwd.split('/').pop() || cwd)
  const place = await $.process.run(
    ['git', 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel'],
    { cwd, timeoutMs: 5_000 },
  )
  if (place.exitCode !== 0) {
    await update($, git, () => null)
    return
  }
  const status = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], { cwd, timeoutMs: 5_000 })
  const parsed = parseGitStatus(place.stdout, status.exitCode === 0 ? status.stdout : '')
  await update($, git, () => parsed)
}

async function readUsage($: EngineInterface) {
  const usage = await $.session.usage()
  const model = await $.session.model()
  const clock = await $.clock.now()
  await update($, limits, () => usage.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })))
  await update($, snapshot, previous => ({
    model,
    contextPercent: usage.context.percent ?? null,
    costUsd: usage.cost?.usd ?? null,
    git: previous?.git ?? null,
  }))
  await update($, now, () => clock)
}

async function tick($: EngineInterface) {
  const clock = await $.clock.now()
  await update($, now, () => clock)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command (~0.7 s), which would hold startup.
    // Typed as /usage-bar in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'usage-bar',
      description: "Show plan limits as used or remaining",
      argumentHint: '[used|remaining|debug]',
    }).catch(() => undefined)
    const stored = await $.store.get(SHOW_KEY)
    if (stored === 'used' || stored === 'remaining') await update($, show, () => stored)
    void readUsage($)
    void readGit($)
    $.clock.every(GIT_EVERY_MS, () => void readGit($))
    $.clock.every(CLOCK_EVERY_MS, () => void tick($))

    return next(e)
  })

  // `/usage-bar` flips between used and remaining; `/usage-bar used|remaining` picks one. The choice is kept.
  on('command.run', { command: ['usage-bar', 'usage-bar:usage-bar'] }, async ($, e) => {
    const asked = e.args.trim()
    // The figures exactly as the engine reports them, to compare with /usage.
    if (asked === 'debug') {
      const usage = await $.session.usage()
      return { text: JSON.stringify({ now: new Date(await $.clock.now()).toISOString(), rateLimits: usage.rateLimits }, null, 2) }
    }
    const current = await read($, show)
    const next: Show = asked === 'used' || asked === 'remaining' ? asked : current === 'used' ? 'remaining' : 'used'
    await update($, show, () => next)
    await $.store.set(SHOW_KEY, next)

    return { text: next === 'used' ? 'Limits now show what you have used.' : 'Limits now show what you have left.' }
  })

  // The engine pushes a measurement after each turn and whenever a limit moves a whole point.
  on('session.measure', async ($, e, next) => {
    await readUsage($)

    return next(e)
  })

  // A turn can switch branches or enter a worktree: read git again as soon as it ends.
  on('turn.complete', async ($, e, next) => {
    void readGit($)

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    // The mode labels as the rest of the chain and the engine draw them: labels other mods add (the heat mod's
    // tier, persona's role) show whichever order the mods were installed in.
    const labels = await next(e)
    const mode = await read($, show)
    const info = await read($, snapshot)
    const place = await read($, git)
    const where = await read($, folder)
    const clock = (await read($, now)) || Date.now()
    const windows = orderLimits(currentLimits(await read($, limits), clock))

    const changes = place
      ? [
          place.staged > 0 && { text: `+${place.staged}`, color: 'success' },
          place.modified > 0 && { text: `~${place.modified}`, color: 'warning' },
          place.untracked > 0 && { text: `?${place.untracked}`, color: 'inactive' },
          place.ahead > 0 && { text: `↑${place.ahead}`, color: 'suggestion' },
          place.behind > 0 && { text: `↓${place.behind}`, color: 'suggestion' },
        ].filter((part): part is { text: string; color: string } => Boolean(part))
      : []

    const limitRow = (
      <Box flexDirection="row" columnGap={3}>
        {windows.map(window => {
          const color = levelColor(window.percentUsed)
          const elapsed = elapsedShare(window.kind, window.resetsAt, clock)
          // Remaining: the bar drains as you use it, in one color for how close you are, and the tick marks
          // how much of the window's time is left, so a bar shorter than the tick is running out early.
          const cells =
            mode === 'remaining'
              ? barCells(Math.max(0, 100 - window.percentUsed), BAR_CELLS, elapsed === null ? null : 1 - elapsed, color)
              : barCells(window.percentUsed, BAR_CELLS, elapsed)
          const reset = resetLabel(window.resetsAt, clock)

          return (
            <Box key={`limit:${window.kind}`} flexDirection="row" columnGap={1}>
              <Text dimColor>{labelOf(window.kind)}</Text>
              <Box flexDirection="row">
                {cells.map(cell => (
                  <Text color={cell.color} backgroundColor={cell.background}>
                    {cell.glyph}
                  </Text>
                ))}
              </Box>
              <Text color={color} bold>
                {mode === 'remaining'
                  ? `${Math.max(0, Math.round(100 - window.percentUsed))}% left`
                  : `${Math.round(window.percentUsed)}%`}
              </Text>
              {reset !== null && <Text dimColor>{`↻ ${reset}`}</Text>}
            </Box>
          )
        })}
      </Box>
    )

    const gitPart =
      place === null ? (
        where !== '' && <Text dimColor>{`▸ ${where}`}</Text>
      ) : (
        <Box flexDirection="row" columnGap={1}>
          <Text color={place.worktree ? 'permission' : 'suggestion'}>
            {place.worktree ? `⌂ ${place.worktree}` : '⎇'}
          </Text>
          <Text color={place.worktree ? 'permission' : 'suggestion'}>{place.branch}</Text>
          {changes.map(part => (
            <Text color={part.color}>{part.text}</Text>
          ))}
        </Box>
      )

    return (
      <Box flexDirection="column" alignItems="flex-end">
        <Box flexDirection="row" columnGap={3}>
          {gitPart}
          {windows.length > 0 && limitRow}
        </Box>
        <Box flexDirection="row" columnGap={3}>
          {labels}
          {info !== null && <Text dimColor>{modelName(info.model)}</Text>}
          {info?.contextPercent !== null && info?.contextPercent !== undefined && (
            <Text color={levelColor(info.contextPercent)} dimColor={info.contextPercent < 70}>
              {`ctx ${Math.round(info.contextPercent)}%`}
            </Text>
          )}
          {info?.costUsd !== null && info?.costUsd !== undefined && (
            <Text dimColor>{`$${info.costUsd.toFixed(2)}`}</Text>
          )}
        </Box>
      </Box>
    )
  })
}
