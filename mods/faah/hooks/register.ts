import type { EngineInterface, Register } from 'claude-code'

import { ASKING_NOTIFICATIONS, ASKING_TOOLS, bashEvent, CLIP_FILES, CLIPS, DEFAULT_EVENTS, DEFAULT_SOUNDS, EVENTS, isClip, parseEvents } from './events'
import type { Clip, FaahEvent } from './events'

/**
 * The clips come from Remotion's sound library (https://www.remotion.dev/docs/sfx), which collected them from
 * meme soundboards. They are not under a free license, so the mod does not ship them: each is fetched once into
 * your cache and played from there.
 */
const CLIP_URL = (clip: Clip) => `https://remotion.media/${CLIP_FILES[clip]}.wav`
/** One sound per mishap: the same event again within this plays once. */
const COOLDOWN_MS = 2500
const STORE = { on: 'on', events: 'events', sounds: 'sounds' }

let configured: FaahEvent[] = DEFAULT_EVENTS
let gain = 1
const lastPlayed = new Map<FaahEvent, number>()

type Sound = Clip | { file: string }

async function settings($: EngineInterface): Promise<{ on: boolean; events: FaahEvent[]; sounds: Partial<Record<FaahEvent, Sound>> }> {
  const stored = (await $.store.get(STORE.events)) as string[] | undefined
  return {
    on: (await $.store.get(STORE.on)) !== false,
    events: stored ? parseEvents(stored.join(',')) : configured,
    sounds: ((await $.store.get(STORE.sounds)) as Partial<Record<FaahEvent, Sound>> | undefined) ?? {},
  }
}

async function cacheFolder($: EngineInterface): Promise<string> {
  return `${await $.env.get('HOME')}/Library/Caches/faah`
}

/** Fetches a clip into the cache once; later sessions find it there. Resolves to its file, or null. */
async function fetchClip($: EngineInterface, clip: Clip): Promise<string | null> {
  const folder = await cacheFolder($)
  const file = `${folder}/${CLIP_FILES[clip]}.wav`
  if (await $.fs.exists(file)) return file
  const ran = await $.process.run(['sh', '-c', 'mkdir -p "$1" && curl -fsSL "$2" -o "$3.part" && mv "$3.part" "$3"', 'sh', folder, CLIP_URL(clip), file], { timeoutMs: 30_000 })
  return ran.exitCode === 0 ? file : null
}

/** Plays a sound: your own file, or a clip from the cache, else straight from its URL. */
async function play($: EngineInterface, sound: Sound) {
  const file = typeof sound === 'string' ? await fetchClip($, sound).catch(() => null) : sound.file
  if (file) {
    const ran = await $.process.run(['afplay', '-v', String(gain), file], { timeoutMs: 15_000 })
    if (ran.exitCode !== 0) throw new Error(ran.stderr.trim() || `afplay could not play ${file}`)
    return
  }
  if (typeof sound === 'string') await $.audio.play({ url: CLIP_URL(sound) }, { gain })
}

async function maybePlay($: EngineInterface, event: FaahEvent) {
  const now = await $.clock.now()
  const current = await settings($)
  if (!current.on || !current.events.includes(event) || now - (lastPlayed.get(event) ?? -Infinity) < COOLDOWN_MS) return
  lastPlayed.set(event, now)
  void play($, current.sounds[event] ?? DEFAULT_SOUNDS[event]).catch(() => undefined)
}

function outputText(result: unknown): string {
  const record = (result as { result?: unknown }).result ?? result
  if (typeof record === 'string') return record
  const { stdout, stderr } = (record ?? {}) as { stdout?: unknown; stderr?: unknown }
  return [stdout, stderr].filter(part => typeof part === 'string').join('\n')
}

function soundName(sound: Sound): string {
  return typeof sound === 'string' ? sound : sound.file
}

async function status($: EngineInterface): Promise<string> {
  const current = await settings($)
  const rows = (Object.keys(EVENTS) as FaahEvent[]).map(name => {
    const sound = soundName(current.sounds[name] ?? DEFAULT_SOUNDS[name])
    return `${current.events.includes(name) ? '●' : '○'} ${name.padEnd(15)}${sound.padEnd(11)}${EVENTS[name]}`
  })
  return [
    `Sounds are ${current.on ? 'on' : 'off'}.`,
    '',
    ...rows,
    '',
    `/faah test [event|clip] · /faah on|off · /faah add|remove <event> · /faah sound <event> <${CLIPS.join('|')}|file|default>`,
  ].join('\n')
}

export const register: Register = (on, options) => {
  const asked = options as { events?: string; volume?: string }
  if (typeof asked.events === 'string' && asked.events.trim() !== '') configured = parseEvents(asked.events)
  const volume = Number(asked.volume)
  if (Number.isFinite(volume) && volume >= 0 && volume <= 4) gain = volume

  on('session.start', async ($, e, next) => {
    // The clips are small: fetch any missing now, so the first one plays at once.
    for (const clip of CLIPS) void fetchClip($, clip).catch(() => undefined)
    // Not awaited: registering makes Claude Code re-describe every command, which would hold startup.
    void $.command.register({ name: 'faah', description: 'Meme sounds on events: FAAAH on failed tests, anime wow on passing ones, bruh when Claude asks you', argumentHint: '[test|on|off|add <event>|remove <event>|sound <event> <clip|file>]' }).catch(() => undefined)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A question or a plan to approve: the dialog opens as the call runs.
    if (ASKING_TOOLS.has(e.tool)) void maybePlay($, 'asking').catch(() => undefined)
    const result = await next(e)
    if ('deny' in result) {
      void maybePlay($, 'denied').catch(() => undefined)
      return result
    }
    if (e.tool === 'Bash') {
      const command = String((e as { command?: string }).command ?? '')
      const isError = 'isError' in result && result.isError === true
      const event = bashEvent(command, { isError, text: outputText(result) })
      if (event) void maybePlay($, event).catch(() => undefined)
    }
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // A dialog waiting on you: the engine raises this notification only once a permission prompt (or an MCP
  // server's question) is actually on screen, never for a call auto mode or a rule settled by itself.
  on('classic.Notification', async ($, e, next) => {
    if (ASKING_NOTIFICATIONS.has(e.notification_type)) void maybePlay($, 'asking').catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'error') void maybePlay($, 'turn-error').catch(() => undefined)
    if (e.reason === 'aborted') void maybePlay($, 'interrupted').catch(() => undefined)
    return result
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  on('command.run', { command: ['faah', 'faah:faah'] }, async ($, e) => {
    const [verb = '', first = '', ...rest] = e.args.trim().split(/\s+/)
    const current = await settings($)
    if (verb === 'test') {
      const sound: Sound = isClip(first) ? first : first in EVENTS ? (current.sounds[first as FaahEvent] ?? DEFAULT_SOUNDS[first as FaahEvent]) : 'faah'
      try {
        await play($, sound)
        return { text: `Played ${soundName(sound)}.` }
      } catch (error) {
        return { text: `Could not play it: ${(error as Error).message}` }
      }
    }
    if (verb === 'on' || verb === 'off') {
      await $.store.set(STORE.on, verb === 'on')
      return { text: `Sounds ${verb}.` }
    }
    if (verb === 'add' || verb === 'remove') {
      const picked = parseEvents([first, ...rest].join(' '))
      if (picked.length === 0) return { text: `Events: ${Object.keys(EVENTS).join(', ')}.` }
      const events = verb === 'add' ? [...new Set([...current.events, ...picked])] : current.events.filter(name => !picked.includes(name))
      await $.store.set(STORE.events, events)
      return { text: await status($) }
    }
    if (verb === 'sound') {
      if (!(first in EVENTS)) return { text: `usage: /faah sound <event> <${CLIPS.join('|')}|file|default>. Events: ${Object.keys(EVENTS).join(', ')}.` }
      const event = first as FaahEvent
      const choice = rest.join(' ').trim().replace(/^['"]|['"]$/g, '')
      const sounds = { ...current.sounds }
      if (choice === '' || choice === 'default') delete sounds[event]
      else if (isClip(choice)) sounds[event] = choice
      else {
        const file = choice.replace(/^~(?=\/)/, (await $.env.get('HOME')) ?? '~')
        if (!(await $.fs.exists(file))) return { text: `No file at ${file}.` }
        sounds[event] = { file }
      }
      await $.store.set(STORE.sounds, sounds)
      return { text: `${event} now plays ${soundName(sounds[event] ?? DEFAULT_SOUNDS[event])}. /faah test ${event} to hear it.` }
    }
    return { text: await status($) }
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)
}
