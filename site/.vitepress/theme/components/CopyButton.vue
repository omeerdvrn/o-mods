<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { copy as strings } from '../copy'

const props = defineProps<{ text: string; label: string; failedLabel?: string; failedNote?: string }>()
const emit = defineEmits<{ (e: 'failed'): void; (e: 'copied'): void }>()

const state = ref<'idle' | 'done' | 'failed'>('idle')
const announce = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

// navigator.clipboard needs a secure context and permission; fall back to the
// old selection-based copy before giving up.
const legacyCopy = (text: string) => {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(area)
  area.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  area.remove()
  return ok
}

const run = async () => {
  clearTimeout(timer)
  let ok = false
  try {
    await navigator.clipboard.writeText(props.text)
    ok = true
  } catch {
    ok = legacyCopy(props.text)
  }
  state.value = ok ? 'done' : 'failed'
  announce.value = ok ? strings.copyAnnounce : props.failedNote ?? strings.copyFailedNote
  emit(ok ? 'copied' : 'failed')
  timer = setTimeout(() => { state.value = 'idle'; announce.value = '' }, ok ? 2000 : 6000)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <span class="copy-wrap">
    <button type="button" class="copy-btn" :data-state="state" :aria-label="label" @click="run">
      <svg v-if="state === 'done'" class="copy-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M2 8.5 6 12.5 14 4" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
      <svg v-else class="copy-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M5 1.5h8.5V11H5zM2.5 4.5v10H11" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <span>{{ state === 'done' ? strings.copyDone : state === 'failed' ? (failedLabel ?? strings.copyFailed) : strings.copyIdle }}</span>
    </button>
    <span class="sr-only" role="status" aria-live="polite">{{ announce }}</span>
  </span>
</template>

<style scoped>
.copy-wrap { display: inline-flex; }
.copy-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  min-height: var(--tap-min); min-width: var(--tap-min); padding: 0 var(--space-4);
  border: 1px solid var(--border-strong); border-radius: var(--radius-md);
  background: transparent; color: var(--ink);
  font: 600 var(--text-sm)/1 var(--font-sans); cursor: pointer;
  transition: background-color 0.12s ease-out, border-color 0.12s ease-out;
}
.copy-btn:hover { background: var(--accent-soft); border-color: var(--accent-ink); }
.copy-btn[data-state='done'] { border-color: var(--success); color: var(--success); }
.copy-btn[data-state='failed'] { border-color: var(--error); color: var(--error); }
/* Inside the dark terminal, use terminal tokens */
.on-term .copy-btn { color: var(--term-text); border-color: var(--term-dim); }
.on-term .copy-btn:hover { background: rgba(255, 255, 255, 0.08); border-color: var(--term-accent); }
.on-term .copy-btn[data-state='done'] { color: var(--term-success); border-color: var(--term-success); }
.on-term .copy-btn[data-state='failed'] { color: var(--term-error); border-color: var(--term-error); }
html .on-term .copy-btn:focus-visible { outline-color: var(--term-accent); }
@media (prefers-reduced-motion: reduce) { .copy-btn { transition: none; } }
</style>
