<template>
  <v-slide-y-reverse-transition>
    <div v-if="rest.endsAt" class="rest-bar" :class="{ done: rest.done }">
      <v-progress-linear :model-value="pct" color="primary" height="4" />
      <div class="d-flex align-center px-4 py-2">
        <div class="flex-grow-1" style="min-width: 0">
          <div class="text-caption muted text-truncate">{{ rest.done ? 'Rest over' : 'Resting' }}<span v-if="rest.label"> · next: {{ rest.label }}</span></div>
          <div class="time tabular">{{ mmss }}</div>
        </div>
        <v-btn variant="tonal" size="small" class="mr-2" @click="addRest(-15)" :disabled="rest.remaining <= 15">−15</v-btn>
        <v-btn variant="tonal" size="small" class="mr-2" @click="addRest(30)">+30</v-btn>
        <v-btn color="primary" variant="flat" size="small" @click="stopRest">Skip</v-btn>
      </div>
    </div>
  </v-slide-y-reverse-transition>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { rest, addRest, stopRest } from '../lib/restTimer.js'

const route = useRoute()
const pct = computed(() => (rest.total ? 100 - (rest.remaining / rest.total) * 100 : 0))
const mmss = computed(() => {
  const s = rest.remaining
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
// Sit above the bottom nav when it's visible
const bottomOffset = computed(() => (route.meta.hideNav ? '0px' : '56px'))
</script>

<style scoped>
.rest-bar {
  position: fixed; left: 0; right: 0;
  bottom: calc(v-bind(bottomOffset) + env(safe-area-inset-bottom));
  z-index: 1005;
  background: rgb(var(--v-theme-surface-variant));
  box-shadow: 0 -4px 16px rgba(0,0,0,0.35);
}
.rest-bar.done { background: rgb(var(--v-theme-success)); color: #fff; }
.time { font-size: 1.6rem; font-weight: 700; line-height: 1.1; }
</style>
