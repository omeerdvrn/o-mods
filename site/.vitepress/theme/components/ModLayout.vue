<script setup lang="ts">
import { computed } from 'vue'
import { Content, useData, withBase } from 'vitepress'
import DemoPlayer from './DemoPlayer.vue'
import InstallCommand from './InstallCommand.vue'
import { copy as strings, fill, REPO } from '../copy'
import { getMod, inCategory } from '../mods'

const { frontmatter } = useData()
const mod = computed(() => getMod(frontmatter.value.mod)!)
const category = computed(() => strings.categories[mod.value.category])
const siblings = computed(() => inCategory(mod.value.category))
const index = computed(() => siblings.value.findIndex(m => m.name === mod.value.name))
const prev = computed(() => siblings.value[index.value - 1])
const next = computed(() => siblings.value[index.value + 1])
const crab = computed(() => ({ fun: 'ui-ux', status: 'qa', workflow: 'dev' })[mod.value.category] ?? 'dev')
const editUrl = computed(() => `${REPO}/edit/main/mods/${mod.value.name}/README.md`)
</script>

<template>
  <main v-if="mod" class="mod-page">
    <nav class="crumbs" :aria-label="strings.breadcrumbName">
      <ol>
        <li><a :href="withBase('/#mods')">{{ strings.breadcrumbRoot }}</a></li>
        <li><a :href="withBase(`/#cat-${mod.category}`)">{{ category.name }}</a></li>
        <li aria-current="page">{{ mod.name }}</li>
      </ol>
    </nav>

    <header class="mod-head">
      <div class="mod-title">
        <img class="mod-crab" :src="withBase(`/crabs/${crab}.svg`)" alt="" width="80" height="40" />
        <h1 class="mod-h1">{{ mod.name }}</h1>
      </div>
      <p class="mod-badges">
        <span class="badge">{{ category.name }}</span>
        <span class="badge">v{{ mod.version }}</span>
      </p>
      <p class="mod-pitch">{{ mod.pitch }}</p>
    </header>

    <div class="mod-main">
    <DemoPlayer
      caption
      :mod="mod.name"
      :title="`claude: ${mod.name}`"
      :video="mod.video"
      :poster="mod.poster"
      :description="mod.demoDescription"
    />

      <div class="mod-side">
    <div class="mod-install">
        <InstallCommand heading steps first-time :lines="mod.install" />
      </div>

      <dl class="meta">
        <div>
          <dt>{{ strings.metaAuthor }}</dt>
          <dd><a :href="mod.authorUrl" rel="noopener">{{ mod.author }}</a></dd>
        </div>
        <div>
          <dt>{{ strings.metaVersion }}</dt>
          <dd>{{ mod.version }}</dd>
        </div>
        <div>
          <dt>{{ strings.metaLicense }}</dt>
          <dd>{{ strings.licenseName }}</dd>
        </div>
        <div v-if="mod.tags.length">
          <dt>{{ strings.metaTags }}</dt>
          <dd>{{ mod.tags.join(', ') }}</dd>
        </div>
        <div>
          <dt class="sr-only">{{ strings.metaSource }}</dt>
          <dd><a :href="mod.source" rel="noopener">{{ strings.metaSource }}</a></dd>
        </div>
      </dl>
      </div>
    </div>

    <div class="vp-doc mod-readme"><Content /></div>

    <p class="edit"><a :href="editUrl" rel="noopener">{{ strings.editPage }}</a></p>

    <nav v-if="prev || next" class="pn" :aria-label="fill(strings.moreIn, { category: category.name })">
      <a v-if="prev" class="pn-link pn-prev" :href="withBase(`/mods/${prev.name}`)">{{ fill(strings.prev, { mod: prev.name }) }}</a>
      <a v-if="next" class="pn-link pn-next" :href="withBase(`/mods/${next.name}`)">{{ fill(strings.next, { mod: next.name }) }}</a>
    </nav>
  </main>
</template>

<style scoped>
.mod-page { max-width: 1152px; margin: 0 auto; padding: calc(var(--vp-nav-height) + var(--space-3)) var(--gutter) var(--space-7); }
.crumbs ol { display: flex; flex-wrap: wrap; gap: var(--space-1) 0; margin: 0 0 var(--space-3); padding: 0; list-style: none; font: var(--text-sm)/1.4 var(--font-sans); color: var(--ink-muted); }
.crumbs li { margin: 0; display: inline-flex; align-items: center; }
.crumbs li + li::before { content: '/'; margin: 0 var(--space-2); color: var(--ink-faint); }
.crumbs a { display: inline-flex; align-items: center; min-height: 32px; color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.mod-title { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.mod-crab { flex: none; width: 80px; height: 40px; image-rendering: pixelated; }
.mod-h1 { margin: 0; padding: 0; border: 0; font: 700 var(--text-3xl)/var(--leading-tight) var(--font-display); letter-spacing: 0; color: var(--ink); overflow-wrap: anywhere; min-width: 0; }
.mod-badges { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-3) 0 0; }
.badge { padding: 4px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-pill); font: 600 var(--text-sm)/1.2 var(--font-sans); color: var(--ink-muted); }
.mod-pitch { margin: var(--space-3) 0 var(--space-5); max-width: 60ch; font: var(--text-lg)/var(--leading-body) var(--font-sans); color: var(--ink); }
.mod-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-6); }
.mod-main > * { min-width: 0; }
.mod-install { margin: 0; }
.meta { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); margin: var(--space-5) 0 0; padding: var(--space-3) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); font: var(--text-sm)/1.4 var(--font-sans); color: var(--ink-muted); }
.meta div { display: flex; gap: var(--space-2); align-items: center; min-height: 32px; }
.meta dt { font-weight: 600; color: var(--ink-faint); }
.meta dd { margin: 0; }
.meta a { display: inline-flex; align-items: center; min-height: 32px; color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.mod-readme { margin-top: var(--space-7); max-width: 800px; min-width: 0; }
.edit { margin: var(--space-6) 0 0; font: var(--text-sm)/1.4 var(--font-sans); }
.edit a { display: inline-flex; align-items: center; min-height: var(--tap-min); color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.pn { display: grid; gap: var(--space-3); margin-top: var(--space-5); max-width: 800px; }
.pn-link { display: flex; align-items: center; min-height: var(--tap-min); padding: var(--space-3) var(--space-4); border: 1px solid var(--border-strong); border-radius: var(--radius-md); color: var(--ink); font: 600 var(--text-base)/1.3 var(--font-sans); text-decoration: none; }
.pn-link:hover { background: var(--accent-soft); border-color: var(--accent-ink); }
.pn-next { justify-content: flex-end; text-align: right; }
@media (min-width: 640px) { .pn { grid-template-columns: 1fr 1fr; } .pn-prev { grid-column: 1; } .pn-next { grid-column: 2; } }
@media (min-width: 768px) { .mod-page { padding-left: var(--space-5); padding-right: var(--space-5); } }
/* Wide screens: the demo and the install block sit side by side, install sticky. */
@media (min-width: 1024px) {
  .mod-main { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: var(--space-6); align-items: start; }
  .mod-side { position: sticky; top: calc(var(--vp-nav-height) + var(--space-4)); }
  .mod-pitch { margin-bottom: var(--space-4); }
}
</style>
