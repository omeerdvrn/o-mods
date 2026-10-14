<script setup lang="ts">
import { onMounted } from 'vue'
import DefaultTheme from 'vitepress/theme'
import SiteFooter from './components/SiteFooter.vue'
import NotFoundPage from './components/NotFoundPage.vue'
import { copy } from './copy'

const { Layout } = DefaultTheme

// The search modal's empty state: custom.css prints this after "No mods match ...".
onMounted(() => {
  document.documentElement.style.setProperty('--search-help', JSON.stringify(copy.search.help))
})
</script>

<template>
  <Layout>
    <template #not-found><NotFoundPage /></template>
    <template #layout-bottom><SiteFooter /></template>
  </Layout>
</template>
