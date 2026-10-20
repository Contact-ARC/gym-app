<template>
  <div v-if="session">
    <v-toolbar color="surface" density="comfortable" class="workout-bar">
      <v-btn icon @click="$router.push('/')" aria-label="Home"><v-icon>mdi-home-outline</v-icon></v-btn>
      <div class="flex-grow-1 px-1" style="min-width: 0">
        <div class="text-body-1 font-weight-bold text-truncate">{{ session.dayName }}</div>
        <div class="text-caption muted tabular">{{ elapsed }} · {{ session.sets.length }}/{{ plannedSets }} sets</div>
      </div>
      <v-menu>
        <template #activator="{ props }">
          <v-btn icon v-bind="props" aria-label="More"><v-icon>mdi-dots-vertical</v-icon></v-btn>
        </template>
        <v-list density="compact">
          <v-list-item prepend-icon="mdi-plus" title="Add exercise" @click="addDialog = true" />
          <v-list-item prepend-icon="mdi-delete-outline" title="Discard workout" base-color="error" @click="discardDialog = true" />
        </v-list>
      </v-menu>
      <v-btn color="primary" variant="flat" class="mr-2" @click="finishDialog = true">Finish</v-btn>
    </v-toolbar>

    <div class="page pt-3">
      <v-alert v-if="isDeloadWeek && session.dayIndex != null" type="warning" variant="tonal" density="compact" class="mb-3">
        Deload week — lighter weights, leave 3+ reps in the tank.
      </v-alert>

      <div v-if="!session.items.length" class="text-center py-10">
        <v-icon size="48" class="muted">mdi-playlist-plus</v-icon>
        <p class="text-body-1 mt-2">Add the exercises you're doing.</p>
        <v-btn color="primary" variant="flat" class="mt-3" prepend-icon="mdi-plus" @click="addDialog = true">Add exercise</v-btn>
      </div>

      <v-card v-for="(it, i) in session.items" :key="i" variant="tonal" class="mb-3" :id="`item-${i}`">
        <v-card-text class="pb-2">
          <div class="d-flex align-start">
            <div v-if="it.group" class="group-tag mr-2 mt-1">{{ it.group }}</div>
            <div class="flex-grow-1" style="min-width: 0">
              <div class="text-body-1 font-weight-bold" @click="$router.push(`/exercise/${it.exerciseId}`)">
                {{ ex(it.exerciseId)?.name || it.exerciseId }}
                <v-icon size="16" class="muted">mdi-information-outline</v-icon>
              </div>
              <div class="text-caption muted tabular">
                {{ prescription(it, ex(it.exerciseId)) }}
                <span v-if="it.exerciseId !== it.originalExerciseId"> · swapped from {{ ex(it.originalExerciseId)?.name }}</span>
              </div>
            </div>
            <v-menu>
              <template #activator="{ props }">
                <v-btn icon size="small" variant="text" v-bind="props" aria-label="Exercise options"><v-icon>mdi-dots-horizontal</v-icon></v-btn>
              </template>
              <v-list density="compact">
                <v-list-item prepend-icon="mdi-swap-horizontal" title="Swap exercise" @click="openSwap(i)" />
                <v-list-item prepend-icon="mdi-plus" title="Add a set" @click="addSet(it)" />
                <v-list-item v-if="extraSets(it) > 0" prepend-icon="mdi-minus" title="Remove extra set" @click="removeExtra(it)" />
                <v-list-item prepend-icon="mdi-note-edit-outline" title="Note" @click="openNote(it.exerciseId)" />
              </v-list>
            </v-menu>
          </div>

          <div class="suggest text-caption mt-2" :class="`k-${sugg(i).kind}`">
            <v-icon size="14" class="mr-1">{{ suggIcon(sugg(i).kind) }}</v-icon>{{ sugg(i).text }}
          </div>
          <div v-if="state.data.exerciseNotes[it.exerciseId]" class="text-caption mt-1">
            <v-icon size="14" class="mr-1">mdi-note-text-outline</v-icon>{{ state.data.exerciseNotes[it.exerciseId] }}
          </div>
          <div v-if="it.notes" class="text-caption mt-1 muted">{{ it.notes }}</div>

          <div class="mt-2">
            <SetRow
              v-for="k in rowCount(it, i)" :key="`${i}-${k}-${it.exerciseId}`"
              :index="k - 1"
              :exercise="ex(it.exerciseId)"
              :unit="unitFor(ex(it.exerciseId), state.data.profile)"
              :is-time-item="!!it.durationSec"
              :prefill="prefillFor(i, k - 1)"
              :logged="loggedSets(i)[k - 1] || null"
              :hint="hintFor(i, k - 1)"
              @log="(v) => onLog(i, k - 1, v)"
              @update="(v) => updateSet(session.id, loggedSets(i)[k - 1].id, v)"
              @remove="deleteSet(session.id, loggedSets(i)[k - 1].id)"
            />
          </div>
        </v-card-text>
      </v-card>

      <v-textarea
        v-model="sessionNotes" label="Session notes" rows="2" auto-grow variant="outlined"
        class="mt-4" hide-details @blur="saveSessionNotes"
      />
    </div>

    <!-- Swap -->
    <v-dialog v-model="swapDialog" max-width="480">
      <v-card title="Swap exercise">
        <v-card-text>
          <template v-if="swapAlternatives.length">
            <div class="section-label mt-0">Suggested alternatives</div>
            <v-list density="compact" class="pa-0 mb-3" bg-color="transparent">
              <v-list-item v-for="a in swapAlternatives" :key="a.id" :title="a.name" rounded="lg" @click="doSwap(a.id)" />
            </v-list>
          </template>
          <v-autocomplete
            label="Or pick any exercise" :items="allExercises" item-title="name" item-value="id"
            variant="outlined" @update:model-value="(id) => id && doSwap(id)"
          />
          <div class="text-caption muted mt-2">Sets already logged for this slot are cleared.</div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Add exercise -->
    <v-dialog v-model="addDialog" max-width="480">
      <v-card title="Add exercise">
        <v-card-text>
          <v-autocomplete
            label="Exercise" :items="allExercises" item-title="name" item-value="id" variant="outlined"
            @update:model-value="(id) => { if (id) { addItemToSession(session.id, id); addDialog = false } }"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Note -->
    <v-dialog v-model="noteDialog" max-width="480">
      <v-card :title="ex(noteFor)?.name">
        <v-card-text>
          <v-textarea v-model="noteText" label="Your note (saved for next time)" rows="3" auto-grow variant="outlined" hide-details />
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="noteDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" @click="saveNote">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Finish -->
    <v-dialog v-model="finishDialog" max-width="420">
      <v-card title="Finish workout?">
        <v-card-text>
          {{ session.sets.length }} of {{ plannedSets }} planned sets logged.
          <span v-if="session.sets.length < plannedSets">Unlogged sets just won't be recorded.</span>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="finishDialog = false">Keep going</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!session.sets.length" @click="finish">Finish</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Discard -->
    <v-dialog v-model="discardDialog" max-width="420">
      <v-card title="Discard this workout?">
        <v-card-text>All {{ session.sets.length }} logged sets from this session will be deleted.</v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="discardDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="discard">Discard</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>

  <div v-else class="page">
    <p>This workout no longer exists.</p>
    <v-btn class="mt-3" to="/">Home</v-btn>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SetRow from '../components/SetRow.vue'
import {
  state, persist, getSession, exercisesById, historyFor, suggestionFor, isDeloadWeek,
  logSet, updateSet, deleteSet, swapExercise, addItemToSession, finishSession, discardSession, setExerciseNote
} from '../store.js'
import { unitFor, fmtLoad } from '../lib/training.js'
import { prescription } from '../lib/format.js'
import { effectiveRest, nextInGroup } from '../lib/supersets.js'
import { startRest, stopRest } from '../lib/restTimer.js'
import { tap, keepAwake } from '../lib/native.js'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession(route.params.id))
const ex = (id) => exercisesById.value[id]
const allExercises = computed(() => Object.values(exercisesById.value).sort((a, b) => a.name.localeCompare(b.name)))

// ── Elapsed clock ──
const now = ref(Date.now())
let clock
onMounted(() => {
  clock = setInterval(() => { now.value = Date.now() }, 1000)
  keepAwake(true)
})
onBeforeUnmount(() => { clearInterval(clock); keepAwake(false) })
const elapsed = computed(() => {
  if (!session.value) return ''
  const s = Math.floor((now.value - new Date(session.value.startedAt)) / 1000)
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`
})

// ── Sets ──
const extraSets = (it) => it.extraSets || 0
const loggedSets = (i) => session.value.sets.filter(s => s.itemIndex === i && s.exerciseId === session.value.items[i].exerciseId)
const rowCount = (it, i) => Math.max((it.sets || 1) + extraSets(it), loggedSets(i).length)
const plannedSets = computed(() => session.value.items.reduce((t, it) => t + (it.sets || 1) + extraSets(it), 0))

function addSet (it) { it.extraSets = extraSets(it) + 1; persist() }
function removeExtra (it) { it.extraSets = Math.max(0, extraSets(it) - 1); persist() }

// Suggestions are computed from history before this session, so they don't shift mid-workout
const suggCache = {}
function sugg (i) {
  const it = session.value.items[i]
  const key = `${i}:${it.exerciseId}`
  if (!suggCache[key]) suggCache[key] = suggestionFor(it, session.value.id)
  return suggCache[key]
}
const suggIcon = (k) => ({ up: 'mdi-arrow-up-bold', down: 'mdi-arrow-down-bold', deload: 'mdi-feather', start: 'mdi-flag-outline' }[k] || 'mdi-arrow-right-bold')

function prefillFor (i, k) {
  const done = loggedSets(i)
  const prevRow = done[k - 1] || done[done.length - 1]
  const s = sugg(i)
  if (prevRow) {
    // Follow whatever you actually did on the previous set
    return { load: prevRow.load, reps: prevRow.reps ?? s.reps, seconds: prevRow.seconds ?? s.seconds }
  }
  return { load: s.load, reps: s.reps, seconds: s.seconds }
}

const lastSessionSets = {}
function hintFor (i, k) {
  const it = session.value.items[i]
  if (!(it.exerciseId in lastSessionSets)) {
    lastSessionSets[it.exerciseId] = historyFor(it.exerciseId, session.value.id)[0]?.sets || []
  }
  const s = lastSessionSets[it.exerciseId][k]
  if (!s) return ''
  if (s.seconds) return `${s.load ? fmtLoad(s.load, s.unit) + ' · ' : ''}${s.seconds}s`
  return `${s.load ? fmtLoad(s.load, s.unit) : 'BW'} × ${s.reps}${s.rir != null ? ` (RIR ${s.rir})` : ''}`
}

function onLog (i, k, values) {
  const it = session.value.items[i]
  logSet(session.value.id, { exerciseId: it.exerciseId, itemIndex: i, setIndex: k, ...values })
  tap()

  const restSec = effectiveRest(session.value.items, i)
  if (!restSec) return stopRest()
  // Label: what's next after the rest
  const total = rowCount(it, i)
  const doneCount = loggedSets(i).length
  let nextName
  if (it.group) nextName = ex(session.value.items[nextInGroup(session.value.items, i)].exerciseId)?.name
  else if (doneCount < total) nextName = `${ex(it.exerciseId)?.name} (set ${doneCount + 1})`
  else nextName = ex(session.value.items[i + 1]?.exerciseId)?.name || ''
  startRest(restSec, nextName)
}

// ── Swap ──
const swapDialog = ref(false)
const swapIndex = ref(null)
const swapAlternatives = computed(() => {
  if (swapIndex.value == null) return []
  const it = session.value.items[swapIndex.value]
  const ids = new Set([...(ex(it.originalExerciseId)?.alternatives || []), it.originalExerciseId])
  ids.delete(it.exerciseId)
  return [...ids].map(ex).filter(Boolean)
})
function openSwap (i) { swapIndex.value = i; swapDialog.value = true }
function doSwap (id) {
  swapExercise(session.value.id, swapIndex.value, id)
  Object.keys(suggCache).forEach(k => delete suggCache[k])
  swapDialog.value = false
}

// ── Notes ──
const noteDialog = ref(false)
const noteFor = ref(null)
const noteText = ref('')
function openNote (id) { noteFor.value = id; noteText.value = state.data.exerciseNotes[id] || ''; noteDialog.value = true }
function saveNote () { setExerciseNote(noteFor.value, noteText.value); noteDialog.value = false }

const sessionNotes = ref(session.value?.notes || '')
function saveSessionNotes () { if (session.value) { session.value.notes = sessionNotes.value; persist() } }

// ── Finish / discard ──
const addDialog = ref(false)
const finishDialog = ref(false)
const discardDialog = ref(false)

function finish () {
  saveSessionNotes()
  stopRest()
  finishSession(session.value.id)
  router.replace(`/summary/${route.params.id}`)
}
function discard () {
  stopRest()
  discardSession(session.value.id)
  router.replace('/')
}
</script>

<style scoped>
.workout-bar { position: sticky; top: 0; z-index: 5; }
.group-tag {
  min-width: 24px; height: 24px; padding: 0 5px; border-radius: 6px; display: grid; place-items: center;
  font-weight: 700; font-size: 0.75rem; background: rgb(var(--v-theme-secondary)); color: #000; flex: 0 0 auto;
}
.suggest { padding: 6px 8px; border-radius: 8px; background: rgba(128,128,128,0.12); }
.suggest.k-up { background: rgba(76, 175, 80, 0.16); }
.suggest.k-down, .suggest.k-deload { background: rgba(255, 176, 32, 0.16); }
</style>
