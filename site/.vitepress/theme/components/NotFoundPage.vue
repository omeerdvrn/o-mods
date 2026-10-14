<script setup lang="ts">
import { withBase } from 'vitepress'
import { copy as strings } from '../copy'
</script>

<template>
  <div class="nf">
    <img :src="withBase('/crabs/qa.svg')" alt="" width="128" height="64" class="nf-crab" />
    <h1 class="nf-h">{{ strings.notFound.heading }}</h1>
    <p>{{ strings.notFound.sentence }}</p>
    <a class="btn btn-primary" :href="withBase('/#mods')">{{ strings.notFound.button }}</a>
  </div>
</template>

<style scoped>
.nf { max-width: 640px; margin: 0 auto; padding: calc(var(--vp-nav-height) + var(--space-7)) var(--gutter) var(--space-8); text-align: center; }
.nf-crab { image-rendering: pixelated; }
.nf-h { margin: var(--space-4) 0 0; font: 700 var(--text-3xl)/var(--leading-tight) var(--font-display); color: var(--ink); text-wrap: balance; }
p { margin: var(--space-4) 0 var(--space-5); font: var(--text-lg)/var(--leading-body) var(--font-sans); color: var(--ink-muted); }
</style>
