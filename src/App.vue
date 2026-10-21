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
  <Sheet :model-value="!!announce" :title="tx(announce, 'title')" @update:model-value="(v) => !v && markRoutineSeen()">
    <template v-if="announce">
      <p v-if="tx(announce, 'description')" class="t-body t-muted">{{ tx(announce, 'description') }}</p>
      <ul class="news">
        <li v-for="(w, i) in tx(announce, 'whatsNew')" :key="i">{{ w }}</li>
      </ul>
      <div v-if="announce.challenge" class="ch card-pad">
        <div class="t-tiny t-muted up">{{ t('This month\'s challenge') }}</div>
        <div class="t-h3">{{ tx(announce.challenge, 'title') }}</div>
        <p v-if="tx(announce.challenge, 'description')" class="t-small t-muted">{{ tx(announce.challenge, 'description') }}</p>
      </div>
    </template>
    <template #actions>
      <button class="btn btn-primary btn-lg" @click="markRoutineSeen">{{ t('Got it') }}</button>
    </template>
  </Sheet>

  <!-- Last month's report, once, at the start of a new month -->
  <Sheet :model-value="!!reportToShow" :title="t('Your {month} in numbers', { month: monthName(reportToShow || '', { month: 'long' }) })" @update:model-value="(v) => !v && seeReport(false)">
    <p class="t-body t-muted">{{ t('A new month started. Here\'s how the last one went: workouts, records and your biggest gains.') }}</p>
    <template #actions>
      <button class="btn btn-primary btn-lg" @click="seeReport(true)">{{ t('See my report') }}</button>
      <button class="btn btn-ghost" @click="seeReport(false)">{{ t('Later') }}</button>
    </template>
  </Sheet>

  <WelcomeSheet />

  <!-- Saving to the phone keeps failing -->
  <div v-if="state.saveError" class="save-err" role="alert">
    <span class="grow t-small">{{ t("Couldn't save to the phone. Your changes are kept while the app stays open.") }}</span>
    <button class="btn btn-sm btn-primary" @click="persist">{{ t('Try again') }}</button>
  </div>

  <!-- One-off notices (data restored from a backup, …) -->
  <Sheet :model-value="!!state.notice" :title="t('About your data')" @update:model-value="(v) => !v && (state.notice = null)">
    <p v-if="state.notice" class="t-body">{{ t(state.notice.key, state.notice.vars) }}</p>
    <template #actions>
      <button class="btn btn-primary btn-lg" @click="state.notice = null">{{ t('OK') }}</button>
    </template>
  </Sheet>
</template>

<script setup>
import { computed, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomNav from './ui/BottomNav.vue'
import RestPill from './ui/RestPill.vue'
import Toast from './ui/Toast.vue'
import Sheet from './ui/Sheet.vue'
import WelcomeSheet from './views/WelcomeSheet.vue'
import { state, newRoutineToAnnounce, markRoutineSeen, days, persist } from './store.js'
import { scheduleReminders } from './lib/reminders.js'
import { dayTitle, monthName } from './lib/format.js'
import { rest } from './lib/restTimer.js'
import { t, tx, setLang, deviceLang, i18n } from './i18n/index.js'
import { monthKey, shiftMonth, sessionsInMonth } from './lib/stats.js'

const route = useRoute()
const router = useRouter()

// Language: the setting, or the phone's language
watchEffect(() => setLang(state.data.settings.lang || deviceLang()))

// Don't interrupt a workout or a first-run welcome with the routine announcement
const announce = computed(() => {
  if (route.meta.hideNav) return null
  if (!state.data.welcomed && !state.data.sessions.length) return null
  return newRoutineToAnnounce.value
})

// Month report: first time the app opens in a new month, if last month had workouts
const reportToShow = computed(() => {
  if (route.meta.hideNav || announce.value || !state.data.welcomed) return null
  const last = shiftMonth(monthKey(new Date(state.today + 'T12:00:00')), -1)
  if (state.data.reportsSeen[last]) return null
  return sessionsInMonth(state.data.sessions, last).length ? last : null
})
function seeReport (open) {
  const m = reportToShow.value
  if (!m) return
  state.data.reportsSeen[m] = true
  persist()
  if (open) router.push(`/report/${m}`)
}

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

// Larger text: scale the whole interface a little
watchEffect(() => {
  document.documentElement.style.zoom = state.data.settings.textSize === 'large' ? '1.1' : ''
})

// Keep the weekly reminders in sync with the settings and the next day in the rotation
let remTimer = null
watch(
  () => [JSON.stringify(state.data.settings.reminders), state.data.nextDayIndex, days.value.length, i18n.lang],
  () => {
    clearTimeout(remTimer)
    remTimer = setTimeout(() => {
      const d = days.value[state.data.nextDayIndex] || days.value[0]
      const body = d ? t('Next up: day {id}, {name}', { id: d.id, name: dayTitle(tx(d, 'name'), d.id) }) : t('Time to train')
      scheduleReminders(state.data.settings.reminders, body)
    }, 800)
  },
  { immediate: true }
)
</script>

<style scoped>
.news { margin: 14px 0 0 20px; }
.news li { margin-bottom: 8px; font-size: 16px; }
.save-err {
  position: fixed; left: 12px; right: 12px; top: calc(var(--safe-top) + 8px); z-index: 2600;
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--r-card);
  background: var(--err-soft); color: var(--ink); box-shadow: var(--shadow-float);
}
.ch { margin-top: 14px; background: var(--card-2); border-radius: var(--r-card); }
.ch .t-small { margin-top: 4px; }
.up { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
</style>
