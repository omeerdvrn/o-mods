<script setup lang="ts">
import { withBase } from 'vitepress'
import { copy as strings, REPO } from '../copy'
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer-inner">
      <p>{{ strings.footer.line1 }}</p>
      <p>{{ strings.footer.line2 }}</p>
      <ul>
        <li><a :href="REPO">{{ strings.footer.github }}</a></li>
        <li><a :href="withBase('/guide/contributing')">{{ strings.footer.contribute }}</a></li>
        <li><a :href="`${REPO}/issues/new/choose`">{{ strings.footer.report }}</a></li>
      </ul>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { margin-top: var(--space-7); padding: var(--space-6) var(--gutter); border-top: 1px solid var(--border); background: var(--paper-alt); }
.site-footer-inner { max-width: var(--content-max); margin: 0 auto; }
@media (min-width: 768px) { .site-footer-inner { padding: 0 var(--space-5); } }
p { margin: 0 0 var(--space-1); font: var(--text-sm)/var(--leading-body) var(--font-sans); color: var(--ink-muted); }
ul { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin: var(--space-3) 0 0; padding: 0; list-style: none; }
li { margin: 0; }
a { display: inline-flex; align-items: center; min-height: var(--tap-min); color: var(--accent-ink); font: 600 var(--text-sm)/1 var(--font-sans); text-decoration: underline; text-underline-offset: 3px; }
</style>
