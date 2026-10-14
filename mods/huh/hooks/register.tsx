import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Reading, Typeset, Version } from '../types'
import { blocks, partsOf, sections, titleOf } from './markdown'
import type { Span } from './markdown'
import { spans as spansOf } from './markdown'

const PANE = 'huh'
const MODEL = 'haiku'
/** Answers longer than this are rewritten in parts at once, so a long one takes about as long as a short one. */
const PART_CHARS = 2400
const PAGE_KEY = 'page'

/** The page the reader is set on: its own light or dark page, or the terminal's colors. */
type Page = 'light' | 'dark' | 'terminal'
const PAGES: Page[] = ['light', 'dark', 'terminal']

/** Each page's colors, picked for contrast on it: body text, headings, code, the dim lines, the panel's edge. */
const PALETTES: Record<Page, { background?: string; text?: string; accent: string; code: string; block: string; muted: string; edge: string }> = {
  light: { background: '#f6f6f3', text: '#24292f', accent: '#1f5fa8', code: '#8250df', block: '#116329', muted: '#6e7781', edge: '#c8ccd2' },
  dark: { background: '#17191e', text: '#e3e5e8', accent: '#7aa7e8', code: '#c9a2ff', block: '#9ad48a', muted: '#8b929b', edge: '#3a3f47' },
  terminal: { accent: '#6f9bd8', code: '#c792ea', block: '#c3e88d', muted: 'inactive', edge: 'inactive' },
}

const reading = atom({ plugin: 'huh', key: 'reading' } as const, null as Reading | null)
const version = atom({ plugin: 'huh', key: 'version' } as const, 'readable' as Version)
const page = atom({ plugin: 'huh', key: 'page' } as const, 'terminal' as Page)
const typeset = atom({ plugin: 'huh', key: 'typeset' } as const, null as Typeset | null)

/**
 * A terminal cell's size in screen pixels: the page is drawn at exactly that many pixels per column and cut
 * into strips a whole number of rows tall, so the terminal shows it 1:1. 17×37 is JetBrains Mono at 14 pt on a
 * Retina screen; the cellSize option changes it.
 */
let cell = { width: 17, height: 37 }
/** The sidebar's width as last drawn, in columns; the page is typeset to it. */
let columns = 64
let typesetting: string | null = null

/** Readable versions already made, by the answer they came from, so reopening one is instant. */
const made = new Map<string, string>()
/** Rewrites under way, by the answer, so a second /huh joins the first instead of asking again. */
const pending = new Map<string, Promise<Rewrite>>()

type Rewrite = { text: string } | { problem: string }

const REWRITE = `You rewrite an answer from a coding assistant so it is easy to read in a narrow sidebar (about 60 characters wide).

Keep every fact, decision, number, file path, command, code block and caveat. Do not add anything, do not drop anything that matters, and do not change what it says. Write in the answer's own language.

Shape it for reading:
- Start with "**In short:**" and one to three plain sentences: what happened and what the reader needs to do, if anything.
- Then short sections, each under a "## " heading of a few words.
- Short paragraphs; one idea each. Sentences of twenty words or fewer, in plain words.
- Lists for steps and for sets of parallel items. Start each item with its key word or phrase in **bold**, so the
  list can be scanned down its left edge.
- Tables only when they have two or three columns; otherwise turn them into lists.
- Code, commands and paths stay in backticks or code blocks, unchanged.
- End with a "## Next" section only if the answer asks the reader to do something.

Reply with the rewritten Markdown only: no preamble, no closing remarks.`

function scriptOf($: EngineInterface): string {
  return `${$.plugin.root.replace(/\/\.claude-plugin\/?$/, '')}/scripts/typeset.py`
}

/** Whether this terminal shows pictures (kitty graphics): the typeset page, or the text view. */
async function showsPictures($: EngineInterface): Promise<boolean> {
  if ((await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')) === '1') return true
  if (await $.env.get('KITTY_WINDOW_ID')) return true
  const program = (await $.env.get('TERM_PROGRAM')) ?? ''
  return ['WezTerm', 'ghostty', 'kitty', 'iTerm.app'].includes(program)
}

/** What the typeset page shows now: the version on screen, on the chosen page, at the sidebar's width. */
async function wanted($: EngineInterface): Promise<{ key: string; markdown: string; title: string; page: 'light' | 'dark' } | null> {
  const current = await read($, reading)
  const setting = await read($, page)
  if (current === null || setting === 'terminal') return null
  const shown = await read($, version)
  const markdown = shown === 'readable' && current.readable ? current.readable : current.original
  return { key: `${setting}:${columns}:${cell.width}x${cell.height}:${markdown.length}:${markdown.slice(0, 64)}:${markdown.slice(-64)}`, markdown, title: current.title, page: setting }
}

/**
 * Typesets the page as a browser would draw it (real fonts, line spacing, headings) into picture strips for
 * the sidebar. Only a cache is written; nothing opens.
 */
async function typesetPage($: EngineInterface) {
  const want = await wanted($)
  if (want === null || !(await showsPictures($))) return
  if ((await read($, typeset))?.key === want.key || typesetting === want.key) return
  typesetting = want.key
  try {
    const stdin = JSON.stringify({ markdown: want.markdown, title: want.title, page: want.page, columns, cell: [cell.width, cell.height] })
    const ran = await $.process.run(['python3', scriptOf($)], { stdin, timeoutMs: 120_000 })
    if (ran.exitCode !== 0) return
    const done = JSON.parse(ran.stdout) as { strips: string[]; heights: number[]; width: number; problem: string | null }
    if (done.problem || done.strips.length === 0) return
    if ((await wanted($))?.key !== want.key) return
    await update($, typeset, () => ({ key: want.key, strips: done.strips, heights: done.heights, width: done.width }))
  } finally {
    if (typesetting === want.key) typesetting = null
  }
}

/** Claude's last answer: the text of the latest assistant message that has any. */
async function lastAnswer($: EngineInterface): Promise<string | null> {
  const messages = await $.session.messages({ as: 'api' })
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (message.role !== 'assistant') continue
    const content = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
    const text = (content as { type: string; text?: string }[])
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text!)
      .join('\n\n')
      .trim()
    if (text !== '') return text
  }
  return null
}

const PART_RULES = `This is one part of a longer answer; the other parts are rewritten separately and joined after it.
Do not start with "**In short:**" and do not add a "## Next" section unless this part asks the reader to do something.`

const SHORT = `Summarize this answer from a coding assistant for a reader in a narrow sidebar: "**In short:**" then one to three
plain sentences of twenty words or fewer: what happened and what the reader needs to do, if anything. Write in the
answer's own language. Reply with that line only.`

async function ask($: EngineInterface, system: string, prompt: string, maxTokens: number): Promise<Rewrite> {
  const result = await $.model.complete({ model: MODEL, system, prompt, maxTokens, effort: 'low', timeoutMs: 120_000 })
  if (result.isAnswered && result.text.trim() !== '') return { text: result.text.trim() }
  return { problem: result.isAnswered ? 'the reply was empty' : result.reason === 'api-error' ? `the API answered ${result.status ?? 'with an error'}` : result.reason }
}

/** The readable version: one request for a short answer; for a long one, every part and the summary at once. */
function rewrite($: EngineInterface, original: string): Promise<Rewrite> {
  const known = made.get(original)
  if (known) return Promise.resolve({ text: known })
  const running = pending.get(original)
  if (running) return running
  const parts = partsOf(original, PART_CHARS)
  const work = (async (): Promise<Rewrite> => {
    const done =
      parts.length < 2
        ? [await ask($, REWRITE, original, 8000)]
        : await Promise.all([
            ask($, SHORT, original, 400),
            ...parts.map((part, index) => ask($, `${REWRITE}\n\n${PART_RULES}${index === 0 ? '' : '\nDo not repeat a title.'}`, part, 8000)),
          ])
    const failed = done.find((one): one is { problem: string } => 'problem' in one)
    if (failed) return failed
    const text = done.map(one => (one as { text: string }).text).join('\n\n')
    made.set(original, text)
    return { text }
  })().finally(() => pending.delete(original))
  pending.set(original, work)
  return work
}

/** Shows the readable version once it arrives; the original stays on screen until then. */
async function makeReadable($: EngineInterface, original: string) {
  const result = await rewrite($, original)
  const current = await read($, reading)
  if (current === null || current.original !== original) return
  if ('text' in result) {
    await update($, reading, value => (value ? { ...value, readable: result.text, state: 'ready', problem: null } : value))
    await update($, version, value => (value === 'original' ? 'readable' : value))
    void typesetPage($).catch(() => undefined)
  } else {
    await update($, reading, value => (value ? { ...value, state: 'failed', problem: result.problem } : value))
    await update($, version, () => 'original')
  }
}

export const register: Register = (on, options) => {
  const asked = /^(\d+)\s*[x×]\s*(\d+)$/.exec(String((options as { cellSize?: string }).cellSize ?? '').trim())
  if (asked) cell = { width: Number(asked[1]), height: Number(asked[2]) }

  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command, which would hold startup.
    // Typed as /huh in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({ name: 'huh', description: "Claude's last answer, made easy to read, in the sidebar", argumentHint: '[light|dark|terminal]' }).catch(() => undefined)
    const stored = await $.store.get(PAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'terminal') await update($, page, () => stored)
    return next(e)
  })

  on('command.run', { command: ['huh', 'huh:huh'] }, async ($, e) => {
    const asked = e.args.trim()
    if (asked === 'light' || asked === 'dark' || asked === 'terminal') {
      await update($, page, () => asked)
      await $.store.set(PAGE_KEY, asked)
      void typesetPage($).catch(() => undefined)
      if (await read($, reading)) return { text: `Reader page: ${asked}.` }
    }

    const original = await lastAnswer($)
    if (original === null) return { text: 'There is no answer from Claude in this conversation yet.' }
    const known = made.get(original)
    await update($, reading, () => ({
      title: titleOf(original),
      original,
      readable: known ?? null,
      state: known ? 'ready' : 'rewriting',
      problem: null,
    }))
    await update($, version, () => (known ? 'readable' : 'original'))
    // Focused, so it comes to the front where a surface shows one pane at a time (the desktop app).
    const opened = await $.ui.open({ id: PANE, title: 'Reader', focus: true })
    void typesetPage($).catch(() => undefined)
    if (!known) void makeReadable($, original)
    return { text: opened.isPlaced ? 'Opened in the sidebar.' : 'The sidebar could not open here.' }
  }).catch(($, e, next) => (next.called ? undefined : next(e)) as never)

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown, Image } = $.ui.resolve(e)
    const current = await read($, reading)
    const setting = await read($, page)
    const colors = PALETTES[setting]
    const bg = colors.background
    if (current === null) return <Text color={colors.muted} wrap="wrap">Run /huh to open Claude's last answer here, made easy to read.</Text>
    const shown = await read($, version)
    const markdown = shown === 'readable' && current.readable ? current.readable : current.original
    if (Math.abs(e.props.bodyColumns - columns) >= 6) {
      columns = e.props.bodyColumns
      void typesetPage($).catch(() => undefined)
    }
    const margin = bg ? 1 : 0
    const width = Math.max(20, e.props.bodyColumns - margin * 2)
    const gap = 1
    // The terminal's own colors read best through the engine's Markdown, as Claude's replies do; the pages
    // keep every color their own, so their text is drawn here.
    const native = setting === 'terminal' && Markdown !== undefined

    // Every piece of text carries the page's colors, so the page reads as one sheet in any terminal.
    const T = (props: { children: unknown; color?: string; bold?: boolean; wrap?: 'wrap'; key?: string }) => (
      <Text key={props.key} color={props.color ?? colors.text} backgroundColor={bg} bold={props.bold} wrap={props.wrap}>
        {props.children as never}
      </Text>
    )
    const inline = (parts: Span[], color?: string) =>
      parts.map(part => <Text color={part.code ? colors.code : color ?? colors.text} backgroundColor={bg} bold={part.bold}>{part.text}</Text>)
    const nextPage = PAGES[(PAGES.indexOf(setting) + 1) % PAGES.length]!
    const pageLabel = { light: 'Light page', dark: 'Dark page', terminal: 'Terminal colors' }

    const toolbar = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {current.state === 'ready' && (
          <Button
            key="toggle"
            label={shown === 'readable' ? 'Show original' : 'Show readable'}
            plain
            onPress={async () => {
              await update($, version, value => (value === 'readable' ? 'original' : 'readable'))
              void typesetPage($).catch(() => undefined)
            }}
          />
        )}
        <Button
          key="page"
          label={`${pageLabel[setting]} → ${pageLabel[nextPage].toLowerCase()}`}
          plain
          onPress={async () => {
            await update($, page, () => nextPage)
            await $.store.set(PAGE_KEY, nextPage)
            void typesetPage($).catch(() => undefined)
          }}
        />
      </Box>
    )
    const status =
      current.state === 'rewriting'
        ? T({ color: colors.accent, children: 'Making it easier to read… the original is below until then.' })
        : current.state === 'failed'
          ? T({ color: '#d1242f', wrap: 'wrap', children: `Could not make a readable version (${current.problem}). Showing the original.` })
          : T({ color: colors.muted, children: shown === 'readable' ? 'Rewritten for reading; same content.' : 'As Claude wrote it.' })
    const rule = (at: string) => T({ key: at, color: colors.edge, children: '─'.repeat(Math.min(width, 32)) })

    /** A heading: section headings bold in the accent with a rule under them, smaller ones bold. */
    const heading = (text: string, level: number, at: string) => {
      const major = level <= 2
      return (
        <Box key={at} flexDirection="column" marginTop={major ? 1 : 0}>
          <Text bold color={major ? colors.accent : colors.text} backgroundColor={bg} wrap="wrap">{inline(spansOf(text), major ? colors.accent : undefined)}</Text>
          {major && rule(`${at}-rule`)}
        </Box>
      )
    }

    /** A section's body: the engine's Markdown on terminal colors, else drawn block by block for the page. */
    const body = (text: string, at: string) => {
      if (text.trim() === '') return null
      if (native) return <Markdown key={at} text={text} />
      return (
        <Box key={at} flexDirection="column" rowGap={gap}>
          {blocks(text).map((block, index) => {
            const key = `${at}-${index}`
            switch (block.kind) {
              case 'heading':
                return heading(block.spans.map(span => span.text).join(''), block.level, key)
              case 'paragraph':
                return <Text key={key} backgroundColor={bg} wrap="wrap">{inline(block.spans)}</Text>
              case 'item':
                return (
                  <Box key={key} flexDirection="row" paddingLeft={block.depth * 2} columnGap={1}>
                    <Box flexShrink={0}>{T({ color: colors.accent, children: block.marker })}</Box>
                    <Text backgroundColor={bg} wrap="wrap">{inline(block.spans)}</Text>
                  </Box>
                )
              case 'code':
                return (
                  <Box key={key} flexDirection="column" borderStyle="single" borderColor={colors.edge} paddingX={1} backgroundColor={bg}>
                    {block.lines.map((line, row) => T({ key: `${key}-${row}`, color: colors.block, wrap: 'wrap', children: line || ' ' }))}
                  </Box>
                )
              case 'quote':
                return (
                  <Box key={key} flexDirection="row" columnGap={1}>
                    {T({ color: colors.edge, children: '│' })}
                    <Text backgroundColor={bg} wrap="wrap">{inline(block.spans, colors.muted)}</Text>
                  </Box>
                )
              case 'row':
                return (
                  <Box key={key} flexDirection="row" columnGap={2}>
                    {block.cells.map((cell, column) => (
                      <Box key={`${key}-${column}`} flexGrow={1} flexShrink={1}>
                        <Text bold={block.isHeader} backgroundColor={bg} wrap="wrap">{inline(cell, block.isHeader ? colors.accent : undefined)}</Text>
                      </Box>
                    ))}
                  </Box>
                )
              default:
                return rule(key)
            }
          })}
        </Box>
      )
    }

    // The typeset page: picture strips one under another, the pane scrolling through them.
    const set = await read($, typeset)
    const want = await wanted($)
    if (e.surface === 'terminal' && Image !== undefined && set !== null && want !== null && set.key === want.key) {
      return (
        <Box flexDirection="column" rowGap={1}>
          {toolbar}
          {current.state !== 'ready' && status}
          <Box flexDirection="column">
            {set.strips.map((strip, index) => (
              <Image
                key={`strip-${index}`}
                source={{ file: strip, format: 'png' }}
                columns={columns}
                rows={Math.max(1, Math.round(set.heights[index]! / cell.height))}
                alt={index === 0 ? current.title : ' '}
              />
            ))}
          </Box>
        </Box>
      )
    }

    const parts = sections(markdown)
    // The buttons sit above the page, on the terminal's own colors: a button draws in the theme's colors,
    // which would fade on a light page.
    return (
      <Box flexDirection="column" rowGap={1}>
        {toolbar}
      <Box flexDirection="column" rowGap={gap} backgroundColor={bg} paddingX={margin} paddingY={bg ? 1 : 0}>
        <Box flexDirection="column">
          {T({ bold: true, color: colors.accent, wrap: 'wrap', children: current.title })}
          {status}
        </Box>
        {parts.summary && (
          <Box borderStyle="round" borderColor={colors.accent} paddingX={1} backgroundColor={bg}>
            {native ? <Markdown text={parts.summary} /> : <Text backgroundColor={bg} wrap="wrap">{inline(spansOf(parts.summary))}</Text>}
          </Box>
        )}
        {parts.sections.map((section, at) => (
          <Box key={`s${at}`} flexDirection="column" rowGap={gap}>
            {section.heading && heading(section.heading.text, section.heading.level, `h${at}`)}
            {body(section.body, `s${at}-body`)}
          </Box>
        ))}
      </Box>
      </Box>
    )
  })
}
