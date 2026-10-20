<template>
  <div class="page">
    <div class="d-flex align-center mb-1">
      <div class="flex-grow-1">
        <div class="text-caption muted">{{ greeting }}</div>
        <div class="page-title">{{ routine?.title || 'Gym Crew' }}</div>
      </div>
      <v-btn icon variant="text" :loading="state.routineStatus.loading" @click="refreshRoutines" aria-label="Refresh routine">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </div>
    <div v-if="routine" class="d-flex flex-wrap ga-2 mb-4">
      <v-chip size="small" variant="tonal">{{ monthLabel }}</v-chip>
      <v-chip size="small" variant="tonal">Week {{ currentWeek }}</v-chip>
      <v-chip v-if="isDeloadWeek" size="small" color="warning" variant="flat">Deload week</v-chip>
    </div>

    <!-- App update -->
    <v-alert v-if="updateAvailable" type="info" variant="tonal" class="mb-3" density="comfortable">
      <div class="font-weight-bold">App update {{ updateAvailable.version }} available</div>
      <div v-if="updateAvailable.notes" class="text-body-2">{{ updateAvailable.notes }}</div>
      <template #append>
        <v-btn size="small" variant="flat" color="info" @click="openUrl(updateAvailable.downloadUrl)">Get it</v-btn>
      </template>
    </v-alert>

    <!-- Routine problems -->
    <v-alert v-if="!routine && !state.routineStatus.loading" type="warning" variant="tonal" class="mb-3">
      <div class="font-weight-bold">No routine loaded yet</div>
      <div class="text-body-2">Connect to the internet once to download this month's routine.</div>
      <div v-if="state.routineStatus.error" class="text-caption mt-1 muted">{{ state.routineStatus.error }}</div>
      <div class="mt-2">
        <v-btn size="small" variant="flat" color="warning" class="mr-2" @click="refreshRoutines">Retry</v-btn>
        <v-btn size="small" variant="text" to="/settings">Settings</v-btn>
      </div>
    </v-alert>
    <div v-else-if="routine && state.routineStatus.error" class="text-caption muted mb-3">
      <v-icon size="14">mdi-cloud-off-outline</v-icon> Offline — using the routine saved {{ fetchedAgo }}.
    </div>

    <!-- Backup reminder -->
    <v-alert
      v-if="needsBackup"
      type="warning" variant="tonal" density="compact" class="mb-3"
      :text="daysSinceBackup == null ? 'You haven\'t backed up your history yet.' : `Last backup ${daysSinceBackup} days ago.`"
    >
      <template #append><v-btn size="small" variant="text" to="/settings">Back up</v-btn></template>
    </v-alert>

    <!-- Workout in progress -->
    <v-card v-if="activeSession" color="primary" variant="flat" class="mb-4" :to="`/workout/${activeSession.id}`">
      <v-card-text class="d-flex align-center">
        <v-icon size="32" class="mr-3">mdi-timer-play-outline</v-icon>
        <div class="flex-grow-1">
          <div class="font-weight-bold text-body-1">Workout in progress</div>
          <div class="text-body-2">{{ activeSession.dayName }} · {{ activeSession.sets.length }} sets logged</div>
        </div>
        <v-icon>mdi-chevron-right</v-icon>
      </v-card-text>
    </v-card>

    <!-- Next up -->
    <template v-if="nextDay && !activeSession">
      <div class="section-label">Next up</div>
      <v-card variant="tonal" class="mb-2">
        <v-card-item>
          <v-card-title class="text-wrap">{{ nextDay.name }}</v-card-title>
          <v-card-subtitle>
            {{ nextDay.items.length }} exercises<span v-if="nextDay.estMinutes"> · ~{{ nextDay.estMinutes }} min</span>
          </v-card-subtitle>
        </v-card-item>
        <v-card-text class="pt-0">
          <div v-for="(it, i) in nextDay.items" :key="i" class="text-body-2 py-1 d-flex">
            <span class="flex-grow-1">{{ exName(it.exerciseId) }}</span>
            <span class="muted tabular">{{ prescription(it, exercisesById[it.exerciseId]) }}</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" :to="`/day/${state.data.nextDayIndex}`">Details</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" size="large" prepend-icon="mdi-play" @click="start(state.data.nextDayIndex)">Start</v-btn>
        </v-card-actions>
      </v-card>
    </template>

    <!-- All days -->
    <template v-if="days.length">
      <div class="section-label">This month's days</div>
      <v-list bg-color="transparent" class="pa-0">
        <v-list-item
          v-for="(d, i) in days" :key="d.id"
          :to="`/day/${i}`" rounded="lg" class="mb-1"
          :title="d.name"
          :subtitle="`${d.items.length} exercises${d.estMinutes ? ' · ~' + d.estMinutes + ' min' : ''}`"
        >
          <template #prepend>
            <v-avatar :color="i === state.data.nextDayIndex ? 'primary' : 'surface-variant'" size="40">
              <span class="font-weight-bold">{{ d.id }}</span>
            </v-avatar>
          </template>
          <template #append>
            <span v-if="lastDone[d.id]" class="text-caption muted">{{ lastDone[d.id] }}</span>
          </template>
        </v-list-item>
      </v-list>
    </template>

    <v-btn v-if="!activeSession" block variant="outlined" class="mt-4" prepend-icon="mdi-plus" @click="startFree">
      Log a session outside the routine
    </v-btn>

    <div class="section-label">Last 7 days</div>
    <div class="text-body-2">
      {{ weekCount }} session{{ weekCount === 1 ? '' : 's' }}
      <router-link to="/history" class="ml-2 text-primary">History</router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  state, routine, days, currentWeek, isDeloadWeek, updateAvailable, refreshRoutines,
  activeSession, exercisesById, startSession, startFreeSession, finishedSessions, daysSinceBackup
} from '../store.js'
import { openUrl } from '../lib/native.js'
import { prescription, relativeDay } from '../lib/format.js'

const router = useRouter()

const greeting = computed(() => {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening'
  return state.data.profile.name ? `${part}, ${state.data.profile.name}` : part
})

const monthLabel = computed(() => {
  const m = routine.value?.month
  if (!m) return ''
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

const nextDay = computed(() => days.value[state.data.nextDayIndex] || days.value[0])
const exName = (id) => exercisesById.value[id]?.name || id

const fetchedAgo = computed(() => relativeDay(state.data.cache.fetchedAt))

const lastDone = computed(() => {
  const out = {}
  for (const s of finishedSessions.value) {
    if (s.routineMonth === routine.value?.month && !out[s.dayId]) out[s.dayId] = relativeDay(s.startedAt)
  }
  return out
})

const weekCount = computed(() => {
  const cutoff = Date.now() - 7 * 86400000
  return finishedSessions.value.filter(s => new Date(s.startedAt).getTime() >= cutoff).length
})

const needsBackup = computed(() =>
  finishedSessions.value.length >= 3 && (daysSinceBackup.value == null || daysSinceBackup.value >= 14)
)

function start (i) {
  const id = startSession(i)
  if (id) router.push(`/workout/${id}`)
}
function startFree () {
  const id = startFreeSession('Free session')
  if (id) router.push(`/workout/${id}`)
}
</script>
