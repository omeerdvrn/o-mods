import { expect, mock, test } from 'claude-code/testing'

import { blocks, sections, spans, titleOf } from '../hooks/markdown'

declare const setTimeout: (callback: () => void, ms: number) => unknown
const settle = () => new Promise<void>(resolve => setTimeout(() => resolve(), 30))

const ANSWER = ['## Results', '', 'Built **task-router** as a mod: `mods/task-router`.', '', '- one', '  - nested', '| A | B |', '| --- | --- |', '| x | y |', '', '```', 'code line', '```', '> a quote'].join('\n')
const READABLE = '**In short:** Built task-router; nothing for you to do.\n\n## What changed\n\n- New mod: `mods/task-router`'

test('Markdown becomes blocks and spans; the title comes from the first heading or sentence', async () => {
  expect(blocks(ANSWER).map(block => block.kind)).toEqual(['heading', 'paragraph', 'item', 'item', 'row', 'row', 'code', 'quote'])
  expect(spans('Built **it** with `x`')).toEqual([{ text: 'Built ' }, { text: 'it', bold: true }, { text: ' with ' }, { text: 'x', code: true }])
  expect(titleOf(ANSWER)).toBe('Results')
  const cut = sections(READABLE)
  expect(cut.summary).toBe('**In short:** Built task-router; nothing for you to do.')
  expect(cut.sections.map(section => section.heading?.text)).toEqual(['What changed'])
})

const PANE = { component: 'Pane', requestId: 'huh', props: { title: 'Reader', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const

test('/huh shows the original at once, then the readable version, with the original a click away', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('session.messages', async () => ({ value: [
    { role: 'user', content: 'explain' },
    { role: 'assistant', content: [{ type: 'text', text: ANSWER }] },
  ] }) as never)
  const asked: { model: string; prompt: string }[] = []
  let answerNow: (text: string) => void = () => undefined
  on('model.complete', async (_$, e) => {
    asked.push({ model: e.model, prompt: String(e.prompt) })
    const text = await new Promise<string>(resolve => (answerNow = resolve))
    return { value: { isAnswered: true, text, usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect(JSON.stringify(await $.command.run({ command: 'huh', args: '' } as never))).toContain('sidebar')
  await settle()
  expect(asked[0]?.prompt).toBe(ANSWER)

  // While the rewrite runs, the original is already readable in the sidebar.
  const waiting = await $.ui.mount({ plugin: 'huh', surface: 'terminal', ...PANE } as never)
  expect(await waiting.find({ type: 'Text', text: /Making it easier to read/ })).toBeDefined()
  expect((await waiting.find({ type: 'Markdown' }))?.props.text).toContain('code line')
  await waiting.unmount()

  answerNow(READABLE)
  await settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'huh', surface, ...PANE } as never)
    expect(await ui.find({ type: 'Text', text: 'What changed' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).not.toContain('code line')
    await ui.unmount()
  }
  const toggled = await $.ui.mount({ plugin: 'huh', surface: 'terminal', ...PANE } as never)
  await toggled.press({ key: 'toggle' })
  expect(JSON.stringify(await toggled.drawn())).toContain('code line')
  await toggled.unmount()

  // The page: terminal colors first, then a light page, then a dark one; /huh dark sets it directly.
  const paged = await $.ui.mount({ plugin: 'huh', surface: 'terminal', ...PANE } as never)
  expect((await paged.find({ type: 'Text', text: 'Results' }))?.props.backgroundColor).toBeUndefined()
  await paged.press({ key: 'page' })
  expect((await paged.find({ type: 'Text', text: 'Results' }))?.props.backgroundColor).toBe('#f6f6f3')
  await paged.press({ key: 'page' })
  expect((await paged.find({ type: 'Text', text: 'Results' }))?.props.backgroundColor).toBe('#17191e')
  await paged.unmount()
  expect(JSON.stringify(await $.command.run({ command: 'huh', args: 'light' } as never))).toContain('light')

  // The same answer again: the readable version comes back at once, no second request.
  await $.command.run({ command: 'huh', args: '' } as never)
  await settle()
  expect(asked).toHaveLength(1)
})

test('on a light or dark page, where pictures show, the answer is a typeset page in strips', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  mock.env(on, { TERM_PROGRAM: 'WezTerm' })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('session.messages', async () => ({ value: [{ role: 'assistant', content: [{ type: 'text', text: ANSWER }] }] }) as never)
  on('model.complete', async () => ({ value: { isAnswered: true, text: READABLE, usage: { input_tokens: 1, output_tokens: 1 } } }) as never)
  const typeset: string[] = []
  on('process.run', async (_$, e) => {
    typeset.push(JSON.parse(e.init?.stdin ?? '{}').page)
    const stdout = JSON.stringify({ strips: ['/cache/strip-1.png', '/cache/strip-2.png'], heights: [1400, 700], width: 1120, problem: null })
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'huh', args: 'light' } as never)
  await $.command.run({ command: 'huh', args: '' } as never)
  await settle()
  expect(typeset).toContain('light')

  const ui = await $.ui.mount({ plugin: 'huh', surface: 'terminal', ...PANE } as never)
  const strips = (JSON.stringify(await ui.drawn()).match(/strip-\d\.png/g) ?? []).length
  expect(strips).toBe(2)
  await ui.unmount()
  // The desktop app shows no pictures: the text view.
  const desktop = await $.ui.mount({ plugin: 'huh', surface: 'desktop', ...PANE } as never)
  expect(JSON.stringify(await desktop.drawn())).not.toContain('strip-1.png')
  await desktop.unmount()
})
