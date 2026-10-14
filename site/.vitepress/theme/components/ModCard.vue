<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { withBase } from 'vitepress'
import DemoPlayer from './DemoPlayer.vue'
import CopyButton from './CopyButton.vue'
import { copy as strings, fill } from '../copy'
import type { Mod } from '../mods'

const props = withDefaults(defineProps<{ mod: Mod; showCategory?: boolean }>(), { showCategory: true })
const failed = ref(false)
let failTimer: ReturnType<typeof setTimeout> | undefined
const onFailed = () => {
  failed.value = true
  clearTimeout(failTimer)
  failTimer = setTimeout(() => (failed.value = false), 10000)
}
const onCopied = () => { failed.value = false }
onBeforeUnmount(() => clearTimeout(failTimer))
const player = ref<InstanceType<typeof DemoPlayer>>()
const category = computed(() => strings.categories[props.mod.category]?.name ?? props.mod.category)

const onFocusIn = (e: FocusEvent) => {
  // Only keyboard focus on the link starts the demo, not a click on Copy or Play.
  const t = e.target as HTMLElement
  if (t.classList.contains('card-link') && t.matches(':focus-visible')) player.value?.hoverPlay()
}
const onFocusOut = (e: FocusEvent) => {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) player.value?.hoverPause()
}
</script>

<template>
  <article
    class="card"
    @pointerenter="(e: PointerEvent) => e.pointerType === 'mouse' && player?.hoverPlay()"
    @pointerleave="(e: PointerEvent) => e.pointerType === 'mouse' && player?.hoverPause()"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <DemoPlayer
      ref="player"
      interactive
      :mod="mod.name"
      :video="mod.video"
      :poster="mod.poster"
      :description="mod.demoDescription"
    />
    <h3 class="card-name">
      <a
        class="card-link"
        :href="withBase(`/mods/${mod.name}`)"
        :aria-label="fill(strings.cardLinkName, { mod: mod.name, pitch: mod.pitch })"
      >{{ mod.name }}</a>
    </h3>
    <p class="card-pitch" aria-hidden="true">{{ mod.pitch }}</p>
    <div class="card-foot">
      <span v-if="showCategory" class="card-cat">{{ category }}</span>
      <CopyButton
        :text="mod.install.join('\n')"
        :label="fill(strings.copyNameCard, { mod: mod.name })"
        :failed-label="strings.copyFailedCard"
        :failed-note="strings.copyFailedCardNote"
        @failed="onFailed"
        @copied="onCopied"
      />
    </div>
    <p v-if="failed" class="card-fail">
      {{ strings.copyFailedCardVisible }}
      <a :href="withBase(`/mods/${mod.name}`)">{{ strings.copyFailedCardLink }}</a>
    </p>
  </article>
</template>

<style scoped>
.card {
  position: relative; display: flex; flex-direction: column; gap: var(--space-3);
  padding: var(--space-4);
  background: var(--paper-soft); border: 1px solid var(--border); border-radius: var(--radius-lg);
  transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
}
.card:hover, .card:focus-within { transform: translate(-2px, -2px); box-shadow: var(--shadow-pixel); }
.card:has(.card-link:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
.card-name { margin: var(--space-1) 0 0; padding: 0; border: 0; font: 700 var(--text-xl)/var(--leading-tight) var(--font-display); letter-spacing: 0; color: var(--ink); }
.card-link { color: inherit; text-decoration: none; }
/* The whole card is the link; Copy and Play sit above this overlay. */
.card-link::after { content: ''; position: absolute; inset: 0; z-index: 1; border-radius: var(--radius-lg); }
.card-link:focus-visible { outline: none; }
.card-pitch {
  flex: 1; margin: 0; font: var(--text-base)/var(--leading-body) var(--font-sans); color: var(--ink-muted);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.card-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); }
.card-cat { font: var(--text-sm)/1.4 var(--font-sans); color: var(--ink-faint); }
.card-foot:not(:has(.card-cat)) { justify-content: flex-end; }
.card-fail { position: relative; z-index: 2; margin: calc(var(--space-1) * -1) 0 0; font: var(--text-sm)/var(--leading-body) var(--font-sans); color: var(--error); }
.card-fail a { color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.card :deep(.copy-wrap), .card :deep(.demo-btn) { position: relative; z-index: 2; }
@media (prefers-reduced-motion: reduce) {
  .card { transition: none; }
  .card:hover, .card:focus-within { transform: none; }
}
</style>
