<template>
  <Transition name="fade">
    <button v-if="show" class="rest-pill" :class="{ done: rest.done }" @click="goWorkout">
      <Icon name="timer" :size="20" />
      <span class="t-num rp-time">{{ rest.done ? 'Go' : mmss(rest.remaining) }}</span>
      <span class="rp-label">{{ rest.done ? 'Rest over' : 'Resting' }}</span>
      <Icon name="chevronRight" :size="20" />
    </button>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { rest } from '../lib/restTimer.js'
import { activeSession } from '../store.js'
import { mmss } from '../lib/format.js'

const route = useRoute()
const router = useRouter()
const show = computed(() => !!rest.endsAt && route.name !== 'workout')
function goWorkout () {
  if (activeSession.value) router.push(`/workout/${activeSession.value.id}`)
}
</script>

<style scoped>
.rest-pill {
  position: fixed; left: 50%; transform: translateX(-50%); z-index: 1001;
  bottom: calc(var(--nav-h) + var(--safe-bottom) + 12px);
  display: flex; align-items: center; gap: 8px;
  min-height: 48px; padding: 0 12px 0 16px; border-radius: 24px;
  background: var(--ink); color: var(--paper);
  box-shadow: var(--shadow-float);
  font-weight: 600;
}
.rest-pill.done { background: var(--ok); color: #fff; }
.rp-time { font-size: 22px; font-weight: 700; min-width: 44px; text-align: left; }
.rp-label { font-size: 14px; opacity: 0.8; }
</style>
