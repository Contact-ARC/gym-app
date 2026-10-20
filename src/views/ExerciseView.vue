<template>
  <div class="page" v-if="ex">
    <div class="topbar">
      <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ ex.name }}</h1>
    <ExerciseDetails :ex="ex" />

    <section>
      <h2 class="section-h">Your machine settings</h2>
      <button class="group group-row settings-btn" @click="msOpen = true">
        <div class="grow">
          <div v-if="machine.length" class="ms-list">
            <span v-for="r in machine" :key="r.label" class="ms"><span class="t-muted">{{ r.label }}</span> <b class="t-num">{{ r.value }}</b></span>
          </div>
          <span v-else class="t-muted">Seat height, pad position, pulley height…</span>
        </div>
        <Icon name="edit" class="chev" />
      </button>
    </section>

    <section>
      <h2 class="section-h">Your note</h2>
      <textarea v-model="note" class="field" rows="2" placeholder="Seat height, grip, how it felt" aria-label="Your note" @blur="saveNote" />
    </section>

    <section>
      <h2 class="section-h">Your history</h2>
      <p v-if="!history.length" class="t-small t-muted">You haven't logged this one yet.</p>
      <template v-else>
        <div class="row stats">
          <div class="card card-pad stat">
            <div class="t-tiny t-muted">{{ unit === 'pin' ? 'Heaviest pin' : 'Best estimated max' }}</div>
            <div class="t-h2 t-num">{{ fmtLoad(best, unit) }}</div>
          </div>
          <div class="card card-pad stat">
            <div class="t-tiny t-muted">Times done</div>
            <div class="t-h2 t-num">{{ history.length }}</div>
          </div>
        </div>
        <div class="group hist">
          <div v-for="h in history.slice(0, 6)" :key="h.sessionId" class="group-row">
            <span class="t-small t-muted when">{{ relativeDay(h.date) }}</span>
            <span class="grow t-num sets-line">{{ h.sets.map(setStr).join(',  ') }}</span>
          </div>
        </div>
        <RouterLink :to="`/progress?exercise=${ex.id}`" class="btn btn-ghost btn-block chart-link"><Icon name="progress" />See the chart</RouterLink>
      </template>
    </section>

    <section v-if="alternatives.length">
      <h2 class="section-h">Alternatives</h2>
      <div class="group">
        <RouterLink v-for="a in alternatives" :key="a.id" :to="`/exercise/${a.id}`" class="group-row">
          <span class="grow t-h3">{{ a.name }}</span><Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
    </section>

    <MachineSettingsSheet v-model="msOpen" :exercise-id="ex.id" />
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">This exercise isn't in the library</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import { toast } from '../ui/toast.js'
import ExerciseDetails from '../ui/ExerciseDetails.vue'
import MachineSettingsSheet from '../ui/MachineSettingsSheet.vue'
import { state, exercisesById, historyFor, setExerciseNote } from '../store.js'
import { relativeDay } from '../lib/format.js'
import { bestE1RM, heaviest, fmtLoad, unitFor } from '../lib/training.js'

const route = useRoute()
const router = useRouter()
const ex = computed(() => exercisesById.value[route.params.id])
const unit = computed(() => unitFor(ex.value, state.data.profile))
const machine = computed(() => state.data.machineSettings[ex.value?.id] || [])
const msOpen = ref(false)
const alternatives = computed(() => (ex.value?.alternatives || []).map(id => exercisesById.value[id]).filter(Boolean))
const history = computed(() => (ex.value ? historyFor(ex.value.id) : []))
const best = computed(() => {
  const sets = history.value.flatMap(h => h.sets)
  return unit.value === 'pin' ? heaviest(sets, state.data.profile.unit) : bestE1RM(sets, state.data.profile.unit)
})

const note = ref('')
watch(() => route.params.id, (id) => { note.value = state.data.exerciseNotes[id] || '' }, { immediate: true })
function saveNote () {
  if ((state.data.exerciseNotes[ex.value.id] || '') !== note.value) {
    setExerciseNote(ex.value.id, note.value.trim())
    toast('Note saved')
  }
}

function setStr (s) {
  if (s.seconds) return s.load ? `${fmtLoad(s.load, s.unit)} for ${s.seconds}s` : `${s.seconds}s`
  const reps = s.repsL != null && s.repsR != null && s.repsL !== s.repsR ? `${s.repsL}/${s.repsR}` : s.reps
  const tag = s.type === 'drop' ? ' drop' : s.type === 'warmup' ? ' warm-up' : ''
  return `${s.load ? fmtLoad(s.load, s.unit) : 'BW'} × ${reps}${tag}`
}
</script>

<style scoped>
.settings-btn { width: 100%; }
.ms-list { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.ms { font-size: 17px; }
.stats { gap: 10px; }
.stat { flex: 1 1 0; padding: 14px 16px; }
.hist { margin-top: 10px; }
.when { width: 92px; flex: 0 0 auto; }
.sets-line { font-size: 18px; }
.chart-link { margin-top: 6px; }
</style>
