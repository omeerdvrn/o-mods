import { expect, mock, test } from 'claude-code/testing'

import { Canvas, NO_ACTIVITY, toCells } from '../hooks/engine'
import { SCENES, composeFrame, desktopSvg, findScene, pickScene } from '../hooks/scenes'
import { weatherOf } from '../hooks/scenes/weather'

declare const setTimeout: (callback: () => void, ms: number) => unknown
const settle = (ms = 20) => new Promise<void>(resolve => setTimeout(() => resolve(), ms))

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 120 } } as const

test('every scene draws at any size, moves, and loops back to its start', async () => {
  const act = { ...NO_ACTIVITY, elapsedMs: 20_000, toolCalls: 3, usagePercent: 50, now: 1 }
  for (const scene of SCENES) {
    for (const [width, height] of [[40, 20], [200, 20], [120, 8]] as const) {
      const canvas = composeFrame(scene, width, height, 0.3, act, true)
      expect(canvas.colors).toHaveLength(width * height)
    }
    const start = composeFrame(scene, 120, 20, 0, act, false).colors
    expect(Array.from(composeFrame(scene, 120, 20, 0.4, act, false).colors)).not.toEqual(Array.from(start))
    // A whole loop later it is back where it started (bar a pixel or two of rounding).
    const end = composeFrame(scene, 120, 20, 1, act, false).colors
    expect(end.filter((color, index) => color !== start[index]).length).toBeLessThan(start.length * 0.05)
  }
})

test('half-block cells, a desktop SVG under the limit, and the pickers', async () => {
  const canvas = new Canvas(10, 4, 0xff0000)
  canvas.put(0, 1, 0x00ff00)
  const cells = toCells(canvas)
  expect(cells).toHaveLength(10 * 2 * 3)
  expect([cells[0], cells[1], cells[2]]).toEqual([0x2580, 0xff0000, 0x00ff00])
  for (const scene of SCENES) expect(desktopSvg(scene, 120, 20, { ...NO_ACTIVITY, usagePercent: 95 }, true).length).toBeLessThan(131_072)
  expect(findScene('lofi')?.id).toBe('lofi-room')
  expect(findScene('Night drive')?.id).toBe('night-drive')
  expect(pickScene({ ...NO_ACTIVITY }, null, 0.99).id).not.toBe('weather')
  expect(pickScene({ ...NO_ACTIVITY }, 'night-drive', 0).id).not.toBe('night-drive')
  expect([weatherOf(10), weatherOf(55), weatherOf(80), weatherOf(95)]).toEqual(['clear', 'cloudy', 'rain', 'storm'])
})

test('a turn brings a scene up, tool calls and tests show in it, and it goes once the turn is done', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 13, 12) })
  mock.store(on)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', async () => ({ value: { rateLimits: [{ kind: 'five_hour', percentUsed: 30 }], context: {}, cost: null } }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('turn.start', async () => ({ turnId: 't1' }) as never)
  on('turn.complete', async () => ({ text: 'done' }) as never)
  on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  on('ui.blit', async () => ({ value: undefined }) as never)
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const idle = await $.ui.mount({ plugin: 'scenes', surface: 'terminal', ...BAND } as never)
  expect(await idle.find({ type: 'Raster' })).toBeUndefined()
  await idle.unmount()

  expect(JSON.stringify(await $.command.run({ command: 'scenes', args: 'fish' } as never))).toContain('Fish tank')
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const working = await $.ui.mount({ plugin: 'scenes', surface: 'terminal', ...BAND } as never)
  expect(await working.find({ type: 'Raster' })).toBeDefined()
  expect(await working.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await working.unmount()
  const desktop = await $.ui.mount({ plugin: 'scenes', surface: 'desktop', ...BAND } as never)
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  await desktop.unmount()

  // The scene lingers a moment after the turn (food, a heart), then goes.
  await $.turn.complete({ reason: 'end_turn', text: 'done', answer: 'done', turnId: 't1' } as never)
  const lingering = await $.ui.mount({ plugin: 'scenes', surface: 'terminal', ...BAND } as never)
  expect(await lingering.find({ type: 'Raster' })).toBeDefined()
  await lingering.unmount()
  await clock.advance(2000)
  await settle(50)
  const after = await $.ui.mount({ plugin: 'scenes', surface: 'terminal', ...BAND } as never)
  expect(await after.find({ type: 'Raster' })).toBeUndefined()
  await after.unmount()

  expect(JSON.stringify(await $.command.run({ command: 'scenes', args: '' } as never))).toContain('Pinned to Fish tank')
  await $.command.run({ command: 'scenes', args: 'off' } as never)
  await $.turn.start({ text: 'again', turnId: 't2' } as never)
  const off = await $.ui.mount({ plugin: 'scenes', surface: 'terminal', ...BAND } as never)
  expect(await off.find({ type: 'Raster' })).toBeUndefined()
  await off.unmount()
})
