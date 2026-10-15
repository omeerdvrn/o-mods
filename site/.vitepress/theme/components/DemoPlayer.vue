<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { copy as strings, fill } from '../copy'

const props = defineProps<{
  mod: string
  video?: string
  poster?: string
  description: string
  /** Hero only: start playing on load (never under reduced motion). */
  autoplay?: boolean
  /** Card mode: compact Play button, driven by the card's hover/focus. */
  interactive?: boolean
  /** Show the visible "What you are seeing" caption (not on cards). */
  caption?: boolean
  /** Frame title text (default: the mod name). */
  title?: string
}>()

const el = ref<HTMLVideoElement>()
const playing = ref(false)
const failed = ref(false)
const reduced = ref(false)
let mq: MediaQueryList | undefined
const onMq = () => { reduced.value = !!mq?.matches }

const play = async () => {
  try { await el.value?.play() } catch { /* blocked or interrupted: the button stays Play */ }
}
const pause = () => el.value?.pause()
const toggle = () => (playing.value ? pause() : play())

// Cards call these from hover/focus; they do nothing under reduced motion.
const hoverPlay = () => { if (!reduced.value && props.interactive) play() }
const hoverPause = () => { if (props.interactive) pause() }
defineExpose({ hoverPlay, hoverPause })

onMounted(() => {
  mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMq()
  mq.addEventListener('change', onMq)
  if (props.autoplay && !reduced.value) play()
})
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))
</script>

<template>
  <figure class="demo" :class="{ 'demo-card': interactive, 'demo-auto': autoplay, 'demo-playing': playing }">
    <div class="term">
      <div class="term-bar">
        <span class="term-dots" aria-hidden="true"><i /><i /><i /></span>
        <span class="term-title" :aria-hidden="interactive ? 'true' : undefined">{{ title ?? mod }}</span>
        <button
          v-if="video && !failed"
          type="button"
          class="demo-btn"
          :aria-label="fill(playing ? strings.pauseName : strings.playName, { mod })"
          @click="toggle"
        >
          <svg v-if="playing" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M5 3h3.5v14H5zM11.5 3H15v14h-3.5z" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M5 3l12 7-12 7z" fill="currentColor" />
          </svg>
          <span class="demo-btn-text">{{ playing ? strings.pause : interactive ? strings.play : strings.playDemo }}</span>
        </button>
        <span v-else class="term-spacer" aria-hidden="true" />
      </div>
      <div class="term-screen">
        <p v-if="failed || !video" class="demo-failed" role="status">{{ strings.demoFailed }}</p>
        <template v-else>
          <video
            ref="el"
            :src="withBase(video)"
            :poster="poster ? withBase(poster) : undefined"
            :aria-label="description"
            muted
            loop
            playsinline
            :preload="interactive ? 'none' : 'metadata'"
            @play="playing = true"
            @pause="playing = false"
            @click="!interactive && toggle()"
            @error="failed = true"
          />
          <span v-if="!interactive" class="demo-glyph" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="28" height="28" focusable="false"><path d="M5 3l12 7-12 7z" fill="currentColor" /></svg>
          </span>
        </template>
      </div>
    </div>
    <figcaption v-if="caption" class="demo-caption">
      <span class="demo-caption-label">{{ strings.captionPrefix }}</span>
      {{ description }}
    </figcaption>
  </figure>
</template>

<style scoped>
.demo { margin: 0; }
.term {
  overflow: hidden;
  background: var(--term-bg);
  border: 1px solid var(--term-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-term);
}
.term-bar {
  display: flex; align-items: center; gap: var(--space-3);
  height: 44px; padding: 0 var(--space-3);
  background: var(--term-chrome);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.term-dots { display: flex; gap: 6px; flex: 0 0 auto; }
.term-dots i { width: 10px; height: 10px; border-radius: 50%; background: var(--term-dot-1); }
.term-dots i:nth-child(2) { background: var(--term-dot-2); }
.term-dots i:nth-child(3) { background: var(--term-dot-3); }
.term-spacer { flex: 0 0 42px; }
.term-title {
  flex: 1; min-width: 0; text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font: var(--text-xs)/1 var(--font-mono); color: var(--term-title);
}
.term-screen { position: relative; aspect-ratio: 16 / 9; background: var(--term-bg); }
.demo-card .term-screen { aspect-ratio: 16 / 10; }
.term-screen video { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
.term-screen video { cursor: pointer; }
.demo-card .term-screen video { cursor: inherit; }

.demo-failed {
  display: flex; align-items: center; justify-content: center; height: 100%; margin: 0;
  padding: var(--space-4); text-align: center;
  font: var(--text-sm)/var(--leading-body) var(--font-mono); color: var(--term-text);
}

/* Play/Pause lives in the title bar (right), so it never covers the recording. */
.demo-btn {
  position: relative; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-width: 32px; height: 28px; padding: 0 8px;
  background: var(--accent); color: var(--on-accent);
  border: 0; border-radius: var(--radius-pill);
  font: 700 var(--text-xs)/1 var(--font-sans); cursor: pointer;
  transition: background-color 0.12s ease-out;
}
/* 44px hit area around the 28px pill */
.demo-btn::after { content: ''; position: absolute; inset: -8px -6px; }
.demo-btn:hover { background: var(--accent-hover); }
html .demo-btn:focus-visible { outline: 3px solid var(--term-accent); outline-offset: 2px; }
/* Icon-only on cards and phones; label from 768px on pages */
.demo-btn-text { display: none; }
@media (min-width: 768px) { .demo:not(.demo-card) .demo-btn-text { display: inline; } .demo:not(.demo-card) .demo-btn { padding: 0 12px; } }

/* A big play glyph on the poster: the invitation. Gone once playing.
   The hero autoplays, so it only shows there under reduced motion (pure CSS: right from first paint). */
.demo-glyph {
  position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center;
  pointer-events: none; color: var(--on-accent);
}
.demo-glyph svg { box-sizing: content-box; padding: 18px 16px 18px 20px; background: var(--accent); border-radius: 50%; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
.demo-playing .demo-glyph { display: none; }
.demo-auto .demo-glyph { display: none; }
@media (prefers-reduced-motion: reduce) { .demo-auto:not(.demo-playing) .demo-glyph { display: flex; } }

@media (min-width: 768px) {
  .term-bar { height: 44px; }
  .term-dots i { width: 12px; height: 12px; }
  .term-spacer { flex-basis: 48px; }
  .term-title { font-size: var(--text-sm); }
}

.demo-caption {
  max-width: 65ch; margin-top: var(--space-3);
  font: var(--text-sm)/var(--leading-body) var(--font-sans); color: var(--ink-muted);
}
.demo-caption-label {
  display: block; margin-bottom: 2px;
  font: 700 var(--text-xs)/1.4 var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-faint);
}
</style>
