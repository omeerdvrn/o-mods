import type { EngineInterface, Register } from 'claude-code'

import { crabPicture, crabSvg } from './crabs'
import { planPictures, profileOf } from './pictures'
import type { Plan, Setup } from './pictures'
import { BUILTIN, absolute, bashVerdict, findPersona, mergePersonas, writeVerdict } from './personas'
import type { Persona, PersonaFile } from './personas'

const STORE_KEY = 'active'
const ENV_KEY = 'CLAUDE_PERSONA'

let personas: Persona[] = BUILTIN

async function readFolder($: EngineInterface, folder: string): Promise<PersonaFile[]> {
  const entries = await $.fs.list(folder).catch(() => [])
  const files: PersonaFile[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    try {
      const parsed = JSON.parse(await $.fs.read(`${folder}/${entry.name}`)) as PersonaFile
      files.push({ ...parsed, id: parsed.id ?? entry.name.replace(/\.json$/, '') })
    } catch {
      $.ui.toast(`skipped ${folder}/${entry.name}, not valid JSON`)
    }
  }

  return files
}

/** Builtins, then `~/.claude/personas/*.json`, then the project's `.claude/personas/*.json`. */
async function loadPersonas($: EngineInterface) {
  const home = await $.env.get('HOME')
  const cwd = await $.session.cwd()
  const machine = home ? await readFolder($, `${home}/.claude/personas`) : []
  const project = await readFolder($, `${cwd}/.claude/personas`)
  personas = mergePersonas(BUILTIN, [machine, project])
}

type Active = { persona?: Persona; source?: 'env' | 'store'; unknown?: string }

/** `CLAUDE_PERSONA` wins over the persona saved on this machine with `/persona`. */
async function activePersona($: EngineInterface): Promise<Active> {
  const fromEnv = (await $.env.get('CLAUDE_PERSONA'))?.trim()
  if (fromEnv && fromEnv !== 'off') {
    const persona = findPersona(personas, fromEnv)
    return persona ? { persona, source: 'env' } : { persona: undefined, unknown: fromEnv }
  }
  if (fromEnv === 'off') return { persona: undefined }
  const saved = await $.store.get(STORE_KEY)
  if (typeof saved !== 'string') return { persona: undefined }
  const persona = findPersona(personas, saved)

  return persona ? { persona, source: 'store' } : { persona: undefined, unknown: saved }
}

/** Redraws the hint line, where the active persona's name is shown. */
function showStatus($: EngineInterface, _active: Active) {
  $.ui.invalidate('ui.render')
}

function denial(persona: Persona, reason: string): string {
  return `persona "${persona.name}": ${reason}. Do not try another way to make this change; tell the person what change is needed and who should make it. The person can switch personas with /persona.`
}

async function checkWrite($: EngineInterface, path: string): Promise<string | undefined> {
  const active = await activePersona($)
  if (active.unknown) return `persona "${active.unknown}" is set but not defined; run /persona list. Writes are blocked until it is fixed`
  if (!active.persona) return undefined
  const cwd = await $.session.cwd()
  const target = absolute(path, cwd)
  const verdict = writeVerdict(active.persona, target, cwd)
  if (verdict) return denial(active.persona, verdict)
  // A link inside an allowed folder may lead into a forbidden one.
  const stat = await $.fs.stat(target, { resolve: true }).catch(() => undefined)
  const real = stat?.realPath
  const realVerdict = real && real !== target ? writeVerdict(active.persona, real, cwd) : undefined

  return realVerdict ? denial(active.persona, realVerdict) : undefined
}

const GUARD_FAILED = 'persona: the guard could not check this call, so it is blocked. Run /persona status.'

function listText(active: Active): string {
  const rows = personas.map(
    persona => `${persona.id === active.persona?.id ? '●' : '○'} ${persona.id.padEnd(8)} ${persona.name}: ${persona.summary}`,
  )

  return [...rows, '', 'Use /persona <id> to switch, /persona off to clear.'].join('\n')
}

function statusText(active: Active): string {
  if (active.unknown) return `persona "${active.unknown}" is set but not defined. Run /persona list.`
  if (!active.persona) return 'No persona active. Claude can edit any file. Run /persona list.'
  const from = active.source === 'env' ? `from $${ENV_KEY}` : 'saved on this machine'
  const writes = active.persona.writes
  const scope =
    writes === 'none'
      ? 'read-only'
      : [writes.allow ? `may edit ${writes.allow.length} file patterns` : 'may edit any file', writes.deny ? `blocks ${writes.deny.length} patterns` : '']
          .filter(Boolean)
          .join(', ')

  return `Persona: ${active.persona.name} (${active.persona.id}, ${from}). ${active.persona.summary} Rules: ${scope}.`
}

/**
 * The probe repaints the first picture to learn whether pictures show; some terminals (herdr before 0.9)
 * drop a picture that is replaced in place. So once the probe passes, the crab is drawn under a new key:
 * a new picture, sent whole, never the replaced one.
 */
const PROBE_PICTURE_KEY = 'crab-probe'
const PICTURE_KEY = 'crab'
const PROBE_KEY = 'pictureProbe'
/** The crab is 16×8 pixels: four cells wide by one tall keeps its pixels square. */
const PICTURE_COLUMNS = 4

/** Whether this terminal shows pictures: unknown until the first one is drawn and tried. */
let pictures: 'unknown' | 'yes' | 'no' = 'unknown'
let isProbing = false

/**
 * Asks the terminal once whether it shows pictures: repainting a drawn picture is refused where the
 * terminal shows its alt text instead. Where it does not, the name alone is drawn from then on.
 */
/** Keeps why pictures did or did not show, with the terminal as the session sees it, for `/persona status`. */
async function recordProbe($: EngineInterface, outcome: string) {
  const env = [
    `TERM=${(await $.env.get('TERM')) ?? ''}`,
    `TERM_PROGRAM=${(await $.env.get('TERM_PROGRAM')) ?? ''}`,
    `WEZTERM=${(await $.env.get('WEZTERM_EXECUTABLE')) ? 'yes' : 'no'}`,
    `HERDR=${(await $.env.get('HERDR_ENV')) ? 'yes' : 'no'}`,
    `TMUX=${(await $.env.get('TMUX')) ? 'yes' : 'no'}`,
  ]
  await $.store.set(PROBE_KEY, `${outcome} (${env.join(' ')})`)
}

function probePictures($: EngineInterface, requestId: string, source: ReturnType<typeof crabPicture>) {
  if (isProbing) return
  isProbing = true
  $.clock.after(300, () => {
    void $.ui
      .blit({ requestId, key: PROBE_PICTURE_KEY, source, columns: PICTURE_COLUMNS, rows: 1 })
      .then(async result => {
        const deny = 'deny' in result && result.deny ? String(result.deny) : ''
        pictures = deny ? 'no' : 'yes'
        await recordProbe($, deny || 'pictures shown')
        if (deny) await hintPictures($)
      })
      .catch(async (error: unknown) => {
        pictures = 'no'
        await recordProbe($, `blit failed: ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        isProbing = false
        $.ui.invalidate('ui.render')
      })
  })
}

const HINTED_KEY = 'picturesHinted'

/** This machine's terminal chain and shell, as the session sees them. */
async function readSetup($: EngineInterface): Promise<Setup> {
  const home = (await $.env.get('HOME')) ?? ''
  const shellPath = (await $.env.get('SHELL')) ?? ''
  const isHerdr = Boolean(await $.env.get('HERDR_ENV'))
  const version = isHerdr ? await $.process.run(['herdr', '--version'], { timeoutMs: 5_000 }).catch(() => null) : null

  return {
    home,
    shell: shellPath.split('/').pop() ?? '',
    isHerdr,
    herdrVersion: version?.exitCode === 0 ? version.stdout.trim() : null,
    isWezterm: Boolean(await $.env.get('WEZTERM_EXECUTABLE')) || (await $.env.get('TERM_PROGRAM')) === 'WezTerm',
    weztermConfig: (await $.env.get('WEZTERM_CONFIG_FILE')) ?? null,
    isForced: Boolean(await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')),
  }
}

/** The plan for this machine, reading each file it may change. */
async function planFor($: EngineInterface): Promise<Plan> {
  const setup = await readSetup($)
  const paths = [
    setup.weztermConfig ?? `${setup.home}/.config/wezterm/wezterm.lua`,
    `${setup.home}/.config/herdr/config.toml`,
    profileOf(setup.home, setup.shell),
  ].filter((path): path is string => path !== null)
  const files: Record<string, string | undefined> = {}
  for (const path of paths) files[path] = await $.fs.read(path).then(text => String(text)).catch(() => undefined)

  return planPictures(setup, files)
}

/** `/persona pictures` describes what this machine needs for the crab; `/persona pictures fix` does it. */
async function picturesCommand($: EngineInterface, isFix: boolean): Promise<string> {
  const plan = await planFor($)
  const probe = await $.store.get(PROBE_KEY)
  const now = typeof probe === 'string' ? `Now: ${probe}\n\n` : ''
  if (plan.edits.length === 0 && plan.manual.length === 0) {
    return `${now}Nothing to change: this machine is set up for the crab picture.`
  }
  if (!isFix) {
    const edits = plan.edits.map(edit => `- ${edit.label} (${edit.path})`)
    const manual = plan.manual.map(line => `- ${line}`)
    return [
      now.trim(),
      edits.length > 0 ? `\`/persona pictures fix\` would change, keeping a backup of each file:\n${edits.join('\n')}` : '',
      manual.length > 0 ? `To do by hand:\n${manual.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  const stamp = new Date((await $.clock.now()) || Date.now()).toISOString().replace(/[-:]/g, '').slice(0, 15)
  const done: string[] = []
  for (const edit of plan.edits) {
    const old = await $.fs.read(edit.path).then(text => String(text)).catch(() => undefined)
    if (old !== undefined) await $.fs.write(`${edit.path}.bak-${stamp}`, old)
    await $.fs.write(edit.path, edit.text)
    done.push(`- ${edit.label}: ${edit.path}${old !== undefined ? ` (backup: ${edit.path}.bak-${stamp})` : ''}`)
  }
  // herdr reads its config again on request; the rest takes a restart.
  if (plan.edits.some(edit => edit.path.endsWith('/herdr/config.toml'))) {
    await $.process.run(['herdr', 'server', 'reload-config'], { timeoutMs: 10_000 }).catch(() => undefined)
  }
  pictures = 'unknown'
  const restart = plan.restart.filter(line => !line.startsWith('Run `herdr server'))

  return [
    `Changed:\n${done.join('\n')}`,
    plan.manual.length > 0 ? `Still to do by hand:\n${plan.manual.map(line => `- ${line}`).join('\n')}` : '',
    restart.length > 0 ? `Then:\n${restart.map(line => `- ${line}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Once per machine, when the crab cannot show but this setup can be fixed, says how. */
async function hintPictures($: EngineInterface) {
  if ((await $.store.get(HINTED_KEY)) === true) return
  const plan = await planFor($)
  if (plan.edits.length === 0) return
  await $.store.set(HINTED_KEY, true)
  $.ui.toast('This terminal can show the role crab. Run /persona pictures to see what it needs.', { timeoutMs: 12_000 })
}

export const register: Register = on => {
  // The desktop app shows no hint line; there the role rides the footer's mode labels instead.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const active = await activePersona($)
    if (!active.persona) return next(e)

    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, active.persona.name] } })
  })

  // Under the prompt, after the hint line: the persona's crab as a one-row picture, then its name. Only
  // terminals with the kitty graphics protocol show pictures; everywhere else the name alone rides the
  // engine's own hint line, so its pills stay live.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const active = await activePersona($)
    if (!active.persona) return next(e)
    const name = active.persona.name
    // The desktop app draws vectors: the crab as SVG, crisp at any size.
    if (e.surface === 'desktop') {
      const { Box, Svg, Text } = $.ui.resolve(e)
      return h(
        Box,
        { flexDirection: 'row', alignItems: 'center', columnGap: 1 },
        e.props.hint === '' ? null : h(Text, { dimColor: true }, `${e.props.hint} · `),
        h(Svg, { source: crabSvg(active.persona.id), width: 32, height: 16, alt: `${name} crab` }),
        h(Text, {}, name),
      ) as never
    }
    if (pictures === 'no' || e.surface !== 'terminal') {
      return next({ ...e, props: { ...e.props, tail: e.props.tail ? `${e.props.tail} · ${name}` : name } })
    }
    const { Box, Image, Text } = $.ui.resolve(e)
    const source = crabPicture(active.persona.id)
    if (pictures === 'unknown') probePictures($, e.requestId, source)

    return h(
      Box,
      { flexDirection: 'row' },
      e.props.hint === '' ? null : h(Text, { dimColor: true }, `${e.props.hint} · `),
      h(Image, { key: pictures === 'yes' ? PICTURE_KEY : PROBE_PICTURE_KEY, source, columns: PICTURE_COLUMNS, rows: 1, alt: ' ' }),
      h(Text, {}, ` ${name}`),
    ) as never
  })

  on('session.start', async ($, e, next) => {
    // Not awaited: registering makes Claude Code re-describe every command (~0.7 s), which would hold startup.
    // Typed as /persona in the terminal; the command file is what the desktop app lists in its menu.
    void $.command.register({
      name: 'persona',
      description: "Set the role Claude works for on this machine: what it may edit and how it answers",
      argumentHint: '[ui-ux|backend|dev|qa|docs|pm|off|list|status|pictures]',
    }).catch(() => undefined)
    await loadPersonas($).catch(() => undefined)
    showStatus($, await activePersona($))

    return next(e)
  })

  on('command.run', { command: ['persona', 'persona:persona'] }, async ($, e) => {
    await loadPersonas($).catch(() => undefined)
    const wanted = e.args.trim()
    const before = await activePersona($)
    if (wanted === '' || wanted === 'status') {
      const probe = await $.store.get(PROBE_KEY)
      const pictureLine = typeof probe === 'string' ? `\nCrab picture: ${probe}` : ''
      return { text: `${statusText(before)}${pictureLine}\n\n${listText(before)}` }
    }
    if (wanted === 'list') return { text: listText(before) }
    if (wanted === 'pictures' || wanted === 'pictures fix') return { text: await picturesCommand($, wanted === 'pictures fix') }
    const envNote = before.source === 'env' ? `\nNote: $${ENV_KEY} is set and overrides this until it is unset.` : ''
    if (wanted === 'off') {
      await $.store.delete(STORE_KEY)
      const after = await activePersona($)
      showStatus($, after)
      return { text: `Persona cleared on this machine.${envNote}` }
    }
    const persona = findPersona(personas, wanted)
    if (!persona) return { text: `No persona "${wanted}".\n\n${listText(before)}` }
    await $.store.set(STORE_KEY, persona.id)
    const after = await activePersona($)
    showStatus($, after)

    return {
      text: `Persona set to ${persona.name} on this machine. ${persona.summary}${envNote}`,
      context: [`The active persona is now ${persona.name}. ${persona.prompt}`],
    }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const reason = await checkWrite($, e.file_path)
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const reason = await checkWrite($, e.file_path)
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))

  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const reason = await checkWrite($, e.notebook_path)
    return reason ? { deny: reason } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const active = await activePersona($)
    if (!active.persona) return next(e)
    const cwd = await $.session.cwd()
    const verdict = bashVerdict(active.persona, e.command, cwd, cwd)
    return verdict ? { deny: denial(active.persona, verdict) } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const { persona } = await activePersona($)
    if (!persona) return composed
    const text = [
      `# Active persona: ${persona.name}`,
      persona.prompt,
      `A hook enforces this persona: edits and shell commands outside its scope are denied. When one is denied, do not work around it (no other tool, script or path); explain what change is needed and who should make it.`,
    ].join('\n\n')

    return { sections: [...composed.sections, { id: 'persona:active', text, scope: 'session' }] }
  })
}
