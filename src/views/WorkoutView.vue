<template>
  <div v-if="session" class="wk" :style="plateVars">
    <!-- Header -->
    <header class="wk-head">
      <button class="icon-btn" aria-label="Back to home (workout keeps running)" @click="router.push('/')">
        <Icon name="close" />
      </button>
      <div class="grow wk-title">
        <div class="t-h3 truncate">{{ dayTitle(session.dayName, session.dayId) }}</div>
        <div class="t-tiny t-muted t-num">{{ elapsed }}<span class="sep" />{{ doneSets }} of {{ plannedSets }} sets</div>
      </div>
      <button class="icon-btn" aria-label="Workout options" @click="menuOpen = true"><Icon name="more" /></button>
      <button class="btn btn-sm btn-primary" @click="finishOpen = true">Finish</button>
    </header>
    <div class="wk-progress" role="progressbar" :aria-valuenow="doneSets" :aria-valuemax="plannedSets">
      <div :style="{ width: progressPct + '%' }" />
    </div>

    <!-- Exercise strip -->
    <div v-if="session.items.length" ref="strip" class="strip" role="tablist" aria-label="Exercises">
      <button
        v-for="(it, i) in session.items" :key="i" :ref="(el) => (chips[i] = el)"
        class="chip" role="tab" :aria-selected="i === current"
        :class="{ on: i === current, complete: isComplete(i) }"
        @click="go(i)"
      >
        <span class="chip-n t-num">{{ i + 1 }}</span>
        <span class="chip-name">{{ shortName(it.exerciseId) }}</span>
        <Icon v-if="isComplete(i)" name="checkBold" :size="15" class="chip-check" />
        <span v-else class="chip-count t-num">{{ logged(i).length }}/{{ rowCount(i) }}</span>
      </button>
    </div>

    <!-- Empty free session -->
    <main v-if="!session.items.length" class="wk-empty page no-nav">
      <p class="t-h2">What are you training?</p>
      <p class="t-muted t-small">Add the exercises as you go. They're saved like any other workout.</p>
      <button class="btn btn-primary btn-lg btn-block" @click="addOpen = true"><Icon name="plus" />Add an exercise</button>
    </main>

    <!-- Current exercise -->
    <main
      v-else class="wk-main"
      @touchstart.passive="swipeStart" @touchend.passive="swipeEnd"
    >
      <Transition :name="slideDir" mode="out-in">
        <section :key="current + ':' + item.exerciseId" class="ex">
          <div class="row ex-top">
            <div class="grow">
              <h1 class="t-title">{{ ex?.name || item.exerciseId }}</h1>
              <div class="t-small t-muted ex-meta">
                <span>{{ prescription(item, ex) }}</span>
                <span v-if="restSecs">{{ restLabel(restSecs) }}</span>
                <span v-if="item.exerciseId !== item.originalExerciseId" class="t-faint">replaces {{ name(item.originalExerciseId) }}</span>
              </div>
            </div>
            <button class="icon-btn" aria-label="Exercise options" @click="exMenuOpen = true"><Icon name="more" /></button>
          </div>

          <div v-if="item.group" class="superset t-small">
            <Icon name="superset" :size="18" />
            <span>Superset with {{ groupMates.map(name).join(' and ') }}. Rest after the last one.</span>
          </div>

          <div class="hint" :class="`k-${sugg.kind}`">
            <Icon :name="suggIcon" :size="18" />
            <span>{{ sugg.text }}</span>
          </div>
          <p v-if="state.data.exerciseNotes[item.exerciseId]" class="t-small mini-note">
            <Icon name="note" :size="16" /> {{ state.data.exerciseNotes[item.exerciseId] }}
          </p>
          <p v-if="item.notes" class="t-small t-muted mini-note">{{ item.notes }}</p>

          <!-- Sets -->
          <div class="sets" aria-label="Sets">
            <button
              v-for="(s, k) in logged(current)" :key="s.id" class="set done"
              :aria-label="`Set ${k + 1}: ${setText(s)}. Tap to edit`" @click="openEdit(s)"
            >
              <span class="set-n">{{ k + 1 }}</span>
              <span class="t-num set-v">{{ setText(s) }}</span>
            </button>
            <div
              v-for="k in Math.max(0, rowCount(current) - logged(current).length)" :key="'p' + k"
              class="set" :class="{ next: k === 1 }"
            >
              <span class="set-n">{{ logged(current).length + k }}</span>
              <span class="set-v t-faint">{{ k === 1 ? 'next' : '' }}</span>
            </div>
            <button class="set add" aria-label="Add a set" @click="addSet"><Icon name="plus" :size="20" /></button>
          </div>

          <!-- Inputs -->
          <div class="inputs">
            <Stepper
              v-if="showLoad" v-model="draft.load"
              :label="loadLabel" :unit="unitText" :step="inc" :min="0" :decimals="unit !== 'pin'"
            />
            <Stepper
              v-if="isTimed" v-model="draft.seconds"
              label="Seconds" :step="5" :min="0" :format="(v) => String(Math.round(v))"
            />
            <Stepper v-else v-model="draft.reps" label="Reps" :step="1" :min="0" />

            <div v-if="isTimed" class="hold">
              <button class="btn btn-soft btn-block" @click="toggleHold">
                <Icon :name="hold.running ? 'stop' : 'play'" />
                {{ hold.running ? `Stop at ${hold.elapsed} s` : 'Time it' }}
              </button>
            </div>

            <div v-else>
              <div class="label rir-label">Reps left in the tank <span class="t-faint">(optional)</span></div>
              <Segmented v-model="draft.rir" :options="rirOptions" allow-none label="Reps left in the tank" />
            </div>
          </div>
        </section>
      </Transition>
    </main>

    <!-- Bottom dock: rest timer + log button -->
    <div v-if="session.items.length" class="dock">
      <Transition name="fade">
        <div v-if="rest.endsAt" class="rest" :class="{ done: rest.done }">
          <div class="rest-bar"><div :style="{ width: restPct + '%' }" /></div>
          <div class="row">
            <div class="grow">
              <div class="t-num rest-time">{{ rest.done ? 'Go' : mmss(rest.remaining) }}</div>
              <div class="t-tiny rest-next truncate">{{ rest.done ? 'Rest over' : 'Resting' }}<template v-if="rest.label">, then {{ rest.label }}</template></div>
            </div>
            <button class="btn btn-sm rest-btn" :disabled="rest.remaining <= 15" @click="addRest(-15)">−15</button>
            <button class="btn btn-sm rest-btn" @click="addRest(30)">+30</button>
            <button class="btn btn-sm rest-btn strong" @click="stopRest">{{ rest.done ? 'OK' : 'Skip' }}</button>
          </div>
        </div>
      </Transition>
      <button v-if="!allDone || !isComplete(current)" class="btn btn-lg btn-block btn-plate log" :disabled="!canLog" @click="logNow">
        <Icon name="check" />{{ logLabel }}
      </button>
      <button v-else class="btn btn-lg btn-block btn-primary log" @click="finishOpen = true">
        <Icon name="trophy" />Finish workout
      </button>
    </div>

    <!-- Workout menu -->
    <Sheet v-model="menuOpen" title="Workout">
      <div class="group">
        <button class="group-row" @click="menuOpen = false; addOpen = true"><Icon name="plus" /><span class="grow">Add an exercise</span></button>
        <div class="group-row notes-row">
          <textarea v-model="sessionNotes" class="field" rows="2" placeholder="Notes about today's session" aria-label="Session notes" @blur="saveSessionNotes" />
        </div>
        <button class="group-row t-err" @click="menuOpen = false; discardOpen = true"><Icon name="trash" /><span class="grow">Discard this workout</span></button>
      </div>
    </Sheet>

    <!-- Exercise menu -->
    <Sheet v-model="exMenuOpen" :title="ex?.name">
      <div class="group">
        <button class="group-row" @click="exMenuOpen = false; swapOpen = true"><Icon name="swap" /><span class="grow">Swap for another exercise</span></button>
        <button class="group-row" @click="exMenuOpen = false; router.push(`/exercise/${item.exerciseId}`)"><Icon name="info" /><span class="grow">How to do it</span></button>
        <button class="group-row" @click="exMenuOpen = false; openNote()"><Icon name="note" /><span class="grow">{{ state.data.exerciseNotes[item.exerciseId] ? 'Edit your note' : 'Add a note for next time' }}</span></button>
        <button class="group-row" @click="addSet(); exMenuOpen = false"><Icon name="plus" /><span class="grow">Add a set</span></button>
        <button v-if="(item.extraSets || 0) > 0 || (item.removedSets || 0) < (item.sets || 1) - 1" class="group-row" @click="removeSet(); exMenuOpen = false">
          <Icon name="minus" /><span class="grow">Remove a set</span>
        </button>
      </div>
    </Sheet>

    <ExercisePicker
      v-model="swapOpen" title="Swap exercise"
      :suggested-ids="swapSuggestions" suggested-label="Works the same muscles"
      :exclude-id="item?.exerciseId" @pick="doSwap"
    />
    <ExercisePicker v-model="addOpen" title="Add an exercise" @pick="doAdd" />

    <!-- Note -->
    <Sheet v-model="noteOpen" :title="ex?.name">
      <label class="label" for="ex-note">Your note, shown every time you do this exercise</label>
      <textarea id="ex-note" v-model="noteText" class="field" rows="3" placeholder="Seat height, grip, how it felt" />
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="noteOpen = false">Cancel</button>
        <button class="btn btn-primary btn-lg" @click="saveNote">Save note</button>
      </template>
    </Sheet>

    <!-- Edit a logged set -->
    <Sheet v-model="editOpen" :title="editing ? `Set ${editIndex + 1}` : ''">
      <div v-if="editing" class="inputs">
        <Stepper v-if="showLoad" v-model="editDraft.load" :label="loadLabel" :unit="unitText" :step="inc" :min="0" :decimals="unit !== 'pin'" size="md" />
        <Stepper v-if="isTimed" v-model="editDraft.seconds" label="Seconds" :step="5" :min="0" size="md" />
        <Stepper v-else v-model="editDraft.reps" label="Reps" :step="1" :min="0" size="md" />
        <div v-if="!isTimed">
          <div class="label rir-label">Reps left in the tank</div>
          <Segmented v-model="editDraft.rir" :options="rirOptions" allow-none label="Reps left in the tank" />
        </div>
      </div>
      <template #actions>
        <button class="btn btn-danger btn-lg" @click="removeEditing"><Icon name="trash" />Delete</button>
        <button class="btn btn-primary btn-lg" @click="saveEdit">Save</button>
      </template>
    </Sheet>

    <!-- Finish -->
    <Sheet v-model="finishOpen" title="Finish workout?">
      <p class="t-body">
        You logged <b>{{ doneSets }}</b> of {{ plannedSets }} planned sets.
        <span v-if="doneSets < plannedSets" class="t-muted">Sets you didn't log just won't be recorded.</span>
      </p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="finishOpen = false">Keep going</button>
        <button v-if="doneSets" class="btn btn-primary btn-lg" @click="finish">Finish</button>
        <button v-else class="btn btn-danger btn-lg" @click="discard">Discard</button>
      </template>
    </Sheet>

    <!-- Discard -->
    <Sheet v-model="discardOpen" title="Discard this workout?">
      <p class="t-body">All {{ doneSets }} logged sets from this session will be deleted. This can't be undone.</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="discardOpen = false">Keep it</button>
        <button class="btn btn-danger btn-lg" @click="discard">Discard</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page no-nav">
    <p class="t-h2">This workout no longer exists</p>
    <RouterLink to="/" class="btn btn-primary btn-lg btn-block" style="margin-top: 20px">Go home</RouterLink>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Stepper from '../ui/Stepper.vue'
import Segmented from '../ui/Segmented.vue'
import ExercisePicker from '../ui/ExercisePicker.vue'
import { plateStyle } from '../ui/plates.js'
import { toast } from '../ui/toast.js'
import {
  state, persist, getSession, exercisesById, suggestionFor, logSet, updateSet, deleteSet,
  swapExercise, addItemToSession, finishSession, discardSession, setExerciseNote
} from '../store.js'
import { unitFor, incrementFor } from '../lib/training.js'
import { prescription, restLabel, dayTitle, mmss } from '../lib/format.js'
import { effectiveRest, nextInGroup } from '../lib/supersets.js'
import { rest, startRest, stopRest, addRest } from '../lib/restTimer.js'
import { tap, buzz, keepAwake } from '../lib/native.js'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession(route.params.id))
const items = computed(() => session.value?.items || [])
const name = (id) => exercisesById.value[id]?.name || id
const plateVars = computed(() => plateStyle(session.value?.dayIndex ?? -1))

// ── Current exercise ───────────────────────────────────────
const current = ref(Math.min(session.value?.currentIndex ?? firstIncomplete(), Math.max(0, items.value.length - 1)))
const item = computed(() => items.value[current.value])
const ex = computed(() => exercisesById.value[item.value?.exerciseId])
const slideDir = ref('slide-next')

function go (i, dir) {
  if (i < 0 || i >= items.value.length || i === current.value) return
  slideDir.value = dir || (i > current.value ? 'slide-next' : 'slide-prev')
  current.value = i
  tap()
}
watch(current, (i) => {
  if (session.value) { session.value.currentIndex = i; persist() }
  nextTick(() => chips[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }))
})

const strip = ref(null)
const chips = []
const shortName = (id) => name(id).replace(/^(Barbell|Dumbbell|Cable|Machine|Smith Machine|EZ-Bar)\s+/i, '')

// ── Sets ───────────────────────────────────────────────────
const logged = (i) => (session.value?.sets || []).filter(s => s.itemIndex === i && s.exerciseId === items.value[i]?.exerciseId)
const rowCount = (i) => {
  const it = items.value[i]
  if (!it) return 0
  const planned = Math.max(1, (it.sets || 1) + (it.extraSets || 0) - (it.removedSets || 0))
  return Math.max(planned, logged(i).length)
}
const isComplete = (i) => logged(i).length >= rowCount(i)
const plannedSets = computed(() => items.value.reduce((t, _, i) => t + rowCount(i), 0))
const doneSets = computed(() => session.value?.sets.length || 0)
const progressPct = computed(() => (plannedSets.value ? Math.min(100, (doneSets.value / plannedSets.value) * 100) : 0))
const allDone = computed(() => items.value.length > 0 && items.value.every((_, i) => isComplete(i)))

function firstIncomplete () {
  const s = getSession(route.params.id)
  if (!s) return 0
  const idx = s.items.findIndex((it, i) => {
    const n = s.sets.filter(x => x.itemIndex === i && x.exerciseId === it.exerciseId).length
    return n < (it.sets || 1) + (it.extraSets || 0) - (it.removedSets || 0)
  })
  return idx < 0 ? 0 : idx
}

function addSet () { item.value.extraSets = (item.value.extraSets || 0) + 1; persist() }
function removeSet () {
  if ((item.value.extraSets || 0) > 0) item.value.extraSets--
  else item.value.removedSets = (item.value.removedSets || 0) + 1
  persist()
}

// ── Units and labels ───────────────────────────────────────
const profile = computed(() => state.data.profile)
const unit = computed(() => unitFor(ex.value, profile.value))
const inc = computed(() => incrementFor(ex.value, profile.value))
const isTimed = computed(() => !!item.value?.durationSec)
const isBodyweight = computed(() => ex.value?.logType === 'bodyweight')
const showLoad = computed(() => !isTimed.value || !!ex.value?.loadable)
const loadLabel = computed(() => {
  if (unit.value === 'pin') return 'Pin'
  if (isBodyweight.value) return 'Added weight'
  if (ex.value?.incrementGroup === 'dumbbell') return 'Each dumbbell'
  return 'Weight'
})
const unitText = computed(() => (unit.value === 'pin' ? 'position on the stack' : unit.value))
const restSecs = computed(() => effectiveRest(items.value, current.value))
const groupMates = computed(() => items.value
  .map((it, i) => ({ it, i }))
  .filter(({ it, i }) => it.group && it.group === item.value?.group && i !== current.value)
  .map(({ it }) => it.exerciseId))

const rirOptions = [0, 1, 2, 3, 4].map(n => ({ label: n === 4 ? '4+' : String(n), value: n }))

function setText (s) {
  if (s.seconds) return s.load ? `${s.load} for ${s.seconds}s` : `${s.seconds}s`
  const load = s.unit === 'pin' ? `P${s.load}` : (s.load ? String(s.load) : 'BW')
  return `${load} × ${s.reps}`
}

// ── Suggestions (frozen at the start so they don't shift mid-workout) ──
const suggCache = {}
const sugg = computed(() => {
  const key = `${current.value}:${item.value?.exerciseId}`
  if (!suggCache[key] && item.value) suggCache[key] = suggestionFor(item.value, session.value.id)
  return suggCache[key] || { text: '', kind: 'same' }
})
const suggIcon = computed(() => ({ up: 'up', down: 'down', deload: 'deload', start: 'start' }[sugg.value.kind] || 'same'))

// ── Draft values per exercise slot ─────────────────────────
const drafts = reactive({})
const draft = computed(() => {
  const key = `${current.value}:${item.value?.exerciseId}`
  if (!drafts[key]) {
    const done = logged(current.value)
    const last = done[done.length - 1]
    const s = sugg.value
    drafts[key] = {
      load: last ? last.load : (s.load ?? (isBodyweight.value ? 0 : null)),
      reps: last ? last.reps : (s.reps ?? null),
      seconds: last ? last.seconds : (s.seconds ?? item.value?.durationSec?.[0] ?? null),
      rir: null
    }
  }
  return drafts[key]
})

const canLog = computed(() => {
  if (isTimed.value) return draft.value.seconds > 0
  const loadOk = !showLoad.value || isBodyweight.value || draft.value.load != null
  return loadOk && draft.value.reps > 0
})
const logLabel = computed(() => {
  const n = logged(current.value).length + 1
  return n > rowCount(current.value) ? 'Log an extra set' : `Log set ${n}`
})

function logNow () {
  if (!canLog.value) return
  const i = current.value
  const it = item.value
  const d = draft.value
  const row = logSet(session.value.id, {
    exerciseId: it.exerciseId,
    itemIndex: i,
    setIndex: logged(i).length,
    load: showLoad.value ? (d.load ?? null) : null,
    unit: unit.value,
    reps: isTimed.value ? null : d.reps,
    seconds: isTimed.value ? d.seconds : null,
    rir: isTimed.value ? null : d.rir
  })
  d.rir = null
  buzz(30)
  const n = logged(i).length
  toast(`Set ${n} of ${name(it.exerciseId)} logged`, {
    actionLabel: 'Undo',
    action: () => { deleteSet(session.value.id, row.id); stopRest(); go(i) }
  })

  // Where to next, and what the rest timer should say
  let next = i
  if (it.group) next = nextInGroup(items.value, i)
  else if (isComplete(i)) {
    const after = items.value.findIndex((_, j) => j > i && !isComplete(j))
    const before = items.value.findIndex((_, j) => !isComplete(j))
    next = after >= 0 ? after : (before >= 0 ? before : i)
  }
  const secs = effectiveRest(items.value, i)
  const nextLabel = allDone.value ? '' : `${name(items.value[next].exerciseId)}, set ${logged(next).length + 1}`
  if (secs && !allDone.value) startRest(secs, nextLabel)
  else stopRest()
  if (next !== i) setTimeout(() => go(next, 'slide-next'), it.group ? 0 : 350)
}

// ── Edit a logged set ──────────────────────────────────────
const editOpen = ref(false)
const editing = ref(null)
const editIndex = ref(0)
const editDraft = reactive({ load: null, reps: null, seconds: null, rir: null })
function openEdit (s) {
  editing.value = s
  editIndex.value = logged(current.value).findIndex(x => x.id === s.id)
  Object.assign(editDraft, { load: s.load, reps: s.reps, seconds: s.seconds, rir: s.rir ?? null })
  editOpen.value = true
}
function saveEdit () {
  updateSet(session.value.id, editing.value.id, { ...editDraft })
  editOpen.value = false
  toast('Set updated')
}
function removeEditing () {
  const s = { ...editing.value }
  deleteSet(session.value.id, s.id)
  editOpen.value = false
  toast('Set deleted', {
    actionLabel: 'Undo',
    action: () => { session.value.sets.push(s); session.value.sets.sort((a, b) => a.ts.localeCompare(b.ts)); persist() }
  })
}

// ── Timed holds ────────────────────────────────────────────
const hold = reactive({ running: false, startedAt: 0, elapsed: 0 })
let holdTimer = null
function toggleHold () {
  if (hold.running) {
    clearInterval(holdTimer)
    hold.running = false
    draft.value.seconds = hold.elapsed
    buzz(60)
  } else {
    hold.running = true
    hold.startedAt = Date.now()
    hold.elapsed = 0
    holdTimer = setInterval(() => { hold.elapsed = Math.floor((Date.now() - hold.startedAt) / 1000) }, 250)
    tap()
  }
}
watch(current, () => { if (hold.running) { clearInterval(holdTimer); hold.running = false } })

// ── Swipe between exercises ────────────────────────────────
let sx = 0; let sy = 0; let st = 0
function swipeStart (e) {
  const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now()
}
function swipeEnd (e) {
  const t = e.changedTouches[0]
  const dx = t.clientX - sx; const dy = t.clientY - sy
  if (e.target.closest?.('.inputs, .sets, .seg')) return // don't hijack controls
  if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - st < 600) {
    if (dx < 0) go(current.value + 1, 'slide-next')
    else go(current.value - 1, 'slide-prev')
  }
}

// ── Swap / add ─────────────────────────────────────────────
const swapOpen = ref(false)
const addOpen = ref(false)
const swapSuggestions = computed(() => {
  const orig = exercisesById.value[item.value?.originalExerciseId]
  return [...new Set([...(orig?.alternatives || []), item.value?.originalExerciseId])].filter(id => id && id !== item.value?.exerciseId)
})
function doSwap (id) {
  const was = name(item.value.exerciseId)
  swapExercise(session.value.id, current.value, id)
  Object.keys(suggCache).forEach(k => delete suggCache[k])
  toast(`Swapped ${was} for ${name(id)}`)
}
function doAdd (id) {
  addItemToSession(session.value.id, id)
  go(items.value.length - 1, 'slide-next')
}

// ── Notes ──────────────────────────────────────────────────
const noteOpen = ref(false)
const noteText = ref('')
function openNote () { noteText.value = state.data.exerciseNotes[item.value.exerciseId] || ''; noteOpen.value = true }
function saveNote () { setExerciseNote(item.value.exerciseId, noteText.value.trim()); noteOpen.value = false; toast('Note saved') }
const sessionNotes = ref(session.value?.notes || '')
function saveSessionNotes () { if (session.value) { session.value.notes = sessionNotes.value; persist() } }

// ── Header clock ───────────────────────────────────────────
const now = ref(Date.now())
let clock = null
onMounted(() => {
  clock = setInterval(() => { now.value = Date.now() }, 1000)
  keepAwake(true)
  nextTick(() => chips[current.value]?.scrollIntoView({ inline: 'center', block: 'nearest' }))
})
onBeforeUnmount(() => { clearInterval(clock); clearInterval(holdTimer); keepAwake(false) })
const elapsed = computed(() => {
  if (!session.value) return ''
  const s = Math.max(0, Math.floor((now.value - new Date(session.value.startedAt)) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
})
const restPct = computed(() => (rest.total ? 100 - (rest.remaining / rest.total) * 100 : 0))

// ── Finish / discard ───────────────────────────────────────
const menuOpen = ref(false)
const exMenuOpen = ref(false)
const finishOpen = ref(false)
const discardOpen = ref(false)
function finish () {
  saveSessionNotes()
  stopRest()
  finishSession(session.value.id)
  finishOpen.value = false
  router.replace(`/summary/${route.params.id}`)
}
function discard () {
  stopRest()
  discardSession(session.value.id)
  finishOpen.value = false
  discardOpen.value = false
  router.replace('/')
  toast('Workout discarded')
}
</script>

<style scoped>
.wk { min-height: 100vh; display: flex; flex-direction: column; }

.wk-head {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 4px;
  padding: calc(var(--safe-top) + 6px) 10px 6px 4px;
  background: var(--paper);
}
.wk-title { padding: 0 4px; }
.sep { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: var(--ink-3); margin: 0 8px; vertical-align: middle; }
.wk-progress { height: 3px; background: var(--line); }
.wk-progress > div { height: 100%; background: var(--plate-bg); transition: width 300ms ease; }

.strip {
  display: flex; gap: 8px; overflow-x: auto; padding: 12px 16px 4px;
  scrollbar-width: none; scroll-snap-type: x proximity;
}
.strip::-webkit-scrollbar { display: none; }
.chip {
  flex: 0 0 auto; scroll-snap-align: center;
  display: inline-flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 12px 0 6px; border-radius: 20px;
  background: var(--card); color: var(--ink-2);
  font-size: 15px; font-weight: 600; max-width: 220px;
}
.chip-n {
  width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  background: var(--card-2); font-size: 15px; font-weight: 700; color: var(--ink-2);
}
.chip-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-count { font-size: 14px; color: var(--ink-3); }
.chip.on { background: var(--ink); color: var(--paper); }
.chip.on .chip-n { background: var(--plate-bg); color: var(--plate-fg); }
.chip.on .chip-count { color: var(--paper); opacity: 0.7; }
.chip.complete:not(.on) .chip-n { background: var(--ok-soft); color: var(--ok); }
.chip-check { color: var(--ok); }
.chip.on .chip-check { color: var(--paper); }

.wk-main { flex: 1 1 auto; padding: 8px 16px calc(var(--safe-bottom) + 190px); overflow-x: hidden; }
.wk-empty { display: flex; flex-direction: column; gap: 14px; justify-content: center; text-align: left; }

.ex-top { align-items: flex-start; margin-top: 8px; }
.ex-top h1 { margin-top: 4px; }
.ex-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 4px; }

.superset {
  display: flex; gap: 8px; align-items: flex-start; margin-top: 12px;
  color: var(--ink-2);
}
.hint {
  display: flex; gap: 10px; align-items: flex-start;
  margin-top: 14px; padding: 12px 14px; border-radius: 14px;
  background: var(--card); font-size: 15px; line-height: 1.4;
}
.hint .icon { margin-top: 1px; color: var(--ink-2); }
.hint.k-up .icon { color: var(--ok); }
.hint.k-down .icon, .hint.k-deload .icon { color: var(--warn); }
.mini-note { display: flex; gap: 6px; align-items: flex-start; margin: 10px 2px 0; }

.sets { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.set {
  display: inline-flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 14px 0 6px; border-radius: 22px;
  background: transparent; border: 1.5px dashed var(--line);
  font-size: 16px; font-weight: 600;
}
.set-n {
  width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  font-family: var(--font-num); font-size: 16px; font-weight: 700; color: var(--ink-3);
}
.set-v { font-size: 19px; }
.set.done { background: var(--ok-soft); border: 1.5px solid transparent; color: var(--ink); }
.set.done .set-n { background: var(--ok); color: #fff; }
.set.next { border-style: solid; border-color: var(--ink-3); }
.set.next .set-n { color: var(--ink); }
.set.add { padding: 0; width: 44px; justify-content: center; color: var(--ink-2); }
.set.done:active, .set.add:active { transform: scale(0.96); }

.inputs { display: flex; flex-direction: column; gap: 18px; margin-top: 22px; }
.rir-label { text-align: left; }
.notes-row { padding: 10px 12px; }

/* Dock: rest timer + log button, always under the thumb */
.dock {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  padding: 10px 16px calc(var(--safe-bottom) + 12px);
  background: linear-gradient(to top, var(--paper) 78%, rgba(0,0,0,0));
  max-width: 640px; margin: 0 auto;
}
.log { box-shadow: var(--shadow-float); }
.rest {
  margin-bottom: 10px; padding: 0 12px 12px; border-radius: 16px; overflow: hidden;
  background: var(--ink); color: var(--paper);
  box-shadow: var(--shadow-float);
}
.rest.done { background: var(--ok); color: #fff; }
.rest-bar { height: 4px; margin: 0 -12px 10px; background: rgba(255,255,255,0.15); }
.rest-bar > div { height: 100%; background: var(--plate-bg); transition: width 250ms linear; }
.rest.done .rest-bar > div { background: #fff; }
.rest-time { font-size: 40px; font-weight: 700; line-height: 1; }
.rest-next { opacity: 0.75; margin-top: 2px; }
.rest-btn { background: rgba(255,255,255,0.12); color: inherit; padding: 0 12px; min-height: 42px; }
.rest-btn.strong { background: rgba(255,255,255,0.22); }

/* Slide between exercises */
.slide-next-enter-active, .slide-next-leave-active,
.slide-prev-enter-active, .slide-prev-leave-active { transition: transform 180ms ease, opacity 180ms ease; }
.slide-next-enter-from, .slide-prev-leave-to { transform: translateX(28px); opacity: 0; }
.slide-next-leave-to, .slide-prev-enter-from { transform: translateX(-28px); opacity: 0; }
</style>

<style scoped>
/* Short phones: tighter rest panel and spacing so the controls stay visible while resting */
@media (max-height: 720px) {
  .wk-main { padding-bottom: calc(var(--safe-bottom) + 150px); }
  .ex-top { margin-top: 2px; }
  .hint { margin-top: 10px; padding: 10px 12px; }
  .sets { margin-top: 12px; }
  .inputs { gap: 12px; margin-top: 14px; }
  .rest { padding: 0 10px 8px; margin-bottom: 8px; }
  .rest-bar { margin-bottom: 8px; }
  .rest-time { font-size: 30px; }
  .rest-next { display: none; }
  .rest-btn { min-height: 38px; padding: 0 10px; }
  .log { min-height: 52px; }
}
</style>
