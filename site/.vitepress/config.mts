import { defineConfig } from 'vitepress'

const REPO_URL = 'https://github.com/omeerdvrn/o-mods'

export default defineConfig({
  title: 'o-mods',
  titleTemplate: ':title | o-mods',
  description:
    'Open-source mods for Claude Code: pixel scenes, a usage bar, PR status, themes and more. See each one running, then install it with one command. Not affiliated with Anthropic.',
  base: '/o-mods/',
  cleanUrls: true,
  lastUpdated: true,
  appearance: true,
  head: [
    ['link', { rel: 'icon', href: '/o-mods/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#d97757' }],
  ],
  themeConfig: {
    logo: { src: '/crabs/dev.svg', alt: '' },
    siteTitle: 'o-mods',
    nav: [
      { text: 'Mods', link: '/#mods', activeMatch: '^(index|mods/)' },
      { text: 'Install', link: '/guide/install' },
      { text: 'Contribute', link: '/guide/contributing' },
    ],
    // No docs sidebar anywhere: the home page and search are the index.
    sidebar: false,
    socialLinks: [{ icon: 'github', link: REPO_URL, ariaLabel: 'GitHub' }],
    skipToContentLabel: 'Skip to content',
    darkModeSwitchLabel: 'Switch between light and dark',
    lightModeSwitchTitle: 'Switch between light and dark',
    darkModeSwitchTitle: 'Switch between light and dark',
    outline: false,
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Search mods', buttonAriaLabel: 'Search mods' },
          modal: { noResultsText: 'No mods match', displayDetails: 'Show details' },
        },
        // Mod pages draw their name and pitch in the layout, so index them here.
        // (Same as the default, plus the title and pitch.)
        async _render(src, env, md) {
          if (env.frontmatter?.search === false) return ''
          const html = await md.render(src, env)
          if (env.frontmatter?.layout === 'mod') {
            return `<h1>${env.frontmatter.title}</h1><p>${env.frontmatter.description}</p>${html}`
          }
          return html
        },
      },
    },
    editLink: {
      // Serialized into the client bundle, so it cannot use REPO_URL.
      pattern: ({ filePath }) =>
        filePath.startsWith('mods/')
          ? `https://github.com/omeerdvrn/o-mods/edit/main/mods/${filePath.slice(5, -3)}/README.md`
          : `https://github.com/omeerdvrn/o-mods/edit/main/site/${filePath}`,
      text: 'Edit this page on GitHub',
    },
  },
})
