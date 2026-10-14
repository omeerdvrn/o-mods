import { expect, mock, test } from 'claude-code/testing'

const ISSUES = {
  issues: [
    {
      id: 'ENG-1',
      title: 'Add login page',
      description: 'Short preview',
      estimate: { value: 3, name: '3 Points' },
      priority: { value: 2, name: 'High' },
      status: 'Todo',
      statusType: 'unstarted',
      project: 'Auth',
      team: 'Acme',
      url: 'https://linear.app/x/issue/ENG-1',
      gitBranchName: 'feature/eng-1-add-login-page',
      labels: [],
      dueDate: null,
    },
    {
      id: 'ENG-2',
      title: 'Old done thing',
      description: '',
      estimate: null,
      priority: { value: 0, name: 'No priority' },
      status: 'Done',
      statusType: 'completed',
      project: null,
      team: 'Acme',
      url: 'https://linear.app/x/issue/ENG-2',
      gitBranchName: null,
      labels: [],
      dueDate: null,
    },
  ],
}

const PANE = {
  component: 'Pane',
  requestId: 'linear-issues',
  props: { title: 'Linear: my issues', isFocused: true, bodyColumns: 60, placement: 'dock' } as never,
} as const

test('lists open issues and Start creates a worktree then submits the brief', async ($, on) => {
  const gitCalls: string[][] = []
  const mcpCalls: { server: string; tool: string; args: Record<string, unknown> }[] = []
  const prompts: string[] = []

  on('session.cwd', async () => ({ value: '/repo/sub' }))
  mock.clock(on, { now: Date.UTC(2026, 9, 8, 12, 0) })
  on('mcp.call', async (_$, e) => {
    // As in a desktop session: no claude.ai connector, Linear added as `linear`.
    if (e.server === 'claude.ai Linear') return { deny: `no connected MCP tool "${e.tool}" on a server named "claude.ai Linear"` } as never
    mcpCalls.push({ server: e.server, tool: e.tool, args: e.args })
    const body =
      e.tool === 'list_issues'
        ? { issues: ISSUES.issues.filter(i => i.statusType === e.args.state), hasNextPage: false }
        : e.tool === 'get_issue'
          ? { id: 'ENG-1', description: 'Full description of the login page.' }
          : { ok: true }
    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }], isError: false } }
  })
  on('process.run', async (_$, e) => {
    gitCalls.push([...e.argv])
    const args = e.argv.slice(1).join(' ')
    if (args === 'rev-parse --show-toplevel') return { value: { exitCode: 0, stdout: '/repo\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (args.startsWith('show-ref')) return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.submit', async (_$, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })

  await $.command.run({ command: 'linear', args: 'refresh' } as never)

  const ui = await $.ui.mount({ plugin: 'linear', surface: 'terminal', ...PANE })
  expect(await ui.find({ key: 'pick:ENG-1' })).toBeDefined()
  expect(await ui.find({ key: 'pick:ENG-2' })).toBeUndefined()

  const desktop = await $.ui.mount({ plugin: 'linear', surface: 'desktop', ...PANE })
  expect(await desktop.find({ key: 'pick:ENG-1' })).toBeDefined()
  await desktop.unmount()

  await ui.press({ key: 'filter:started' })
  expect(await ui.find({ key: 'pick:ENG-1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Nothing is in the In Progress status/ })).toBeDefined()
  await ui.press({ key: 'filter:review' })
  expect(await ui.find({ key: 'pick:ENG-1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Nothing is waiting for review/ })).toBeDefined()
  await ui.press({ key: 'filter:todo' })
  expect(await ui.find({ key: 'pick:ENG-1' })).toBeDefined()
  await ui.press({ key: 'filter:done' })
  expect(await ui.find({ key: 'pick:ENG-2' })).toBeDefined()
  expect(await ui.find({ key: 'quick:ENG-2' })).toBeUndefined()
  await ui.press({ key: 'filter:all' })

  await ui.press({ key: 'pick:ENG-1' })
  expect(await ui.find({ type: 'Text', text: /Add login page/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /3 pts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Auth/ })).toBeDefined()

  await ui.press({ key: 'start:ENG-1' })

  expect(gitCalls).toContainEqual([
    'git',
    'worktree',
    'add',
    '-b',
    'feature/eng-1-add-login-page',
    '/repo/.claude/worktrees/eng-1',
    'HEAD',
  ])
  expect(mcpCalls.some(c => c.tool === 'save_issue' && c.args.state === 'In Progress')).toBe(true)
  expect(mcpCalls.filter(c => c.tool === 'list_issues').every(c => c.args.limit === 50)).toBe(true)
  expect(mcpCalls.every(c => c.server === 'linear')).toBe(true)
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('EnterWorktree')
  expect(prompts[0]).toContain('/repo/.claude/worktrees/eng-1')
  expect(prompts[0]).toContain('Full description of the login page.')
  await ui.unmount()
})
