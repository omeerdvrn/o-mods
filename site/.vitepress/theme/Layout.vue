<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import SiteFooter from './components/SiteFooter.vue'
import NotFoundPage from './components/NotFoundPage.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #not-found><NotFoundPage /></template>
    <template #layout-bottom><SiteFooter /></template>
  </Layout>
</template>
