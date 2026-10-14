import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import ModGrid from './components/ModGrid.vue'
import ModHeader from './components/ModHeader.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ModGrid', ModGrid)
    app.component('ModHeader', ModHeader)
  },
} satisfies Theme
