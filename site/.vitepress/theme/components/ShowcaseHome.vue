<script setup lang="ts">
import HomeHero from './HomeHero.vue'
import CategorySection from './CategorySection.vue'
import YourModBand from './YourModBand.vue'
import { copy as strings } from '../copy'
import { inCategory } from '../mods'

const groups = Object.keys(strings.categories)
const last = groups[groups.length - 1]
// An odd last group leaves a hole in the two-column grid: the contribute tile fills it.
// Otherwise the full-width band closes the page.
const tileFills = inCategory(last).length % 2 === 1
</script>

<template>
  <main class="home">
    <HomeHero />
    <nav class="jump" :aria-label="strings.jumpName">
      <ul>
        <li v-for="key in groups" :key="key">
          <a :href="`#cat-${key}`">{{ strings.categories[key].name }}</a>
        </li>
      </ul>
    </nav>
    <div id="mods" class="mods">
      <CategorySection v-for="key in groups" :key="key" :category="key" :fill-slot="key === last && tileFills" />
    </div>
    <YourModBand v-if="!tileFills" />
  </main>
</template>

<style scoped>
.home { max-width: var(--content-max); margin: 0 auto; padding: 0 var(--gutter) var(--space-8); }
@media (min-width: 768px) { .home { padding-left: var(--space-5); padding-right: var(--space-5); } }
.jump { margin-top: var(--space-5); }
.jump ul { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.jump li { margin: 0; }
.jump a {
  display: inline-flex; align-items: center; min-height: var(--tap-min); padding: 0 var(--space-4);
  border: 1px solid var(--border-strong); border-radius: var(--radius-pill);
  color: var(--ink); background: var(--paper); font: 600 var(--text-sm)/1 var(--font-sans); text-decoration: none;
  transition: background-color 0.12s ease-out, border-color 0.12s ease-out;
}
.jump a:hover { background: var(--accent-soft); border-color: var(--accent-ink); }
.mods { scroll-margin-top: calc(var(--vp-nav-height) + var(--space-4)); }
@media (prefers-reduced-motion: reduce) { .jump a { transition: none; } }
</style>
