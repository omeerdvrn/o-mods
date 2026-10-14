import { expect, mock, test } from 'claude-code/testing'

declare const setTimeout: (callback: () => void, ms: number) => unknown

import { TRACK, barCells, currentLimits, elapsedShare, modelName, parseGitStatus, resetLabel } from '../hooks/meter'

const MODE = { component: 'SessionMode', props: { modes: [] } } as const

test('bars light one cell for any use, and the pace tick sits at the elapsed share', async () => {
  expect(barCells(0, 10, null).filter(cell => cell.isFilled)).toHaveLength(0)
  expect(barCells(2, 10, null).filter(cell => cell.isFilled)).toHaveLength(1)
  expect(barCells(50, 10, null).filter(cell => cell.isFilled)).toHaveLength(5)
  const cells = barCells(30, 10, 0.75)
  expect(cells[7]?.glyph).toBe('▏')
  expect(cells[7]?.background).toBe(TRACK)

  const now = Date.UTC(2026, 9, 8, 12, 0)
  expect(Math.round((elapsedShare('five_hour', new Date(now + 4 * 3_600_000).toISOString(), now) ?? 0) * 100)).toBe(20)
  expect(resetLabel(new Date(now + 47 * 60_000).toISOString(), now)).toBe('47m')
  expect(resetLabel(new Date(now + 133 * 60_000).toISOString(), now)).toBe('2h13m')
})

test('a window past its reset reads as fresh until the engine reports again', async () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  const fresh = currentLimits(
    [
      { kind: 'five_hour', percentUsed: 80, resetsAt: '2026-10-12T11:00:00Z' },
      { kind: 'seven_day', percentUsed: 40, resetsAt: '2026-10-15T11:00:00Z' },
    ],
    now,
  )
  expect(fresh[0]).toEqual({ kind: 'five_hour', percentUsed: 0 })
  expect(fresh[1]?.percentUsed).toBe(40)
})

test('model names and git status read the way the bar shows them', async () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 1M')

  const status = [
    '# branch.oid 0123456789abcdef',
    '# branch.head feature/eng-1930',
    '# branch.upstream origin/feature/eng-1930',
    '# branch.ab +2 -1',
    '1 M. N... 100644 100644 100644 a b src/a.ts',
    '1 .M N... 100644 100644 100644 a b src/b.ts',
    '? notes.md',
  ].join('\n')
  const main = parseGitStatus('/r/.git\n/r/.git\n/r\n', status)
  expect(main).toEqual({ branch: 'feature/eng-1930', staged: 1, modified: 1, untracked: 1, ahead: 2, behind: 1 })
  const tree = parseGitStatus('/r/.git/worktrees/eng-1930\n/r/.git\n/r/.claude/worktrees/eng-1930\n', status)
  expect(tree?.worktree).toBe('eng-1930')
})

test('the footer draws limits, branch and session figures on every surface', async ($, on) => {
  const resets = new Date(Date.now() + 2 * 3_600_000).toISOString()
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      context: { window: 200_000, percent: 31 },
      rateLimits: [
        { kind: 'seven_day', percentUsed: 18, resetsAt: resets },
        { kind: 'five_hour', percentUsed: 42, resetsAt: resets },
      ],
      cost: { usd: 1.24 },
    },
  }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', async () => ({ value: '/repo' }))
  mock.clock(on)
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  // The engine's own drawing of the mode labels, beneath every plugin; a mod installed after usage-bar
  // adds its label on the way down, as persona does.
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const modes = [...((e.props as { modes?: string[] }).modes ?? []), 'Developer']
    return h(Text, { dimColor: true }, modes.join(' & ')) as never
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('process.run', async (_$, e) => {
    const out = e.argv.includes('rev-parse')
      ? '/repo/.git\n/repo/.git\n/repo\n'
      : e.argv.includes('status')
        ? '# branch.oid abc\n# branch.head main\n1 .M N... 1 1 1 a b x.ts\n'
        : ''
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  // usage-bar reads usage and git in the background; give them a moment to land.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 50))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-bar', surface, ...MODE })
    expect(await ui.find({ type: 'Text', text: /^5h$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^7d$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^main$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^~1$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Opus 5.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Developer/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ctx 31%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$1.24/ })).toBeDefined()
    await ui.unmount()
  }

  // Remaining: 42% used reads as 58% left, and the choice sticks.
  await $.command.run({ command: 'usage-bar', args: 'remaining' } as never)
  const left = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', ...MODE })
  expect(await left.find({ type: 'Text', text: /^58% left$/ })).toBeDefined()
  expect(await left.find({ type: 'Text', text: /^82% left$/ })).toBeDefined()
  await left.unmount()
  await $.command.run({ command: 'usage-bar', args: '' } as never)
  const used = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', ...MODE })
  expect(await used.find({ type: 'Text', text: /^42%$/ })).toBeDefined()
  await used.unmount()
})
