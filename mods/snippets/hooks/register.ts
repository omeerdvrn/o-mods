import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { DEFAULT_SNIPPETS, expandAll, expandAtCursor, paint, secretsIn, suggestions } from './draft'
import type { Issue } from './draft'
import type { Thumb } from '../types'

const SNIPPETS_KEY = 'snippets'
const ISSUES_EVERY_MS = 10 * 60_000
/** The names a Linear MCP server goes by: the claude.ai connector, or one added with `claude mcp add`. */
const LINEAR_SERVERS = ['claude.ai Linear', 'linear', 'Linear']
const OPEN_STATES = ['started', 'unstarted', 'triage', 'backlog']

let issues: Issue[] = []
let known = new Set<string>()
let snippets: Record<string, string> = { ...DEFAULT_SNIPPETS }
let linearServer: string | null = null
let warnedSecret = ''

// Pasted images: Claude Code puts "[Image #N]" in the draft and keeps the picture to itself, so each one is
// saved from the clipboard the moment its tag shows up, and drawn small above the input.
const thumbs = atom({ plugin: 'snippets', key: 'thumbs' } as const, [] as Thumb[])
const IMAGE_TAG = /\[Image #(\d+)\]/g
const THUMB_ROWS = 6
const THUMB_PX = 360
/** A terminal cell's width over its height. */
const CELL_ASPECT = 0.46
const captured = new Map<number, Thumb | null>()
const capturing = new Set<number>()

function clipScript($: EngineInterface): string {
  return `${$.plugin.root.replace(/\/\.claude-plugin\/?$/, '')}/scripts/clip-image.sh`
}

/** Saves the pasted image for each new tag in the draft, and shows the thumbnails of the tags still in it. */
async function syncThumbs($: EngineInterface, text: string) {
  const numbers = [...new Set([...text.matchAll(IMAGE_TAG)].map(found => Number(found[1])))]
  for (const number of numbers) {
    if (captured.has(number) || capturing.has(number)) continue
    capturing.add(number)
    const session = (await $.session.id()).replace(/[^\w-]/g, '')
    const folder = `${await $.env.get('HOME')}/Library/Caches/snippets/pasted`
    const ran = await $.process
      .run(['sh', clipScript($), `${folder}/${session}-${number}.png`, String(THUMB_PX)], { timeoutMs: 30_000 })
      .catch(() => null)
    const size = ran?.exitCode === 0 ? ran.stdout.trim().split(/\s+/).map(Number) : []
    captured.set(number, size.length === 2 && size[0]! > 0 ? { number, file: `${folder}/${session}-${number}.png`, width: size[0]!, height: size[1]! } : null)
    capturing.delete(number)
  }
  const shown = numbers.map(number => captured.get(number)).filter((thumb): thumb is Thumb => Boolean(thumb))
  const before = await read($, thumbs)
  if (shown.map(thumb => thumb.number).join() !== before.map(thumb => thumb.number).join()) await update($, thumbs, () => shown)
}

/** Your Linear issues, open ones first, for the ticket typeahead and highlighting; kept fresh in the background. */
async function loadIssues($: EngineInterface) {
  const found: Issue[] = []
  for (const state of OPEN_STATES) {
    const result = await linearCall($, { assignee: 'me', state, limit: 50, orderBy: 'updatedAt', fields: ['id', 'title', 'status'] })
    if (result === null) return
    const text = result.content.map(block => block.text ?? '').join('')
    if (result.isError) return
    const data = JSON.parse(text) as { issues?: { id?: string; identifier?: string; title?: string; status?: string }[] }
    for (const raw of data.issues ?? []) {
      const id = String(raw.identifier ?? raw.id ?? '')
      if (id) found.push({ id, title: String(raw.title ?? ''), status: String(raw.status ?? '') })
    }
  }
  issues = found
  known = new Set(found.map(issue => issue.id))
}

async function linearCall($: EngineInterface, args: Record<string, unknown>) {
  const names = [...new Set([linearServer, ...LINEAR_SERVERS].filter((name): name is string => Boolean(name)))]
  for (const server of names) {
    try {
      const result = await $.mcp.call(server, 'list_issues', args)
      linearServer = server
      return result
    } catch {
      // Not connected under this name: try the next.
    }
  }
  return null
}

/** Whether this terminal shows pictures (kitty graphics). */
async function showsPictures($: EngineInterface): Promise<boolean> {
  if ((await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')) === '1') return true
  if (await $.env.get('KITTY_WINDOW_ID')) return true
  return ['WezTerm', 'ghostty', 'kitty', 'iTerm.app'].includes((await $.env.get('TERM_PROGRAM')) ?? '')
}

async function saveSnippets($: EngineInterface) {
  const own = Object.fromEntries(Object.entries(snippets).filter(([name, text]) => DEFAULT_SNIPPETS[name] !== text))
  const removed = Object.keys(DEFAULT_SNIPPETS).filter(name => snippets[name] === undefined)
  await $.store.set(SNIPPETS_KEY, { own, removed })
}

function snippetList(): string {
  const rows = Object.entries(snippets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, text]) => `;;${name.padEnd(10)}${text}`)
  return [...rows, '', 'Type ;;name then space (or Tab from the list) to expand it.', '/snippets add <name> <text> · /snippets remove <name>'].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command, which would hold startup.
    // Typed as /snippets in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({ name: 'snippets', description: 'Your ;;snippets: list, add, remove', argumentHint: '[add <name> <text>|remove <name>]' }).catch(() => undefined)
    const stored = (await $.store.get(SNIPPETS_KEY)) as { own?: Record<string, string>; removed?: string[] } | undefined
    snippets = { ...DEFAULT_SNIPPETS, ...(stored?.own ?? {}) }
    for (const name of stored?.removed ?? []) delete snippets[name]
    void loadIssues($).catch(() => undefined)
    $.clock.every(ISSUES_EVERY_MS, () => void loadIssues($).catch(() => undefined))
    // The clipboard helper is compiled once (a few seconds): do it now, so the first paste is quick too.
    void $.process.run(['sh', clipScript($), '--build'], { timeoutMs: 120_000 }).catch(() => undefined)
    // A paste may not pass through an edit the mod sees: check the draft for new image tags four times a second.
    $.clock.every(250, () => {
      void (async () => {
        const box = await $.prompt.read()
        if (box.text.includes('[Image #') || (await read($, thumbs)).length > 0) await syncThumbs($, box.text)
      })().catch(() => undefined)
    })
    return next(e)
  })

  // Each edit: a ;;snippet expands when you type a space after it, and the draft is painted.
  on('prompt.edit', async ($, e, next) => {
    let box = await next(e)
    if (e.inputText === ' ' || e.inputText === '\t') {
      const expanded = expandAtCursor(box.text, box.cursor, snippets)
      if (expanded) box = { ...box, ...expanded }
    }
    const secrets = secretsIn(box.text)
    if (secrets.length > 0) {
      const first = box.text.slice(secrets[0]!.start, secrets[0]!.end)
      if (first !== warnedSecret) {
        warnedSecret = first
        void $.ui.toast('That looks like a secret (a key or token). Take it out before you send.')
      }
    }
    void syncThumbs($, box.text).catch(() => undefined)
    return { ...box, decorations: [...(box.decorations ?? []), ...paint(box.text, known, snippets)] }
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // The typeahead: your Linear tickets as you type an id, your snippets after ;;.
  on('prompt.autocomplete', async ($, e, next) => {
    const result = await next(e)
    const mine = suggestions(e.token, issues, snippets)
    return mine.length === 0 ? result : { suggestions: [...mine, ...result.suggestions] }
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // A ;;snippet sent with no space after it still expands. Sending clears the image previews.
  on('prompt.submit', async ($, e, next) => {
    void update($, thumbs, () => [])
    const text = expandAll(e.text, snippets)
    return next(text === e.text ? e : { ...e, text })
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  // Pasted images, small, in a row above the input, each with its tag's number.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, thumbs)
    if (shown.length === 0 || e.props.hasSurvey) return next(e)
    const { Box, Text, Image } = $.ui.resolve(e)
    const above = await next(e)
    const pictures = e.surface === 'terminal' && Image !== undefined && (await showsPictures($))
    const row = h(
      Box,
      { flexDirection: 'row', columnGap: 2, flexWrap: 'wrap' },
      ...shown.map(thumb => {
        const columns = Math.max(4, Math.min(48, Math.round((THUMB_ROWS * thumb.width) / thumb.height / CELL_ASPECT)))
        return h(
          Box,
          { key: `thumb-${thumb.number}`, flexDirection: 'column' },
          pictures
            ? h(Image, { key: `image-${thumb.number}`, source: { file: thumb.file, format: 'png' }, columns, rows: THUMB_ROWS, alt: `Image #${thumb.number}` })
            : null,
          h(Text, { dimColor: true }, pictures ? `#${thumb.number}` : `🖼 Image #${thumb.number}`),
        )
      }),
    )
    return h(Box, { flexDirection: 'column' }, above, row)
  })

  on('command.run', { command: ['snippets', 'snippets:snippets'] }, async ($, e) => {
    const [verb = '', name = '', ...rest] = e.args.trim().split(/\s+/)
    const key = name.replace(/^;;/, '').toLowerCase()
    if (verb === 'add') {
      if (!/^[a-z0-9-]+$/.test(key) || rest.length === 0) return { text: 'usage: /snippets add <name> <text>' }
      snippets[key] = rest.join(' ')
      await saveSnippets($)
      return { text: `;;${key} now expands to: ${snippets[key]}` }
    }
    if (verb === 'remove') {
      if (snippets[key] === undefined) return { text: `No snippet ;;${key}.` }
      delete snippets[key]
      await saveSnippets($)
      return { text: `;;${key} removed.` }
    }
    return { text: snippetList() }
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)
}
