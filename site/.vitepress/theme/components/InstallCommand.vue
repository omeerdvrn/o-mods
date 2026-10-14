<script setup lang="ts">
import { computed, ref } from 'vue'
import { withBase } from 'vitepress'
import CopyButton from './CopyButton.vue'
import { copy as strings } from '../copy'

const props = defineProps<{
  /** The command lines, in order. */
  lines: string[]
  /** Show the "Install" h2 and the step captions (mod page). */
  steps?: boolean
  /** Show the "First time?" link. */
  firstTime?: boolean
  /** Small label above the block (hero). */
  label?: string
  /** h2 heading level text; false hides it. */
  heading?: boolean
}>()

const text = computed(() => props.lines.join('\n'))
const codeEl = ref<HTMLElement>()
const note = ref('')
const captions = [strings.installStep1, strings.installStep2]

const onFailed = () => {
  // Select the commands so Ctrl/Cmd+C works.
  const el = codeEl.value
  if (el) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
  note.value = strings.copyFailedNote
  setTimeout(() => (note.value = ''), 8000)
}
</script>

<template>
  <section class="install" :aria-labelledby="heading ? 'install-h' : undefined">
    <h2 v-if="heading" id="install-h" class="install-h">{{ strings.installHeading }}</h2>
    <p v-if="label" class="install-label">{{ label }}</p>
    <div class="term on-term">
      <div class="term-bar">
        <span class="term-dots" aria-hidden="true"><i /><i /><i /></span>
        <span class="term-title">o-mods</span>
        <span class="term-spacer" aria-hidden="true" />
      </div>
      <div class="install-body">
        <div ref="codeEl" class="install-code">
          <template v-for="(line, i) in lines" :key="line">
            <p v-if="steps" class="cmd-caption"># {{ captions[i] }}</p>
            <p class="cmd"><span class="prompt" aria-hidden="true">$ </span><code>{{ line }}</code></p>
          </template>
        </div>
        <div class="install-actions">
          <CopyButton :text="text" :label="strings.copyName" @failed="onFailed" />
        </div>
      </div>
    </div>
    <p v-if="note" class="install-note" role="status">{{ note }}</p>
    <p v-if="firstTime" class="install-first">
      <a :href="withBase('/guide/install')">{{ strings.firstTime }}</a>
    </p>
  </section>
</template>

<style scoped>
.install { container: install / inline-size; }
.install-h { margin: 0 0 var(--space-3); padding: 0; border: 0; font: 700 var(--text-xl)/var(--leading-tight) var(--font-display); color: var(--ink); letter-spacing: 0; }
.install-label { margin: 0 0 var(--space-2); font: 600 var(--text-sm)/1.4 var(--font-sans); color: var(--ink-muted); }
.term { overflow: hidden; background: var(--term-bg); border: 1px solid var(--term-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-term); text-align: left; }
.term-bar { display: flex; align-items: center; gap: var(--space-3); height: 36px; padding: 0 var(--space-3); background: var(--term-chrome); border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.term-dots { display: flex; gap: 6px; }
.term-dots i { width: 10px; height: 10px; border-radius: 50%; background: var(--term-dot-1); }
.term-dots i:nth-child(2) { background: var(--term-dot-2); }
.term-dots i:nth-child(3) { background: var(--term-dot-3); }
.term-spacer { flex: 0 0 42px; }
.term-title { flex: 1; text-align: center; font: var(--text-xs)/1 var(--font-mono); color: var(--term-title); }
.install-body { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); }
.install-code { min-width: 0; font: var(--text-sm)/1.6 var(--font-mono); color: var(--term-text); }
.install-code p { margin: 0; }
.cmd-caption { color: var(--term-dim); margin-top: var(--space-2) !important; }
.cmd-caption:first-child { margin-top: 0 !important; }
.cmd { white-space: pre-wrap; overflow-wrap: anywhere; }
.prompt { color: var(--term-accent); user-select: none; }
.install-code code { padding: 0; background: none; color: inherit; font: inherit; }
.install-actions { display: flex; justify-content: flex-end; }
.install-note { margin: var(--space-2) 0 0; font: var(--text-sm)/var(--leading-body) var(--font-sans); color: var(--error); }
.install-first { margin: var(--space-3) 0 0; font: var(--text-sm)/1.4 var(--font-sans); }
.install-first a { display: inline-flex; align-items: center; min-height: var(--tap-min); color: var(--accent-ink); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
@media (min-width: 768px) {
  .term-bar { height: 40px; }
  .term-dots i { width: 12px; height: 12px; }
  .term-spacer { flex-basis: 48px; }
  .term-title { font-size: var(--text-sm); }
  .install-body { padding: var(--space-5); }
}
@container install (min-width: 560px) {
  .install-body { flex-direction: row; align-items: flex-end; justify-content: space-between; }
  .install-code { flex: 1; }
}
</style>
