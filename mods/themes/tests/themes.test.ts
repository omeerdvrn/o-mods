import { expect, mock, test } from 'claude-code/testing'

import { ROTATION, findTheme } from '../hooks/themes'

declare const setTimeout: (callback: () => void, ms: number) => unknown

/** Stand-ins for the theme setting and the apply script, as the engine and the script keep them. */
function machine(on: Parameters<Parameters<typeof test>[1]>[1], initial: string) {
  const state = { setting: initial, file: null as string | null, runs: [] as string[][] }
  on('config.list', async () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: state.setting, provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] }) as never)
  on('process.run', async (_$, e) => {
    const [verb, value] = e.argv.slice(2)
    state.runs.push([verb!, value!])
    if (verb === 'use') {
      state.file = value!
      state.setting = 'custom:themes'
    } else if (verb === 'restore') state.setting = value!
    return { value: { exitCode: 0, stdout: 'wrote theme\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return state
}

test('names find themes loosely; light themes sit out the rotation', async () => {
  expect(findTheme('mocha')).toBe('catppuccin-mocha')
  expect(findTheme('Tokyo Night')).toBe('tokyo-night')
  expect(findTheme('rosepine')).toBe('rose-pine')
  expect(findTheme('catppuccin')).toBeUndefined()
  expect(ROTATION).not.toContain('catppuccin-latte')
})

test('each new session takes the next theme, and takes it back when you type there', async ($, on) => {
  // The store every session shares, kept here so the test can play another session writing to it.
  const shared = new Map<string, unknown>()
  on('store.get', async (_$, e) => ({ value: shared.get(e.key) }) as never)
  on('store.set', async (_$, e) => {
    shared.set(e.key, e.value)
    return { value: undefined } as never
  })
  mock.clock(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  const machineState = machine(on, 'dark')

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(machineState.file).toBe(ROTATION[0])
  expect(machineState.setting).toBe('custom:themes')

  // Another session wrote its own theme meanwhile; typing here brings this one's back.
  shared.set('applied', ROTATION[1])
  machineState.file = ROTATION[1]!
  await $.prompt.submit({ text: 'hi' } as never)
  expect(machineState.file).toBe(ROTATION[0])

  expect(JSON.stringify(await $.command.run({ command: 'themes', args: 'nord' } as never))).toContain('Nord')
  expect(machineState.file).toBe('nord')
  expect(JSON.stringify(await $.command.run({ command: 'themes', args: '' } as never))).toContain('● nord')

  // Off puts back the theme the person had before the switcher.
  await $.command.run({ command: 'themes', args: 'off' } as never)
  expect(machineState.setting).toBe('dark')
})
