<script setup lang="ts">
import { withBase } from 'vitepress'
import DemoPlayer from './DemoPlayer.vue'
import InstallCommand from './InstallCommand.vue'
import { copy as strings } from '../copy'
import { getMod } from '../mods'

const featured = getMod('heat')!
</script>

<template>
  <section class="hero" aria-labelledby="hero-h">
    <div class="hero-text">
      <img class="hero-crab" :src="withBase('/crabs/dev.svg')" alt="" width="128" height="64" />
      <h1 id="hero-h" class="hero-h">{{ strings.hero.headline }}</h1>
      <p class="hero-pitch">{{ strings.hero.pitch }}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#mods">{{ strings.hero.primary }}</a>
        <a class="btn btn-ghost" :href="withBase('/guide/install')">{{ strings.hero.secondary }}</a>
      </div>
    </div>
    <div class="hero-demo">
      <DemoPlayer
        autoplay
        caption
        :mod="featured.name"
        :video="featured.video"
        :poster="featured.poster"
        :description="featured.demoDescription"
      />
    </div>
    <div class="hero-install">
      <InstallCommand :lines="featured.install" :label="strings.hero.installLabel" />
    </div>
  </section>
</template>

<style scoped>
.hero {
  display: grid; gap: var(--space-5);
  grid-template-columns: minmax(0, 1fr);
  padding: var(--space-6) 0 var(--space-5);
}
.hero-crab { display: block; width: 128px; height: auto; image-rendering: pixelated; margin-bottom: var(--space-3); }
.hero-h { margin: 0; padding: 0; border: 0; font: 700 var(--text-3xl)/var(--leading-tight) var(--font-display); letter-spacing: 0; color: var(--ink); text-wrap: balance; }
.hero-pitch { margin: var(--space-4) 0 0; max-width: 52ch; font: var(--text-lg)/var(--leading-body) var(--font-sans); color: var(--ink-muted); }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-5); }
@media (min-width: 960px) {
  .hero { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); column-gap: var(--space-7); align-items: center; padding-top: var(--space-7); }
  .hero-text { grid-row: 1; }
  .hero-demo { grid-row: 1 / span 2; grid-column: 2; }
  .hero-install { grid-column: 1; grid-row: 2; align-self: start; }

}
</style>
