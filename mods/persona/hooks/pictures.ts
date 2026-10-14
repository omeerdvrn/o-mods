/**
 * What a machine needs before Claude Code draws pictures (the persona crab), and the edits that give it.
 *
 * The chain that works: WezTerm with kitty graphics on, optionally herdr between it and Claude Code with
 * kitty graphics passed through, and inside herdr Claude Code told to draw pictures anyway: herdr calls
 * itself tmux and its terminal (libghostty) is not on Claude Code's list. kitty and Ghostty need nothing.
 */

export type Setup = {
  home: string
  shell: string
  isHerdr: boolean
  herdrVersion: string | null
  isWezterm: boolean
  weztermConfig: string | null
  isForced: boolean
}

/** One edit: the file, what it does, and its whole new text. */
export type Edit = { path: string; label: string; text: string }

/** What to change, what the person must do themselves, and what is fine already. */
export type Plan = { edits: Edit[]; manual: string[]; restart: string[] }

export const FORCE_VARIABLE = 'CLAUDE_CODE_FORCE_TERMINAL_IMAGES'

/** WezTerm's config with `enable_kitty_graphics = true`, or null when it is on or the file cannot be read for it. */
export function weztermEdit(text: string): string | null {
  if (/enable_kitty_graphics\s*=\s*true/.test(text)) return null
  if (/enable_kitty_graphics\s*=\s*false/.test(text)) return text.replace(/enable_kitty_graphics\s*=\s*false/, 'enable_kitty_graphics = true')
  // The usual shape: a config table returned at the end; set the field just before.
  const returned = /^return\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/m.exec(text)
  if (!returned) return null
  const line = `-- Pictures over the kitty graphics protocol (the persona crab in Claude Code, among others).\n${returned[1]}.enable_kitty_graphics = true\n\n`

  return text.slice(0, returned.index) + line + text.slice(returned.index)
}

/** herdr's config with `[experimental] kitty_graphics = true`; null when on already or herdr turns it on itself. */
export function herdrEdit(text: string, version: string | null): string | null {
  if (version !== null && isAtLeast(version, [0, 9])) return null
  if (/^\s*kitty_graphics\s*=\s*true/m.test(text)) return null
  if (/^\s*kitty_graphics\s*=\s*false/m.test(text)) return text.replace(/^(\s*kitty_graphics\s*=\s*)false/m, '$1true')
  const note = '# Pictures over the kitty graphics protocol, passed through to the terminal (on by default from herdr 0.9).\n'
  if (/^\[experimental\]\s*$/m.test(text)) return text.replace(/^\[experimental\]\s*$/m, `[experimental]\n${note}kitty_graphics = true`)

  return `${text.replace(/\n*$/, '\n')}\n[experimental]\n${note}kitty_graphics = true\n`
}

/** The shell profile with Claude Code told to draw pictures inside herdr only; null when it is there already. */
export function shellEdit(text: string, shell: string): string | null {
  if (text.includes(FORCE_VARIABLE)) return null
  const why =
    "# herdr's terminal (libghostty) draws pictures but is not on Claude Code's list of picture terminals;\n# tell Claude Code to draw them there (the persona crab, among others).\n"
  const line = shell === 'fish' ? `if set -q HERDR_ENV; set -gx ${FORCE_VARIABLE} 1; end` : `[[ -n $HERDR_ENV ]] && export ${FORCE_VARIABLE}=1`

  return `${text.replace(/\n*$/, '\n')}\n${why}${line}\n`
}

/** The profile a shell reads for interactive sessions. */
export function profileOf(home: string, shell: string): string | null {
  if (shell === 'zsh') return `${home}/.zshrc`
  if (shell === 'bash') return `${home}/.bashrc`
  if (shell === 'fish') return `${home}/.config/fish/config.fish`
  return null
}

function isAtLeast(version: string, wanted: number[]): boolean {
  const parts = (/(\d+(?:\.\d+)*)/.exec(version)?.[1] ?? '0').split('.').map(Number)
  for (let index = 0; index < wanted.length; index++) {
    const have = parts[index] ?? 0
    if (have !== wanted[index]) return have > wanted[index]!
  }
  return true
}

/**
 * The plan for this machine, from its setup and the current text of each file (undefined: missing).
 * Only the chain known to work is changed; anything else is described.
 */
export function planPictures(setup: Setup, files: Record<string, string | undefined>): Plan {
  const plan: Plan = { edits: [], manual: [], restart: [] }
  if (!setup.isWezterm && !setup.isHerdr) {
    plan.manual.push(
      'This terminal is neither WezTerm nor herdr. kitty and Ghostty show the crab as they are; other terminals show the role name.',
    )
    return plan
  }

  if (setup.isWezterm) {
    const path = setup.weztermConfig ?? `${setup.home}/.config/wezterm/wezterm.lua`
    const text = files[path]
    if (text === undefined) {
      plan.manual.push(`Add \`config.enable_kitty_graphics = true\` to your WezTerm config (none found at ${path}).`)
    } else {
      const next = weztermEdit(text)
      if (next !== null) {
        plan.edits.push({ path, label: 'WezTerm: turn on kitty graphics', text: next })
        plan.restart.push('Quit WezTerm (Cmd+Q) and open it again, so it starts with graphics on.')
      } else if (!/enable_kitty_graphics\s*=\s*true/.test(text)) {
        plan.manual.push(`Add \`enable_kitty_graphics = true\` to the config table in ${path}; its shape is not one this command edits.`)
      }
    }
  }

  if (setup.isHerdr) {
    const path = `${setup.home}/.config/herdr/config.toml`
    const next = herdrEdit(files[path] ?? '', setup.herdrVersion)
    if (next !== null) {
      plan.edits.push({ path, label: 'herdr: pass pictures through to the terminal', text: next })
      plan.restart.push('Run `herdr server reload-config`, or restart herdr.')
    }
    const profile = profileOf(setup.home, setup.shell)
    if (profile === null) {
      plan.manual.push(`Set ${FORCE_VARIABLE}=1 for Claude Code inside herdr in your shell's profile (${setup.shell} is not one this command edits).`)
    } else {
      const next = shellEdit(files[profile] ?? '', setup.shell)
      if (next !== null) {
        plan.edits.push({ path: profile, label: `${setup.shell}: let Claude Code draw pictures inside herdr`, text: next })
        if (!setup.isForced) plan.restart.push('Start Claude Code again from a new herdr pane, so it reads the new setting.')
      }
    }
  }

  return plan
}
