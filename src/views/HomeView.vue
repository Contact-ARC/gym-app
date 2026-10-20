<template>
  <div class="page">
    <header class="home-head">
      <div class="grow">
        <div class="t-small t-muted">{{ weekdayDate() }}</div>
        <h1 class="t-title">{{ greeting }}</h1>
      </div>
      <button class="icon-btn" :class="{ spin: state.routineStatus.loading }" aria-label="Check for a new routine" @click="refresh">
        <Icon name="refresh" />
      </button>
    </header>
    <div v-if="routine" class="row meta">
      <span class="pill">{{ routine.title }}</span>
      <span class="pill">Week {{ currentWeek }}</span>
      <span v-if="isDeloadWeek" class="pill pill-warn"><Icon name="deload" :size="16" />Deload week</span>
    </div>

    <!-- Status messages -->
    <div class="stack notes">
      <button v-if="updateAvailable" class="note note-info row note-btn" @click="openUrl(updateAvailable.downloadUrl)">
        <Icon name="download" />
        <div class="grow">
          <div class="t-h3">App update {{ updateAvailable.version }} is ready</div>
          <div v-if="updateAvailable.notes" class="t-small t-muted">{{ updateAvailable.notes }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>

      <div v-if="!routine && !state.routineStatus.loading" class="note note-warn">
        <div class="t-h3">No routine yet</div>
        <p class="t-small">Connect to the internet once to download this month's routine.</p>
        <p v-if="state.routineStatus.error" class="t-tiny t-muted err-line">{{ state.routineStatus.error }}</p>
        <div class="row" style="margin-top: 12px">
          <button class="btn btn-sm btn-primary" @click="refresh">Try again</button>
          <RouterLink to="/settings" class="btn btn-sm btn-ghost">Settings</RouterLink>
        </div>
      </div>
      <div v-else-if="routine && state.routineStatus.error" class="t-small t-muted row offline">
        <Icon name="offline" :size="18" />Offline. Using the routine saved {{ relativeDay(state.data.cache.fetchedAt) }}.
      </div>

      <RouterLink v-if="needsBackup" to="/settings" class="note note-warn row note-btn">
        <div class="grow t-small">
          {{ daysSinceBackup == null ? "Your workouts aren't backed up yet." : `Last backup was ${daysSinceBackup} days ago.` }}
          <b>Back up now</b>
        </div>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
    </div>

    <!-- Workout in progress -->
    <RouterLink v-if="activeSession" :to="`/workout/${activeSession.id}`" class="card hero live" :style="plateStyle(activeSession.dayIndex ?? -1)">
      <div class="row">
        <PlateBadge :index="activeSession.dayIndex ?? -1" :label="activeSession.dayId === 'free' ? '+' : activeSession.dayId" size="lg" />
        <div class="grow">
          <div class="t-small t-muted">Workout in progress</div>
          <div class="t-h2">{{ dayTitle(activeSession.dayName, activeSession.dayId) }}</div>
          <div class="t-small t-muted">{{ activeSession.sets.length }} sets logged</div>
        </div>
      </div>
      <span class="btn btn-lg btn-block btn-plate hero-btn"><Icon name="play" />Continue</span>
    </RouterLink>

    <!-- Next up -->
    <section v-else-if="nextDay" class="card hero" :style="plateStyle(nextIndex)">
      <div class="row">
        <PlateBadge :index="nextIndex" :label="nextDay.id" size="lg" />
        <div class="grow">
          <div class="t-small t-muted">Next up</div>
          <h2 class="t-h2">{{ dayTitle(nextDay.name, nextDay.id) }}</h2>
          <div class="t-small t-muted">{{ nextDay.items.length }} exercises<template v-if="nextDay.estMinutes">, about {{ nextDay.estMinutes }} min</template></div>
        </div>
      </div>
      <ul class="ex-list">
        <li v-for="(it, i) in nextDay.items" :key="i" class="row">
          <span class="grow truncate">{{ exName(it.exerciseId) }}</span>
          <span class="t-num t-muted">{{ prescription(it, exercisesById[it.exerciseId]) }}</span>
        </li>
      </ul>
      <div class="row hero-actions">
        <RouterLink :to="`/day/${nextIndex}`" class="btn btn-lg btn-soft">Details</RouterLink>
        <button class="btn btn-lg btn-plate grow" @click="start(nextIndex)"><Icon name="play" />Start day {{ nextDay.id }}</button>
      </div>
    </section>

    <!-- This week -->
    <section v-if="routine || finishedSessions.length">
      <h2 class="section-h">This week</h2>
      <div class="card card-pad week">
        <div class="week-row">
          <div v-for="d in week" :key="d.key" class="wd" :class="{ on: d.on, today: d.today, future: d.future }">
            <span class="wd-dot"><Icon v-if="d.on" name="checkBold" :size="16" /></span>
            <span class="wd-l">{{ d.label }}</span>
          </div>
        </div>
        <div class="t-small t-muted week-sum">
          {{ weekCount === 0 ? 'No workouts yet this week.' : `${weekCount} workout${weekCount === 1 ? '' : 's'} this week.` }}
          <RouterLink to="/history" class="link">History</RouterLink>
        </div>
      </div>
    </section>

    <!-- All days -->
    <section v-if="days.length">
      <h2 class="section-h">This month's days</h2>
      <div class="group">
        <RouterLink v-for="(d, i) in days" :key="d.id" :to="`/day/${i}`" class="group-row">
          <PlateBadge :index="i" :label="d.id" />
          <div class="grow">
            <div class="t-h3 truncate">{{ dayTitle(d.name, d.id) }}</div>
            <div class="t-small t-muted">{{ lastDone[d.id] ? `Done ${lastDone[d.id]}` : `${d.items.length} exercises` }}</div>
          </div>
          <span v-if="i === nextIndex && !activeSession" class="pill">Next</span>
          <Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
    </section>

    <button v-if="!activeSession" class="btn btn-soft btn-block free" @click="startFree">
      <Icon name="plus" />Log a session outside the routine
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import { plateStyle } from '../ui/plates.js'
import {
  state, routine, days, currentWeek, isDeloadWeek, updateAvailable, refreshRoutines,
  activeSession, exercisesById, startSession, startFreeSession, finishedSessions, daysSinceBackup
} from '../store.js'
import { openUrl } from '../lib/native.js'
import { prescription, relativeDay, dayTitle, weekdayDate } from '../lib/format.js'
import { dateKey } from '../lib/training.js'
import { toast } from '../ui/toast.js'

const router = useRouter()

const greeting = computed(() => {
  const h = new Date().getHours()
  const part = h < 6 ? 'Late session' : h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening'
  const n = state.data.profile.name
  return n ? `${part}, ${n}` : part
})

const nextIndex = computed(() => (days.value[state.data.nextDayIndex] ? state.data.nextDayIndex : 0))
const nextDay = computed(() => days.value[nextIndex.value])
const exName = (id) => exercisesById.value[id]?.name || id

const lastDone = computed(() => {
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
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      on: trained.has(key),
      today: key === dateKey(today),
      future: d > today
    }
  })
})
const weekCount = computed(() => week.value.filter(d => d.on).length)

const needsBackup = computed(() =>
  finishedSessions.value.length >= 3 && (daysSinceBackup.value == null || daysSinceBackup.value >= 14)
)

async function refresh () {
  await refreshRoutines()
  if (!state.routineStatus.error) toast('Routine is up to date')
}
function start (i) {
  const id = startSession(i)
  if (id) router.push(`/workout/${id}`)
}
function startFree () {
  const id = startFreeSession('Free session')
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

.free { margin-top: 20px; }
.spin :deep(svg) { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
