<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import mods from '../../mods.json'

const query = ref('')
const tag = ref<string | null>(null)

// Tags shared by two or more mods make useful filters; one-off tags stay on the cards.
const tags = computed(() => {
  const counts = new Map<string, number>()
  for (const mod of mods) for (const t of mod.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).map(([t]) => t)
})

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return mods.filter(mod =>
    (!tag.value || mod.tags.includes(tag.value)) &&
    (!q || [mod.name, mod.description, ...mod.tags].some(text => text.toLowerCase().includes(q))),
  )
})

const pick = (t: string) => (tag.value = tag.value === t ? null : t)
</script>

<template>
  <section id="mods" class="mods">
    <div class="mods-bar">
      <input v-model="query" class="mods-search" type="search" placeholder="Search mods…" aria-label="Search mods" />
      <div class="mods-tags" role="group" aria-label="Filter by tag">
        <button :class="['chip', { on: !tag }]" @click="tag = null">all {{ mods.length }}</button>
        <button v-for="t in tags" :key="t" :class="['chip', { on: tag === t }]" @click="pick(t)">{{ t }}</button>
      </div>
    </div>

    <div class="mods-grid">
      <a v-for="mod in shown" :key="mod.name" class="mod-card" :href="withBase(`/mods/${mod.name}`)">
        <div class="mod-screen" aria-hidden="true">
          <video v-if="mod.video" :src="withBase(mod.video)" autoplay muted loop playsinline preload="metadata" />
          <img v-else-if="mod.image" :src="withBase(mod.image)" alt="" loading="lazy" />
          <pre v-else-if="mod.preview">{{ mod.preview }}</pre>
          <pre v-else class="mod-screen-cmd"><span class="prompt">❯</span> /{{ mod.name }}</pre>
        </div>
        <div class="mod-body">
          <div class="mod-title">
            <h3>{{ mod.name }}</h3>
            <span class="mod-version">v{{ mod.version }}</span>
          </div>
          <p>{{ mod.description }}</p>
          <div class="mod-meta">
            <span class="mod-author">by {{ mod.author }}</span>
            <span class="mod-tags">
              <span v-for="t in mod.tags.slice(0, 3)" :key="t" class="tag">#{{ t }}</span>
            </span>
          </div>
        </div>
      </a>
    </div>

    <p v-if="!shown.length" class="mods-empty">
      No mod matches. <a :href="withBase('/guide/contributing')">Build it?</a>
    </p>
  </section>
</template>
