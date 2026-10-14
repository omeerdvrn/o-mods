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
const editUrl = computed(() => `${REPO}/edit/main/mods/${mod.value.name}/README.md`)
</script>

<template>
  <div v-if="mod" class="mod-page">
    <nav class="crumbs" :aria-label="strings.breadcrumbName">
      <ol>
        <li><a :href="withBase('/#mods')">{{ strings.breadcrumbRoot }}</a></li>
        <li><a :href="withBase(`/#cat-${mod.category}`)">{{ category.name }}</a></li>
        <li aria-current="page">{{ mod.name }}</li>
      </ol>
    </nav>

    <header class="mod-head">
      <h1 class="mod-h1">{{ mod.name }}</h1>
      <p class="mod-badges">
        <span class="badge">{{ category.name }}</span>
        <span class="badge">v{{ mod.version }}</span>
      </p>
      <p class="mod-pitch">{{ mod.pitch }}</p>
    </header>

    <DemoPlayer
      caption
      :mod="mod.name"
      :title="`claude: ${mod.name}`"
      :video="mod.video"
      :poster="mod.poster"
      :description="mod.demoDescription"
    />

    <div class="mod-install">
      <InstallCommand heading steps first-time :lines="mod.install" />
    </div>

    <dl class="meta">
      <div>
        <dt>Author</dt>
        <dd><a :href="mod.authorUrl" rel="noopener">{{ mod.author }}</a></dd>
      </div>
      <div>
        <dt>{{ strings.metaVersion }}</dt>
        <dd>{{ mod.version }}</dd>
      </div>
      <div>
        <dt>{{ strings.metaLicense }}</dt>
        <dd>MIT</dd>
      </div>
      <div v-if="mod.tags.length">
        <dt>Tags</dt>
        <dd>{{ mod.tags.join(', ') }}</dd>
      </div>
      <div>
        <dt class="sr-only">{{ strings.metaSource }}</dt>
        <dd><a :href="mod.source" rel="noopener">{{ strings.metaSource }}</a></dd>
      </div>
    </dl>

    <div class="vp-doc mod-readme"><Content /></div>

    <p class="edit"><a :href="editUrl" rel="noopener">Edit this page on GitHub</a></p>

    <nav v-if="prev || next" class="pn" :aria-label="fill(strings.moreIn, { category: category.name })">
      <a v-if="prev" class="pn-link pn-prev" :href="withBase(`/mods/${prev.name}`)">{{ fill(strings.prev, { mod: prev.name }) }}</a>
      <a v-if="next" class="pn-link pn-next" :href="withBase(`/mods/${next.name}`)">{{ fill(strings.next, { mod: next.name }) }}</a>
    </nav>
  </div>
</template>

<style scoped>
.mod-page { max-width: 880px; margin: 0 auto; padding: calc(var(--vp-nav-height) + var(--space-5)) var(--gutter) var(--space-7); }
.crumbs ol { display: flex; flex-wrap: wrap; gap: var(--space-1) 0; margin: 0 0 var(--space-4); padding: 0; list-style: none; font: var(--text-sm)/1.4 var(--font-sans); color: var(--ink-muted); }
.crumbs li { margin: 0; display: inline-flex; align-items: center; }
.crumbs li + li::before { content: '/'; margin: 0 var(--space-2); color: var(--ink-faint); }
.crumbs a { display: inline-flex; align-items: center; min-height: 32px; color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.mod-h1 { margin: 0; padding: 0; border: 0; font: 700 var(--text-3xl)/var(--leading-tight) var(--font-display); letter-spacing: 0; color: var(--ink); overflow-wrap: anywhere; }
.mod-badges { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-3) 0 0; }
.badge { padding: 4px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-pill); font: 600 var(--text-sm)/1.2 var(--font-sans); color: var(--ink-muted); }
.mod-pitch { margin: var(--space-4) 0 var(--space-5); max-width: 60ch; font: var(--text-lg)/var(--leading-body) var(--font-sans); color: var(--ink); }
.mod-install { margin-top: var(--space-6); }
.meta { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin: var(--space-5) 0 var(--space-6); padding: var(--space-3) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); font: var(--text-sm)/1.4 var(--font-sans); color: var(--ink-muted); }
.meta div { display: flex; gap: var(--space-2); align-items: center; min-height: 32px; }
.meta dt { font-weight: 600; color: var(--ink-faint); }
.meta dd { margin: 0; }
.meta a { color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.edit { margin: var(--space-6) 0 0; font: var(--text-sm)/1.4 var(--font-sans); }
.edit a { display: inline-flex; align-items: center; min-height: var(--tap-min); color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.pn { display: grid; gap: var(--space-3); margin-top: var(--space-5); }
.pn-link { display: flex; align-items: center; min-height: var(--tap-min); padding: var(--space-3) var(--space-4); border: 1px solid var(--border-strong); border-radius: var(--radius-md); color: var(--ink); font: 600 var(--text-base)/1.3 var(--font-sans); text-decoration: none; }
.pn-link:hover { background: var(--accent-soft); border-color: var(--accent-ink); }
.pn-next { justify-content: flex-end; text-align: right; }
@media (min-width: 640px) { .pn { grid-template-columns: 1fr 1fr; } .pn-prev { grid-column: 1; } .pn-next { grid-column: 2; } }
@media (min-width: 768px) { .mod-page { padding-left: var(--space-5); padding-right: var(--space-5); } }
</style>
