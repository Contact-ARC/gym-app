<template>
  <div class="page" v-if="ex">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-2 px-0" @click="$router.back()">Back</v-btn>
    <div class="page-title">{{ ex.name }}</div>
    <div class="d-flex flex-wrap ga-1 mt-2">
      <v-chip v-for="e in ex.equipment || []" :key="e" size="small" variant="outlined">{{ e }}</v-chip>
      <v-chip v-if="ex.perSide" size="small" variant="outlined">per side</v-chip>
      <v-chip v-if="ex.loadUnit === 'pin'" size="small" variant="outlined">logged in pin positions</v-chip>
    </div>

    <div class="section-label">Muscles</div>
    <div class="d-flex flex-wrap ga-1">
      <v-chip v-for="m in ex.primary || []" :key="'p' + m" color="primary" variant="flat" size="small">{{ muscleLabel(m) }}</v-chip>
      <v-chip v-for="m in ex.secondary || []" :key="'s' + m" color="primary" variant="tonal" size="small">{{ muscleLabel(m) }}</v-chip>
    </div>
    <div class="text-caption muted mt-1">Solid = main target · light = assisting</div>

    <template v-if="ex.setup?.length">
      <div class="section-label">Set-up</div>
      <ul class="pl-5 text-body-2"><li v-for="(s, i) in ex.setup" :key="i" class="mb-1">{{ s }}</li></ul>
    </template>

    <div class="section-label">How to do it</div>
    <ol class="pl-5 text-body-2"><li v-for="(s, i) in ex.steps || []" :key="i" class="mb-2">{{ s }}</li></ol>

    <template v-if="ex.cues?.length">
      <div class="section-label">Body position cues</div>
      <ul class="pl-5 text-body-2"><li v-for="(s, i) in ex.cues" :key="i" class="mb-1">{{ s }}</li></ul>
    </template>

    <template v-if="ex.mistakes?.length">
      <div class="section-label">Common mistakes</div>
      <ul class="pl-5 text-body-2"><li v-for="(s, i) in ex.mistakes" :key="i" class="mb-1">{{ s }}</li></ul>
    </template>

    <v-btn block variant="tonal" class="mt-5" prepend-icon="mdi-youtube" @click="openUrl(videoUrl)">
      {{ ex.videoUrl ? 'Watch video' : 'Find a form video' }}
    </v-btn>

    <template v-if="alternatives.length">
      <div class="section-label">Alternatives</div>
      <v-list bg-color="transparent" density="compact" class="pa-0">
        <v-list-item v-for="a in alternatives" :key="a.id" :to="`/exercise/${a.id}`" :title="a.name" rounded="lg" append-icon="mdi-chevron-right" />
      </v-list>
    </template>

    <div class="section-label">Your notes</div>
    <v-textarea
      v-model="note" rows="2" auto-grow variant="outlined" hide-details
      placeholder="Seat height, grip, how it felt…" @blur="saveNote"
    />

    <div class="section-label">History</div>
    <div v-if="!history.length" class="text-body-2 muted">Not logged yet.</div>
    <template v-else>
      <div class="d-flex ga-3 mb-3">
        <v-card variant="tonal" class="flex-grow-1 pa-3">
          <div class="text-caption muted">Best est. 1RM</div>
          <div class="text-h6 tabular">{{ fmtLoad(best, unit) }}</div>
        </v-card>
        <v-card variant="tonal" class="flex-grow-1 pa-3">
          <div class="text-caption muted">Sessions</div>
          <div class="text-h6 tabular">{{ history.length }}</div>
        </v-card>
      </div>
      <div v-for="h in history.slice(0, 6)" :key="h.sessionId" class="d-flex text-body-2 py-1">
        <span class="muted" style="width: 90px">{{ relativeDay(h.date) }}</span>
        <span class="tabular">{{ h.sets.map(setStr).join(' · ') }}</span>
      </div>
      <v-btn variant="text" class="px-0 mt-2" :to="`/progress?exercise=${ex.id}`" append-icon="mdi-chart-line">See chart</v-btn>
    </template>
  </div>
  <div v-else class="page">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="$router.back()">Back</v-btn>
    <p class="mt-4">Exercise not found in the library.</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { state, exercisesById, historyFor, setExerciseNote } from '../store.js'
import { muscleLabel, relativeDay, youtubeSearchUrl } from '../lib/format.js'
import { openUrl } from '../lib/native.js'
import { bestE1RM, fmtLoad, unitFor } from '../lib/training.js'

const route = useRoute()
const ex = computed(() => exercisesById.value[route.params.id])
const unit = computed(() => unitFor(ex.value, state.data.profile))
const videoUrl = computed(() => ex.value?.videoUrl || youtubeSearchUrl(ex.value?.name || ''))
const alternatives = computed(() => (ex.value?.alternatives || []).map(id => exercisesById.value[id]).filter(Boolean))
const history = computed(() => (ex.value ? historyFor(ex.value.id) : []))
const best = computed(() => bestE1RM(history.value.flatMap(h => h.sets), state.data.profile.unit))

const note = ref('')
watch(() => route.params.id, (id) => { note.value = state.data.exerciseNotes[id] || '' }, { immediate: true })
function saveNote () {
  if ((state.data.exerciseNotes[ex.value.id] || '') !== note.value) setExerciseNote(ex.value.id, note.value)
}

function setStr (s) {
  if (s.seconds) return `${s.load ? fmtLoad(s.load, s.unit) + ' ' : ''}${s.seconds}s`
  return `${s.load ? fmtLoad(s.load, s.unit) : 'BW'}×${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`
}
</script>
