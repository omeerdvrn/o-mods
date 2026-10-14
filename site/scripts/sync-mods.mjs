#!/usr/bin/env node
// Builds the site's mod pages from the registry: one page per mod from its
// README, plus mods.json for the showcase. Runs before dev and build.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(site, '..')
const REPO_URL = 'https://github.com/omeerdvrn/o-mods'
const MARKETPLACE = 'omeerdvrn/o-mods'
// The site groups mods by these, in this order (see CONTRIBUTING.md).
const CATEGORIES = ['fun', 'status', 'workflow']

const marketplace = JSON.parse(readFileSync(join(repo, '.claude-plugin/marketplace.json'), 'utf8'))

rmSync(join(site, 'mods'), { recursive: true, force: true })
rmSync(join(site, 'public/previews'), { recursive: true, force: true })
mkdirSync(join(site, 'mods'), { recursive: true })
mkdirSync(join(site, 'public/previews'), { recursive: true })

// The README's demo line: ![<what the demo shows>](preview.gif). Its alt text
// is the demo's description on the site, for people who can't watch it.
const GIF_LINE = /\n!\[([^\]]*)\]\(preview\.gif\)\n/

// Links to files inside the mod point at GitHub; the site only has the README.
const linkFiles = (markdown, name) =>
  markdown.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, path) => `](${REPO_URL}/blob/main/mods/${name}/${path.replace(/^\.\//, '')})`)

// The layout draws its own Install block, so the README's "## Install" section
// loses its install commands. Anything else in it (a mod-specific note, like
// usage-bar's statusLine warning) stays under "## Before you install".
const trimInstall = markdown => {
  const lines = markdown.split('\n')
  const start = lines.findIndex(l => /^## Install\s*$/.test(l))
  if (start === -1) return markdown
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  if (end === -1) end = lines.length
  const body = lines.slice(start + 1, end).join('\n')
    .replace(/```[^\n]*\n[^`]*claude plugin[^`]*```/g, '')
    .replace(/^In a terminal, run:\s*$/gm, '')
    .replace(/^The first command adds the marketplace[^\n]*$/gm, '')
    .trim()
  const kept = body ? ['## Before you install', '', body, ''] : []
  return [...lines.slice(0, start), ...kept, ...lines.slice(end)].join('\n')
}

const yaml = value => JSON.stringify(value)

const copyPublic = (from, to) => {
  if (!existsSync(from)) return undefined
  copyFileSync(from, join(site, 'public', to))
  return to
}

const mods = marketplace.plugins.map(entry => {
  if (!CATEGORIES.includes(entry.category)) throw new Error(`${entry.name}: marketplace.json needs a "category": one of ${CATEGORIES.join(', ')}`)
  const dir = join(repo, entry.source)
  const manifest = JSON.parse(readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8'))
  const readme = readFileSync(join(dir, 'README.md'), 'utf8')

  const mod = {
    name: entry.name,
    category: entry.category,
    // The short pitch from the marketplace; the longer description from the plugin.
    pitch: entry.description,
    description: manifest.description ?? entry.description,
    demoDescription: readme.match(GIF_LINE)?.[1] ?? entry.description,
    version: manifest.version ?? '0.0.0',
    author: manifest.author?.name ?? 'unknown',
    authorUrl: manifest.author?.url ?? (manifest.author?.name ? `https://github.com/${manifest.author.name}` : undefined),
    tags: manifest.keywords ?? [],
    video: copyPublic(join(dir, 'preview.mp4'), `/previews/${entry.name}.mp4`),
    poster: copyPublic(join(dir, 'preview.jpg'), `/previews/${entry.name}.jpg`),
    gif: copyPublic(join(dir, 'preview.gif'), `/previews/${entry.name}.gif`),
    source: `${REPO_URL}/tree/main/mods/${entry.name}`,
    install: [`claude plugin marketplace add ${MARKETPLACE}`, `claude plugin install ${entry.name}@o-mods`],
  }

  // The page: the README's body under the mod layout, which draws the title,
  // pitch, demo and install itself. The README's title and its demo GIF line
  // (for GitHub) are left out.
  const body = trimInstall(linkFiles(readme.replace(GIF_LINE, '\n'), entry.name)).replace(/^# .*\n/, '')
  const page = [
    '---',
    `title: ${yaml(entry.name)}`,
    `description: ${yaml(`${mod.pitch} Install ${entry.name} for Claude Code with one command.`)}`,
    `pitch: ${yaml(mod.pitch)}`,
    'layout: mod',
    `mod: ${yaml(entry.name)}`,
    'outline: [2, 3]',
    '---',
    body,
  ].join('\n')
  writeFileSync(join(site, 'mods', `${entry.name}.md`), page)
  return mod
})

// Listed in category order, keeping the marketplace's order within each.
mods.sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))

writeFileSync(join(site, '.vitepress/mods.json'), JSON.stringify(mods, null, 2) + '\n')
console.log(`synced ${mods.length} mods`)
