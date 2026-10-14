import { expect, mock, test } from 'claude-code/testing'

import { crabArt, crabRuns, crabSvg } from '../hooks/crabs'

declare const setTimeout: (callback: () => void, ms: number) => unknown
const settle = () => new Promise<void>(resolve => setTimeout(() => resolve(), 50))

const ROWS = [
  { task_id: 't-aa01', title: 'Fix the typo in the README', status: 'done', review: 'passed', plan_ref: null, parent_id: null, mismatch: false, group: 'Haiku', model: 'haiku', rule: 'trivial-local', elapsed: '40s', ran_on: 'claude-haiku-4-5' },
  { task_id: 't-bb02', title: 'Add CSV export to reports', status: 'escalated', review: null, plan_ref: null, parent_id: null, mismatch: false, group: 'Sonnet', model: 'sonnet', rule: 'typical-change', elapsed: '3m', ran_on: 'claude-sonnet-5-5' },
  { task_id: 't-cc03', title: 'Add CSV export to reports', status: 'running', review: null, plan_ref: null, parent_id: 't-bb02', mismatch: false, group: 'Opus', model: 'claude-opus-5-5', rule: 'escalation', elapsed: '1m', ran_on: 'claude-opus-5-5' },
  { task_id: 't-dd04', title: 'Explore the auth module', status: 'running', review: null, plan_ref: null, parent_id: null, mismatch: false, group: 'Unrouted', model: 'claude-sonnet-5-5', rule: 'unrouted', elapsed: '12s', ran_on: 'claude-sonnet-5-5' },
]

test('every tier has its own crab, 16 by 8, four rows of half blocks', async () => {
  for (const tier of ['haiku', 'sonnet', 'opus', 'unrouted'] as const) {
    expect(crabArt(tier)).toHaveLength(8)
    expect(crabArt(tier).every(line => line.length === 16)).toBe(true)
    expect(crabRuns(tier)).toHaveLength(4)
    expect(crabSvg(tier)).toContain('<rect')
  }
  expect(crabArt('opus')[0]).toContain('y')
  expect(crabArt('haiku').join('')).not.toBe(crabArt('sonnet').join(''))
})

test('spawns and answers go to the registry; the sidebar draws the crabs and the escalation chain', async ($, on) => {
  const calls: string[][] = []
  mock.clock(on)
  mock.store(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/repo' }))
  on('agent.list', async () => ({ value: [] }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('process.run', async (_$, e) => {
    calls.push([...e.argv])
    const command = e.argv[2]
    const stdout = command === 'summary-json' ? JSON.stringify(ROWS) : command === 'status' ? 'Haiku (1)' : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // The engine beneath: the spawn resolves its model, the Agent call answers with the worker's text.
  on('agent.spawn', async () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }) as never)
  on('tool.call', async () => ({ result: { agentId: 'a1', resolvedModel: 'claude-haiku-4-5', content: [{ type: 'text', text: 'done\n{"task_id": "t-aa01", "result": "success", "summary": "Fixed it."}' }] } }) as never)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'Task [t-aa01] fix the typo', description: '[t-aa01] Fix the typo', subagentType: 'task-router:worker-light' } as never)
  await settle()
  const started = calls.find(call => call[2] === 'started')!
  expect(JSON.parse(started[3]!)).toMatchObject({ subagentType: 'task-router:worker-light', model: 'claude-haiku-4-5', agentId: 'a1' })

  await $.tool.call({ tool: 'Agent', input: { prompt: 'x', description: '[t-aa01] Fix the typo' } } as never)
  await settle()
  const stopped = calls.find(call => call[2] === 'stopped')!
  expect(JSON.parse(stopped[3]!).text).toContain('"result": "success"')

  expect(JSON.stringify(await $.command.run({ command: 'route-status', args: '' } as never))).toContain('Haiku (1)')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'task-router', surface, component: 'Pane', requestId: 'task-router', props: { title: 'Task router', isFocused: true, bodyColumns: 60, placement: 'dock' } as never })
    // Full model names, from what the workers really ran on (Haiku 4.5 here), else today's lineup.
    for (const name of ['Haiku 4.5', 'Sonnet 5.5', 'Opus 5.5', 'Unrouted']) expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Needs attention/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Sonnet 5.5 failed, running on Opus 5.5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'started without /route' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1 running' })).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect(await ui.find({ type: 'Text', text: '▀' })).toBeDefined()
    await ui.unmount()
  }
})
