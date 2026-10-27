<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ t('History') }}</h1>
    <p v-if="!finishedSessions.length" class="t-body t-muted empty">{{ t('Finished workouts show up here.') }}</p>

    <template v-else>
      <Segmented v-model="view" class="view-switch" :options="[{ label: t('Calendar'), value: 'cal' }, { label: t('List'), value: 'list' }]" :label="t('View')" />

      <!-- Calendar -->
      <template v-if="view === 'cal'">
        <div class="row month-head">
          <button class="icon-btn" :aria-label="t('Previous month')" @click="month = shiftMonth(month, -1)"><Icon name="chevronLeft" /></button>
          <div class="grow center">
            <div class="t-h2">{{ monthName(month) }}</div>
            <div class="t-small t-muted">{{ monthLine }}</div>
          </div>
          <button class="icon-btn" :aria-label="t('Next month')" :disabled="month >= thisMonth" @click="month = shiftMonth(month, 1)"><Icon name="chevronRight" /></button>
        </div>

        <div class="card cal" role="grid" :aria-label="monthName(month)">
          <div class="cal-row cal-head" role="row">
            <span v-for="l in weekdayLabels" :key="l" class="t-tiny t-muted" role="columnheader">{{ l }}</span>
          </div>
          <div v-for="(wk, wi) in weeks" :key="wi" class="cal-row" role="row">
            <button
              v-for="d in wk" :key="d.key" class="cal-day" role="gridcell"
              :class="{ out: !d.inMonth, today: d.today, has: d.sessions.length, sel: d.key === selected }"
              :disabled="!d.inMonth" :aria-label="dayAria(d)" @click="selected = d.key"
            >
              <span class="t-num dn">{{ d.day }}</span>
              <span class="dots">
                <span v-for="s in d.sessions.slice(0, 3)" :key="s.id" class="dot" :style="dotStyle(s)" />
              </span>
            </button>
          </div>
        </div>

        <section>
          <h2 class="section-h">{{ selectedLabel }}</h2>
          <div v-if="selectedSessions.length" class="group">
            <RouterLink v-for="s in selectedSessions" :key="s.id" :to="`/summary/${s.id}`" class="group-row">
              <PlateBadge :index="s.dayIndex ?? -1" :label="s.dayId === 'free' ? '+' : s.dayId" size="sm" />
              <div class="grow">
                <div class="t-h3 truncate">{{ sessionTitle(s) }}</div>
                <div class="t-small t-muted">{{ line(s) }}</div>
              </div>
              <Icon name="chevronRight" class="chev" />
            </RouterLink>
          </div>
          <p v-else class="t-small t-muted rest-day">{{ t('No workout this day.') }}</p>
        </section>

        <RouterLink v-if="monthSessions.length" :to="`/report/${month}`" class="btn btn-soft btn-block report-btn">
          <Icon name="report" />{{ t('{month} report', { month: monthName(month, { month: 'long' }) }) }}
        </RouterLink>
      </template>

      <!-- List -->
      <template v-else>
        <section v-for="g in groups" :key="g.key">
          <h2 class="section-h">{{ monthName(g.key) }}</h2>
          <div class="group">
            <RouterLink v-for="s in g.sessions" :key="s.id" :to="`/summary/${s.id}`" class="group-row">
              <PlateBadge :index="s.dayIndex ?? -1" :label="s.dayId === 'free' ? '+' : s.dayId" size="sm" />
              <div class="grow">
                <div class="t-h3 truncate">{{ sessionTitle(s) }}</div>
                <div class="t-small t-muted">{{ when(s.startedAt) }}, {{ line(s) }}</div>
              </div>
              <Icon name="chevronRight" class="chev" />
            </RouterLink>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import Segmented from '../ui/Segmented.vue'
import { dayPlate } from '../ui/plates.js'
import { state, finishedSessions } from '../store.js'
import { dayTitle, monthName, fmtDate, fmtMins, sessionTitle } from '../lib/format.js'
import { dateKey } from '../lib/training.js'
import { calendarMonth, shiftMonth, monthKey, sessionMinutes, workSets, addDays, weekStart } from '../lib/stats.js'
import { t, tn, locale } from '../i18n/index.js'

const router = useRouter()

// Remember the chosen view on this phone (a convenience; fine if storage is unavailable)
const VIEW_KEY = 'gymcrew.historyView'
let saved = null
try { saved = localStorage.getItem(VIEW_KEY) } catch { /* ignore */ }
const view = ref(saved === 'list' ? 'list' : 'cal')
watch(view, (v) => { try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ } })

const thisMonth = computed(() => state.today.slice(0, 7))
const month = ref(thisMonth.value)
const weeks = computed(() => calendarMonth(month.value, state.data.sessions, new Date(state.today + 'T12:00:00')))
const weekdayLabels = computed(() => {
  const mon = weekStart(new Date())
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i).toLocaleDateString(locale(), { weekday: 'narrow' }).toUpperCase())
})

const monthSessions = computed(() => finishedSessions.value.filter(s => monthKey(s.startedAt) === month.value))
const monthLine = computed(() => {
  const n = monthSessions.value.length
  if (!n) return t('No workouts')
  const mins = monthSessions.value.reduce((a, s) => a + sessionMinutes(s), 0)
  const h = Math.round(mins / 6) / 10
  return `${tn(n, '{n} workout', '{n} workouts')} · ${t('{h} h', { h: h.toLocaleString(locale()) })}`
})

// Selected day: today in the current month, otherwise the last workout of the month
const selected = ref(state.today)
watch(month, (m) => {
  if (m === thisMonth.value) selected.value = state.today
  else {
    const last = monthSessions.value[0]
    selected.value = last ? dateKey(last.startedAt) : `${m}-01`
  }
})
const selectedSessions = computed(() => finishedSessions.value.filter(s => dateKey(s.startedAt) === selected.value).reverse())
const selectedLabel = computed(() => (selected.value === state.today ? t('Today') : fmtDate(selected.value + 'T12:00:00')))

const dotStyle = (s) => ({ background: dayPlate(s.dayIndex ?? -1).bg })
const dayAria = (d) => d.sessions.length
  ? `${d.day}: ${d.sessions.map(s => sessionTitle(s)).join(', ')}`
  : String(d.day)

const line = (s) => `${tn(workSets(s).length, '{n} set', '{n} sets')}, ${t('{n} min', { n: fmtMins(sessionMinutes(s)) })}`
const when = (iso) => new Date(iso).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })

const groups = computed(() => {
  const out = []
  for (const s of finishedSessions.value) {
    const key = monthKey(s.startedAt)
    let g = out.find(x => x.key === key)
    if (!g) { g = { key, sessions: [] }; out.push(g) }
    g.sessions.push(s)
  }
  return out
})
</script>

<style scoped>
.empty { margin-top: 12px; }
.view-switch { margin-top: 14px; }
.month-head { margin-top: 18px; gap: 4px; }
.center { text-align: center; }
.cal { margin-top: 12px; padding: 10px 8px 12px; }
.cal-row { display: grid; grid-template-columns: repeat(7, 1fr); }
.cal-head { text-align: center; padding: 4px 0 6px; font-weight: 700; }
.cal-day {
  height: 52px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  border-radius: 12px; color: var(--ink);
}
.cal-day.out { visibility: hidden; }
.cal-day .dn { font-size: 18px; font-weight: 600; line-height: 1; }
.cal-day:not(.has) .dn { color: var(--ink-2); font-weight: 500; }
.cal-day.today .dn { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
.cal-day.sel { background: var(--card-2); box-shadow: inset 0 0 0 2px var(--ink-3); }
.cal-day:active { background: var(--press); }
.dots { display: flex; gap: 3px; height: 8px; margin-top: 5px; } /* clear of today's underline */
.dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 1px var(--plate-ring); }
.rest-day { margin: 0 4px; }
.report-btn { margin-top: 20px; }
</style>
