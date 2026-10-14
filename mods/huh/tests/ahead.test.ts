import { expect, mock, test } from 'claude-code/testing'

declare const setTimeout: (callback: () => void, ms: number) => unknown
const settle = () => new Promise<void>(resolve => setTimeout(() => resolve(), 30))

const LONG = ['## One', '', 'word '.repeat(400).trim(), '', '## Two', '', 'more '.repeat(400).trim()].join('\n')

test('a long answer is rewritten in parts at once, only when /huh asks, and only once', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('session.messages', async () => ({ value: [{ role: 'user', content: 'go' }, { role: 'assistant', content: [{ type: 'text', text: LONG }] }] }) as never)
  const asked: { model: string; system: string }[] = []
  on('model.complete', async (_$, e) => {
    asked.push({ model: e.model, system: String(e.system) })
    return { value: { isAnswered: true, text: String(e.system).startsWith('Summarize') ? '**In short:** done.' : '## Rewritten', usage: { input_tokens: 1, output_tokens: 1 } } } as never
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ turnId: 't1', answer: LONG, reason: 'answer', durationMs: 1, isAborted: false } as never)
  await settle()
  expect(asked.length).toBe(0)

  await $.command.run({ command: 'huh', args: '' } as never)
  await settle()
  expect(asked.length).toBe(3)
  expect(asked.every(one => one.model === 'haiku')).toBe(true)
  await $.command.run({ command: 'huh', args: '' } as never)
  await settle()
  expect(asked.length).toBe(3)
  const ui = await $.ui.mount({ plugin: 'huh', surface: 'terminal', component: 'Pane', requestId: 'huh', props: { title: 'Reader', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as never)
  expect(JSON.stringify(await ui.drawn())).toContain('Rewritten')
  await ui.unmount()
})
