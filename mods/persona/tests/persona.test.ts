import { expect, mock, test } from 'claude-code/testing'

import { crabFor, crabPicture, crabSvg } from '../hooks/crabs'
import { herdrEdit, planPictures, shellEdit, weztermEdit } from '../hooks/pictures'
import { BUILTIN, bashVerdict, bashWriteTargets, findPersona, globToRegExp, mergePersonas, writeVerdict } from '../hooks/personas'

const ROOT = '/repo'
const persona = (id: string) => findPersona(BUILTIN, id)!

test('globs span folders with ** and pick with braces', async () => {
  expect(globToRegExp('**/api/**').test('apps/web/src/api/user.ts')).toBe(true)
  expect(globToRegExp('**/api/**').test('api/user.ts')).toBe(true)
  expect(globToRegExp('**/*.{tsx,css}').test('src/Button.tsx')).toBe(true)
  expect(globToRegExp('**/*.{tsx,css}').test('src/Button.ts')).toBe(false)
  expect(globToRegExp('**/.env.*').test('.env.local')).toBe(true)
})

test('UI/UX may edit components and styles but not API, database or secrets', async () => {
  const ui = persona('ui-ux')
  expect(writeVerdict(ui, '/repo/src/components/Button.tsx', ROOT)).toBeUndefined()
  expect(writeVerdict(ui, '/repo/src/styles/theme.css', ROOT)).toBeUndefined()
  expect(writeVerdict(ui, '/repo/src/api/users.ts', ROOT)).toContain('off limits')
  expect(writeVerdict(ui, '/repo/app/api/users/route.ts', ROOT)).toContain('off limits')
  expect(writeVerdict(ui, '/repo/prisma/schema.prisma', ROOT)).toContain('off limits')
  expect(writeVerdict(ui, '/repo/db/migrations/001.sql', ROOT)).toContain('off limits')
  expect(writeVerdict(ui, '/repo/src/lib/auth.ts', ROOT)).toContain('outside')
  expect(writeVerdict(ui, '/repo/.env', ROOT)).toContain('off limits')
  // Outside the project only the deny list applies: scratch files and plans stay writable.
  expect(writeVerdict(ui, '/tmp/scratch/notes.md', ROOT)).toBeUndefined()
})

test('every persona keeps to its own files', async () => {
  expect(writeVerdict(persona('backend'), '/repo/src/api/users.ts', ROOT)).toBeUndefined()
  expect(writeVerdict(persona('backend'), '/repo/src/components/Button.tsx', ROOT)).toContain('off limits')
  expect(writeVerdict(persona('dev'), '/repo/src/components/Button.tsx', ROOT)).toBeUndefined()
  expect(writeVerdict(persona('dev'), '/repo/src/api/users.ts', ROOT)).toBeUndefined()
  expect(writeVerdict(persona('dev'), '/repo/.github/workflows/ci.yml', ROOT)).toContain('off limits')
  expect(writeVerdict(persona('dev'), '/repo/.env.production', ROOT)).toContain('off limits')
  expect(writeVerdict(persona('qa'), '/repo/src/api/users.test.ts', ROOT)).toBeUndefined()
  expect(writeVerdict(persona('qa'), '/repo/e2e/login.spec.ts', ROOT)).toBeUndefined()
  expect(writeVerdict(persona('qa'), '/repo/src/api/users.ts', ROOT)).toContain('outside')
  expect(writeVerdict(persona('docs'), '/repo/docs/setup.md', ROOT)).toBeUndefined()
  expect(writeVerdict(persona('docs'), '/repo/src/index.ts', ROOT)).toContain('outside')
  expect(writeVerdict(persona('pm'), '/repo/README.md', ROOT)).toContain('read-only')
  expect(writeVerdict(persona('pm'), '/tmp/plan.md', ROOT)).toBeUndefined()
})

test('shell commands are read for the files they write', async () => {
  expect(bashWriteTargets('echo hi > src/api/x.ts 2>&1').paths).toEqual(['src/api/x.ts'])
  expect(bashWriteTargets("sed -i '' 's/a/b/' src/api/x.ts").paths).toEqual(['src/api/x.ts'])
  expect(bashWriteTargets('cp src/api/x.ts src/components/y.ts').paths).toEqual(['src/components/y.ts'])
  expect(bashWriteTargets('git apply fix.patch').isOpaque).toBe(true)
  expect(bashWriteTargets('grep -r "a -> b" src | head').paths).toEqual([])
  // Operators inside quotes are text: a `|patch` in a grep pattern is not the patch command.
  expect(bashWriteTargets("grep -rhoE 'Endpoint\\.(get|post|put|patch|delete)' src | wc -l").isOpaque).toBe(false)
  expect(bashWriteTargets('echo "a; rm src/api/x.ts" > /dev/null').paths).toEqual([])
  expect(bashWriteTargets("awk '$5 > 0' f.txt 2>/dev/null").paths).toEqual([])
  expect(bashWriteTargets('ls x 2>err.log; cat a >>out.txt').paths).toEqual(['err.log', 'out.txt'])
  // A heredoc body is data for the command, never commands of its own.
  expect(bashWriteTargets("python3 - <<'EOF'\nrm = open('src/api/x.ts')\npatch = 1\nEOF\necho done").paths).toEqual([])
  expect(bashWriteTargets("cat <<EOF > notes.md\nhello\nEOF").paths).toEqual(['notes.md'])
  expect(bashWriteTargets("python3 - <<'EOF'\npatch = 1\nEOF").isOpaque).toBe(false)

  const ui = persona('ui-ux')
  expect(bashVerdict(ui, 'npx prisma migrate dev', ROOT, ROOT)).toContain('command')
  expect(bashVerdict(ui, 'rm src/api/users.ts', ROOT, ROOT)).toContain('off limits')
  expect(bashVerdict(ui, 'cat src/api/users.ts | head', ROOT, ROOT)).toBeUndefined()
  expect(bashVerdict(ui, 'npm run dev', ROOT, ROOT)).toBeUndefined()
  const dev = findPersona(BUILTIN, 'dev')!
  expect(bashVerdict(dev, "which xelatex typst 2>/dev/null; ls node_modules/.bin/ | grep -i playwright; sed -n 1,80p scripts/figures.ts", ROOT, ROOT)).toBeUndefined()
  expect(bashVerdict(dev, "for p in $(ls -d packages/*/); do grep -rhoE 'Api\\.(get|patch)' $p | wc -l; done", ROOT, ROOT)).toBeUndefined()
  expect(bashVerdict(persona('pm'), 'git log --oneline', ROOT, ROOT)).toBeUndefined()
  expect(bashVerdict(persona('pm'), 'git commit -m x', ROOT, ROOT)).toContain('command')
  expect(bashVerdict(persona('pm'), 'echo x > notes.md', ROOT, ROOT)).toContain('read-only')
})

test('persona files override and extend builtins', async () => {
  const merged = mergePersonas(BUILTIN, [[{ id: 'ui-ux', extraDeny: ['**/hooks/**'] }], [{ id: 'growth', name: 'Growth', writes: { allow: ['**/*.md'] } }]])
  expect(writeVerdict(findPersona(merged, 'ui-ux')!, '/repo/src/hooks/useUser.ts', ROOT)).toContain('off limits')
  expect(findPersona(merged, 'growth')?.name).toBe('Growth')
  expect(findPersona(merged, 'UI/UX Designer')?.id).toBe('ui-ux')
  expect(findPersona(merged, 'designer')?.id).toBe('ui-ux')
})

test('the command saves a persona and the guard denies writes outside it', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/home/me' })
  on('session.cwd', async () => ({ value: ROOT }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('fs.list', async () => ({ value: [] }) as never)
  on('fs.stat', async () => {
    throw new Error('ENOENT')
  })
  on('tool.call', async () => ({ result: 'ok' }) as never)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  const set = await $.command.run({ command: 'persona', args: 'ui-ux' } as never)
  expect(JSON.stringify(set)).toContain('UI/UX Designer')

  const blocked = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/api/users.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(blocked)).toContain('off limits')
  const allowed = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/components/Nav.tsx', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(allowed)).not.toContain('persona')

  await $.command.run({ command: 'persona', args: 'off' } as never)
  const free = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/api/users.ts', old_string: 'a', new_string: 'b' } as never)
  expect(JSON.stringify(free)).not.toContain('persona')
})

test('CLAUDE_PERSONA overrides the saved persona', async ($, on) => {
  mock.store(on, { active: 'dev' })
  mock.env(on, { HOME: '/home/me', CLAUDE_PERSONA: 'pm' })
  on('session.cwd', async () => ({ value: ROOT }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('fs.list', async () => ({ value: [] }) as never)
  on('tool.call', async () => ({ result: 'ok' }) as never)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  const status = await $.command.run({ command: 'persona', args: 'status' } as never)
  expect(JSON.stringify(status)).toContain('Product Manager')
  const blocked = await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: 'x' } as never)
  expect(JSON.stringify(blocked)).toContain('read-only')
})

test('every built-in persona has its own crab, four half-block rows by 16; a file persona gets the crab alone', async () => {
  const ids = ['ui-ux', 'dev', 'backend', 'qa', 'docs', 'pm']
  const drawn = ids.map(id => crabFor(id))
  for (const crab of drawn) {
    expect(crab).toHaveLength(4)
    for (const row of crab) expect(row).toHaveLength(16)
    // Only glyphs every font has.
    for (const row of crab) for (const cell of row) expect(' ▀▄█').toContain(cell.text)
  }
  expect(new Set(drawn.map(crab => JSON.stringify(crab))).size).toBe(ids.length)
  expect(crabFor('my-own-role')).toHaveLength(4)
})

test('the crab picture is 16×8 RGBA, transparent around the crab', async () => {
  const picture = crabPicture('dev')
  expect(picture.width).toBe(16)
  expect(picture.height).toBe(8)
  // 16 × 8 pixels × 4 bytes, base64 with padding.
  expect(picture.rgba.length).toBe(Math.ceil((16 * 8 * 4) / 3) * 4)
  expect(picture.rgba.startsWith('AAAA')).toBe(true)
  expect(new Set(['ui-ux', 'dev', 'backend', 'qa', 'docs', 'pm'].map(id => crabPicture(id).rgba)).size).toBe(6)
})

const WEZTERM = `local wezterm = require("wezterm")
local config = wezterm.config_builder()

config.font_size = 14.0

return config
`

test('pictures: WezTerm, herdr and the shell profile are each edited once, and only as needed', async () => {
  const wezterm = weztermEdit(WEZTERM)!
  expect(wezterm).toContain('config.enable_kitty_graphics = true\n\nreturn config')
  expect(weztermEdit(wezterm)).toBeNull()
  expect(weztermEdit('config.enable_kitty_graphics = false\nreturn config\n')).toContain('enable_kitty_graphics = true')
  // A config with no `return <table>` is not guessed at.
  expect(weztermEdit('return { font_size = 14 }\n')).toBeNull()

  const herdr = herdrEdit('[ui]\nagent_panel_sort = "priority"\n', '0.8.2')!
  expect(herdr).toContain('[experimental]')
  expect(herdr).toContain('kitty_graphics = true')
  expect(herdrEdit(herdr, '0.8.2')).toBeNull()
  // herdr 0.9 turns graphics on by itself.
  expect(herdrEdit('', '0.9.0')).toBeNull()

  const zsh = shellEdit('export PATH="$HOME/bin:$PATH"\n', 'zsh')!
  expect(zsh).toContain('[[ -n $HERDR_ENV ]] && export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1')
  expect(shellEdit(zsh, 'zsh')).toBeNull()
  expect(shellEdit('', 'fish')).toContain('if set -q HERDR_ENV; set -gx CLAUDE_CODE_FORCE_TERMINAL_IMAGES 1; end')
})

test('pictures: the plan covers the WezTerm-under-herdr chain and leaves other terminals alone', async () => {
  const setup = {
    home: '/u',
    shell: 'zsh',
    isHerdr: true,
    herdrVersion: 'herdr 0.8.2',
    isWezterm: true,
    weztermConfig: '/u/.config/wezterm/wezterm.lua',
    isForced: false,
  }
  const fresh = planPictures(setup, { '/u/.config/wezterm/wezterm.lua': WEZTERM, '/u/.config/herdr/config.toml': '', '/u/.zshrc': '' })
  expect(fresh.edits.map(edit => edit.path)).toEqual(['/u/.config/wezterm/wezterm.lua', '/u/.config/herdr/config.toml', '/u/.zshrc'])
  expect(fresh.restart.length).toBeGreaterThan(0)

  const done = Object.fromEntries(fresh.edits.map(edit => [edit.path, edit.text]))
  expect(planPictures({ ...setup, isForced: true }, done).edits).toEqual([])

  const other = planPictures({ ...setup, isHerdr: false, isWezterm: false }, {})
  expect(other.edits).toEqual([])
  expect(other.manual[0]).toContain('kitty and Ghostty')
})

test('on the desktop the crab is SVG: one square per pixel, crisp edges', async () => {
  const svg = crabSvg('dev')
  expect(svg).toContain('viewBox="0 0 16 8"')
  expect(svg).toContain('shape-rendering="crispEdges"')
  expect(svg).toContain('fill="#D4826A"')
  expect(svg).not.toBe(crabSvg('pm'))
})
