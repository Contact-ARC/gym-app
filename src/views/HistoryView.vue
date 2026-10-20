<template>
  <div class="page">
    <v-btn variant="text" prepend-icon="mdi-arrow-left" class="mb-2 px-0" @click="$router.back()">Back</v-btn>
    <div class="page-title mb-2">History</div>
    <div v-if="!finishedSessions.length" class="text-body-2 muted">No finished workouts yet.</div>
    <template v-for="g in groups" :key="g.label">
      <div class="section-label">{{ g.label }}</div>
      <v-list bg-color="transparent" class="pa-0">
        <v-list-item
          v-for="s in g.sessions" :key="s.id" :to="`/summary/${s.id}`" rounded="lg"
          :title="s.dayName"
          :subtitle="`${fmtDate(s.startedAt)} · ${s.sets.length} sets · ${mins(s)} min`"
          append-icon="mdi-chevron-right"
        />
      </v-list>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { finishedSessions } from '../store.js'
import { fmtDate } from '../lib/format.js'

const mins = (s) => Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000)

const groups = computed(() => {
  const out = []
  for (const s of finishedSessions.value) {
    const label = new Date(s.startedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    let g = out.find(x => x.label === label)
    if (!g) { g = { label, sessions: [] }; out.push(g) }
    g.sessions.push(s)
  }
  return out
})
</script>
