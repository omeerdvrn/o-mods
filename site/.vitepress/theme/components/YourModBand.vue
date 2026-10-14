<script setup lang="ts">
import { withBase } from 'vitepress'
import { copy as strings } from '../copy'

/** tile: the compact version that fills an empty grid cell (h3); default: the full-width band (h2). */
defineProps<{ tile?: boolean }>()
</script>

<template>
  <section class="band" :class="{ 'band-tile': tile }" aria-labelledby="band-h">
    <component :is="tile ? 'h3' : 'h2'" id="band-h" class="band-h">{{ strings.band.heading }}</component>
    <p class="band-text">{{ strings.band.sentence }}</p>
    <a class="btn btn-primary" :href="withBase('/guide/contributing')">{{ strings.band.button }}</a>
  </section>
</template>

<style scoped>
.band {
  margin-top: var(--space-8);
  padding: var(--space-6) var(--space-5);
  border: 2px dashed var(--border-strong); border-radius: var(--radius-lg);
  background: var(--paper-alt);
}
.band-tile { margin-top: 0; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
.band-h { margin: 0; padding: 0; border: 0; font: 700 var(--text-2xl)/var(--leading-tight) var(--font-display); letter-spacing: 0; color: var(--ink); }
.band-tile .band-h { font-size: var(--text-xl); }
.band-text { margin: var(--space-3) 0 var(--space-5); max-width: 60ch; font: var(--text-base)/var(--leading-body) var(--font-sans); color: var(--ink-muted); }
</style>
