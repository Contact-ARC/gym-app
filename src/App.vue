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

  <!-- New app version: ask once per version (the banner on Home stays until you update) -->
  <Sheet :model-value="!!updatePrompt" :title="t('Version {v} is ready', { v: updatePrompt?.version })" @update:model-value="(v) => !v && dismissUpdate()">
    <p v-if="updatePrompt && tx(updatePrompt, 'notes')" class="t-body t-muted">{{ tx(updatePrompt, 'notes') }}</p>
    <p class="t-small t-muted upd-note">{{ t('Download it from GitHub and install it over this one. Your workouts stay.') }}</p>
    <template #actions>
      <button class="btn btn-soft btn-lg" @click="dismissUpdate">{{ t('Later') }}</button>
      <button class="btn btn-primary btn-lg" @click="downloadUpdate"><Icon name="download" />{{ t('Download') }}</button>
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

  <!-- The routine changed a day you'd adjusted: what to do with your changes -->
  <Sheet :model-value="!!dayChange" :title="dayChange ? t('Day {id} changed', { id: dayChange.dayId }) : ''" @update:model-value="(v) => !v && laterDayChange()">
    <template v-if="dayChange">
      <p class="t-body">
        <template v-if="dayChange.kind === 'gone'">{{ tn(dayChange.count, "This month's routine doesn't have a day {id} any more. You had {n} change to it.", "This month's routine doesn't have a day {id} any more. You had {n} changes to it.", { id: dayChange.dayId }) }}</template>
        <template v-else>{{ tn(dayChange.count, 'It was {from} and now it\'s {to}. You had {n} change for the old version.', 'It was {from} and now it\'s {to}. You had {n} changes for the old version.', { from: chName(dayChange.fromName, dayChange.fromNameEs), to: chName(dayChange.toName, dayChange.toNameEs) }) }}</template>
      </p>
      <div class="group choices">
        <button class="group-row" @click="resolveChange('mine')">
          <Icon name="mine" />
          <div class="grow">
            <div class="t-h3">{{ t('Save the old day {id} as mine', { id: dayChange.dayId }) }}</div>
            <div class="t-tiny t-muted">{{ t('With your changes, in My routines. The new day {id} starts as the routine has it.', { id: dayChange.dayId }) }}</div>
          </div>
        </button>
        <button v-if="dayChange.kind !== 'gone'" class="group-row" @click="resolveChange('fit')">
          <Icon name="adjust" />
          <div class="grow">
            <div class="t-h3">{{ t('Apply what still fits') }}</div>
            <div class="t-tiny t-muted">{{ t('Keeps the changes that make sense on the new day, like extra exercises.') }}</div>
          </div>
        </button>
        <button class="group-row" @click="resolveChange('drop')">
          <Icon name="trash" />
          <div class="grow">
            <div class="t-h3">{{ t('Drop my changes') }}</div>
            <div class="t-tiny t-muted">{{ t('Use the new day as the routine has it.') }}</div>
          </div>
        </button>
      </div>
    </template>
  </Sheet>

  <!-- Plans whose time ran out -->
  <Sheet :model-value="!!endedPlans.length" :title="tn(endedPlans.length, 'Back in My routines', 'Back in My routines')" @update:model-value="(v) => !v && dismissPlanNotices()">
    <p class="t-body t-muted">{{ tn(endedPlans.length, 'Its time on Train is up. It\'s kept in My routines for whenever you want it again.', 'Their time on Train is up. They\'re kept in My routines for whenever you want them again.') }}</p>
    <div class="group choices">
      <div v-for="p in endedPlans" :key="p.id" class="group-row">
        <span class="grow t-h3 truncate">{{ p.name || t('Untitled') }}</span>
        <button class="btn btn-sm btn-soft" @click="useAgain(p)">{{ t('Use again') }}</button>
      </div>
    </div>
    <template #actions>
      <button class="btn btn-primary btn-lg" @click="dismissPlanNotices">{{ t('OK') }}</button>
    </template>
  </Sheet>

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
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomNav from './ui/BottomNav.vue'
import RestPill from './ui/RestPill.vue'
import Toast from './ui/Toast.vue'
import Sheet from './ui/Sheet.vue'
import WelcomeSheet from './views/WelcomeSheet.vue'
import {
  state, newRoutineToAnnounce, markRoutineSeen, nextDay, persist, updateAvailable, pendingDayChanges, resolveDayChange,
  planById, usePlan, dismissPlanNotices
} from './store.js'
import { toast } from './ui/toast.js'
import Icon from './ui/Icon.vue'
import { openUrl } from './lib/native.js'
import { scheduleReminders } from './lib/reminders.js'
import { dayTitle, monthName } from './lib/format.js'
import { rest } from './lib/restTimer.js'
import { t, tn, tx, setLang, deviceLang, i18n } from './i18n/index.js'
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

const updatePrompt = computed(() => {
  const u = updateAvailable.value
  if (!u || route.meta.hideNav || announce.value || !state.data.welcomed || dayChange.value) return null
  return state.data.updateSeen === u.version ? null : u
})
function dismissUpdate () {
  if (!updatePrompt.value) return
  state.data.updateSeen = updatePrompt.value.version
  persist()
}
function downloadUpdate () {
  const u = updatePrompt.value
  dismissUpdate()
  if (u) openUrl(u.downloadUrl)
}

// Month report: first time the app opens in a new month, if last month had workouts
const reportToShow = computed(() => {
  if (route.meta.hideNav || announce.value || updatePrompt.value || dayChange.value || !state.data.welcomed) return null
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

// ── The routine changed a day you'd adjusted ──
// Asked on Train-side screens (not mid-workout, not over the month's announcement); "later" waits until you ask from the day
const laterChange = ref(null)
const dayChange = computed(() => {
  const list = pendingDayChanges.value
  if (state.reviewDayChange) return list.find(c => c.dayId === state.reviewDayChange) || null
  if (route.meta.hideNav || announce.value || route.meta.tab !== 'home') return null
  return list.find(c => c.dayId !== laterChange.value) || null
})
function laterDayChange () {
  laterChange.value = dayChange.value?.dayId || null
  state.reviewDayChange = null
}
const chName = (en, es) => dayTitle(i18n.lang === 'es' && es ? es : en, '')
function resolveChange (choice) {
  const c = dayChange.value
  if (!c) return
  const name = dayTitle(chName(c.fromName, c.fromNameEs), c.dayId) + ' (' + monthName(c.baseMonth, { month: 'short' }) + ')'
  const plan = resolveDayChange(c.dayId, choice, name)
  state.reviewDayChange = null
  if (plan) toast(t('Saved to My routines'), { actionLabel: t('Open'), action: () => router.push(`/plan/${plan.id}`) })
  else toast(choice === 'fit' ? t('Your changes that fit are on the new day') : t('Changes dropped'))
}

// ── Plans whose time ran out ──
const endedPlans = computed(() => {
  if (route.meta.hideNav || announce.value || dayChange.value) return []
  return state.data.planNotices.map(planById).filter(Boolean)
})
function useAgain (p) {
  const last = p.lastUse || {}
  usePlan(p.id, { mode: last.mode || 'add', until: last.until || 'month', weeks: last.weeks || 4 })
  toast(t('{name} is on Train again', { name: p.name }))
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
  () => [JSON.stringify(state.data.settings.reminders), nextDay.value?.key, nextDay.value?.name, i18n.lang],
  () => {
    clearTimeout(remTimer)
    remTimer = setTimeout(() => {
      const d = nextDay.value
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
.upd-note { margin-top: 12px; }
.ch { margin-top: 14px; background: var(--card-2); border-radius: var(--r-card); }
.ch .t-small { margin-top: 4px; }
.up { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
.choices { margin-top: 16px; background: var(--card-2); }
.choices .group-row { align-items: flex-start; }
</style>
