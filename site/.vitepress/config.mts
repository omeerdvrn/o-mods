import { defineConfig } from 'vitepress'
import mods from './mods.json' with { type: 'json' }

const REPO_URL = 'https://github.com/omeerdvrn/o-mods'

export default defineConfig({
  title: 'o-mods',
  description: 'Open-source mods for Claude Code: panes, sidebars, bands and hooks that run inside your sessions.',
  base: '/o-mods/',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',
  head: [
    ['link', { rel: 'icon', href: '/o-mods/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#d97757' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Mods', link: '/#mods' },
      { text: 'Install', link: '/guide/install' },
      { text: 'Contribute', link: '/guide/contributing' },
    ],
    sidebar: {
      '/': [
        {
          text: 'Guide',
          items: [
            { text: 'Install a mod', link: '/guide/install' },
            { text: 'Contribute', link: '/guide/contributing' },
          ],
        },
        {
          text: 'Mods',
          items: mods.map(mod => ({ text: mod.name, link: `/mods/${mod.name}` })),
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    search: { provider: 'local' },
    editLink: {
      // Serialized into the client bundle, so it cannot use REPO_URL.
      pattern: ({ filePath }) =>
        filePath.startsWith('mods/')
          ? `https://github.com/omeerdvrn/o-mods/edit/main/mods/${filePath.slice(5, -3)}/README.md`
          : `https://github.com/omeerdvrn/o-mods/edit/main/site/${filePath}`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License. Not affiliated with Anthropic.',
      copyright: 'omeerdvrn and o-mods contributors',
    },
  },
})
