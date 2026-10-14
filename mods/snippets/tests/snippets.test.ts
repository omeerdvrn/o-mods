import { expect, mock, test } from 'claude-code/testing'

import { DEFAULT_SNIPPETS, expandAll, expandAtCursor, paint, secretsIn, suggestions } from '../hooks/draft'

const ISSUES = [
  { id: 'ENG-3399', title: 'Add dark mode to settings', status: 'In Progress' },
  { id: 'ENG-3410', title: 'Export invoices as CSV', status: 'Todo' },
  { id: 'OPS-12', title: 'Rotate keys', status: 'Backlog' },
]

test('snippets expand after a space, and on send', async () => {
  expect(expandAtCursor('please ;;mmi ', 13, DEFAULT_SNIPPETS)).toEqual({
    text: 'please Merge origin main into this branch and resolve conflicts. ',
    cursor: 'please Merge origin main into this branch and resolve conflicts. '.length,
  })
  expect(expandAtCursor(';;nope ', 7, DEFAULT_SNIPPETS)).toBeNull()
  expect(expandAll('do ;;tldr', DEFAULT_SNIPPETS)).toBe('do Summarize your last answer in three bullet points.')
})

test('the typeahead offers tickets for an id being typed, and snippets after ;;', async () => {
  expect(suggestions('ENG-', ISSUES, DEFAULT_SNIPPETS).map(row => row.text)).toEqual(['ENG-3399', 'ENG-3410'])
  expect(suggestions('eng-34', ISSUES, DEFAULT_SNIPPETS).map(row => row.text)).toEqual(['ENG-3410'])
  expect(suggestions(';;m', ISSUES, DEFAULT_SNIPPETS)[0]).toMatchObject({ label: ';;mmi', text: DEFAULT_SNIPPETS.mmi })
  expect(suggestions('hello', ISSUES, DEFAULT_SNIPPETS)).toEqual([])
})

test('the draft is painted: known tickets, paths, mentions, snippets, secrets', async () => {
  const text = 'fix ENG-3399 and ABC-1 in src/api/client.ts with @docs/x.md ;;plan key sk-ant-abcdefghijklmnopqrstuvwxyz123'
  const runs = paint(text, new Set(['ENG-3399']), DEFAULT_SNIPPETS)
  const at = (word: string) => runs.find(run => text.slice(run.start, run.end) === word)
  expect(at('ENG-3399')).toMatchObject({ bold: true, color: '#5fb3ff' })
  expect(at('ABC-1')?.bold).toBeUndefined()
  expect(at('src/api/client.ts')).toBeDefined()
  expect(at('@docs/x.md')).toBeDefined()
  expect(at(';;plan')).toMatchObject({ bold: true })
  expect(secretsIn(text)).toHaveLength(1)
  expect(secretsIn('password = hunter22')).toHaveLength(1)
  expect(secretsIn('the password is in the vault')).toHaveLength(0)
})

test('hooks: tickets come from Linear, edits expand and paint, sends expand, /snippets edits the list', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('mcp.call', async (_$, e) => {
    if (e.server === 'claude.ai Linear') return { deny: 'no connected MCP tool "list_issues" on a server named "claude.ai Linear"' } as never
    const body = e.args.state === 'started' ? { issues: [ISSUES[0]] } : { issues: [] }
    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }], isError: false } }
  })
  on('prompt.edit', async (_$, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }) as never)
  on('prompt.autocomplete', async () => ({ suggestions: [] }) as never)
  const sent: string[] = []
  on('prompt.submit', async (_$, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await new Promise<void>(resolve => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(resolve, 30))

  const rows = await $.prompt.autocomplete({ text: 'ENG-', cursor: 4, token: 'ENG-', start: 0 } as never)
  expect(rows.suggestions[0]?.text).toBe('ENG-3399')

  const typed = await $.prompt.edit({ origin: { kind: 'composer' }, text: ';;mmi', cursor: 5, start: 5, end: 5, inputText: ' ' } as never)
  expect(typed.text).toBe(`${DEFAULT_SNIPPETS.mmi} `)
  const painted = await $.prompt.edit({ origin: { kind: 'composer' }, text: 'look at ENG-339', cursor: 15, start: 15, end: 15, inputText: '9' } as never)
  expect(painted.decorations?.some(run => run.bold && run.start === 8)).toBe(true)

  await $.prompt.submit({ text: 'then ;;tests' } as never)
  expect(sent.at(-1)).toBe(`then ${DEFAULT_SNIPPETS.tests}`)

  expect(JSON.stringify(await $.command.run({ command: 'snippets', args: 'add hi Say hi to the team.' } as never))).toContain(';;hi')
  await $.prompt.submit({ text: ';;hi' } as never)
  expect(sent.at(-1)).toBe('Say hi to the team.')
  expect(JSON.stringify(await $.command.run({ command: 'snippets', args: '' } as never))).toContain(';;mmi')
})

test('a pasted image shows as a small preview above the input until it is sent', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  mock.env(on, { TERM_PROGRAM: 'WezTerm', HOME: '/Users/me' })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.id', async () => ({ value: 'abc' }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('prompt.read', async () => ({ value: { text: '', cursor: 0 } }) as never)
  on('mcp.call', async () => ({ value: { content: [{ type: 'text', text: '{"issues":[]}' }], isError: false } }))
  const saved: string[][] = []
  on('process.run', async (_$, e) => {
    saved.push([...e.argv])
    return { value: { exitCode: 0, stdout: '360 200\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.edit', async (_$, e) => ({ text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }) as never)
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('ui.render', async ($, e) => h($.ui.resolve(e).Text, {}, 'engine') as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.prompt.edit({ origin: { kind: 'composer' }, text: 'look at ', cursor: 8, start: 8, end: 8, inputText: '[Image #1]' } as never)
  await new Promise<void>(resolve => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(resolve, 40))
  expect(saved.some(argv => argv[1]!.endsWith('clip-image.sh') && argv[2] === '/Users/me/Library/Caches/snippets/pasted/abc-1.png' && argv[3] === '360')).toBe(true)

  const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } } as const
  const ui = await $.ui.mount({ plugin: 'snippets', surface: 'terminal', ...BAND } as never)
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '#1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui.unmount()

  await $.prompt.submit({ text: 'look at [Image #1]' } as never)
  const after = await $.ui.mount({ plugin: 'snippets', surface: 'terminal', ...BAND } as never)
  expect(await after.find({ type: 'Image' })).toBeUndefined()
  await after.unmount()
})
