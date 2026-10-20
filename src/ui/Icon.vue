<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" class="icon">
    <path :d="path" fill="currentColor" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import * as icons from './icons.js'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 24 }
})
const path = computed(() => icons[props.name] || '')
</script>

<style scoped>
.icon { flex: 0 0 auto; }
</style>
