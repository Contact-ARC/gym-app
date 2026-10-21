<template>
  <div class="page">
    <header class="home-head">
      <div class="grow">
        <div class="t-small t-muted">{{ weekdayDate() }}</div>
        <h1 class="t-title">{{ greeting }}</h1>
      </div>
      <button class="icon-btn" :class="{ spin: state.routineStatus.loading }" :aria-label="t('Check for a new routine')" @click="refresh">
        <Icon name="refresh" />
      </button>
      <RouterLink to="/settings" class="icon-btn" :aria-label="t('Settings')"><Icon name="settings" /></RouterLink>
    </header>
    <div v-if="routine" class="row meta">
      <span class="pill">{{ tx(routine, 'title') }}</span>
      <span class="pill">{{ t('Week {n}', { n: currentWeek }) }}</span>
      <span v-if="isDeloadWeek" class="pill pill-warn"><Icon name="deload" :size="16" />{{ t('Deload week') }}</span>
      <span v-else-if="todayPlan.rir != null" class="pill">{{ t('Leave {n} in the tank', { n: todayPlan.rir }) }}</span>
      <span v-if="beginner" class="pill">{{ t('Beginner track') }}</span>
    </div>

    <!-- Status messages -->
    <div class="stack notes">
      <button v-if="updateAvailable" class="note note-info row note-btn" @click="openUrl(updateAvailable.downloadUrl)">
        <Icon name="download" />
        <div class="grow">
          <div class="t-h3">{{ t('App update {v} is ready', { v: updateAvailable.version }) }}</div>
          <div v-if="tx(updateAvailable, 'notes')" class="t-small t-muted">{{ tx(updateAvailable, 'notes') }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>

      <div v-if="!routine && !state.routineStatus.loading" class="note note-warn">
        <div class="t-h3">{{ t('No routine yet') }}</div>
        <p class="t-small">{{ t('Connect to the internet once to download this month\'s routine.') }}</p>
        <p v-if="state.routineStatus.error" class="t-tiny t-muted err-line">{{ state.routineStatus.error }}</p>
        <div class="row" style="margin-top: 12px">
          <button class="btn btn-sm btn-primary" @click="refresh">{{ t('Try again') }}</button>
          <RouterLink to="/settings" class="btn btn-sm btn-ghost">{{ t('Settings') }}</RouterLink>
        </div>
      </div>
      <div v-else-if="routine && state.routineStatus.error" class="t-small t-muted row offline">
        <Icon name="offline" :size="18" />{{ t('Offline. Using the routine saved {when}.', { when: relativeDay(state.data.cache.fetchedAt) }) }}
      </div>

      <RouterLink v-if="needsBackup" to="/settings#backup" class="note note-warn row note-btn">
        <div class="grow t-small">
          {{ daysSinceBackup == null ? t("Your workouts aren't saved off this phone yet.") : t('Last backup off this phone was {n} days ago.', { n: daysSinceBackup }) }}
          <b>{{ t('Back up now') }}</b>
        </div>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>

      <RouterLink v-if="reportMonth" :to="`/report/${reportMonth}`" class="note row note-btn report-note">
        <Icon name="report" />
        <div class="grow">
          <div class="t-h3">{{ t('Your {month} report', { month: monthName(reportMonth, { month: 'long' }) }) }}</div>
          <div class="t-small t-muted">{{ t('Workouts, records and biggest gains') }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
    </div>

    <!-- Workout in progress -->
    <RouterLink v-if="activeSession" :to="`/workout/${activeSession.id}`" class="card hero live" :style="plateStyle(activeSession.dayIndex ?? -1)">
      <div class="row">
        <PlateBadge :index="activeSession.dayIndex ?? -1" :label="activeSession.dayId === 'free' ? '+' : activeSession.dayId" size="lg" />
        <div class="grow">
          <div class="t-small t-muted">{{ t('Workout in progress') }}</div>
          <div class="t-h2">{{ sessionTitle(activeSession) }}</div>
          <div class="t-small t-muted">
            {{ tn(activeSession.sets.length, '{n} set logged', '{n} sets logged') }}<template v-if="startedEarlier">{{ ' · ' + t('started {when}', { when: relativeDay(activeSession.startedAt) }) }}</template>
          </div>
        </div>
      </div>
      <span class="btn btn-lg btn-block btn-plate hero-btn"><Icon name="play" />{{ t('Continue') }}</span>
    </RouterLink>

    <!-- Next up -->
    <section v-else-if="nextDay" class="card hero" :style="plateStyle(nextIndex)">
      <div class="row">
        <PlateBadge :index="nextIndex" :label="nextDay.id" size="lg" />
        <div class="grow">
          <div class="t-small t-muted">{{ t('Next up') }}</div>
          <h2 class="t-h2">{{ dayTitle(tx(nextDay, 'name'), nextDay.id) }}</h2>
          <div class="t-small t-muted">{{ tn(nextDay.items.length, '{n} exercise', '{n} exercises') }}<template v-if="nextDay.estMinutes">{{ t(', about {n} min', { n: nextDay.estMinutes }) }}</template></div>
        </div>
      </div>
      <ul class="ex-list">
        <li v-for="(it, i) in nextItems" :key="i" class="row">
          <span class="grow truncate">{{ exName(it.exerciseId) }}</span>
          <span class="t-num t-muted">{{ prescription({ ...it, sets: plannedSetsFor(it, i, todayPlan) }, exercisesById[it.exerciseId]) }}</span>
        </li>
      </ul>
      <div class="row hero-actions">
        <RouterLink :to="`/day/${nextIndex}`" class="btn btn-lg btn-soft">{{ t('Details') }}</RouterLink>
        <button class="btn btn-lg btn-plate grow" @click="start(nextIndex)"><Icon name="play" />{{ t('Start day {id}', { id: nextDay.id }) }}</button>
      </div>
    </section>

    <ChallengeCard :compact="challengeStarted" />

    <!-- This week -->
    <section v-if="routine || finishedSessions.length">
      <h2 class="section-h">{{ t('This week') }}</h2>
      <div class="card card-pad week">
        <div class="week-row">
          <div v-for="d in week" :key="d.key" class="wd" :class="{ on: d.on, today: d.today, future: d.future }">
            <span class="wd-dot"><Icon v-if="d.on" name="checkBold" :size="16" /></span>
            <span class="wd-l">{{ d.label }}</span>
          </div>
        </div>
        <div v-if="streak.weeks || streak.thisWeek" class="row streak" :class="{ safe: streak.safe }">
          <Icon name="fire" :size="20" />
          <span class="grow t-small">
            <b v-if="streak.weeks">{{ tn(streak.weeks, '{n}-week streak', '{n}-week streak') }}. </b>
            <template v-if="streak.safe">{{ t('This week counts.') }}</template>
            <template v-else>{{ tn(streak.min - streak.thisWeek, '{n} more workout this week keeps it going.', '{n} more workouts this week keep it going.') }}</template>
          </span>
        </div>
        <div class="t-small t-muted week-sum">
          {{ weekCount === 0 ? t('No workouts yet this week.') : tn(weekCount, '{n} workout this week.', '{n} workouts this week.') }}
          <RouterLink to="/history" class="link">{{ t('History') }}</RouterLink>
        </div>
      </div>
    </section>

    <!-- All days -->
    <section v-if="days.length">
      <h2 class="section-h">{{ t('This month\'s days') }}</h2>
      <div class="group">
        <RouterLink v-for="(d, i) in days" :key="d.id" :to="`/day/${i}`" class="group-row">
          <PlateBadge :index="i" :label="d.id" />
          <div class="grow">
            <div class="t-h3 truncate">{{ dayTitle(tx(d, 'name'), d.id) }}</div>
            <div class="t-small t-muted">{{ lastDone[d.id] ? t('Done {when}', { when: lastDone[d.id] }) : tn(d.items.length, '{n} exercise', '{n} exercises') }}</div>
          </div>
          <span v-if="i === nextIndex && !activeSession" class="pill">{{ t('pill|Next') }}</span>
          <Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
    </section>

    <button v-if="!activeSession" class="btn btn-soft btn-block free" @click="startFree">
      <Icon name="plus" />{{ t('Log a session outside the routine') }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import ChallengeCard from '../ui/ChallengeCard.vue'
import { plateStyle } from '../ui/plates.js'
import {
  state, routine, days, currentWeek, isDeloadWeek, todayPlan, updateAvailable, refreshRoutines,
  activeSession, exercisesById, startSession, startFreeSession, finishedSessions, daysSinceBackup,
  trackItem, streak
} from '../store.js'
import { openUrl } from '../lib/native.js'
import { prescription, relativeDay, dayTitle, weekdayDate, monthName, sessionTitle } from '../lib/format.js'
import { dateKey, plannedSetsFor } from '../lib/training.js'
import { monthKey, shiftMonth, sessionsInMonth } from '../lib/stats.js'
import { toast } from '../ui/toast.js'
import { t, tx, locale } from '../i18n/index.js'

const router = useRouter()

const greeting = computed(() => {
  const h = new Date().getHours()
  const part = h < 6 ? t('Late session') : h < 12 ? t('Good morning') : h < 19 ? t('Good afternoon') : t('Good evening')
  const n = state.data.profile.name
  return n ? `${part}, ${n}` : part
})
const beginner = computed(() => state.data.profile.level === 'beginner')
// A workout left open from an earlier day: say so, so it's finished or discarded rather than continued by mistake
const startedEarlier = computed(() => activeSession.value && dateKey(activeSession.value.startedAt) !== state.today)
// The challenge's description is for the start of the month; after the first workout just show progress
const challengeStarted = computed(() => !!routine.value && sessionsInMonth(state.data.sessions, routine.value.month).length > 0)

const nextIndex = computed(() => (days.value[state.data.nextDayIndex] ? state.data.nextDayIndex : 0))
const nextDay = computed(() => days.value[nextIndex.value])
const nextItems = computed(() => (nextDay.value?.items || []).map(trackItem))
const exName = (id) => tx(exercisesById.value[id], 'name') || id

const lastDone = computed(() => {
  void state.today // re-word "today"/"yesterday" when the date changes
  const out = {}
  for (const s of finishedSessions.value) {
    if (s.routineMonth === routine.value?.month && !out[s.dayId]) out[s.dayId] = relativeDay(s.startedAt)
  }
  return out
})

// Monday-first week strip
const week = computed(() => {
  const trained = new Set(finishedSessions.value.map(s => dateKey(s.startedAt)))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const key = dateKey(d)
    return {
      key,
      label: d.toLocaleDateString(locale(), { weekday: 'narrow' }).toUpperCase(),
      on: trained.has(key),
      today: key === dateKey(today),
      future: d > today
    }
  })
})
const weekCount = computed(() => week.value.filter(d => d.on).length)

// Exports off the phone: every 2 weeks, or every 5 weeks while automatic backups are working
const needsBackup = computed(() => {
  if (finishedSessions.value.length < 3) return false
  const autoOk = state.data.settings.autoBackup !== 'off' && state.data.autoBackup.where === 'documents' && !state.data.autoBackup.lastError
  const limit = autoOk ? 35 : 14
  return daysSinceBackup.value == null ? !autoOk || finishedSessions.value.length >= 12 : daysSinceBackup.value >= limit
})

// First week of a month: link to last month's report
const reportMonth = computed(() => {
  const today = new Date(state.today + 'T12:00:00')
  if (today.getDate() > 7) return null
  const last = shiftMonth(monthKey(today), -1)
  return sessionsInMonth(state.data.sessions, last).length ? last : null
})

async function refresh () {
  await refreshRoutines()
  if (!state.routineStatus.error) toast(t('Routine is up to date'))
}
function start (i) {
  const id = startSession(i)
  if (id) router.push(`/workout/${id}`)
}
function startFree () {
  const id = startFreeSession(t('Free session'))
  if (id) router.push(`/workout/${id}`)
}
</script>

<style scoped>
.home-head { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; }
.home-head h1 { margin-top: 2px; }
.meta { flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.notes { margin-top: 16px; }
.notes:empty { display: none; }
.note-btn { width: 100%; text-align: left; }
.err-line { margin-top: 6px; word-break: break-word; }
.offline { gap: 8px; }

.hero { display: block; padding: 18px; margin-top: 18px; }
.hero h2 { margin: 2px 0; }
.ex-list { list-style: none; margin: 16px 0 4px; }
.ex-list li { padding: 8px 0; font-size: 16px; border-top: 1px solid var(--line); gap: 12px; }
.hero-actions { margin-top: 14px; gap: 10px; }
.hero-actions .btn-soft { flex: 0 0 auto; padding-left: 18px; padding-right: 18px; }
.hero-actions .btn-plate { white-space: nowrap; min-width: 0; }
.ex-list .t-num { white-space: nowrap; }
.hero-btn { margin-top: 16px; }
.live { border: 2px solid var(--plate-bg); }

.week-row { display: flex; justify-content: space-between; }
.wd { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 40px; }
.wd-dot {
  width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  background: var(--card-2); color: var(--paper);
}
.wd.on .wd-dot { background: var(--ink); }
.wd.today .wd-dot { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--ink-3); }
.wd.future .wd-dot { background: transparent; border: 1.5px dashed var(--line); }
.wd-l { font-size: 13px; font-weight: 600; color: var(--ink-2); }
.wd.today .wd-l { color: var(--ink); }
.week-sum { margin-top: 14px; display: flex; justify-content: space-between; gap: 12px; }
.link { font-weight: 600; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }

.streak { gap: 10px; margin-top: 14px; padding: 10px 12px; border-radius: var(--r-ctl); background: var(--warn-soft); color: var(--warn); }
.streak .t-small { color: var(--ink); }
.streak.safe { background: var(--ok-soft); color: var(--ok); }
.report-note { background: var(--card); }
.free { margin-top: 20px; }
.spin :deep(svg) { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
