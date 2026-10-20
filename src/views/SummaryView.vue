<template>
  <div class="page" v-if="session">
    <div class="text-center py-4">
      <v-icon size="56" color="primary">mdi-trophy-outline</v-icon>
      <div class="page-title mt-2">Workout done</div>
      <div class="text-body-2 muted">{{ session.dayName }} · {{ fmtDate(session.startedAt) }}</div>
    </div>

    <div class="d-flex ga-2 mb-4">
      <v-card variant="tonal" class="flex-1 pa-3 text-center">
        <div class="text-caption muted">Time</div>
        <div class="text-h6 tabular">{{ sum.minutes ?? '—' }} min</div>
      </v-card>
      <v-card variant="tonal" class="flex-1 pa-3 text-center">
        <div class="text-caption muted">Sets</div>
        <div class="text-h6 tabular">{{ sum.sets }}</div>
      </v-card>
      <v-card variant="tonal" class="flex-1 pa-3 text-center">
        <div class="text-caption muted">Volume</div>
        <div class="text-h6 tabular">{{ fmtNum(sum.volume, 0) }}<span class="text-caption"> {{ sum.unit }}</span></div>
      </v-card>
    </div>

    <template v-if="sum.prs.length">
      <div class="section-label">Personal records 🎉</div>
      <v-card v-for="g in prGroups" :key="g.id" variant="tonal" color="success" class="mb-2">
        <v-card-text class="py-2">
          <div class="font-weight-bold">{{ name(g.id) }}</div>
          <div v-for="p in g.prs" :key="p.type" class="text-body-2 tabular">
            {{ p.type === 'e1rm' ? 'Est. 1RM' : 'Heaviest' }}: {{ fmtLoad(p.value, unitOf(g.id)) }}
            <span class="muted">(was {{ fmtLoad(p.prev, unitOf(g.id)) }})</span>
          </div>
        </v-card-text>
      </v-card>
    </template>

    <div class="section-label">What you did</div>
    <div v-for="id in sum.exercises" :key="id" class="mb-2">
      <div class="font-weight-bold text-body-2">{{ name(id) }}</div>
      <div class="text-body-2 muted tabular">{{ setsFor(id) }}</div>
    </div>
    <div v-if="session.notes" class="text-body-2 mt-3"><v-icon size="16">mdi-note-text-outline</v-icon> {{ session.notes }}</div>

    <div class="d-flex ga-2 mt-6">
      <v-btn variant="tonal" class="flex-1" prepend-icon="mdi-share-variant" @click="share">Share</v-btn>
      <v-btn color="primary" variant="flat" class="flex-1" to="/">Done</v-btn>
    </div>
    <div v-if="shareMsg" class="text-caption text-center mt-2 muted">{{ shareMsg }}</div>
    <v-btn variant="text" color="error" size="small" class="mt-6" @click="confirmDelete = true">Delete this session</v-btn>

    <v-dialog v-model="confirmDelete" max-width="420">
      <v-card title="Delete session?">
        <v-card-text>This removes it from your history and charts.</v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="confirmDelete = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="del">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
  <div v-else class="page"><p>Session not found.</p><v-btn class="mt-3" to="/">Home</v-btn></div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state, getSession, sessionSummary, exercisesById, deleteSession } from '../store.js'
import { fmtLoad, unitFor } from '../lib/training.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { shareText } from '../lib/native.js'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession(route.params.id))
const sum = computed(() => sessionSummary(session.value))
const name = (id) => exercisesById.value[id]?.name || id
const prGroups = computed(() => {
  const m = new Map()
  for (const p of sum.value.prs) { if (!m.has(p.exerciseId)) m.set(p.exerciseId, []); m.get(p.exerciseId).push(p) }
  return [...m].map(([id, prs]) => ({ id, prs }))
})
const unitOf = (id) => unitFor(exercisesById.value[id], state.data.profile)

function setsFor (id) {
  return session.value.sets.filter(s => s.exerciseId === id).map(s => {
    if (s.seconds) return `${s.load ? fmtLoad(s.load, s.unit) + ' ' : ''}${s.seconds}s`
    return `${s.load ? fmtLoad(s.load, s.unit) : 'BW'}×${s.reps}`
  }).join(' · ')
}

const shareMsg = ref('')
async function share () {
  const lines = [
    `💪 ${session.value.dayName} — ${sum.value.minutes ?? '?'} min, ${sum.value.sets} sets, ${fmtNum(sum.value.volume, 0)} ${sum.value.unit} moved`
  ]
  for (const p of sum.value.prs) lines.push(`🏆 PR ${name(p.exerciseId)}: ${fmtLoad(p.value, unitOf(p.exerciseId))} ${p.type === 'e1rm' ? 'est. 1RM' : 'top set'}`)
  for (const id of sum.value.exercises) lines.push(`• ${name(id)}: ${setsFor(id)}`)
  const r = await shareText('Workout', lines.join('\n'))
  shareMsg.value = r === 'copied' ? 'Copied to clipboard' : ''
}

const confirmDelete = ref(false)
function del () { deleteSession(session.value.id); router.replace('/') }
</script>

<style scoped>
.flex-1 { flex: 1 1 0; }
</style>
