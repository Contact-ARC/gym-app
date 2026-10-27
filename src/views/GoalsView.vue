<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>
    <div class="row head">
      <h1 class="t-title grow">{{ t('Goals') }}</h1>
      <button class="btn btn-sm btn-primary" @click="openNew"><Icon name="plus" :size="20" />{{ t('New goal') }}</button>
    </div>
    <p class="t-small t-muted sub">{{ t('Targets for your lifts, your body and how often you train. Progress updates from your workouts and weigh-ins.') }}</p>

    <div v-if="!active.length && !reached.length" class="card card-pad empty">
      <p class="t-h3">{{ t('No goals yet') }}</p>
      <p class="t-small t-muted">{{ t('Pick something you want in the next few months: a lift, a number of reps, a weight or body fat, or how often you train.') }}</p>
    </div>

    <section v-if="active.length">
      <div v-for="{ goal, p } in active" :key="goal.id" class="card card-pad gcard">
        <div class="row g-head">
          <button class="grow g-title-btn" @click="openEdit(goal)">
            <div class="t-tiny t-muted up">{{ goalLabel(goal.type) }}</div>
            <div class="t-h3">{{ goalTitle(goal, p.target, p.unit) }}</div>
          </button>
          <button class="icon-btn" :aria-label="goal.pinned ? t('Unpin from Train') : t('Pin to Train')" :aria-pressed="!!goal.pinned" @click="togglePin(goal)">
            <Icon :name="goal.pinned ? 'pin' : 'pinOff'" :size="22" :class="goal.pinned ? '' : 't-faint'" />
          </button>
        </div>
        <div class="bar" :class="{ ok: p.done }"><div :style="{ width: Math.round(p.pct * 100) + '%' }" /></div>
        <div class="row nums t-small">
          <span class="grow">
            <template v-if="goal.type === 'weekly'">{{ t('This week: {a} of {b}', { a: p.current ?? 0, b: p.target }) }}</template>
            <template v-else-if="p.current == null">{{ missingText(goal) }}</template>
            <template v-else>{{ t('Now {v}', { v: goalValue(goal.type, p.current, p.unit) }) }}<span v-if="p.start != null && p.start !== p.current" class="t-muted">{{ ' · ' + t('started at {v}', { v: goalValue(goal.type, p.start, p.unit) }) }}</span></template>
          </span>
          <span class="t-num t-muted">{{ Math.round(p.pct * 100) }}%</span>
        </div>
        <p v-if="goal.type === 'weekly'" class="t-tiny t-muted extra">{{ tn(streak.weeks, 'Streak: {n} week in a row', 'Streak: {n} weeks in a row') }}</p>
        <p v-if="paceText(goal, p)" class="t-tiny extra" :class="paceWarn(goal) ? 't-warn' : 't-muted'">{{ paceText(goal, p) }}</p>
        <p v-if="goal.by && goal.type !== 'weekly'" class="t-tiny t-muted extra">{{ byText(goal) }}</p>
      </div>
    </section>

    <section v-if="reached.length">
      <h2 class="section-h">{{ t('Reached') }}</h2>
      <div class="group">
        <button v-for="{ goal, p } in reached" :key="goal.id" class="group-row" @click="openEdit(goal)">
          <span class="ok-ic"><Icon name="trophy" :size="20" /></span>
          <div class="grow">
            <div class="t-h3">{{ goalTitle(goal, p.target, p.unit) }}</div>
            <div class="t-tiny t-muted">{{ t('Reached {when}', { when: relativeDay(goal.doneAt) }) }}</div>
          </div>
        </button>
      </div>
    </section>

    <!-- New goal: what kind -->
    <Sheet v-model="typeOpen" :title="t('New goal')">
      <template v-for="grp in TYPE_GROUPS" :key="grp.label">
        <div class="section-h first">{{ t(grp.label) }}</div>
        <div class="group types">
          <button v-for="ty in grp.types" :key="ty" class="group-row" @click="pickType(ty)">
            <div class="grow">
              <div class="t-h3">{{ goalLabel(ty) }}</div>
              <div class="t-tiny t-muted">{{ t(TYPE_HELP[ty]) }}</div>
            </div>
            <Icon name="chevronRight" class="chev" />
          </button>
        </div>
      </template>
    </Sheet>

    <!-- New or edit -->
    <Sheet v-model="formOpen" :title="draft.id ? t('Edit goal') : goalLabel(draft.type)">
      <template v-if="needsExercise">
        <button class="group group-row ex-pick" @click="exOpen = true">
          <div class="grow">
            <div class="t-tiny t-muted">{{ t('Exercise') }}</div>
            <div class="t-h3">{{ draft.exerciseId ? exName(draft.exerciseId) : t('Choose an exercise') }}</div>
          </div>
          <Icon name="chevronRight" class="chev" />
        </button>
      </template>

      <template v-if="hasBasis">
        <div class="label mt">{{ t('Count it as') }}</div>
        <Segmented v-model="draft.basis" :options="basisOptions" :label="t('Count it as')" />
        <p class="t-tiny t-muted help">{{ draft.basis === 'e1rm' ? t('Estimated from any set, like the Progress charts. No max testing needed.') : t('Only counts when you log a set at that weight or more.') }}</p>
      </template>
      <template v-if="draft.type === 'lift' && draft.basis === 'actual'">
        <div class="mt">
          <Stepper v-model="draft.reps" :label="t('For how many reps')" :step="1" :min="1" :max="20" size="md" />
        </div>
      </template>

      <p v-if="requirement" class="note note-warn t-small mt">{{ requirement }}</p>

      <div class="mt">
        <Stepper v-model="draft.target" :label="t('Target')" :unit="targetUnit" :step="targetStep" :min="0" :decimals="targetDecimals" size="md" />
      </div>
      <p v-if="formCurrent != null && draft.type !== 'weekly'" class="t-small t-muted help center">{{ t('You now: {v}', { v: goalValue(draft.type, formCurrent, targetUnit) }) }}</p>
      <div v-if="suggestion?.options?.length" class="sugg">
        <span class="t-tiny t-muted">{{ suggestion.basis === 'average' ? t('You average {n} a week. Try:', { n: suggestion.current }) : t('Realistic in about 3 months:') }}</span>
        <div class="row chips">
          <button v-for="o in suggestion.options" :key="o" class="schip t-num" :class="{ on: draft.target === o }" @click="draft.target = o">{{ goalValue(draft.type, o, targetUnit) }}</button>
        </div>
      </div>
      <p v-if="draft.type === 'weight'" class="t-tiny t-muted help">{{ t('A steady pace is about 0.5–1% of your bodyweight a week. Slower losses keep more muscle.') }}</p>
      <p v-if="draft.type === 'bodyFat' && suggestion?.basis === 'lean'" class="t-tiny t-muted help">{{ t("You're already lean. Holding steady while getting stronger is a good goal too.") }}</p>

      <template v-if="draft.type !== 'weekly'">
        <label class="label mt" for="g-by">{{ t('By (optional)') }}</label>
        <input id="g-by" v-model="draft.by" type="date" class="field" :min="state.today">
      </template>

      <label class="toggle-row t-small">
        <Toggle v-model="draft.pinned" />
        <span class="grow">{{ t('Show on Train') }}</span>
      </label>

      <template #actions>
        <button v-if="draft.id" class="btn btn-danger btn-lg" @click="remove"><Icon name="trash" />{{ t('Delete') }}</button>
        <button v-else class="btn btn-soft btn-lg" @click="formOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!canSave" @click="save">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <ExercisePicker v-model="exOpen" :title="t('Choose an exercise')" :suggested-ids="exSuggestions" :suggested-label="t('You do these')" @pick="(id) => { draft.exerciseId = id; refreshTarget() }" />
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Stepper from '../ui/Stepper.vue'
import Segmented from '../ui/Segmented.vue'
import Toggle from '../ui/Toggle.vue'
import ExercisePicker from '../ui/ExercisePicker.vue'
import { toast } from '../ui/toast.js'
import { state, persist, goalsWithProgress, goalCtx, saveGoal, deleteGoal, exercisesById, finishedSessions, streak } from '../store.js'
import { currentValue, suggestTargets, displayUnit, weeksToGo, EXERCISE_GOALS } from '../lib/goals.js'
import { weightRate } from '../lib/body.js'
import { goalTitle, goalValue, goalLabel } from '../lib/goalText.js'
import { relativeDay, shortDay } from '../lib/format.js'
import { daysBetween } from '../lib/routines.js'
import { t, tn, tx } from '../i18n/index.js'

const router = useRouter()
const exName = (id) => tx(exercisesById.value[id], 'name') || id
const active = computed(() => goalsWithProgress.value.filter(g => !g.goal.doneAt))
const reached = computed(() => goalsWithProgress.value.filter(g => g.goal.doneAt).sort((a, b) => b.goal.doneAt.localeCompare(a.goal.doneAt)))

const TYPE_GROUPS = [
  { label: 'Strength', types: ['lift', 'reps', 'time', 'bwMultiple', 'total', 'dots'] },
  { label: 'Body', types: ['weight', 'bodyFat', 'waist', 'leanMass'] },
  { label: 'Habit', types: ['weekly'] }
]
const TYPE_HELP = {
  lift: 'Bench 100 kg, squat 140 kg for 5…',
  reps: '10 pull-ups, 30 push-ups…',
  time: 'A 2-minute plank, a longer carry…',
  bwMultiple: 'Squat twice your bodyweight…',
  total: 'Squat + bench + deadlift',
  dots: 'Compares lifters of different bodyweights',
  weight: 'Gain or lose, with a 7-day average',
  bodyFat: 'Entered or estimated from measurements',
  waist: 'From your measurements',
  leanMass: 'Weight without fat: build muscle',
  weekly: 'Also sets what keeps your streak going'
}

// ── Pace and dates for body goals ──
const unit = computed(() => state.data.profile.unit)
const rate = computed(() => weightRate(state.data.body.entries, unit.value, { today: state.today }))
function paceText (goal, p) {
  if (goal.type !== 'weight' || p.current == null || p.done) return ''
  const r = rate.value
  if (!r) return t('Weigh in a few times a week to see your pace.')
  const w = weeksToGo(p.current, p.target, r.perWeek)
  const pace = t('{v} a week', { v: `${r.perWeek > 0 ? '+' : ''}${r.perWeek} ${unit.value}` })
  if (w == null) return t("Lately: {pace}, so you're not heading there yet.", { pace })
  return tn(w, 'Lately: {pace}. At this rate: about {n} week.', 'Lately: {pace}. At this rate: about {n} weeks.', { pace })
}
const paceWarn = (goal) => goal.type === 'weight' && rate.value && rate.value.pctPerWeek < -1
function byText (goal) {
  const left = daysBetween(state.today, goal.by)
  if (left < 0) return t('Target date was {date}', { date: shortDay(goal.by) })
  return tn(Math.ceil(left / 7), 'By {date}: {n} week left', 'By {date}: {n} weeks left', { date: shortDay(goal.by) })
}
function missingText (goal) {
  if (EXERCISE_GOALS.includes(goal.type)) return t('Log this exercise to see where you are.')
  if (goal.type === 'total' || goal.type === 'dots') return t('Needs a logged squat, bench and deadlift.')
  if (goal.type === 'bodyFat' || goal.type === 'leanMass') return t('Log your body fat, or your measurements, to see it.')
  return t('Log your weight or measurements to see where you are.')
}
function togglePin (g) { g.pinned = !g.pinned; persist() }

// ── New / edit ──
const typeOpen = ref(false)
const formOpen = ref(false)
const exOpen = ref(false)
const draft = reactive({})
function openNew () { typeOpen.value = true }
function pickType (type) {
  typeOpen.value = false
  Object.keys(draft).forEach(k => delete draft[k])
  // Pinned to Train while fewer than two are
  const pinnedNow = goalsWithProgress.value.filter(g => g.goal.pinned && !g.goal.doneAt).length
  Object.assign(draft, { id: null, type, exerciseId: null, basis: 'e1rm', reps: 1, target: null, by: '', pinned: pinnedNow < 2 })
  if (type === 'total' || type === 'dots') draft.basis = state.data.settings.plBasis || 'e1rm'
  refreshTarget()
  formOpen.value = true
  if (EXERCISE_GOALS.includes(type)) exOpen.value = true
}
function openEdit (goal) {
  Object.keys(draft).forEach(k => delete draft[k])
  const p = goalsWithProgress.value.find(x => x.goal.id === goal.id)?.p
  Object.assign(draft, { ...JSON.parse(JSON.stringify(goal)), target: p?.target ?? goal.target, by: goal.by || '' })
  formOpen.value = true
}
const needsExercise = computed(() => EXERCISE_GOALS.includes(draft.type))
const hasBasis = computed(() => ['lift', 'bwMultiple', 'total', 'dots'].includes(draft.type))
const basisOptions = computed(() => [{ label: t('Estimated max'), value: 'e1rm' }, { label: t('Actually lifted'), value: 'actual' }])
// Weights and lengths follow the app's units; other goals store a fixed code
const MEASURED = ['lift', 'total', 'weight', 'leanMass', 'waist']
const UNIT_CODE = { reps: 'reps', time: 's', bodyFat: '%', bwMultiple: 'x', dots: 'pts', weekly: 'n' }
const unitCode = computed(() => (MEASURED.includes(draft.type) ? displayUnit({ type: draft.type }, state.data.profile) : UNIT_CODE[draft.type]))
const targetUnit = computed(() => (MEASURED.includes(draft.type) ? unitCode.value : ({ reps: t('reps'), time: t('seconds'), bodyFat: '%', bwMultiple: '×', dots: t('points'), weekly: t('workouts a week') }[draft.type] || '')))
const targetStep = computed(() => ({ lift: unit.value === 'kg' ? 2.5 : 5, total: unit.value === 'kg' ? 2.5 : 5, weight: 0.5, bodyFat: 0.5, waist: 0.5, leanMass: 0.5, reps: 1, time: 5, bwMultiple: 0.05, dots: 5, weekly: 1 }[draft.type] || 1))
const targetDecimals = computed(() => ['lift', 'total', 'weight', 'bodyFat', 'waist', 'leanMass', 'bwMultiple'].includes(draft.type))
const formCurrent = computed(() => (draft.type ? currentValue(draft, goalCtx.value) : null))
const suggestion = computed(() => (draft.type ? suggestTargets(draft, goalCtx.value) : null))
function refreshTarget () {
  if (draft.id) return
  const s = suggestTargets(draft, goalCtx.value)
  const cur = currentValue(draft, goalCtx.value)
  draft.target = s?.options?.[0] ?? (cur != null ? Math.round(cur * 10) / 10 : ({ weekly: 3, reps: 10, time: 60, bwMultiple: 1.5, dots: 300, bodyFat: 15 }[draft.type] ?? null))
}

// Exercises you've logged, most done first (for exercise goals)
const exSuggestions = computed(() => {
  const n = {}
  for (const s of finishedSessions.value) for (const x of s.sets) n[x.exerciseId] = (n[x.exerciseId] || 0) + 1
  return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id)
})

const requirement = computed(() => {
  const p = state.data.profile
  if (draft.type === 'dots' && !p.sex) return t('DOTS needs your sex, set in Body (the formula differs for men and women).')
  if ((draft.type === 'bwMultiple' || draft.type === 'dots') && !p.bodyweight && !state.data.body.entries.some(e => e.weight)) return t('Log your weight in Body first.')
  if ((draft.type === 'total' || draft.type === 'dots')) {
    const l = state.data.settings.lifts
    const missing = ['squat', 'bench', 'deadlift'].filter(k => !l[k] || !exercisesById.value[l[k]])
    if (missing.length) return t('Choose your squat, bench and deadlift exercises on the Progress screen.')
  }
  if (draft.type === 'bodyFat' || draft.type === 'leanMass') {
    if (formCurrent.value == null) return t('Log a body-fat reading in Body, or your height, sex, waist and neck for an estimate.')
  }
  return ''
})
const canSave = computed(() => draft.target > 0 && (!needsExercise.value || !!draft.exerciseId))

function save () {
  const goal = {
    id: draft.id || undefined,
    createdAt: draft.createdAt,
    type: draft.type,
    exerciseId: needsExercise.value ? draft.exerciseId : undefined,
    basis: hasBasis.value ? draft.basis : undefined,
    reps: draft.type === 'lift' && draft.basis === 'actual' ? draft.reps : undefined,
    target: draft.target,
    unit: unitCode.value,
    start: draft.id ? draft.start : formCurrent.value,
    by: draft.by || null,
    pinned: !!draft.pinned,
    doneAt: draft.id && draft.target === goalsWithProgress.value.find(x => x.goal.id === draft.id)?.p.target ? draft.doneAt : null
  }
  if (draft.id && MEASURED.includes(goal.type)) {
    // The start was saved in the goal's old unit; keep it in the same unit as the target
    const p = goalsWithProgress.value.find(x => x.goal.id === draft.id)?.p
    goal.start = p?.start ?? goal.start
  }
  saveGoal(goal)
  formOpen.value = false
  toast(draft.id ? t('Goal saved') : t('Goal added'))
}
function remove () {
  deleteGoal(draft.id)
  formOpen.value = false
  toast(t('Goal deleted'))
}
</script>

<style scoped>
.head { align-items: center; }
.head .t-title { margin: 0; }
.sub { margin-top: 6px; }
.empty { margin-top: 18px; }
.empty .t-small { margin-top: 6px; }
.gcard { margin-top: 14px; }
.g-head { align-items: flex-start; gap: 8px; }
.g-title-btn { text-align: left; }
.up { letter-spacing: 0.02em; font-weight: 700; }
.bar { height: 10px; border-radius: 5px; background: var(--card-2); margin-top: 12px; overflow: hidden; }
.bar > div { height: 100%; background: var(--ink); border-radius: 5px; transition: width 400ms ease; }
.bar.ok > div { background: var(--ok); }
.nums { margin-top: 8px; gap: 10px; }
.extra { margin-top: 6px; }
.ok-ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); flex: 0 0 auto; }
.section-h.first { margin-top: 8px; }
.types { background: var(--card-2); }
.ex-pick { width: 100%; background: var(--card-2); }
.mt { margin-top: 16px; }
.help { margin: 8px 2px 0; }
.center { text-align: center; }
.sugg { margin-top: 12px; }
.chips { gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.schip { min-height: 40px; padding: 0 16px; border-radius: 20px; background: var(--card-2); font-weight: 700; font-size: 17px; }
.schip.on { background: var(--ink); color: var(--paper); }
.toggle-row { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
</style>
