import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import ModLayout from './components/ModLayout.vue'
import ShowcaseHome from './components/ShowcaseHome.vue'
import InstallCommand from './components/InstallCommand.vue'
import './tokens.css'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    // VitePress renders a globally registered component named after `layout:` in frontmatter.
    app.component('mod', ModLayout)
    app.component('showcase', ShowcaseHome)
    app.component('InstallCommand', InstallCommand)
  },
} satisfies Theme
