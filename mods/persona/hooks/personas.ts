// Persona definitions and the pure checks the hooks run against them.

export type Persona = {
  id: string
  name: string
  /** Shown in `/persona list`. */
  summary: string
  /** Added to the system prompt while the persona is active. */
  prompt: string
  /** `none`: no file inside the project may be written. */
  writes: 'none' | { allow?: string[]; deny?: string[] }
  /** Regular expressions; a Bash command matching any of them is denied. */
  bashDeny?: string[]
}

/** A persona file under `~/.claude/personas/` or `<project>/.claude/personas/`. */
export type PersonaFile = Partial<Persona> & {
  extraAllow?: string[]
  extraDeny?: string[]
  extraBashDeny?: string[]
}

const SECRETS = ['**/.env', '**/.env.*', '**/*.{pem,key,p12,pfx}', '**/{secrets,.secrets}/**']

const INFRA = [
  '**/{infra,infrastructure,terraform,k8s,kubernetes,helm,deploy,deployment,ops}/**',
  '**/*.tf',
  '**/Dockerfile*',
  '**/docker-compose*.{yml,yaml}',
  '**/compose*.{yml,yaml}',
  '.github/workflows/**',
  '.gitlab-ci.yml',
]

const BACKEND = [
  '**/{api,apis,server,backend,services,controllers,routes,handlers,resolvers,graphql,trpc,middleware,middlewares}/**',
  '**/{db,database,models,entities,repositories,migrations,migration,prisma,drizzle,seeds,seeders,sql,queries}/**',
  '**/*.{sql,prisma,graphql,gql}',
  '**/route.{ts,js}',
  '**/*.server.*',
  '**/server.{ts,js,mjs,cjs}',
]

const UI = [
  '**/*.{tsx,jsx,vue,svelte,astro,css,scss,sass,less,styl}',
  '**/{components,styles,theme,themes,public,static,assets}/**',
  '**/tailwind.config.*',
  '**/postcss.config.*',
]

const DB_COMMANDS = [
  '\\bprisma\\s+(migrate|db\\s+(push|execute|seed))',
  '\\bdrizzle-kit\\s+(push|migrate|drop)',
  '\\balembic\\s+(upgrade|downgrade|revision)',
  '\\b(rails|rake)\\s+db:',
  '\\bknex\\s+(migrate|seed)',
  '\\bsequelize(-cli)?\\s+db:',
  '\\bsupabase\\s+(db|migration)\\b',
  '\\bflyway\\b',
  '\\b(psql|mysql|mongosh|mongo|sqlite3|redis-cli)\\b',
  '\\bmanage\\.py\\s+(migrate|makemigrations|flush|loaddata)',
]

const RELEASE_COMMANDS = ['\\b(terraform|tofu)\\s+(apply|destroy|import)', '\\bkubectl\\s+(apply|delete|edit|patch|scale|rollout)', '\\bhelm\\s+(install|upgrade|uninstall|rollback)']

const NO_API =
  'Never change API routes, request or response shapes, database schema, migrations, queries, server code or auth. When a design needs a backend change, stop and write the change you need as a note for a developer instead.'

export const BUILTIN: Persona[] = [
  {
    id: 'ui-ux',
    name: 'UI/UX Designer',
    summary: 'Components, styles, layout and assets only. API, server and database are off limits.',
    prompt: `The person you are working with is a UI/UX designer. Focus on visual design, layout, interaction states, copy, responsiveness and accessibility. ${NO_API} Explain changes in design terms, with the visible result first.`,
    writes: {
      allow: [
        '**/*.{tsx,jsx,vue,svelte,astro,html,css,scss,sass,less,styl}',
        '**/*.{svg,png,jpg,jpeg,gif,webp,avif,ico,woff,woff2,ttf,otf}',
        '**/{components,ui,styles,theme,themes,tokens,assets,public,static,pages,app,views,layouts,icons,fonts,stories}/**',
        '**/*.stories.*',
        '**/tailwind.config.*',
        '**/postcss.config.*',
      ],
      deny: [...BACKEND, ...SECRETS, ...INFRA],
    },
    bashDeny: [...DB_COMMANDS, ...RELEASE_COMMANDS],
  },
  {
    id: 'backend',
    name: 'Backend Developer',
    summary: 'API, server, database and business logic. UI files are off limits.',
    prompt:
      'The person you are working with is a backend developer. Focus on APIs, data models, migrations, performance and correctness. Do not change UI components, styles or frontend assets; when an API change affects the UI, describe what the frontend needs instead of editing it.',
    writes: { deny: [...UI, ...SECRETS] },
    bashDeny: RELEASE_COMMANDS,
  },
  {
    id: 'dev',
    name: 'Developer',
    summary: 'All application code, frontend and backend. Secrets, CI and infrastructure are off limits.',
    prompt:
      'The person you are working with is a full-stack developer. Work on any application code, tests and docs. Do not edit secrets, CI pipelines, deployment or infrastructure files, and do not run deploy or infrastructure-changing commands; describe those changes for whoever owns them instead.',
    writes: { deny: [...SECRETS, ...INFRA] },
    bashDeny: RELEASE_COMMANDS,
  },
  {
    id: 'qa',
    name: 'QA Engineer',
    summary: 'Tests, fixtures and test config only. Application code is off limits.',
    prompt:
      'The person you are working with is a QA engineer. Focus on test plans, test cases, reproduction steps and coverage. Write and fix tests, fixtures and test config only. When a test exposes a bug in application code, report it with a reproduction instead of fixing the code.',
    writes: {
      allow: [
        '**/*.{test,spec}.*',
        '**/*_{test,spec}.*',
        '**/test_*.py',
        '**/{test,tests,__tests__,e2e,cypress,playwright,spec,specs,fixtures,__fixtures__,__mocks__,mocks,__snapshots__}/**',
        '**/{jest,vitest,playwright,cypress}.config.*',
        '**/*.snap',
      ],
      deny: SECRETS,
    },
    bashDeny: [...DB_COMMANDS.filter(command => !command.includes('psql|mysql')), ...RELEASE_COMMANDS],
  },
  {
    id: 'docs',
    name: 'Technical Writer',
    summary: 'Documentation and Markdown only. Code is off limits.',
    prompt:
      'The person you are working with writes documentation. Focus on clear, accurate docs, READMEs, guides and changelogs. Read code to understand it, but never change code; when the docs reveal a bug or a missing feature, describe it instead.',
    writes: {
      allow: ['**/*.{md,mdx,rst,txt,adoc}', '**/{docs,doc,documentation}/**', '**/README*', '**/CHANGELOG*'],
      deny: SECRETS,
    },
    bashDeny: [...DB_COMMANDS, ...RELEASE_COMMANDS],
  },
  {
    id: 'pm',
    name: 'Product Manager',
    summary: 'Read-only. Explains, explores and plans; changes no project file.',
    prompt:
      'The person you are working with is a product manager. Answer questions about how the product and code behave, explore the codebase, estimate scope and write plans, specs and tickets in the conversation. Do not change any file in the project and do not run commands that change state; when work is needed, describe it as a task for the team.',
    writes: 'none',
    bashDeny: [...DB_COMMANDS, ...RELEASE_COMMANDS, '\\bgit\\s+(commit|push|merge|rebase|reset|revert|cherry-pick|stash|tag|branch\\s+-[dDmM]|clean)', '\\b(npm|pnpm|yarn|bun)\\s+(i|install|add|remove|uninstall|update|upgrade|publish)\\b'],
  },
]

/** Builtins with machine-level then project-level files laid over them, matched by id. */
export function mergePersonas(builtins: Persona[], layers: PersonaFile[][]): Persona[] {
  const byId = new Map(builtins.map(persona => [persona.id, persona]))
  for (const files of layers) {
    for (const file of files) {
      if (!file.id) continue
      const base: Persona = byId.get(file.id) ?? {
        id: file.id,
        name: file.name ?? file.id,
        summary: '',
        prompt: '',
        writes: {},
      }
      const { extraAllow, extraDeny, extraBashDeny, ...fields } = file
      const merged: Persona = { ...base, ...fields } as Persona
      if (merged.writes !== 'none' && (extraAllow || extraDeny)) {
        merged.writes = {
          allow: merged.writes.allow || extraAllow ? [...(merged.writes.allow ?? []), ...(extraAllow ?? [])] : undefined,
          deny: [...(merged.writes.deny ?? []), ...(extraDeny ?? [])],
        }
      }
      if (extraBashDeny) merged.bashDeny = [...(merged.bashDeny ?? []), ...extraBashDeny]
      byId.set(merged.id, merged)
    }
  }

  return [...byId.values()]
}

/** Accepts `ui-ux`, `UI/UX Designer`, `uiux`, `designer`. */
export function findPersona(personas: Persona[], wanted: string): Persona | undefined {
  const key = squash(wanted)
  if (!key) return undefined

  return (
    personas.find(persona => squash(persona.id) === key) ??
    personas.find(persona => squash(persona.name) === key) ??
    personas.find(persona => squash(persona.name).includes(key))
  )
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const globCache = new Map<string, RegExp>()

/** `**` spans folders, `*` and `?` stay inside one, `{a,b}` picks one. */
export function globToRegExp(glob: string): RegExp {
  const cached = globCache.get(glob)
  if (cached) return cached
  let out = ''
  let depth = 0
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!
    if (char === '*') {
      if (glob[i + 1] === '*') {
        const isFolder = glob[i + 2] === '/'
        out += isFolder ? '(?:.*/)?' : '.*'
        i += isFolder ? 2 : 1
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') out += '[^/]'
    else if (char === '{') {
      out += '(?:'
      depth++
    } else if (char === '}' && depth > 0) {
      out += ')'
      depth--
    } else if (char === ',' && depth > 0) out += '|'
    else out += /[.+^$()|[\]\\]/.test(char) ? `\\${char}` : char
  }
  const regExp = new RegExp(`^${out}$`)
  globCache.set(glob, regExp)

  return regExp
}

function matchesAny(globs: string[] | undefined, path: string): boolean {
  return (globs ?? []).some(glob => globToRegExp(glob).test(path))
}

/** The path relative to the project, or undefined when it lies outside it. */
export function inProject(path: string, root: string): string | undefined {
  const clean = path.replace(/\/+$/, '')
  if (clean === root) return ''
  const base = root.endsWith('/') ? root : `${root}/`

  return clean.startsWith(base) ? clean.slice(base.length) : undefined
}

export function absolute(path: string, cwd: string): string {
  if (path.startsWith('/')) return normalize(path)

  return normalize(`${cwd}/${path}`)
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }

  return `/${parts.join('/')}`
}

/**
 * Why the persona may not write `path`, or undefined when it may. Inside the
 * project every rule applies; outside it (scratch files, memory, plans) only
 * the deny list does.
 */
export function writeVerdict(persona: Persona, path: string, root: string): string | undefined {
  const relative = inProject(path, root)
  const writes = persona.writes
  if (writes === 'none') return relative === undefined ? undefined : 'this persona is read-only'
  const shown = relative ?? path
  if (matchesAny(writes.deny, shown) || (relative !== undefined && matchesAny(writes.deny, path))) {
    return `${shown} is off limits for this persona`
  }
  if (relative !== undefined && writes.allow && !matchesAny(writes.allow, relative)) {
    return `${shown} is outside what this persona may edit`
  }

  return undefined
}

const REWRITERS = new Set(['rm', 'rmdir', 'mv', 'touch', 'mkdir', 'truncate', 'chmod', 'chown', 'unlink', 'shred'])
const COPIERS = new Set(['cp', 'ln', 'install', 'rsync', 'ditto', 'scp'])
const OPAQUE = /^(?:patch|git\s+apply|git\s+am)\b/

/** A word as the shell reads it; `isRedirect` marks an unquoted `>`/`>>` (with its fd, if any). */
type Word = { text: string; isRedirect: boolean }

/**
 * Splits a command into simple commands of words, as the shell would: quotes and backslashes keep
 * operators literal (a `|` inside `'get|patch'` splits nothing), and heredoc bodies are data, not commands.
 */
function segments(command: string): Word[][] {
  const all: Word[][] = []
  let words: Word[] = []
  let text = ''
  let hasWord = false
  let isRedirect = false
  const heredocs: { tag: string; isIndented: boolean }[] = []

  const endWord = () => {
    if (hasWord) words.push({ text, isRedirect })
    text = ''
    hasWord = false
    isRedirect = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) all.push(words)
    words = []
  }

  let i = 0
  while (i < command.length) {
    const char = command[i]!
    if (char === '\\') {
      if (command[i + 1] !== '\n') {
        text += command[i + 1] ?? ''
        hasWord = true
      }
      i += 2
    } else if (char === "'") {
      const close = command.indexOf("'", i + 1)
      const stop = close < 0 ? command.length : close
      text += command.slice(i + 1, stop)
      hasWord = true
      i = stop + 1
    } else if (char === '"') {
      i++
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < command.length) i++
        text += command[i]
        i++
      }
      hasWord = true
      i++
    } else if (char === '#' && !hasWord) {
      while (i < command.length && command[i] !== '\n') i++
    } else if (char === '\n') {
      endCommand()
      i++
      // Heredoc bodies start on the next line and run to their tag: skip them.
      for (const { tag, isIndented } of heredocs.splice(0)) {
        while (i < command.length) {
          const lineEnd = command.indexOf('\n', i)
          const stop = lineEnd < 0 ? command.length : lineEnd
          const line = command.slice(i, stop)
          i = stop + 1
          if ((isIndented ? line.replace(/^\t+/, '') : line) === tag) break
        }
      }
    } else if (char === '<' && command[i + 1] === '<' && command[i + 2] !== '<') {
      endWord()
      i += 2
      const isIndented = command[i] === '-'
      if (isIndented) i++
      while (command[i] === ' ' || command[i] === '\t') i++
      const tag = command.slice(i).match(/^(['"]?)([\w.-]+)\1/)
      if (tag) {
        heredocs.push({ tag: tag[2]!, isIndented })
        i += tag[0].length
      }
    } else if (char === '>') {
      // A redirect: its fd (`2>`) or `&>` sticks to it; the target is the next word or the rest of this one.
      const fd = /^\d+$/.test(text) || text === '&' ? text : ''
      if (fd === '') endWord()
      text = ''
      hasWord = false
      i += command[i + 1] === '>' || command[i + 1] === '|' ? 2 : 1
      if (command[i] === '&') {
        // `>&2`, `2>&1`: a duplicated fd, not a file.
        while (i < command.length && /[&\d-]/.test(command[i]!)) i++
        continue
      }
      while (command[i] === ' ' || command[i] === '\t') i++
      words.push({ text: '>', isRedirect: true })
    } else if (char === ';' || char === '|' || char === '&' || char === '(' || char === ')') {
      endCommand()
      i++
    } else if (char === ' ' || char === '\t') {
      endWord()
      i++
    } else {
      text += char
      hasWord = true
      i++
    }
  }
  endCommand()

  return all
}

export type BashTargets = { paths: string[]; isOpaque: boolean }

/** The files a command visibly writes: redirect targets, `tee`, `sed -i`, `rm`, `mv`, copy destinations. */
export function bashWriteTargets(command: string): BashTargets {
  const paths: string[] = []
  let isOpaque = false
  for (const segment of segments(command)) {
    const plain: string[] = []
    for (let i = 0; i < segment.length; i++) {
      if (!segment[i]!.isRedirect) {
        plain.push(segment[i]!.text)
        continue
      }
      const target = segment[i + 1]
      if (target && !target.isRedirect) {
        if (target.text !== '/dev/null') paths.push(target.text)
        i++
      }
    }
    let words = plain
    while (words.length > 0 && /^\w+=/.test(words[0]!)) words = words.slice(1)
    if (words[0] === 'sudo' || words[0] === 'command' || words[0] === 'env') words = words.slice(1)
    const [head, ...rest] = words
    if (!head) continue
    const args = rest.filter(word => !word.startsWith('-'))
    if (OPAQUE.test(words.join(' '))) isOpaque = true
    else if (REWRITERS.has(head) || head === 'tee') paths.push(...args)
    else if (COPIERS.has(head) && args.length > 1) paths.push(args[args.length - 1]!)
    else if ((head === 'sed' || head === 'perl') && rest.some(word => /^-[a-zA-Z]*i/.test(word))) {
      const operands = rest.filter((word, i) => !word.startsWith('-') && !(head === 'sed' && rest[i - 1] === '-i' && word === ''))
      const hasScriptFlag = rest.includes('-e')
      paths.push(...operands.slice(hasScriptFlag ? 0 : 1).filter(word => word !== ''))
    } else if (head === 'git' && ['checkout', 'restore', 'rm', 'mv'].includes(args[0] ?? '')) {
      const dashes = rest.indexOf('--')
      paths.push(...(dashes >= 0 ? rest.slice(dashes + 1) : args.slice(1)))
    }
  }

  return { paths, isOpaque }
}

/** Why the persona may not run `command`, or undefined when it may. */
export function bashVerdict(persona: Persona, command: string, cwd: string, root: string): string | undefined {
  const pattern = (persona.bashDeny ?? []).find(source => new RegExp(source).test(command))
  if (pattern) return 'this command is off limits for this persona'
  const isRestricted = persona.writes === 'none' || Boolean(persona.writes.allow?.length || persona.writes.deny?.length)
  if (!isRestricted) return undefined
  const { paths, isOpaque } = bashWriteTargets(command)
  if (isOpaque) return 'it applies changes whose files the persona cannot check; use Edit or Write instead'
  for (const path of paths) {
    const verdict = writeVerdict(persona, absolute(path, cwd), root)
    if (verdict) return verdict
  }

  return undefined
}
