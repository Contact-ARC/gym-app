<template>
  <div v-if="session" class="wk" :style="plateVars">
    <!-- Header -->
    <header class="wk-head">
      <button class="icon-btn" :aria-label="editingFinished ? 'Back to the summary' : 'Back to home (workout keeps running)'" @click="leave">
        <Icon :name="editingFinished ? 'back' : 'close'" />
      </button>
      <div class="grow wk-title">
        <div class="t-h3 truncate">{{ editingFinished ? 'Editing workout' : dayTitle(session.dayName, session.dayId) }}</div>
        <div class="t-tiny t-muted t-num">
          <template v-if="editingFinished">{{ fmtDate(session.startedAt) }}</template>
          <template v-else>{{ elapsed }}<span class="sep" />{{ doneSets }} of {{ plannedSets }} sets</template>
        </div>
      </div>
      <button class="icon-btn" aria-label="Workout options" @click="menuOpen = true"><Icon name="more" /></button>
      <button v-if="editingFinished" class="btn btn-sm btn-primary" @click="leave">Done</button>
      <button v-else class="btn btn-sm btn-primary" @click="finishOpen = true">Finish</button>
    </header>
    <div class="wk-progress" role="progressbar" :aria-valuenow="doneSets" :aria-valuemax="plannedSets">
      <div :style="{ width: progressPct + '%' }" />
    </div>

    <!-- Exercise strip -->
    <div v-if="items.length" class="strip" role="tablist" aria-label="Exercises">
      <button
        v-for="(it, i) in items" :key="i" :ref="(el) => (chips[i] = el)"
        class="chip" role="tab" :aria-selected="i === current"
        :class="{ on: i === current, complete: isComplete(i) }"
        @click="go(i)"
      >
        <span class="chip-n t-num">{{ i + 1 }}</span>
        <span class="chip-name">{{ shortName(it.exerciseId) }}</span>
        <Icon v-if="isComplete(i)" name="checkBold" :size="15" class="chip-check" />
        <span v-else class="chip-count t-num">{{ planLogged(i).length }}/{{ rowCount(i) }}</span>
      </button>
    </div>

    <!-- Empty free session -->
    <main v-if="!items.length" class="wk-empty page no-nav">
      <p class="t-h2">What are you training?</p>
      <p class="t-muted t-small">Add the exercises as you go. They're saved like any other workout.</p>
      <button class="btn btn-primary btn-lg btn-block" @click="addOpen = true"><Icon name="plus" />Add an exercise</button>
    </main>

    <!-- Current exercise -->
    <main v-else class="wk-main" @touchstart.passive="swipeStart" @touchend.passive="swipeEnd">
      <!-- First workout only: how the screen works -->
      <div v-if="!state.data.tips.workout && !editingFinished" class="tip">
        <div class="grow t-small">
          <b>Tips:</b> swipe left or right to switch exercises. Tap a logged set to change it. Hold − or + to change numbers quickly.
        </div>
        <button class="btn btn-sm btn-soft" @click="dismissTip">Got it</button>
      </div>

      <Transition :name="slideDir" mode="out-in">
        <section :key="current + ':' + item.exerciseId" class="ex">
          <div class="row ex-top">
            <div class="grow">
              <h1 class="t-title">{{ ex?.name || item.exerciseId }}</h1>
              <div class="t-small t-muted ex-meta">
                <span>{{ prescription({ ...item, sets: rowCount(current) }, ex) }}</span>
                <span v-if="restSecs">{{ restLabel(restSecs) }}</span>
                <span v-if="item.exerciseId !== item.originalExerciseId" class="t-faint">replaces {{ name(item.originalExerciseId) }}</span>
              </div>
            </div>
            <button class="icon-btn" aria-label="Exercise options" @click="exMenuOpen = true"><Icon name="more" /></button>
          </div>

          <div v-if="targetLine || session.easy || machine.length" class="tags">
            <span v-if="targetLine" class="pill" :class="{ 'pill-warn': session.plan?.deload }">{{ targetLine }}</span>
            <span v-if="session.easy" class="pill pill-warn"><Icon name="deload" :size="16" />Lighter day</span>
            <button v-for="r in machine" :key="r.label" class="pill ms" @click="msOpen = true">
              {{ r.label }} <b class="t-num">{{ r.value }}</b>
            </button>
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

          <!-- Warm-up ramp (first lift of the day, or when the routine asks for it) -->
          <div v-if="showWarmup" class="warm card">
            <button class="warm-head" :aria-expanded="warmOpen" @click="warmOpen = !warmOpen">
              <span class="grow">
                <b>Warm-up</b>
                <span class="t-small t-muted">{{ warmDoneCount }} of {{ warmups.length }} done</span>
              </span>
              <Icon :name="warmOpen ? 'minus' : 'plus'" :size="20" />
            </button>
            <div v-if="warmOpen" class="warm-list">
              <button
                v-for="(w, k) in warmups" :key="k" class="warm-row" :class="{ on: warmDone(k) }"
                :aria-pressed="warmDone(k)" @click="toggleWarm(k)"
              >
                <span class="tick"><Icon v-if="warmDone(k)" name="checkBold" :size="16" /></span>
                <span class="grow t-num wv">{{ fmtLoad(w.load, unit) }} × {{ w.reps }}</span>
                <span class="t-tiny t-muted">{{ w.label === 'Empty bar' ? 'empty bar' : w.label }}</span>
              </button>
              <p class="t-tiny t-muted warm-foot">Based on {{ fmtLoad(warmBase, unit) }}. Warm-ups aren't counted in your records.</p>
            </div>
          </div>

          <!-- Sets -->
          <div class="sets" aria-label="Sets">
            <button
              v-for="s in logged(current)" :key="s.id" class="set done" :class="{ extra: !fillsPlannedSet(s) }"
              :aria-label="`${setName(s)}: ${setText(s)}. Tap to edit`" @click="openEdit(s)"
            >
              <span class="set-n">{{ setBadge(s) }}</span>
              <span class="t-num set-v">{{ setText(s) }}</span>
            </button>
            <div
              v-for="k in Math.max(0, rowCount(current) - planLogged(current).length)" :key="'p' + k"
              class="set" :class="{ next: k === 1 }"
            >
              <span class="set-n">{{ planLogged(current).length + k }}</span>
              <span class="set-v t-faint">{{ k === 1 ? 'next' : '' }}</span>
            </div>
            <button class="set add" aria-label="Add a set" @click="addSet"><Icon name="plus" :size="20" /></button>
          </div>
          <p v-if="lastSameSet" class="t-small t-muted last-line">
            Set {{ planLogged(current).length + 1 }} last time: <b class="t-num">{{ lastSameSet }}</b>
          </p>

          <!-- Inputs -->
          <div class="inputs">
            <div v-if="showLoad">
              <Stepper v-model="draft.load" :label="loadLabel" :unit="unitText" :step="inc" :min="0" :decimals="unit !== 'pin'" />
              <p v-if="plateLine" class="t-small t-muted plate-line t-num">{{ plateLine }}</p>
            </div>

            <Stepper v-if="isTimed" v-model="draft.seconds" label="Seconds" :step="5" :min="0" :format="(v) => String(Math.round(v))" />
            <div v-else-if="split" class="split">
              <Stepper v-model="draft.repsL" label="Left reps" :step="1" :min="0" size="md" />
              <Stepper v-model="draft.repsR" label="Right reps" :step="1" :min="0" size="md" />
            </div>
            <Stepper v-else v-model="draft.reps" :label="ex?.perSide ? 'Reps per side' : 'Reps'" :step="1" :min="0" />
            <button v-if="ex?.perSide && !isTimed" class="link-btn t-small" @click="toggleSplit">
              {{ split ? 'Same reps on both sides' : 'Different reps on each side?' }}
            </button>

            <div v-if="isTimed" class="hold">
              <button class="btn btn-soft btn-block" @click="toggleHold">
                <Icon :name="hold.running ? 'stop' : 'play'" />
                {{ hold.running ? `Stop at ${hold.elapsed} s` : 'Time it' }}
              </button>
            </div>

            <template v-else>
              <div>
                <div class="label rir-label">Reps left in the tank <span class="t-faint">(optional)</span></div>
                <Segmented v-model="draft.rir" :options="rirOptions" allow-none label="Reps left in the tank" />
              </div>
              <div class="types" role="group" aria-label="Mark this set as">
                <span class="t-tiny t-muted">Mark as</span>
                <button
                  v-for="t in typeOptions" :key="t.value" class="type-chip" :class="{ on: draft.type === t.value }"
                  :aria-pressed="draft.type === t.value" @click="draft.type = draft.type === t.value ? null : t.value"
                >{{ t.label }}</button>
              </div>
            </template>
          </div>
        </section>
      </Transition>
    </main>

    <!-- Bottom dock: rest timer + log button -->
    <div v-if="items.length" class="dock">
      <Transition name="fade">
        <div v-if="rest.endsAt && !editingFinished" class="rest" :class="{ done: rest.done }">
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
      <button v-if="editingFinished || !allDone || !isComplete(current)" class="btn btn-lg btn-block btn-plate log" :disabled="!canLog" @click="logNow">
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
        <button v-if="!editingFinished" class="group-row" @click="toggleEasy">
          <Icon name="deload" />
          <div class="grow">
            <div>{{ session.easy ? 'Back to a normal day' : 'Feeling rough? Make today lighter' }}</div>
            <div class="t-tiny t-muted">{{ session.easy ? 'Restores the sets and weights' : 'About 10% lighter and one set fewer on exercises you haven\'t started' }}</div>
          </div>
        </button>
        <div class="group-row notes-row">
          <textarea v-model="sessionNotes" class="field" rows="2" placeholder="Notes about this session" aria-label="Session notes" @blur="saveSessionNotes" />
        </div>
        <button class="group-row t-err" @click="menuOpen = false; discardOpen = true"><Icon name="trash" /><span class="grow">{{ editingFinished ? 'Delete this workout' : 'Discard this workout' }}</span></button>
      </div>
    </Sheet>

    <!-- Exercise menu -->
    <Sheet v-model="exMenuOpen" :title="ex?.name">
      <div class="group">
        <button class="group-row" @click="exMenuOpen = false; swapOpen = true"><Icon name="swap" /><span class="grow">Swap for another exercise</span></button>
        <button class="group-row" @click="exMenuOpen = false; router.push(`/exercise/${item.exerciseId}`)"><Icon name="info" /><span class="grow">How to do it</span></button>
        <button class="group-row" @click="exMenuOpen = false; msOpen = true"><Icon name="settings" /><span class="grow">Machine settings</span></button>
        <button class="group-row" @click="exMenuOpen = false; openNote()"><Icon name="note" /><span class="grow">{{ state.data.exerciseNotes[item.exerciseId] ? 'Edit your note' : 'Add a note for next time' }}</span></button>
        <button class="group-row" @click="addSet(); exMenuOpen = false"><Icon name="plus" /><span class="grow">Add a set</span></button>
        <button v-if="rowCount(current) > Math.max(1, planLogged(current).length)" class="group-row" @click="removeSet(); exMenuOpen = false">
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
    <MachineSettingsSheet v-if="item" v-model="msOpen" :exercise-id="item.exerciseId" />

    <!-- Note -->
    <Sheet v-model="noteOpen" :title="ex?.name">
      <label class="label" for="ex-note">Your note, shown every time you do this exercise</label>
      <textarea id="ex-note" v-model="noteText" class="field" rows="3" placeholder="Grip, cues, how it felt" />
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="noteOpen = false">Cancel</button>
        <button class="btn btn-primary btn-lg" @click="saveNote">Save note</button>
      </template>
    </Sheet>

    <!-- Edit a logged set -->
    <Sheet v-model="editOpen" :title="editing ? setName(editing) : ''">
      <div v-if="editing" class="inputs">
        <Stepper v-if="showLoad" v-model="editDraft.load" :label="loadLabel" :unit="unitText" :step="inc" :min="0" :decimals="unit !== 'pin'" size="md" />
        <Stepper v-if="isTimed" v-model="editDraft.seconds" label="Seconds" :step="5" :min="0" size="md" />
        <div v-else-if="editDraft.repsL != null" class="split">
          <Stepper v-model="editDraft.repsL" label="Left reps" :step="1" :min="0" size="md" />
          <Stepper v-model="editDraft.repsR" label="Right reps" :step="1" :min="0" size="md" />
        </div>
        <Stepper v-else v-model="editDraft.reps" label="Reps" :step="1" :min="0" size="md" />
        <template v-if="!isTimed">
          <div>
            <div class="label rir-label">Reps left in the tank</div>
            <Segmented v-model="editDraft.rir" :options="rirOptions" allow-none label="Reps left in the tank" />
          </div>
          <div>
            <div class="label rir-label">This set was</div>
            <Segmented v-model="editDraft.type" :options="editTypeOptions" label="Set type" />
          </div>
        </template>
      </div>
      <template #actions>
        <button class="btn btn-danger btn-lg" @click="removeEditing"><Icon name="trash" />Delete</button>
        <button class="btn btn-primary btn-lg" @click="saveEdit">Save</button>
      </template>
    </Sheet>

    <!-- Finish + check-in -->
    <Sheet v-model="finishOpen" title="Finish workout?">
      <p class="t-body">
        You logged <b>{{ doneSets }}</b> of {{ plannedSets }} planned sets.
        <span v-if="doneSets < plannedSets" class="t-muted">Sets you didn't log just won't be recorded.</span>
      </p>
      <template v-if="doneSets">
        <div class="label check-label">How hard was it? <span class="t-faint">(optional)</span></div>
        <Segmented v-model="rating.effort" :options="effortOptions" allow-none label="How hard was it" />
        <div class="label check-label">Your energy today</div>
        <Segmented v-model="rating.energy" :options="energyOptions" allow-none label="Energy" />
      </template>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="finishOpen = false">Keep going</button>
        <button v-if="doneSets" class="btn btn-primary btn-lg" @click="finish">Finish</button>
        <button v-else class="btn btn-danger btn-lg" @click="discard">Discard</button>
      </template>
    </Sheet>

    <!-- Discard / delete -->
    <Sheet v-model="discardOpen" :title="editingFinished ? 'Delete this workout?' : 'Discard this workout?'">
      <p class="t-body">All {{ doneSets }} logged sets from this session will be deleted. This can't be undone.</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="discardOpen = false">Keep it</button>
        <button class="btn btn-danger btn-lg" @click="discard">{{ editingFinished ? 'Delete' : 'Discard' }}</button>
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
import MachineSettingsSheet from '../ui/MachineSettingsSheet.vue'
import { plateStyle } from '../ui/plates.js'
import { toast, hideToast } from '../ui/toast.js'
import {
  state, persist, getSession, exercisesById, suggestionFor, historyFor, logSet, updateSet, deleteSet,
  swapExercise, addItemToSession, finishSession, discardSession, setExerciseNote, setEasyDay
} from '../store.js'
import {
  unitFor, incrementFor, fmtLoad, fillsPlannedSet, SET_TYPES, isBarbellLift, platesPerSide, warmupSets, DEFAULT_PLATES
} from '../lib/training.js'
import { prescription, restLabel, dayTitle, mmss, fmtDate } from '../lib/format.js'
import { effectiveRest, nextInGroup } from '../lib/supersets.js'
import { rest, startRest, stopRest, addRest } from '../lib/restTimer.js'
import { tap, buzz, keepAwake } from '../lib/native.js'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession(route.params.id))
const items = computed(() => session.value?.items || [])
const editingFinished = computed(() => !!session.value?.finishedAt)
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

const chips = []
const shortName = (id) => name(id).replace(/^(Barbell|Dumbbell|Cable|Machine|Smith Machine|EZ-Bar)\s+/i, '')

// ── Sets ───────────────────────────────────────────────────
const logged = (i) => (session.value?.sets || []).filter(s => s.itemIndex === i && s.exerciseId === items.value[i]?.exerciseId)
const planLogged = (i) => logged(i).filter(fillsPlannedSet)
const rowCount = (i) => {
  const it = items.value[i]
  if (!it) return 0
  const planned = Math.max(1, (it.sets || 1) + (it.extraSets || 0) - (it.removedSets || 0))
  return Math.max(planned, planLogged(i).length)
}
const isComplete = (i) => planLogged(i).length >= rowCount(i)
const plannedSets = computed(() => items.value.reduce((t, _, i) => t + rowCount(i), 0))
const doneSets = computed(() => (session.value?.sets || []).filter(fillsPlannedSet).length)
const progressPct = computed(() => (plannedSets.value ? Math.min(100, (doneSets.value / plannedSets.value) * 100) : 0))
const allDone = computed(() => items.value.length > 0 && items.value.every((_, i) => isComplete(i)))

function firstIncomplete () {
  const s = getSession(route.params.id)
  if (!s) return 0
  const idx = s.items.findIndex((it, i) => {
    const n = s.sets.filter(x => x.itemIndex === i && x.exerciseId === it.exerciseId && fillsPlannedSet(x)).length
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

// ── Units, labels, plan ────────────────────────────────────
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
const machine = computed(() => state.data.machineSettings[item.value?.exerciseId] || [])

const targetLine = computed(() => {
  const p = session.value?.plan
  if (!p || isTimed.value) return ''
  if (p.deload) return 'Deload: easy sets, 3+ reps left'
  if (p.rir == null) return ''
  return p.rir === 0 ? 'Target: take sets close to failure' : `Target: leave ${p.rir} rep${p.rir === 1 ? '' : 's'} in the tank`
})

const rirOptions = [0, 1, 2, 3, 4].map(n => ({ label: n === 4 ? '4+' : String(n), value: n }))
const typeOptions = [
  { label: 'Drop set', value: 'drop' }, { label: 'To failure', value: 'failure' }, { label: 'Max reps', value: 'amrap' }
]
const editTypeOptions = [
  { label: 'Normal', value: null }, { label: 'Warm-up', value: 'warmup' }, { label: 'Drop', value: 'drop' },
  { label: 'Failure', value: 'failure' }, { label: 'Max reps', value: 'amrap' }
]

function repsText (s) {
  if (s.repsL != null && s.repsR != null && s.repsL !== s.repsR) return `${s.repsL}/${s.repsR}`
  return String(s.reps)
}
function setText (s) {
  if (s.seconds) return s.load ? `${s.load} for ${s.seconds}s` : `${s.seconds}s`
  const load = s.unit === 'pin' ? `P${s.load}` : (s.load ? String(s.load) : 'BW')
  return `${load} × ${repsText(s)}`
}
function setBadge (s) {
  if (s.type === 'warmup' || s.type === 'drop') return SET_TYPES[s.type].short
  return planLogged(current.value).findIndex(x => x.id === s.id) + 1
}
function setName (s) {
  if (s.type === 'warmup') return 'Warm-up set'
  if (s.type === 'drop') return 'Drop set'
  return `Set ${planLogged(current.value).findIndex(x => x.id === s.id) + 1}`
}

// ── Suggestions (frozen per slot so they don't shift mid-workout) ──
const suggCache = reactive({})
const sugg = computed(() => {
  const key = `${current.value}:${item.value?.exerciseId}`
  if (!suggCache[key] && item.value) suggCache[key] = suggestionFor(item.value, session.value.id)
  return suggCache[key] || { text: '', kind: 'same' }
})
const suggIcon = computed(() => ({ up: 'up', down: 'down', deload: 'deload', start: 'start' }[sugg.value.kind] || 'same'))

// Same set number last time you did this exercise
const lastSameSet = computed(() => {
  if (editingFinished.value || !item.value) return ''
  const prev = historyFor(item.value.exerciseId, session.value.id)[0]
  const s = prev?.sets.filter(fillsPlannedSet)[planLogged(current.value).length]
  if (!s) return ''
  return setText(s) + (s.rir != null ? `, ${s.rir} left` : '')
})

// ── Draft values per exercise slot ─────────────────────────
const drafts = reactive({})
const draft = computed(() => {
  const key = `${current.value}:${item.value?.exerciseId}`
  if (!drafts[key]) {
    const done = planLogged(current.value)
    const last = done[done.length - 1]
    const s = sugg.value
    drafts[key] = {
      load: last ? last.load : (s.load ?? (isBodyweight.value ? 0 : null)),
      reps: last ? last.reps : (s.reps ?? null),
      repsL: last?.repsL ?? null,
      repsR: last?.repsR ?? null,
      seconds: last ? last.seconds : (s.seconds ?? item.value?.durationSec?.[0] ?? null),
      rir: null,
      type: null
    }
  }
  return drafts[key]
})
const split = computed(() => !!ex.value?.perSide && draft.value.repsL != null)
function toggleSplit () {
  const d = draft.value
  if (split.value) { d.reps = Math.min(d.repsL ?? 0, d.repsR ?? 0) || d.reps; d.repsL = null; d.repsR = null }
  else { d.repsL = d.reps; d.repsR = d.reps }
}

// Plate breakdown for straight-bar lifts
const plateLine = computed(() => {
  if (!isBarbellLift(ex.value) || draft.value.load == null) return ''
  const bar = profile.value.bar || 0
  if (draft.value.load < bar) return `Lighter than the ${bar} ${unit.value} bar`
  const r = platesPerSide(draft.value.load, bar, DEFAULT_PLATES[unit.value] || [])
  if (!r.perSide.length) return 'Just the bar'
  const extra = Math.abs(r.remainder) > 0.001 ? ` (closest: ${fmtLoad(r.achieved, unit.value)})` : ''
  return `Each side: ${r.perSide.join(' + ')}${extra}`
})

// ── Warm-ups ───────────────────────────────────────────────
const warmBase = computed(() => planLogged(current.value)[0]?.load ?? draft.value.load)
const warmups = computed(() => {
  const w = warmBase.value
  if (!w) return []
  const bar = isBarbellLift(ex.value) ? (profile.value.bar || 0) : 0
  return warmupSets(w, inc.value, bar)
})
const showWarmup = computed(() => {
  if (editingFinished.value || !item.value || !ex.value) return false
  if (item.value.warmup === false) return false
  const wanted = item.value.warmup === true || (current.value === 0 && session.value.dayIndex != null)
  return wanted && ex.value.logType === 'weight' && unit.value !== 'pin' && warmups.value.length > 0
})
const warmOpen = ref(true)
const warmKey = computed(() => `${current.value}:${item.value?.exerciseId}`)
const warmDone = (k) => !!session.value.warmups?.[warmKey.value]?.includes(k)
const warmDoneCount = computed(() => warmups.value.filter((_, k) => warmDone(k)).length)
function toggleWarm (k) {
  const s = session.value
  s.warmups = s.warmups || {}
  const list = s.warmups[warmKey.value] || []
  s.warmups[warmKey.value] = list.includes(k) ? list.filter(x => x !== k) : [...list, k]
  persist(); tap()
  if (warmDoneCount.value === warmups.value.length) setTimeout(() => { warmOpen.value = false }, 400)
}
watch(current, () => { warmOpen.value = planLogged(current.value).length === 0 })

// ── Logging ────────────────────────────────────────────────
const canLog = computed(() => {
  if (isTimed.value) return draft.value.seconds > 0
  const loadOk = !showLoad.value || isBodyweight.value || draft.value.load != null
  const repsOk = split.value ? (draft.value.repsL > 0 || draft.value.repsR > 0) : draft.value.reps > 0
  return loadOk && repsOk
})
const logLabel = computed(() => {
  if (draft.value.type === 'drop') return 'Log drop set'
  const n = planLogged(current.value).length + 1
  return n > rowCount(current.value) ? 'Log an extra set' : `Log set ${n}`
})

function logNow () {
  if (!canLog.value) return
  const i = current.value
  const it = item.value
  const d = draft.value
  const sideReps = split.value ? { repsL: d.repsL ?? 0, repsR: d.repsR ?? 0 } : {}
  const row = logSet(session.value.id, {
    exerciseId: it.exerciseId,
    itemIndex: i,
    setIndex: planLogged(i).length,
    load: showLoad.value ? (d.load ?? null) : null,
    unit: unit.value,
    reps: isTimed.value ? null : (split.value ? Math.min(d.repsL ?? 0, d.repsR ?? 0) : d.reps),
    ...sideReps,
    seconds: isTimed.value ? d.seconds : null,
    rir: isTimed.value ? null : d.rir,
    ...(d.type ? { type: d.type } : {})
  })
  const wasDrop = d.type === 'drop'
  d.rir = null
  d.type = null
  if (wasDrop) {
    const work = planLogged(i)
    if (work.length) d.load = work[work.length - 1].load // back to the working weight
  }
  if (planLogged(i).length === 1) warmOpen.value = false
  buzz(30)
  toast(`${wasDrop ? 'Drop set' : `Set ${planLogged(i).length}`} of ${name(it.exerciseId)} logged`, {
    actionLabel: 'Undo',
    action: () => { deleteSet(session.value.id, row.id); stopRest(); go(i) }
  })
  if (editingFinished.value || wasDrop) return

  // Where to next, and what the rest timer should say
  let next = i
  if (it.group) next = nextInGroup(items.value, i)
  else if (isComplete(i)) {
    const after = items.value.findIndex((_, j) => j > i && !isComplete(j))
    const before = items.value.findIndex((_, j) => !isComplete(j))
    next = after >= 0 ? after : (before >= 0 ? before : i)
  }
  const secs = effectiveRest(items.value, i)
  const nextLabel = allDone.value ? '' : `${name(items.value[next].exerciseId)}, set ${planLogged(next).length + 1}`
  if (secs && !allDone.value) startRest(secs, nextLabel)
  else stopRest()
  if (next !== i) setTimeout(() => go(next, 'slide-next'), it.group ? 0 : 350)
}

// ── Edit a logged set ──────────────────────────────────────
const editOpen = ref(false)
const editing = ref(null)
const editDraft = reactive({ load: null, reps: null, repsL: null, repsR: null, seconds: null, rir: null, type: null })
function openEdit (s) {
  editing.value = s
  Object.assign(editDraft, { load: s.load, reps: s.reps, repsL: s.repsL ?? null, repsR: s.repsR ?? null, seconds: s.seconds, rir: s.rir ?? null, type: s.type ?? null })
  editOpen.value = true
}
function saveEdit () {
  const patch = { ...editDraft }
  if (patch.repsL != null && patch.repsR != null) patch.reps = Math.min(patch.repsL, patch.repsR)
  if (!patch.type) { delete patch.type; delete editing.value.type }
  updateSet(session.value.id, editing.value.id, patch)
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
  if (e.target.closest?.('.inputs, .sets, .seg, .warm, .tags')) return // don't hijack controls
  if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - st < 600) {
    if (dx < 0) go(current.value + 1, 'slide-next')
    else go(current.value - 1, 'slide-prev')
  }
}

// ── Swap / add ─────────────────────────────────────────────
const swapOpen = ref(false)
const addOpen = ref(false)
const msOpen = ref(false)
const swapSuggestions = computed(() => {
  const orig = exercisesById.value[item.value?.originalExerciseId]
  return [...new Set([...(orig?.alternatives || []), item.value?.originalExerciseId])].filter(id => id && id !== item.value?.exerciseId)
})
function resetSuggestions () {
  Object.keys(suggCache).forEach(k => delete suggCache[k])
  // Forget drafts for slots you haven't logged yet so they pick up the new suggestion
  Object.keys(drafts).forEach(k => { const i = Number(k.split(':')[0]); if (!logged(i).length) delete drafts[k] })
}
function doSwap (id) {
  const was = name(item.value.exerciseId)
  swapExercise(session.value.id, current.value, id)
  resetSuggestions()
  toast(`Swapped ${was} for ${name(id)}`)
}
function doAdd (id) {
  addItemToSession(session.value.id, id)
  go(items.value.length - 1, 'slide-next')
}

// ── Lighter day ────────────────────────────────────────────
function toggleEasy () {
  const on = !session.value.easy
  setEasyDay(session.value.id, on)
  resetSuggestions()
  menuOpen.value = false
  toast(on ? 'Lighter day: weights and sets reduced' : 'Back to the normal plan')
}

// ── Notes, tips ────────────────────────────────────────────
const noteOpen = ref(false)
const noteText = ref('')
function openNote () { noteText.value = state.data.exerciseNotes[item.value.exerciseId] || ''; noteOpen.value = true }
function saveNote () { setExerciseNote(item.value.exerciseId, noteText.value.trim()); noteOpen.value = false; toast('Note saved') }
const sessionNotes = ref(session.value?.notes || '')
function saveSessionNotes () { if (session.value) { session.value.notes = sessionNotes.value; persist() } }
function dismissTip () { state.data.tips.workout = true; persist() }

// ── Header clock ───────────────────────────────────────────
const now = ref(Date.now())
let clock = null
onMounted(() => {
  clock = setInterval(() => { now.value = Date.now() }, 1000)
  if (!editingFinished.value) keepAwake(true)
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

// ── Leave / finish / discard ───────────────────────────────
const menuOpen = ref(false)
const exMenuOpen = ref(false)
const finishOpen = ref(false)
const discardOpen = ref(false)
const rating = reactive({ effort: null, energy: null })
const effortOptions = [1, 2, 3, 4, 5].map(n => ({ label: ['Easy', '2', '3', '4', 'Max'][n - 1], value: n }))
const energyOptions = [1, 2, 3, 4, 5].map(n => ({ label: ['Low', '2', '3', '4', 'High'][n - 1], value: n }))

function leave () {
  saveSessionNotes()
  if (editingFinished.value) router.replace(`/summary/${route.params.id}`)
  else router.push('/')
}
function finish () {
  saveSessionNotes()
  stopRest()
  hideToast()
  finishSession(session.value.id, { ...rating })
  finishOpen.value = false
  router.replace(`/summary/${route.params.id}`)
}
function discard () {
  const wasFinished = editingFinished.value
  stopRest()
  discardSession(session.value.id)
  finishOpen.value = false
  discardOpen.value = false
  router.replace(wasFinished ? '/history' : '/')
  toast(wasFinished ? 'Workout deleted' : 'Workout discarded')
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

.tip .btn { white-space: nowrap; }
.tip { display: flex; gap: 12px; align-items: center; margin-top: 8px; padding: 12px 12px 12px 16px; border-radius: 14px; background: var(--card); border: 1.5px dashed var(--line); }

.ex-top { align-items: flex-start; margin-top: 8px; }
.ex-top h1 { margin-top: 4px; }
.ex-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 4px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.pill.ms b { color: var(--ink); }

.superset { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; color: var(--ink-2); }
.hint {
  display: flex; gap: 10px; align-items: flex-start;
  margin-top: 14px; padding: 12px 14px; border-radius: 14px;
  background: var(--card); font-size: 15px; line-height: 1.4;
}
.hint .icon { margin-top: 1px; color: var(--ink-2); }
.hint.k-up .icon { color: var(--ok); }
.hint.k-down .icon, .hint.k-deload .icon { color: var(--warn); }
.mini-note { display: flex; gap: 6px; align-items: flex-start; margin: 10px 2px 0; }

.warm { margin-top: 14px; overflow: hidden; }
.warm-head { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 16px; text-align: left; }
.warm-head b { margin-right: 8px; }
.warm-list { padding: 0 8px 8px; }
.warm-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 42px; padding: 0 8px; border-radius: 10px; text-align: left; }
.warm-row:active { background: var(--press); }
.tick { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--line); color: #fff; flex: 0 0 auto; }
.warm-row.on .tick { background: var(--ok); border-color: var(--ok); }
.warm-row.on .wv { color: var(--ink-3); text-decoration: line-through; }
.wv { font-size: 18px; font-weight: 600; }
.warm-foot { padding: 4px 8px 0; }

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
.set.done.extra { background: var(--card-2); }
.set.done.extra .set-n { background: var(--ink-2); }
.set.next { border-style: solid; border-color: var(--ink-3); }
.set.next .set-n { color: var(--ink); }
.set.add { padding: 0; width: 44px; justify-content: center; color: var(--ink-2); }
.set.done:active, .set.add:active { transform: scale(0.96); }
.last-line { margin: 10px 2px 0; }

.inputs { display: flex; flex-direction: column; gap: 18px; margin-top: 22px; }
.plate-line { text-align: center; margin-top: 6px; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.link-btn { align-self: center; margin-top: -8px; padding: 6px 10px; color: var(--ink-2); text-decoration: underline; text-underline-offset: 3px; }
.rir-label { text-align: left; }
.types { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: -4px; }
.types .t-tiny { margin-right: 4px; }
.type-chip { min-height: 36px; padding: 0 12px; border-radius: 18px; font-size: 14px; font-weight: 600; color: var(--ink-2); border: 1.5px solid var(--line); }
.type-chip.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.notes-row { padding: 10px 12px; }
.check-label { margin-top: 18px; }

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
:root[data-theme="dark"] .rest:not(.done) .rest-btn { background: rgba(21,32,46,0.10); }
:root[data-theme="dark"] .rest:not(.done) .rest-btn.strong { background: rgba(21,32,46,0.18); }

/* Slide between exercises */
.slide-next-enter-active, .slide-next-leave-active,
.slide-prev-enter-active, .slide-prev-leave-active { transition: transform 180ms ease, opacity 180ms ease; }
.slide-next-enter-from, .slide-prev-leave-to { transform: translateX(28px); opacity: 0; }
.slide-next-leave-to, .slide-prev-enter-from { transform: translateX(-28px); opacity: 0; }

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
