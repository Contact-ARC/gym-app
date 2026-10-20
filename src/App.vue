<template>
  <RouterView v-slot="{ Component }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>

  <BottomNav v-if="!route.meta.hideNav" :active="route.meta.tab" />
  <RestPill />
  <Toast :bottom="toastBottom" :top="toastTop" />

  <!-- New month's routine -->
  <Sheet :model-value="!!announce" :title="announce?.title" @update:model-value="(v) => !v && markRoutineSeen()">
    <template v-if="announce">
      <p v-if="announce.description" class="t-body t-muted">{{ announce.description }}</p>
      <ul class="news">
        <li v-for="(w, i) in announce.whatsNew" :key="i">{{ w }}</li>
      </ul>
    </template>
    <template #actions>
      <button class="btn btn-primary btn-lg" @click="markRoutineSeen">Got it</button>
    </template>
  </Sheet>

  <WelcomeSheet />
</template>

<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import BottomNav from './ui/BottomNav.vue'
import RestPill from './ui/RestPill.vue'
import Toast from './ui/Toast.vue'
import Sheet from './ui/Sheet.vue'
import WelcomeSheet from './views/WelcomeSheet.vue'
import { state, newRoutineToAnnounce, markRoutineSeen } from './store.js'
import { rest } from './lib/restTimer.js'

const route = useRoute()

// Don't interrupt a workout or a first-run welcome with the routine announcement
const announce = computed(() => {
  if (route.meta.hideNav) return null
  if (!state.data.welcomed && !state.data.sessions.length) return null
  return newRoutineToAnnounce.value
})

// In a workout the bottom is busy (rest timer, log button), so messages drop in from the top
const toastTop = computed(() => (route.name === 'workout' ? 'calc(var(--safe-top) + 64px)' : ''))
// …and elsewhere they sit above the nav bar and the floating rest timer
const toastBottom = computed(() => {
  if (route.meta.hideNav) return 'calc(var(--safe-bottom) + 16px)'
  return `calc(var(--nav-h) + var(--safe-bottom) + ${rest.endsAt ? 72 : 12}px)`
})

// Theme: light, dark, or follow the phone
const media = window.matchMedia?.('(prefers-color-scheme: dark)')
function applyTheme () {
  const pref = state.data.profile.theme || 'system'
  const dark = pref === 'system' ? !!media?.matches : pref === 'dark'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#181D25' : '#EEF1F4')
}
watchEffect(applyTheme)
media?.addEventListener?.('change', applyTheme)
</script>

<style scoped>
.news { margin: 14px 0 0 20px; }
.news li { margin-bottom: 8px; font-size: 16px; }
</style>
