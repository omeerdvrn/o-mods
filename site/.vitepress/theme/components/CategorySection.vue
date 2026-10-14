<script setup lang="ts">
import { computed } from 'vue'
import ModCard from './ModCard.vue'
import YourModBand from './YourModBand.vue'
import { copy as strings } from '../copy'
import { inCategory } from '../mods'
import { withBase } from 'vitepress'

// The persona mod's crabs, dressed for what each group is about.
const CRABS: Record<string, string> = { fun: 'ui-ux', status: 'qa', workflow: 'dev' }

const props = defineProps<{ category: string; fillSlot?: boolean }>()
const info = computed(() => strings.categories[props.category])
const items = computed(() => inCategory(props.category))
</script>

<template>
  <section class="cat" :id="`cat-${category}`" :aria-labelledby="`cat-${category}-h`">
    <div class="cat-title">
      <img class="cat-crab" :src="withBase(`/crabs/${CRABS[category]}.svg`)" alt="" width="64" height="32" />
      <h2 :id="`cat-${category}-h`" class="cat-h">{{ info.name }}</h2>
    </div>
    <p class="cat-intent">{{ info.intent }}</p>
    <ul class="cat-grid">
      <li v-for="mod in items" :key="mod.name"><ModCard :mod="mod" :show-category="false" /></li>
      <li v-if="fillSlot && items.length % 2 === 1" class="cat-fill"><YourModBand tile /></li>
    </ul>
  </section>
</template>

<style scoped>
.cat-title { display: flex; align-items: center; gap: var(--space-3); }
.cat-crab { flex: none; width: 64px; height: 32px; image-rendering: pixelated; }
.cat { margin-top: var(--space-8); scroll-margin-top: calc(var(--vp-nav-height) + var(--space-4)); }
.cat-h { margin: 0; padding: 0; border: 0; font: 700 var(--text-2xl)/var(--leading-tight) var(--font-display); letter-spacing: 0; color: var(--ink); }
.cat-intent { margin: var(--space-2) 0 var(--space-5); max-width: 60ch; font: var(--text-base)/var(--leading-body) var(--font-sans); color: var(--ink-muted); }
.cat-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5); margin: 0; padding: 0; list-style: none; }
.cat-grid li { margin: 0; padding: 0; }
.cat-fill { display: flex; }
.cat-fill > * { flex: 1; }
@media (min-width: 640px) { .cat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
