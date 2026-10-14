import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ROTATION, THEMES, findTheme, nameOf } from './themes'
import type { Slug } from './themes'

/** `rotate`: each new session takes the next theme. `pinned`: every session takes one. `off`: hands off. */
type Mode = 'rotate' | 'pinned' | 'off'

const MODE_KEY = 'mode'
const PINNED_KEY = 'pinned'
const NEXT_KEY = 'next'
/** The theme setting from before the switcher first changed it, put back by /themes off. */
const ORIGINAL_KEY = 'original'
/** The theme now in ~/.claude/themes/themes.json, shared by every session. */
const APPLIED_KEY = 'applied'
/** The theme setting that names the switcher's theme file. */
const SETTING = 'custom:themes'

const current = atom({ plugin: 'themes', key: 'current' } as const, null as string | null)

async function modeOf($: EngineInterface): Promise<Mode> {
  const mode = await $.store.get(MODE_KEY)
  return mode === 'pinned' || mode === 'off' ? mode : 'rotate'
}

async function themeSetting($: EngineInterface): Promise<string | undefined> {
  const row = (await $.config.list()).find(one => one.key === 'theme')
  return typeof row?.value === 'string' ? row.value : undefined
}

function scriptOf($: EngineInterface): string {
  return `${$.plugin.root.replace(/\/\.claude-plugin\/?$/, '')}/scripts/apply.py`
}

/**
 * Makes `slug` the theme. Claude Code's config API takes only its built-in themes, so the theme goes the way
 * custom themes do: one file in ~/.claude/themes that the switcher rewrites (Claude Code reloads it live),
 * and the theme setting pointed at it once. Remembers the person's own theme the first time.
 * Returns why it failed, or undefined.
 */
async function apply($: EngineInterface, slug: string): Promise<string | undefined> {
  if ((await $.store.get(APPLIED_KEY)) === slug && (await themeSetting($)) === SETTING) return undefined
  const before = await themeSetting($)
  if (before !== undefined && !before.startsWith('custom:themes') && (await $.store.get(ORIGINAL_KEY)) === undefined) {
    await $.store.set(ORIGINAL_KEY, before)
  }
  const ran = await $.process.run(['python3', scriptOf($), 'use', slug], { timeoutMs: 10_000 })
  if (ran.exitCode !== 0) return ran.stderr.trim().split('\n').pop() || 'the theme file could not be written'
  await $.store.set(APPLIED_KEY, slug)
  // Claude Code watches ~/.claude/themes only when it existed at startup: the first time, it needs one restart.
  if (ran.stdout.includes('created themes folder')) {
    await $.ui.toast('Themes are installed. Restart Claude Code once; from then on they switch live.')
  }
  return undefined
}

/** The theme a new session opens with: the pinned one, or the next in the rotation. */
async function themeForNewSession($: EngineInterface): Promise<Slug | null> {
  const mode = await modeOf($)
  if (mode === 'off') return null
  if (mode === 'pinned') {
    const pinned = findTheme(String((await $.store.get(PINNED_KEY)) ?? ''))
    if (pinned) return pinned
  }
  const next = Number((await $.store.get(NEXT_KEY)) ?? 0) || 0
  await $.store.set(NEXT_KEY, (next + 1) % ROTATION.length)
  return ROTATION[next % ROTATION.length]!
}

async function useTheme($: EngineInterface, slug: string): Promise<string | undefined> {
  await update($, current, () => slug)
  return apply($, slug)
}

function listText(mine: string | null, mode: Mode, pinned: unknown): string {
  const rows = THEMES.map(theme => `${theme.slug === mine ? '●' : '○'} ${theme.slug.padEnd(22)}${theme.name}`)
  const how =
    mode === 'off'
      ? 'Switcher is off: sessions keep your own theme.'
      : mode === 'pinned'
        ? `Every new session opens in ${nameOf(String(pinned))}.`
        : 'Each new session opens in the next theme of the rotation.'
  return [
    `This session: ${mine ? nameOf(mine) : 'your own theme'}. ${how}`,
    '',
    ...rows,
    '',
    '/themes <theme> for this session · /themes pin <theme> for every session · /themes rotate · /themes off',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command (~0.7 s), which would hold startup.
    // Typed as /themes in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'themes',
      description: 'Color theme for this session, or pin one for every session',
      argumentHint: '[list|<theme>|pin <theme>|rotate|off]',
    }).catch(() => undefined)
    // A reload keeps the session's theme; only a new session takes a new one.
    const kept = await read($, current)
    const slug = kept ?? (await themeForNewSession($))
    // Before the session finishes starting (about 50 ms), so it opens in its theme instead of relying on a
    // live reload of the theme file.
    if (slug !== null) {
      const failed = await useTheme($, slug).catch(error => String(error))
      if (failed) void $.ui.toast(`Theme not applied: ${failed}`)
    }

    return next(e)
  })

  // The theme setting is shared by every session on the machine: the one you type in takes its own back.
  on('prompt.submit', async ($, e, next) => {
    const mine = await read($, current)
    if (mine !== null) await apply($, mine).catch(() => undefined)

    return next(e)
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  on('command.run', { command: ['themes', 'themes:themes'] }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const mode = await modeOf($)
    const mine = await read($, current)

    if (verb === '' || verb === 'list') return { text: listText(mine, mode, await $.store.get(PINNED_KEY)) }

    if (verb === 'off') {
      await $.store.set(MODE_KEY, 'off')
      await update($, current, () => null)
      const original = await $.store.get(ORIGINAL_KEY)
      const back = typeof original === 'string' ? original : 'dark'
      await $.store.set(APPLIED_KEY, null)
      await $.process.run(['python3', scriptOf($), 'restore', back], { timeoutMs: 10_000 })
      return { text: `Switcher off. Theme back to ${back}.` }
    }

    if (verb === 'rotate') {
      await $.store.set(MODE_KEY, 'rotate')
      return { text: 'Each new session now opens in the next theme of the rotation.' }
    }

    if (verb === 'pin') {
      const slug = findTheme(rest.join(' '))
      if (!slug) return { text: `No theme "${rest.join(' ')}". Run /themes to see them.` }
      await $.store.set(MODE_KEY, 'pinned')
      await $.store.set(PINNED_KEY, slug)
      const refused = await useTheme($, slug)
      return { text: refused ? `Pinned ${nameOf(slug)}, but the theme was not changed: ${refused}` : `Every session now opens in ${nameOf(slug)}.` }
    }

    const slug = findTheme(e.args)
    if (!slug) return { text: `No theme "${e.args.trim()}". Run /themes to see them.` }
    if (mode === 'off') await $.store.set(MODE_KEY, 'rotate')
    const refused = await useTheme($, slug)
    return { text: refused ? `Theme not changed: ${refused}` : `This session is now ${nameOf(slug)}.` }
  })

  // The footer names the session's theme, so it is clear which is which.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const mine = await read($, current)
    if (mine === null) return next(e)

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, `◐ ${nameOf(mine)}`] } })
  })
}
