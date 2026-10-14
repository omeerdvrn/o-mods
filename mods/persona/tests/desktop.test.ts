import { expect, mock, test } from 'claude-code/testing'

const HINT = { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as const

test('desktop: the hint line draws the crab as SVG beside the role name', async ($, on) => {
  mock.store(on)
  mock.env(on, { CLAUDE_PERSONA: 'dev', HOME: '/u' })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'persona', surface: 'desktop', ...HINT } as never)
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Developer/ })).toBeDefined()
  await ui.unmount()
})

test('desktop: the role joins the footer mode labels, since the desktop shows no hint line', async ($, on) => {
  mock.store(on)
  mock.env(on, { CLAUDE_PERSONA: 'qa', HOME: '/u' })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, ((e.props as { modes?: string[] }).modes ?? []).join(' & ')) as never
  })
  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'persona', surface: 'desktop', component: 'SessionMode', props: { modes: ['focus'] } } as never)
  expect(await ui.find({ type: 'Text', text: 'focus & QA Engineer' })).toBeDefined()
  await ui.unmount()
})
