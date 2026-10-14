import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80 },
} as const

test('desktop: a hot prompt draws the burst as an SVG in the band', async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 12, 0) })
  mock.store(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  for (const text of ['a long enough prompt to count for length', 'another long enough prompt here', 'and a third long enough prompt']) {
    await $.prompt.submit({ text } as never)
  }
  const band = await $.ui.mount({ plugin: 'heat', surface: 'desktop', ...BAND } as never)
  expect(await band.find({ type: 'Svg' })).toBeDefined()
  await band.unmount()
})
