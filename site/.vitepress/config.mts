import { defineConfig } from 'vitepress'
import { copy } from './theme/copy'

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
  // The 404 page's <title> says what happened, not just "404".
  transformHtml(code, id) {
    return id.endsWith('404.html') ? code.replace(/<title>[^<]*<\/title>/, `<title>${copy.notFound.title} | o-mods</title>`) : code
  },
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
          button: { buttonText: copy.search.button, buttonAriaLabel: copy.search.button },
          modal: { noResultsText: copy.search.noResults, displayDetails: 'Show details' },
        },
        // Mod pages draw their name and pitch in the layout, so index them here:
        // the name becomes the page's h1 (with an anchor, which the indexer needs),
        // the pitch its text, and every README section is listed as "mod > section".
        async _render(src, env, md) {
          if (env.frontmatter?.search === false) return ''
          const html = await md.render(src, env)
          if (env.frontmatter?.layout === 'mod') {
            const { mod, pitch } = env.frontmatter
            return `<h1 id="top-of-page">${mod} <a class="header-anchor" href="#top-of-page"></a></h1><p>${pitch ?? env.frontmatter.description}</p>${html}`
          }
          return html
        },
        miniSearch: {
          searchOptions: {
            boost: { title: 4, text: 2, titles: 3 },
            // Mods first, then guides. Serialized into the client: keep it self-contained.
            boostDocument: (id: string) => (id.includes('/mods/') ? 2 : id.includes('/guide/') ? 0.5 : 1),
          },
        },
      },
    },
    editLink: {
      // Serialized into the client bundle, so it cannot use REPO_URL.
      pattern: ({ filePath }) =>
        filePath.startsWith('mods/')
          ? `https://github.com/omeerdvrn/o-mods/edit/main/mods/${filePath.slice(5, -3)}/README.md`
          : `https://github.com/omeerdvrn/o-mods/edit/main/site/${filePath}`,
      text: copy.editPage,
    },
  },
})
