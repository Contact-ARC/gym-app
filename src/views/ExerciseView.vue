<template>
  <div class="page" v-if="ex">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ tx(ex, 'name') }}</h1>
    <div v-if="ex.custom" class="row own">
      <span class="tag tag-mine">{{ t('Your exercise') }}</span>
      <span v-if="ex.hidden" class="tag tag-edit">{{ t('Deleted') }}</span>
      <span class="grow" />
      <button class="btn btn-sm btn-soft" @click="editOpen = true"><Icon name="edit" :size="18" />{{ t('Edit') }}</button>
    </div>
    <ExerciseDetails :ex="ex" />

    <section>
      <h2 class="section-h">{{ t('Your machine settings') }}</h2>
      <button class="group group-row settings-btn" @click="msOpen = true">
        <div class="grow">
          <div v-if="machine.length" class="ms-list">
            <span v-for="r in machine" :key="r.label" class="ms"><span class="t-muted">{{ r.label }}</span> <b class="t-num">{{ r.value }}</b></span>
          </div>
          <span v-else class="t-muted">{{ t('Seat height, pad position, pulley height…') }}</span>
        </div>
        <Icon name="edit" class="chev" />
      </button>
    </section>

    <section>
      <h2 class="section-h">{{ t('Your note') }}</h2>
      <textarea v-model="note" class="field" rows="2" :placeholder="t('Seat height, grip, how it felt')" :aria-label="t('Your note')" @blur="saveNote" />
    </section>

    <section>
      <h2 class="section-h">{{ t('Your history') }}</h2>
      <p v-if="!history.length" class="t-small t-muted">{{ t("You haven't logged this one yet.") }}</p>
      <template v-else>
        <div class="row stats">
          <div class="card card-pad stat">
            <div class="t-tiny t-muted">{{ unit === 'pin' ? t('Heaviest pin') : t('Best estimated max') }}</div>
            <div class="t-h2 t-num">{{ fmtLoad(best, unit) }}</div>
          </div>
          <div class="card card-pad stat">
            <div class="t-tiny t-muted">{{ t('Times done') }}</div>
            <div class="t-h2 t-num">{{ history.length }}</div>
          </div>
        </div>
        <div class="group hist">
          <div v-for="h in history.slice(0, 6)" :key="h.sessionId" class="group-row">
            <span class="t-small t-muted when">{{ relativeDay(h.date) }}</span>
            <span class="grow t-num sets-line">{{ h.sets.map(setStr).join(',  ') }}</span>
          </div>
        </div>
        <RouterLink :to="`/progress?exercise=${ex.id}`" class="btn btn-ghost btn-block chart-link"><Icon name="progress" />{{ t('See the chart') }}</RouterLink>
      </template>
    </section>

    <section v-if="records.length > 0 || bestHold">
      <h2 class="section-h">{{ t('Rep records') }}</h2>
      <p class="t-small t-muted rec-help">{{ unit === 'pin' ? t('Most reps you\'ve done at each pin, or heavier.') : t('Most reps you\'ve done at each weight, or heavier.') }}</p>
      <div class="group">
        <div v-if="bestHold" class="group-row">
          <Icon name="timer" class="t-muted" />
          <span class="grow">{{ t('Longest set') }}</span>
          <b class="t-num rec-v">{{ bestHold }} s</b>
        </div>
        <div v-for="r in records.slice(0, 8)" :key="r.load" class="group-row">
          <span class="t-num rec-load">{{ r.load ? fmtLoad(r.load, unit) : t('Bodyweight') }}</span>
          <span class="grow t-small t-muted">{{ r.date ? relativeDay(r.date) : '' }}</span>
          <b class="t-num rec-v">{{ tn(r.reps, '{n} rep', '{n} reps') }}</b>
        </div>
      </div>
    </section>

    <section v-if="alternatives.length">
      <h2 class="section-h">{{ t('Alternatives') }}</h2>
      <div class="group">
        <RouterLink v-for="a in alternatives" :key="a.id" :to="`/exercise/${a.id}`" class="group-row">
          <span class="grow t-h3">{{ tx(a, 'name') }}</span><Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
    </section>

    <template v-if="ex.custom">
      <button v-if="ex.hidden" class="btn btn-soft btn-block own-del" @click="hideCustomExercise(ex.id, false); toast(t('Exercise restored'))"><Icon name="restore" />{{ t('Restore this exercise') }}</button>
      <button v-else class="btn btn-ghost btn-block t-err own-del" @click="delOpen = true"><Icon name="trash" />{{ t('Delete this exercise') }}</button>
    </template>

    <MachineSettingsSheet v-model="msOpen" :exercise-id="ex.id" />
    <CustomExerciseSheet v-if="ex.custom" v-model="editOpen" :exercise="ex" />
    <Sheet v-model="delOpen" :title="t('Delete {name}?', { name: ex.name })">
      <p class="t-body">{{ t("It won't show in lists or the exercise picker any more. Workouts, records and charts that used it keep it.") }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="delOpen = false">{{ t('Keep it') }}</button>
        <button class="btn btn-danger btn-lg" @click="del">{{ t('Delete') }}</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">{{ t("This exercise isn't in the library") }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import { toast } from '../ui/toast.js'
import ExerciseDetails from '../ui/ExerciseDetails.vue'
import MachineSettingsSheet from '../ui/MachineSettingsSheet.vue'
import CustomExerciseSheet from '../ui/CustomExerciseSheet.vue'
import Sheet from '../ui/Sheet.vue'
import { state, exercisesById, historyFor, setExerciseNote, hideCustomExercise } from '../store.js'
import { relativeDay } from '../lib/format.js'
import { bestE1RM, heaviest, fmtLoad, unitFor, repRecords, bestSeconds } from '../lib/training.js'
import { t, tx } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const ex = computed(() => exercisesById.value[route.params.id])
const unit = computed(() => unitFor(ex.value, state.data.profile))
const machine = computed(() => state.data.machineSettings[ex.value?.id] || [])
const msOpen = ref(false)
const editOpen = ref(false)
const delOpen = ref(false)
function del () {
  hideCustomExercise(ex.value.id)
  delOpen.value = false
  toast(t('Exercise deleted'))
  router.back()
}
const alternatives = computed(() => (ex.value?.alternatives || []).map(id => exercisesById.value[id]).filter(Boolean))
const history = computed(() => (ex.value ? historyFor(ex.value.id) : []))
const best = computed(() => {
  const sets = history.value.flatMap(h => h.sets)
  return unit.value === 'pin' ? heaviest(sets, state.data.profile.unit) : bestE1RM(sets, state.data.profile.unit)
})

const records = computed(() => {
  const sets = history.value.flatMap(h => h.sets.map(s => ({ ...s, date: h.date })))
  return repRecords(sets, state.data.profile.unit)
})
const bestHold = computed(() => bestSeconds(history.value.flatMap(h => h.sets)))

const note = ref('')
watch(() => route.params.id, (id) => { note.value = state.data.exerciseNotes[id] || '' }, { immediate: true })
function saveNote () {
  if ((state.data.exerciseNotes[ex.value.id] || '') !== note.value) {
    setExerciseNote(ex.value.id, note.value.trim())
    toast(t('Note saved'))
  }
}

function setStr (s) {
  if (s.seconds) return s.load ? t('{load} for {s}s', { load: fmtLoad(s.load, s.unit), s: s.seconds }) : `${s.seconds}s`
  const reps = s.repsL != null && s.repsR != null && s.repsL !== s.repsR ? `${s.repsL}/${s.repsR}` : s.reps
  const tag = s.type === 'drop' ? ' ' + t('drop') : s.type === 'warmup' ? ' ' + t('warm-up') : ''
  return `${s.load ? fmtLoad(s.load, s.unit) : t('BW')} × ${reps}${tag}`
}
</script>

<style scoped>
.settings-btn { width: 100%; }
.own { margin-top: 8px; gap: 8px; }
.own-del { margin-top: 24px; }
.ms-list { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.ms { font-size: 17px; }
.stats { gap: 10px; }
.stat { flex: 1 1 0; padding: 14px 16px; }
.hist { margin-top: 10px; }
.when { width: 92px; flex: 0 0 auto; }
.sets-line { font-size: 18px; }
.chart-link { margin-top: 6px; }
.rec-help { margin: -4px 4px 10px; }
.rec-load { font-size: 18px; font-weight: 600; min-width: 80px; }
.rec-v { font-size: 18px; }
</style>
