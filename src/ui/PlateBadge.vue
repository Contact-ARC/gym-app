<template>
  <div class="plate" :class="`p-${size}`" :style="style" aria-hidden="true">
    <span>{{ label }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { dayPlate } from './plates.js'

const props = defineProps({
  index: Number, // day index → colour
  label: String,
  size: { type: String, default: 'md' } // sm | md | lg
})
const style = computed(() => {
  const p = dayPlate(props.index)
  return { '--bg': p.bg, '--fg': p.fg }
})
</script>

<style scoped>
/* A small bumper plate: coloured disc, a slightly darker rim and a hub */
.plate {
  flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%;
  background:
    radial-gradient(circle, rgba(0,0,0,0) 0 54%, rgba(0,0,0,0.13) 55% 58%, rgba(0,0,0,0) 59%),
    var(--bg);
  color: var(--fg);
  box-shadow: inset 0 0 0 2px rgba(0,0,0,0.12), 0 0 0 1px var(--plate-ring);
  font-family: var(--font-num); font-weight: 700;
}
.p-sm { width: 30px; height: 30px; font-size: 15px; }
.p-md { width: 44px; height: 44px; font-size: 20px; }
.p-lg { width: 60px; height: 60px; font-size: 28px; }
</style>
