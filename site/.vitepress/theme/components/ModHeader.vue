<script setup lang="ts">
import { computed, ref } from 'vue'
import mods from '../../mods.json'

const props = defineProps<{ name: string }>()
const mod = computed(() => mods.find(m => m.name === props.name)!)
const copied = ref(false)

const copy = async () => {
  await navigator.clipboard.writeText(mod.value.install)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div v-if="mod" class="mod-header">
    <div class="mod-header-meta">
      <span>v{{ mod.version }}</span>
      <span>by <a :href="mod.authorUrl" target="_blank" rel="noopener">{{ mod.author }}</a></span>
      <a :href="mod.source" target="_blank" rel="noopener">source ↗</a>
      <span class="mod-tags"><span v-for="t in mod.tags" :key="t" class="tag">#{{ t }}</span></span>
    </div>
    <div class="install">
      <code>{{ mod.install }}</code>
      <button @click="copy">{{ copied ? 'copied' : 'copy' }}</button>
    </div>
  </div>
</template>
