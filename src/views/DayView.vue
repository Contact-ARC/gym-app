<template>
  <div class="page" v-if="day">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-2 px-0" @click="$router.back()">Back</v-btn>
    <div class="page-title">{{ day.name }}</div>
    <div class="text-body-2 muted mb-1">
      {{ day.items.length }} exercises<span v-if="day.estMinutes"> · ~{{ day.estMinutes }} min</span>
    </div>
    <p v-if="day.notes" class="text-body-2 mt-2">{{ day.notes }}</p>
    <v-alert v-if="isDeloadWeek" type="warning" variant="tonal" density="compact" class="my-3">
      Deload week — suggestions are ~10% lighter. Stop each set with 3+ reps left.
    </v-alert>

    <div class="section-label">Exercises</div>
    <v-card
      v-for="(it, i) in day.items" :key="i"
      variant="tonal" class="mb-2" :to="`/exercise/${it.exerciseId}`"
    >
      <v-card-text class="d-flex align-center">
        <div v-if="it.group" class="group-tag mr-3" :title="`Superset ${it.group}`">{{ it.group }}</div>
        <div class="flex-grow-1">
          <div class="font-weight-bold text-body-1">{{ ex(it.exerciseId)?.name || it.exerciseId }}</div>
          <div class="text-body-2 muted tabular">
            {{ prescription(it, ex(it.exerciseId)) }} · rest {{ restLabel(it, i) }}
          </div>
          <div v-if="it.notes" class="text-caption mt-1">{{ it.notes }}</div>
          <div class="text-caption text-secondary mt-1">{{ suggestionFor(it).text }}</div>
        </div>
        <v-icon class="ml-2">mdi-chevron-right</v-icon>
      </v-card-text>
    </v-card>
    <div v-if="hasGroups" class="text-caption muted mt-1">
      Exercises with the same letter tag are a superset: do one set of each back to back, then rest.
    </div>

    <v-btn
      v-if="!activeSession"
      block size="x-large" color="primary" variant="flat" class="mt-6" prepend-icon="mdi-play"
      @click="start"
    >Start {{ day.id ? 'Day ' + day.id : 'workout' }}</v-btn>
    <v-btn
      v-else block size="x-large" variant="tonal" class="mt-6" prepend-icon="mdi-timer-play-outline"
      :to="`/workout/${activeSession.id}`"
    >Resume current workout</v-btn>
  </div>
  <div v-else class="page">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="$router.back()">Back</v-btn>
    <p class="mt-4">That day isn't in the current routine.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { days, exercisesById, activeSession, startSession, suggestionFor, isDeloadWeek } from '../store.js'
import { prescription } from '../lib/format.js'
import { effectiveRest } from '../lib/supersets.js'

const route = useRoute()
const router = useRouter()
const index = computed(() => Number(route.params.index))
const day = computed(() => days.value[index.value])
const ex = (id) => exercisesById.value[id]
const hasGroups = computed(() => day.value?.items.some(i => i.group))

function restLabel (it, i) {
  const s = effectiveRest(day.value.items, i)
  if (!s) return 'none (superset)'
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`
}

function start () {
  const id = startSession(index.value)
  if (id) router.push(`/workout/${id}`)
}
</script>

<style scoped>
.group-tag {
  min-width: 28px; height: 28px; padding: 0 5px; border-radius: 8px; display: grid; place-items: center;
  font-weight: 700; font-size: 0.8rem;
  background: rgb(var(--v-theme-secondary)); color: #000;
}
</style>
