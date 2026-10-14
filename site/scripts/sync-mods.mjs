#!/usr/bin/env node
// Builds the site's mod pages from the registry: one page per mod from its
// README, plus mods.json for the showcase grid. Runs before dev and build.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(site, '..')
const REPO_URL = 'https://github.com/omeerdvrn/o-mods'
const MARKETPLACE = 'omeerdvrn/o-mods'
const PREVIEW_IMAGES = ['preview.gif', 'preview.webp', 'preview.png', 'preview.jpg']
// Recorded demos ship an MP4 next to the GIF; the site plays it, being far smaller.
const PREVIEW_VIDEO = 'preview.mp4'

const marketplace = JSON.parse(readFileSync(join(repo, '.claude-plugin/marketplace.json'), 'utf8'))

rmSync(join(site, 'mods'), { recursive: true, force: true })
rmSync(join(site, 'public/previews'), { recursive: true, force: true })
mkdirSync(join(site, 'mods'), { recursive: true })
mkdirSync(join(site, 'public/previews'), { recursive: true })

// The first fenced block right after the intro is the mod's terminal preview.
// A block under a later heading (install commands, examples) is not.
const previewOf = markdown => {
  const intro = markdown.split(/\n## /)[0]
  const block = intro.match(/```[a-z]*\n([\s\S]*?)```/)
  return block ? block[1].replace(/\s+$/, '') : undefined
}

// Links to files inside the mod point at GitHub; the site only has the README.
const linkFiles = (markdown, name) =>
  markdown.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, path) => `](${REPO_URL}/blob/main/mods/${name}/${path.replace(/^\.\//, '')})`)

const yaml = value => JSON.stringify(value)

const mods = marketplace.plugins.map(entry => {
  const dir = join(repo, entry.source)
  const manifest = JSON.parse(readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8'))
  const readme = readFileSync(join(dir, 'README.md'), 'utf8')

  const imageName = PREVIEW_IMAGES.find(file => existsSync(join(dir, file)))
  let image
  if (imageName) {
    image = `/previews/${entry.name}${imageName.slice(imageName.lastIndexOf('.'))}`
    copyFileSync(join(dir, imageName), join(site, 'public', image))
  }

  let video
  if (existsSync(join(dir, PREVIEW_VIDEO))) {
    video = `/previews/${entry.name}.mp4`
    copyFileSync(join(dir, PREVIEW_VIDEO), join(site, 'public', video))
  }

  const mod = {
    name: entry.name,
    description: manifest.description ?? entry.description,
    version: manifest.version ?? '0.0.0',
    author: manifest.author?.name ?? 'unknown',
    authorUrl: manifest.author?.url ?? (manifest.author?.name ? `https://github.com/${manifest.author.name}` : undefined),
    tags: manifest.keywords ?? [],
    preview: previewOf(readme),
    image,
    video,
    source: `${REPO_URL}/tree/main/mods/${entry.name}`,
    install: `claude plugin marketplace add ${MARKETPLACE} && claude plugin install ${entry.name}@o-mods`,
  }

  // The page is the README as is, with a header (author, tags, install)
  // under its title.
  // The README's own demo GIF is for GitHub; the page plays the MP4 instead.
  const withoutGif = readme.replace(/\n!\[[^\]]*\]\(preview\.gif\)\n/, '\n')
  const [title, ...rest] = linkFiles(withoutGif, entry.name).split('\n')
  const page = [
    '---',
    `title: ${yaml(entry.name)}`,
    `description: ${yaml(mod.description)}`,
    'outline: [2, 3]',
    '---',
    '',
    title,
    '',
    `<ModHeader name=${yaml(entry.name)} />`,
    ...(video
      ? ['', `<video class="mod-demo" src="${video}" autoplay muted loop playsinline aria-label="${entry.name} running in Claude Code"></video>`]
      : image
        ? ['', `![${entry.name} running in Claude Code](${image})`]
        : []),
    ...rest,
    '',
  ].join('\n')
  writeFileSync(join(site, 'mods', `${entry.name}.md`), page)
  return mod
})

writeFileSync(join(site, '.vitepress/mods.json'), JSON.stringify(mods, null, 2) + '\n')
console.log(`synced ${mods.length} mods`)
