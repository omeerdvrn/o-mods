import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Burst, FireStyle, Heat } from '../types'
import { encodeCells, fireConfig, fireRows, fireSvg, frame, particles } from './fire'
import { flameDuration, flameFrame, flameSvg } from './flame'
import { COLD, heatNow, promptBump, tierOf, toolBump } from './heat'

const FRAME_MS = 33
const CLOCK_MS = 30_000
const STORE_KEY = 'isOn'
const FIRE_KEY = 'fire'
const STYLE_KEY = 'style'

/** `flame`: the solid fire (flame.ts). `classic`: the original v1 particle burst (fire.ts), kept as it was. */
type Style = FireStyle

const heat = atom({ plugin: 'heat', key: 'heat' } as const, { heat: 0, at: 0 } as Heat)
const burst = atom({ plugin: 'heat', key: 'burst' } as const, null as Burst | null)
const style = atom({ plugin: 'heat', key: 'style' } as const, 'flame' as Style)
const isOn = atom({ plugin: 'heat', key: 'isOn' } as const, true)
const now = atom({ plugin: 'heat', key: 'now' } as const, 0)

// The band's instance and size, as its last drawing laid it out; the animation repaints that Raster.
let band: { requestId: string; columns: number; rows: number } | null = null
let animation: { cancel: () => void } | null = null

async function reset($: EngineInterface) {
  const clock = await $.clock.now()
  await update($, heat, () => ({ heat: 0, at: clock }))
  await update($, now, () => clock)
}

/** Lights the burst for the current heat and repaints it every frame until it burns out. */
/** How long a burst of `kind` lasts at this heat; null when it is too cold to light. */
function durationOf(kind: Style, level: number): number | null {
  const config = fireConfig(level)
  if (config === null) return null
  return kind === 'flame' ? flameDuration(level) : config.durationMs
}

async function ignite($: EngineInterface, level: number) {
  const kind = await read($, style)
  const duration = durationOf(kind, level)
  if (duration === null) return
  animation?.cancel()
  const startedAt = await $.clock.now()
  const seed = Math.floor(Math.random() * 0xffffffff)
  await update($, burst, () => ({ heat: level, startedAt, seed, style: kind }))

  const timer = $.clock.every(FRAME_MS, () => void paint($, startedAt, seed, level, kind))
  animation = timer
  $.clock.after(duration + FRAME_MS * 2, () => void burnOut($, timer, startedAt, duration))
}

const swarms = new Map<number, { columns: number; list: ReturnType<typeof particles> }>()

function swarmFor(seed: number, level: number, columns: number) {
  const known = swarms.get(seed)
  if (known && known.columns === columns) return known.list
  const config = fireConfig(level)
  const list = config === null ? [] : particles(config, columns, seed)
  swarms.clear()
  swarms.set(seed, { columns, list })
  return list
}

/** Stops the animation and clears the band once the burst's time has passed. */
async function burnOut($: EngineInterface, timer: { cancel: () => void }, startedAt: number, durationMs: number) {
  if ((await $.clock.now()) - startedAt < durationMs) return
  timer.cancel()
  if (animation === timer) animation = null
  await update($, burst, current => (current?.startedAt === startedAt ? null : current))
}

/** The burst's cells at `elapsed`, in its style. */
function cellsAt(kind: Style, seed: number, level: number, elapsed: number, columns: number, rows: number): string {
  if (kind === 'flame') return encodeCells(flameFrame(seed, level, elapsed, columns, rows))
  return encodeCells(frame(fireConfig(level)!, swarmFor(seed, level, columns), elapsed, columns, rows))
}

async function paint($: EngineInterface, startedAt: number, seed: number, level: number, kind: Style) {
  if (band === null || fireConfig(level) === null) return
  const elapsed = (await $.clock.now()) - startedAt
  const { requestId, columns, rows } = band
  const cells = cellsAt(kind, seed, level, elapsed, columns, rows)
  await $.ui.blit({ requestId, key: FIRE_KEY, columns, rows, cells }).catch(() => undefined)
}

async function status($: EngineInterface) {
  const clock = await $.clock.now()
  const level = heatNow(await read($, heat), clock)
  const on = await read($, isOn)
  const kind = await read($, style)
  return [`tracking: ${on ? 'on' : 'off'}`, `heat: ${level}°`, `tier: ${tierOf(level).label}`, `style: ${kind}`].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command (~0.7 s), which would hold startup.
    // Typed as /heat in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'heat',
      description: 'Heat tracker: status, reset, on, off, style',
      argumentHint: '[status|reset|on|off|style flame|classic]',
    }).catch(() => undefined)
    const stored = await $.store.get(STORE_KEY)
    await update($, isOn, () => stored !== false)
    const storedStyle = await $.store.get(STYLE_KEY)
    if (storedStyle === 'flame' || storedStyle === 'classic') await update($, style, () => storedStyle)
    // Every session starts ice cold.
    await reset($)
    $.clock.every(CLOCK_MS, () => {
      void $.clock.now().then(clock => update($, now, () => clock))
    })

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    await reset($)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (await read($, isOn)) {
      const clock = await $.clock.now()
      const bumped = promptBump(await read($, heat), e.text.length, clock)
      await update($, heat, () => bumped)
      await update($, now, () => clock)
      if (bumped.heat >= COLD) void ignite($, bumped.heat)
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (await read($, isOn)) {
      const isError = 'deny' in result || ('isError' in result && result.isError === true)
      const clock = await $.clock.now()
      await update($, heat, state => toolBump(state, isError, clock))
      await update($, now, () => clock)
    }

    return result
  })

  on('command.run', { command: ['heat', 'heat:heat'] }, async ($, e) => {
    const verb = e.args.trim() || 'status'
    if (verb === 'reset') {
      await reset($)
      return { text: 'Heat reset to 0°.' }
    }
    if (verb === 'on' || verb === 'off') {
      await $.store.set(STORE_KEY, verb === 'on')
      await update($, isOn, () => verb === 'on')
      return { text: `heat is ${verb}.` }
    }
    if (verb === 'status') return { text: await status($) }
    // `/heat style` flips between the two; `/heat style flame|classic` picks one. The choice is kept.
    const [word, asked] = verb.split(/\s+/)
    if (word === 'style') {
      const current = await read($, style)
      const chosen: Style = asked === 'flame' || asked === 'classic' ? asked : current === 'flame' ? 'classic' : 'flame'
      await $.store.set(STYLE_KEY, chosen)
      await update($, style, () => chosen)
      return { text: chosen === 'flame' ? 'Fire style: flame.' : 'Fire style: classic (the original particle burst).' }
    }

    return { text: 'usage: /heat [status|reset|on|off|style flame|classic]' }
  })

  // The tier rides in the footer's mode labels, where other footers (usage-bar) already draw them.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const level = heatNow(await read($, heat), (await read($, now)) || Date.now())
    const label = `${tierOf(level).label} ${level}°`

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })

  // The fire: a burst of cells rising in the band above the prompt while it burns.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const lit = await read($, burst)
    if (lit === null || e.props.hasSurvey) return next(e)
    const config = fireConfig(lit.heat)
    const duration = durationOf(lit.style, lit.heat)
    if (config === null || duration === null) return next(e)
    // The desktop app draws vectors: the same burst as an animated SVG, played by the surface itself.
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      const elapsed = Math.max(0, (await $.clock.now()) - lit.startedAt)
      if (elapsed >= duration) return next(e)
      const width = Math.max(10, e.props.bodyColumns)
      const rows = fireRows(lit.heat, e.props.maxRows)
      const source = lit.style === 'flame' ? flameSvg(lit.heat, lit.seed, width, rows * 2) : fireSvg(config, lit.seed, width, rows * 2)
      return (
        <Svg
          key={`fire-${lit.seed}`}
          source={source}
          height={rows * 18}
          alt="fire"
          isInteractive
        />
      )
    }
    // Raster, a grid of colored cells, is the terminal's alone.
    if (e.surface !== 'terminal') return next(e)
    const { Raster } = $.ui.resolve(e)

    const columns = Math.max(10, e.props.bodyColumns)
    const rows = fireRows(lit.heat, e.props.maxRows)
    band = { requestId: e.requestId, columns, rows }
    const elapsed = Math.max(0, (await $.clock.now()) - lit.startedAt)
    if (elapsed >= duration) return next(e)
    const cells = cellsAt(lit.style, lit.seed, lit.heat, elapsed, columns, rows)

    return <Raster key={FIRE_KEY} columns={columns} rows={rows} cells={cells} />
  })
}
