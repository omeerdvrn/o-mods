#!/usr/bin/env node
// Checks that every mod folder, the marketplace and the README table agree,
// and that no secrets slipped into the repository. Run from the repo root.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const errors = []
const fail = message => errors.push(message)

const readJson = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${relative(root, path)}: ${error.message}`)
    return undefined
  }
}

// The site groups mods by these; see CONTRIBUTING.md.
const CATEGORIES = ['fun', 'status', 'workflow']

const marketplace = readJson(join(root, '.claude-plugin/marketplace.json')) ?? { plugins: [] }
const listed = new Map(marketplace.plugins.map(plugin => [plugin.name, plugin]))
const folders = readdirSync(join(root, 'mods')).filter(name => statSync(join(root, 'mods', name)).isDirectory())
const readme = readFileSync(join(root, 'README.md'), 'utf8')

for (const name of folders) {
  const dir = join(root, 'mods', name)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) fail(`mods/${name}: folder name must be lowercase words joined by -`)

  // A mod still in testing has a .unlisted file: kept out of the marketplace,
  // the README and the site until it's ready.
  const unlisted = existsSync(join(dir, '.unlisted'))
  const entry = listed.get(name)
  if (unlisted && entry) fail(`mods/${name}: has .unlisted but is in marketplace.json`)
  else if (!unlisted && !entry) fail(`mods/${name}: missing from .claude-plugin/marketplace.json (or add a .unlisted file while it's in testing)`)
  else if (entry && entry.source !== `./mods/${name}`) fail(`marketplace.json: ${name} source should be ./mods/${name}`)
  if (entry && !CATEGORIES.includes(entry.category)) fail(`marketplace.json: ${name} needs a "category": one of ${CATEGORIES.join(', ')}`)

  const manifestPath = join(dir, '.claude-plugin/plugin.json')
  if (!existsSync(manifestPath)) fail(`mods/${name}: missing .claude-plugin/plugin.json`)
  else {
    const manifest = readJson(manifestPath)
    if (manifest && manifest.name !== name) fail(`mods/${name}/plugin.json: name is "${manifest.name}", expected "${name}"`)
    if (manifest && !manifest.description) fail(`mods/${name}/plugin.json: missing description`)
    if (manifest && !manifest.author?.name) fail(`mods/${name}/plugin.json: missing author.name`)
  }

  const modReadme = join(dir, 'README.md')
  if (!existsSync(modReadme)) fail(`mods/${name}: missing README.md`)
  else if (!readFileSync(modReadme, 'utf8').startsWith(`# ${name}`)) fail(`mods/${name}/README.md: must start with "# ${name}"`)

  if (unlisted && readme.includes(`(mods/${name})`)) fail(`README.md: ${name} is unlisted; take it out of the README`)
  if (!unlisted && !readme.includes(`[${name}](mods/${name})`)) fail(`README.md: add [${name}](mods/${name}) to the mods`)
}

for (const name of listed.keys()) {
  if (!folders.includes(name)) fail(`marketplace.json lists "${name}" but mods/${name} does not exist`)
}

// Secrets: the patterns real keys have. Test fixtures that need a fake key
// must use an obviously fake one: sk-ant-abc…xyz, a line marked "fake", or a
// documented example key (AWS's AKIA…EXAMPLE).
const SECRET = /(sk-ant-[A-Za-z0-9_-]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|lin_api_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/
// Someone's real home folder. Generic ones (/Users/dev, /home/user) are fine.
const HOME_PATH = /\/(Users|home)\/(?!(dev|user|me|you|runner|example)\b)[a-z][\w.-]*\//
const SKIP = new Set(['node_modules', '.git', '.vitepress', 'dist', 'cache', '__pycache__', '.DS_Store'])
const walk = dir => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (statSync(path).size < 1_000_000) {
      readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
        if (SECRET.test(line) && !/fake|example|abcdefghijklmnop/i.test(line)) fail(`${relative(root, path)}:${index + 1}: looks like a secret`)
        if (HOME_PATH.test(line)) fail(`${relative(root, path)}:${index + 1}: a real home path; use {{HOME}}, $HOME or ~ instead`)
      })
    }
  }
}
walk(root)

if (errors.length) {
  console.error(`✘ ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n` + errors.map(error => `  - ${error}`).join('\n'))
  process.exit(1)
}
const testing = folders.filter(name => existsSync(join(root, 'mods', name, '.unlisted')))
console.log(`✓ ${folders.length - testing.length} mods listed${testing.length ? `, ${testing.length} in testing (${testing.join(', ')})` : ''}; marketplace and README agree; no secrets found`)
