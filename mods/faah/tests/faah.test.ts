import { expect, mock, test } from 'claude-code/testing'

import { bashEvent, parseEvents } from '../hooks/events'

declare const setTimeout: (callback: () => void, ms: number) => unknown
const settle = () => new Promise<void>(resolve => setTimeout(() => resolve(), 20))
const CACHE = '/home/me/Library/Caches/faah'

test('which event a finished command is', async () => {
  expect(bashEvent('npm test', { isError: true, text: '' })).toBe('tests-failed')
  expect(bashEvent('npm test', { isError: false, text: 'Tests: 12 passed' })).toBe('tests-passed')
  expect(bashEvent('pytest -q | tail -3', { isError: false, text: '2 failed, 40 passed' })).toBe('tests-failed')
  expect(bashEvent('claude plugin test .', { isError: false, text: ' 4 pass\n 0 fail' })).toBe('tests-passed')
  expect(bashEvent('npm run build', { isError: true, text: '' })).toBe('build-failed')
  expect(bashEvent('git push origin main', { isError: true, text: 'rejected' })).toBe('push-rejected')
  expect(bashEvent('ls nope', { isError: true, text: '' })).toBe('command-failed')
  expect(bashEvent('ls', { isError: false, text: '' })).toBeNull()
  expect(parseEvents('tests-failed, asking nonsense')).toEqual(['tests-failed', 'asking'])
})

test('FAAAH on failed tests, anime wow on passing ones, bruh when Claude asks; /faah changes it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('env.get', async () => ({ value: '/home/me' }) as never)
  on('fs.exists', async () => ({ value: true }) as never)
  const played: string[] = []
  on('process.run', async (_$, e) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'afplay') played.push(argv[argv.length - 1]!.replace(`${CACHE}/`, ''))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  let failing = true
  on('tool.call', async () => ({ result: { stdout: failing ? '' : 'ok', stderr: '', interrupted: false }, isError: failing }) as never)
  on('tool.check', async () => ({ decision: 'ask' }) as never)
  on('classic.Notification', async () => ({}) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await settle()
  expect(played).toEqual(['fah.wav'])
  // The same mishap again right after plays once.
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await settle()
  expect(played).toEqual(['fah.wav'])

  failing = false
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await settle()
  expect(played).toEqual(['fah.wav', 'anime-wow.wav'])

  // An "ask" verdict alone (auto mode may settle it) and the idle reminder stay quiet.
  await clock.advance(5000)
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu1' } as never)
  await $.classic.Notification({ message: 'Claude is waiting for your input', notification_type: 'idle_prompt' } as never)
  await settle()
  expect(played).toHaveLength(2)
  // A permission dialog on screen, and a question put to you.
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
  await settle()
  expect(played.at(-1)).toBe('bruh.wav')
  await clock.advance(5000)
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  await settle()
  expect(played.filter(clip => clip === 'bruh.wav')).toHaveLength(2)

  // Other failures stay quiet until added; any event can take any clip.
  await clock.advance(5000)
  failing = true
  await $.tool.call({ tool: 'Bash', command: 'ls missing' } as never)
  await settle()
  expect(played).toHaveLength(4)
  await $.command.run({ command: 'faah', args: 'add command-failed' } as never)
  expect(JSON.stringify(await $.command.run({ command: 'faah', args: 'sound command-failed bruh' } as never))).toContain('now plays bruh')
  await $.tool.call({ tool: 'Bash', command: 'ls missing' } as never)
  await settle()
  expect(played.at(-1)).toBe('bruh.wav')
  expect(played).toHaveLength(5)

  // Off is off.
  await clock.advance(5000)
  await $.command.run({ command: 'faah', args: 'off' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  await settle()
  expect(played).toHaveLength(5)
})
