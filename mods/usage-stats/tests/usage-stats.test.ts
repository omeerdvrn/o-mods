import { expect, mock, test } from 'claude-code/testing'

import { bigText, bucket, leaderLine, proportions, sparkRows, stretch } from '../hooks/charts'
import { change, compact, dayKey, modelName, modelOrder, summarize, topWithOther, weekOf, weekdayOf } from '../hooks/stats'
import type { Scan } from '../types'

declare const setTimeout: (callback: () => void, ms: number) => unknown

const NOW = new Date(2026, 9, 8, 12, 0).getTime()
const TODAY = dayKey(NOW)
const LONG_AGO = '2026-08-20'

const SCAN: Scan = {
  generatedAt: NOW,
  files: 3,
  parsed: 3,
  seconds: 0.1,
  tokens: [
    [TODAY, 'shop-api', 'claude-opus-5-5', 'ENG-1930', 100, 200, 300, 9_400, 4],
    [TODAY, 'webapp', 'claude-sonnet-5', '', 50, 50, 0, 900, 2],
    [LONG_AGO, 'mydevenv', 'claude-opus-5', '', 10, 10, 0, 80, 1],
  ],
  prompts: [
    [TODAY, 'shop-api', 'ENG-1930', 5],
    [LONG_AGO, 'mydevenv', '', 2],
  ],
  hours: [
    [TODAY, 14, 10_000, 5],
    [LONG_AGO, 9, 100, 2],
  ],
  sessions: [
    [TODAY, 'shop-api'],
    [LONG_AGO, 'mydevenv'],
  ],
}

test('a range sums only its own days, by project, model and issue', async () => {
  const week = summarize(SCAN, [{ id: 'ENG-1', day: TODAY, points: 3 }], '7d', NOW)
  expect(week.tokens).toBe(11_000)
  expect(week.prompts).toBe(5)
  expect(week.sessions).toBe(1)
  expect(week.byProject[0]).toEqual({ label: 'shop-api', value: 10_000 })
  expect(week.byModel.map(slice => slice.label)).toEqual(['Opus 5.5', 'Sonnet 5'])
  expect(week.byIssue).toEqual([{ label: 'ENG-1930', value: 10_000 }])
  expect(week.daily).toHaveLength(7)
  expect(week.hourly[14]).toBe(10_000)
  expect(week.closed).toHaveLength(1)
  expect(week.closedPoints).toBe(3)

  const all = summarize(SCAN, [], 'all', NOW)
  expect(all.tokens).toBe(11_100)
  expect(all.prompts).toBe(7)
  expect(all.daily[0]?.day).toBe(LONG_AGO)
})

test('formatting and chart pieces', async () => {
  expect(compact(26_607_881_459)).toBe('26.6B')
  expect(compact(22_499_414)).toBe('22.5M')
  expect(compact(1_174)).toBe('1,174')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(weekOf('2026-10-08')).toBe('W41')
  expect(topWithOther([4, 3, 2, 1].map(value => ({ label: `m${value}`, value })), 3).at(-1)).toEqual({ label: 'other', value: 3 })
  expect(bigText('17.8B')).toEqual(['▀█  ▀▀█   █▀█ █▀▄', ' █    █   █▀█ █▀▄', '▀▀▀   ▀ ▀ ▀▀▀ ▀▀ '])
  const parts = leaderLine('webapp', ['10.8B', '61%'], 40)
  expect((parts.name + parts.leader + parts.tail).length).toBe(39)
  expect(parts.leader).toMatch(/^·+$/)
  expect(leaderLine('a-very-long-project-name-indeed', ['1.0B'], 24).name).toContain('…')
  expect(sparkRows([0, 4, 8], 1)).toEqual([' ▄█'])
  expect(sparkRows([8], 2)).toEqual(['█', '█'])
  expect(bucket([1, 2, 3, 4, 5], 2)).toEqual([6, 9])
  expect(stretch([1, 2], 5)).toEqual([1, 1, 2, 2])
  expect(proportions([90, 9, 1], 20)).toEqual([17, 2, 1])
  expect(proportions([90, 9, 1], 20).reduce((a, b) => a + b, 0)).toBe(20)
  expect(change(120, 100)).toBe(20)
  expect(change(5, 0)).toBeNull()
  expect(weekdayOf('2026-10-05')).toBe(0)
  expect(modelOrder(SCAN)).toEqual(['Opus 5.5', 'Sonnet 5', 'Opus 5'])
})

test('/usage-stats opens the view; nothing opens on its own', async ($, on) => {
  const opened: string[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } } as never
  })
  on('process.run', async () => ({
    value: { exitCode: 0, stdout: JSON.stringify(SCAN), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  const servers: string[] = []
  on('mcp.call', async (_$, e) => {
    servers.push(e.server)
    // As in a desktop session: no claude.ai connector, Linear added as `linear`.
    if (e.server === 'claude.ai Linear') return { deny: 'no connected MCP tool "list_issues" on a server named "claude.ai Linear"' } as never
    return {
    value: {
      content: [{ type: 'text', text: JSON.stringify({ issues: [{ id: 'ENG-1', completedAt: new Date(NOW).toISOString(), estimate: { value: 5 } }] }) }],
      isError: false,
    },
  }
  })
  mock.clock(on, { now: NOW })
  mock.store(on)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual([])

  await $.command.run({ command: 'usage-stats', args: '' } as never)
  expect(opened).toEqual(['usage-stats'])
  // The scan runs in the background; give it a moment to land.
  await new Promise<void>(resolve => setTimeout(() => resolve(), 50))

  const PANE = {
    component: 'Pane',
    requestId: 'usage-stats',
    props: { title: 'Usage stats', isFocused: true, bodyColumns: 70, placement: 'dock' } as never,
  } as const
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-stats', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /prompts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Projects$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /shop-api/ })).toBeDefined()
    await ui.unmount()
  }
  expect(servers.at(-1)).toBe('linear')
})

test('where no pane is placed, /usage-stats prints the receipt into the conversation', async ($, on) => {
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: false, reason: 'this desktop app places no panes' } }) as never)
  on('process.run', async () => ({
    value: { exitCode: 0, stdout: JSON.stringify(SCAN), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('mcp.call', async () => ({ value: { content: [{ type: 'text', text: JSON.stringify({ issues: [] }) }], isError: false } }))
  mock.clock(on, { now: NOW })
  mock.store(on)
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })

  const reply = JSON.stringify(await $.command.run({ command: 'usage-stats', args: '' } as never))
  expect(reply).toContain('```')
  expect(reply).toContain('shop-api')
  expect(reply).toContain('prompts')
  expect(reply).toContain('this desktop app places no panes')
})
