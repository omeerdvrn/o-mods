import { expect, mock, test } from 'claude-code/testing'

import { encodeCells, fireConfig, fireRows, fireSvg, frame, particles } from '../hooks/fire'
import { flameDuration, flameFrame, flameSvg } from '../hooks/flame'
import { heatNow, promptBump, tierOf, toolBump } from '../hooks/heat'

const T0 = Date.UTC(2026, 9, 8, 12, 0)

test('heat bumps, decays and tiers the way the shell version did', async () => {
  const cold = { heat: 0, at: T0 }
  // A 60-character prompt two minutes after the last: base 2 + length 4 + no pace bonus.
  expect(promptBump(cold, 60, T0 + 120_000).heat).toBe(6)
  // The same prompt five seconds later adds the rapid-fire bonus.
  expect(promptBump({ heat: 6, at: T0 }, 60, T0 + 5_000).heat).toBe(18)
  // One point lost per 30 idle seconds.
  expect(heatNow({ heat: 50, at: T0 }, T0 + 95_000)).toBe(47)
  expect(toolBump({ heat: 10, at: T0 }, false, T0).heat).toBe(11)
  expect(toolBump({ heat: 2, at: T0 }, true, T0).heat).toBe(0)
  expect(promptBump({ heat: 99, at: T0 }, 5000, T0 + 1_000).heat).toBe(100)
  expect(tierOf(90).label).toContain('ON FIRE!')
  expect(tierOf(10).label).toBe('ice cold')
})

test('no fire below 15; hotter fire is bigger, taller and longer', async () => {
  expect(fireConfig(14)).toBeNull()
  const ember = fireConfig(15)!
  const blaze = fireConfig(100)!
  expect(ember.count).toBe(60)
  expect(blaze.count).toBe(900)
  expect(blaze.durationMs).toBe(1300)
  expect(fireRows(100, 30)).toBeGreaterThan(fireRows(20, 30))
  expect(fireRows(100, 6)).toBe(6)
})

test('a frame draws flame glyphs in the band and encodes as Raster cells', async () => {
  const config = fireConfig(90)!
  const swarm = particles(config, 60, 42)
  const words = frame(config, swarm, 400, 60, 10)
  expect(words.length).toBe(60 * 10 * 3)
  const glyphs = new Set<number>()
  for (let index = 0; index < words.length; index += 3) glyphs.add(words[index]!)
  expect(glyphs.size).toBeGreaterThan(2)
  // The same seed replays the same burst.
  expect(encodeCells(frame(config, particles(config, 60, 42), 400, 60, 10))).toBe(encodeCells(words))
  // One orange block: the encoding RasterProps documents.
  expect(encodeCells(Uint32Array.of(0x2588, 0xff8800, 0x01000000))).toBe('iCUAAACI/wAAAAAB')
})

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80 },
} as const

test('prompts heat the session; /heat reports it; desktop keeps its own band', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  // The engine's own drawing, for the sites the mod passes on.
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine') as never
  })
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Rapid prompts: each one adds base, length and pace bonuses, past the fire threshold.
  for (const text of ['make the login page', 'now add the tests for it', 'and fix the lint errors please']) {
    clock.advance(2_000)
    await $.prompt.submit({ text } as never)
  }

  const desktop = await $.ui.mount({ plugin: 'heat', surface: 'desktop', ...BAND } as never)
  expect(await desktop.find({ type: 'Raster' })).toBeUndefined()
  await desktop.unmount()

  const status = await $.command.run({ command: 'heat', args: 'status' } as never)
  expect(JSON.stringify(status)).toContain('heat: 30°')
  expect(JSON.stringify(status)).toContain('lukewarm')
  await $.command.run({ command: 'heat', args: 'reset' } as never)
  expect(JSON.stringify(await $.command.run({ command: 'heat', args: 'status' } as never))).toContain('heat: 0°')
})

test('on the desktop the burst is an animated SVG, light enough at full heat', async () => {
  const config = fireConfig(100)!
  const svg = fireSvg(config, 7, 120, 28)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('<animate attributeName="y"')
  expect(svg).toContain('#ffffdc')
  // Svg sources are capped at 131072 characters.
  expect(svg.length).toBeLessThan(131_072)
  expect(fireSvg(config, 7, 120, 28)).toBe(svg)
  // Every heat stays under the cap, mid heat (more particles kept) included.
  for (const heat of [15, 30, 50, 70, 85, 100]) expect(fireSvg(fireConfig(heat)!, 3, 200, 28).length).toBeLessThan(131_072)
})

test('flame style: a solid half-block fire that builds, burns and dies down', async () => {
  const columns = 60
  const rows = 10
  const glyphsAt = (elapsed: number) => {
    const words = flameFrame(9, 90, elapsed, columns, rows)
    let lit = 0
    for (let index = 0; index < words.length; index += 3) if (words[index] !== 0x20) lit++
    return { words, lit }
  }
  const roaring = glyphsAt(flameDuration(90) * 0.4)
  expect(roaring.lit).toBeGreaterThan(columns * rows * 0.2)
  for (let index = 0; index < roaring.words.length; index += 3) {
    expect([0x20, 0x2580, 0x2584]).toContain(roaring.words[index])
  }
  // The same seed replays the same fire, even when asked out of order.
  expect(encodeCells(glyphsAt(flameDuration(90) * 0.4).words)).toBe(encodeCells(roaring.words))
  // Starved of its source, it is out by the end.
  expect(glyphsAt(flameDuration(90)).lit).toBeLessThan(columns)
  expect(flameDuration(100)).toBeGreaterThan(flameDuration(15))
})

test('flame style on the desktop: tongues, glow and sparks, under the size cap', async () => {
  const svg = flameSvg(100, 7, 200, 28)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('feGaussianBlur')
  expect(svg).toContain('<circle')
  expect(svg.length).toBeLessThan(131_072)
  expect(flameSvg(100, 7, 200, 28)).toBe(svg)
})

test('/heat style switches between flame and classic and keeps the choice', async ($, on) => {
  mock.clock(on, { now: T0 })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  const store = mock.store(on)
  on('command.register', async () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(await $.command.run({ command: 'heat', args: 'status' } as never))).toContain('style: flame')
  expect(JSON.stringify(await $.command.run({ command: 'heat', args: 'style classic' } as never))).toContain('classic')
  expect(JSON.stringify(await $.command.run({ command: 'heat', args: 'status' } as never))).toContain('style: classic')
  expect(JSON.stringify(await $.command.run({ command: 'heat', args: 'style' } as never))).toContain('flame')
  void store
})
