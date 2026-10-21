<template>
  <div v-if="session" class="wk" :style="plateVars">
    <!-- Header -->
    <header class="wk-head">
      <button class="icon-btn" :aria-label="editingFinished ? t('Back to the summary') : t('Back to home (workout keeps running)')" @click="leave">
        <Icon :name="editingFinished ? 'back' : 'close'" />
      </button>
      <div class="grow wk-title">
        <div class="t-h3 truncate">{{ editingFinished ? t('Editing workout') : sessionTitle(session) }}</div>
        <div class="t-tiny t-muted t-num">
          <template v-if="editingFinished">{{ fmtDate(session.startedAt) }}</template>
          <template v-else>{{ elapsed }}<span class="sep" />{{ t('{a} of {b} sets', { a: doneSets, b: plannedSets }) }}</template>
        </div>
      </div>
      <button class="icon-btn" :aria-label="t('Workout options')" @click="menuOpen = true"><Icon name="more" /></button>
      <button v-if="editingFinished" class="btn btn-sm btn-primary" @click="leave">{{ t('Done') }}</button>
      <button v-else class="btn btn-sm btn-primary" @click="finishOpen = true">{{ t('Finish') }}</button>
    </header>
    <div class="wk-progress" role="progressbar" :aria-valuenow="doneSets" :aria-valuemax="plannedSets">
      <div :style="{ width: progressPct + '%' }" />
    </div>

    <!-- Exercise strip -->
    <div v-if="items.length" class="strip" role="tablist" :aria-label="t('Exercises')">
      <button
        v-for="(e, ei) in entries" :key="ei" :ref="(el) => (chips[ei] = el)"
        class="chip" role="tab" :aria-selected="e.indices.includes(current)"
        :class="{ on: e.indices.includes(current), complete: entryComplete(e), ss: e.indices.length > 1 }"
        @click="goEntry(ei)"
      >
        <span class="chip-n t-num">{{ ei + 1 }}</span>
        <Icon v-if="e.indices.length > 1" name="superset" :size="16" class="chip-link" />
        <span class="chip-name">{{ e.indices.map(i => shortName(items[i].exerciseId)).join(' + ') }}</span>
        <Icon v-if="entryComplete(e)" name="checkBold" :size="15" class="chip-check" />
        <span v-else class="chip-count t-num">{{ entryDone(e) }}/{{ entryTotal(e) }}</span>
      </button>
    </div>

    <!-- Empty free session -->
    <main v-if="!items.length" class="wk-empty page no-nav">
      <p class="t-h2">{{ t('What are you training?') }}</p>
      <p class="t-muted t-small">{{ t("Add the exercises as you go. They're saved like any other workout.") }}</p>
      <button class="btn btn-primary btn-lg btn-block" @click="addOpen = true"><Icon name="plus" />{{ t('Add an exercise') }}</button>
    </main>

    <!-- Current exercise -->
    <main v-else class="wk-main" @touchstart.passive="swipeStart" @touchend.passive="swipeEnd">
      <!-- First workout only: how the screen works -->
      <div v-if="!state.data.tips.workout && !editingFinished" class="tip">
        <div class="grow t-small">
          <b>{{ t('Tips:') }}</b> {{ t('swipe left or right to switch exercises. Tap a logged set to change it. Hold − or + to change numbers quickly.') }}
        </div>
        <button class="btn btn-sm btn-soft" @click="dismissTip">{{ t('Got it') }}</button>
      </div>

      <div v-if="group" class="ss-card" :key="'ss' + group.indices[0]">
        <div class="ss-head t-small">
          <Icon name="superset" :size="18" />
          <span><b>{{ t('Superset.') }}</b> {{ t('One set of each, back to back, then rest {t}.', { t: restShort(groupRest) }) }}</span>
        </div>
        <div class="ss-tabs" role="tablist" :aria-label="t('Exercises in this superset')">
          <button
            v-for="(gi, k) in group.indices" :key="gi" class="ss-tab" role="tab"
            :aria-selected="gi === current" :class="{ on: gi === current, done: isComplete(gi) }"
            @click="go(gi, 'swap')"
          >
            <span class="ss-letter">{{ letters[k] }}</span>
            <span class="ss-name">{{ shortName(items[gi].exerciseId) }}</span>
            <Icon v-if="isComplete(gi)" name="checkBold" :size="15" />
          </button>
        </div>
        <div class="ss-grid t-num" :style="{ gridTemplateColumns: `28px repeat(${groupRounds}, minmax(0, 1fr))` }" :aria-label="t('Rounds')">
          <span />
          <span v-for="r in groupRounds" :key="'h' + r" class="ss-rh">{{ t('Round {n}', { n: r }) }}</span>
          <template v-for="(gi, k) in group.indices" :key="'row' + gi">
            <span class="ss-letter sm">{{ letters[k] }}</span>
            <button
              v-for="r in groupRounds" :key="gi + ':' + r" class="ss-cell"
              :class="{ done: !!planLogged(gi)[r - 1], now: gi === current && r === planLogged(gi).length + 1, off: r > rowCount(gi) }"
              :disabled="!planLogged(gi)[r - 1] && gi === current"
              :aria-label="planLogged(gi)[r - 1] ? t('Edit {x}, round {n}', { x: letters[k], n: r }) : t('{x}, round {n}', { x: letters[k], n: r })"
              @click="planLogged(gi)[r - 1] ? openEdit(planLogged(gi)[r - 1]) : go(gi, 'swap')"
            >{{ planLogged(gi)[r - 1] ? setText(planLogged(gi)[r - 1]) : (gi === current && r === planLogged(gi).length + 1 ? t('now') : '') }}</button>
          </template>
        </div>
      </div>

      <Transition :name="slideDir" mode="out-in">
        <section :key="current + ':' + item.exerciseId" class="ex">
          <div class="row ex-top">
            <button v-if="thumb" class="thumb" :aria-label="t('How to do it')" @click="infoOpen = true">
              <img :src="thumb" alt="" @error="(e) => (e.target.parentElement.style.display = 'none')">
            </button>
            <div class="grow">
              <h1 class="t-title" :class="{ 'in-ss': !!group }" @click="infoOpen = true">{{ name(item.exerciseId) }}</h1>
              <div class="t-small t-muted ex-meta">
                <span>{{ prescription({ ...item, sets: rowCount(current) }, ex) }}</span>
                <span v-if="restSecs">{{ restLabel(restSecs) }}</span>
                <span v-if="item.exerciseId !== item.originalExerciseId" class="t-faint">{{ t('replaces {name}', { name: name(item.originalExerciseId) }) }}</span>
                <span v-if="item.track" class="t-faint">{{ t('beginner version') }}</span>
              </div>
            </div>
            <button class="icon-btn info-btn" :aria-label="t('How to do it')" @click="infoOpen = true"><Icon name="info" /></button>
            <button class="icon-btn" :aria-label="t('Exercise options')" @click="exMenuOpen = true"><Icon name="more" /></button>
          </div>

          <div v-if="targetLine || session.easy || machine.length" class="tags">
            <span v-if="targetLine" class="pill" :class="{ 'pill-warn': session.plan?.deload }">{{ targetLine }}</span>
            <span v-if="session.easy" class="pill pill-warn"><Icon name="deload" :size="16" />{{ t('Lighter day') }}</span>
            <button v-for="r in machine" :key="r.label" class="pill ms" @click="msOpen = true">
              {{ r.label }} <b class="t-num">{{ r.value }}</b>
            </button>
          </div>

          <div class="hint" :class="`k-${sugg.kind}`">
            <Icon :name="suggIcon" :size="18" />
            <span>{{ sugg.text }}</span>
          </div>
          <p v-if="state.data.exerciseNotes[item.exerciseId]" class="t-small mini-note">
            <Icon name="note" :size="16" /> {{ state.data.exerciseNotes[item.exerciseId] }}
          </p>
          <p v-if="tx(item, 'notes')" class="t-small t-muted mini-note">{{ tx(item, 'notes') }}</p>

          <!-- Warm-up ramp (first lift of the day, or when the routine asks for it) -->
          <div v-if="showWarmup" class="warm card">
            <button class="warm-head" :aria-expanded="warmOpen" @click="warmOpen = !warmOpen">
              <span class="grow">
                <b>{{ t('Warm-up') }}</b>
                <span class="t-small t-muted">{{ t('{a} of {b} done', { a: warmDoneCount, b: warmups.length }) }}</span>
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
                <span class="t-tiny t-muted">{{ w.label }}</span>
              </button>
              <p class="t-tiny t-muted warm-foot">{{ t("Based on {load}. Warm-ups aren't counted in your records.", { load: fmtLoad(warmBase, unit) }) }}</p>
            </div>
          </div>

          <!-- Sets -->
          <div v-if="!group" class="sets" :aria-label="t('Sets')">
            <button
              v-for="s in logged(current)" :key="s.id" class="set done" :class="{ extra: !fillsPlannedSet(s) }"
              :aria-label="t('{name}: {value}. Tap to edit', { name: setName(s), value: setText(s) })" @click="openEdit(s)"
            >
              <span class="set-n">{{ setBadge(s) }}</span>
              <span class="t-num set-v">{{ setText(s) }}</span>
            </button>
            <div
              v-for="k in Math.max(0, rowCount(current) - planLogged(current).length)" :key="'p' + k"
              class="set" :class="{ next: k === 1 }"
            >
              <span class="set-n">{{ planLogged(current).length + k }}</span>
              <span class="set-v t-faint">{{ k === 1 ? t('next') : '' }}</span>
            </div>
            <button class="set add" :aria-label="t('Add a set')" @click="addSet"><Icon name="plus" :size="20" /></button>
          </div>
          <p v-if="lastSameSet" class="t-small t-muted last-line">
            {{ t('Set {n} last time:', { n: planLogged(current).length + 1 }) }} <b class="t-num">{{ lastSameSet }}</b>
          </p>

          <!-- Inputs -->
          <div class="inputs">
            <div v-if="showLoad">
              <Stepper v-model="draft.load" :label="loadLabel" :unit="unitText" :step="inc" :min="0" :decimals="unit !== 'pin'" />
              <p v-if="plateLine" class="t-small t-muted plate-line t-num">{{ plateLine }}</p>
            </div>

            <Stepper v-if="isTimed" v-model="draft.seconds" :label="t('Seconds')" :step="5" :min="0" :format="(v) => String(Math.round(v))" />
            <div v-else-if="split" class="split">
              <Stepper v-model="draft.repsL" :label="t('Left reps')" :step="1" :min="0" size="md" />
              <Stepper v-model="draft.repsR" :label="t('Right reps')" :step="1" :min="0" size="md" />
            </div>
            <Stepper v-else v-model="draft.reps" :label="ex?.perSide ? t('Reps per side') : t('Reps')" :step="1" :min="0" />
            <button v-if="ex?.perSide && !isTimed" class="link-btn t-small" @click="toggleSplit">
              {{ split ? t('Same reps on both sides') : t('Different reps on each side?') }}
            </button>

            <div v-if="isTimed" class="hold">
              <button class="btn btn-soft btn-block" @click="toggleHold">
                <Icon :name="hold.running ? 'stop' : 'play'" />
                {{ hold.running ? t('Stop at {n} s', { n: hold.elapsed }) : t('Time it') }}
              </button>
            </div>

            <template v-else>
              <div>
                <div class="label rir-label">{{ t('Reps left in the tank') }} <span class="t-faint">{{ t('(optional)') }}</span></div>
                <Segmented v-model="draft.rir" :options="rirOptions" allow-none :label="t('Reps left in the tank')" />
              </div>
              <div class="types" role="group" :aria-label="t('Mark this set as')">
                <span class="t-tiny t-muted">{{ t('Mark as') }}</span>
                <button
                  v-for="o in typeOptions" :key="o.value" class="type-chip" :class="{ on: draft.type === o.value }"
                  :aria-pressed="draft.type === o.value" @click="draft.type = draft.type === o.value ? null : o.value"
                >{{ o.label }}</button>
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
              <div class="t-num rest-time">{{ rest.done ? t('Go') : mmss(rest.remaining) }}</div>
              <div class="t-tiny rest-next truncate">{{ rest.done ? t('Rest over') : t('Resting') }}<template v-if="rest.label">{{ t(', then {what}', { what: rest.label }) }}</template></div>
            </div>
            <button class="btn btn-sm rest-btn" :disabled="rest.remaining <= 15" @click="addRest(-15)">−15</button>
            <button class="btn btn-sm rest-btn" @click="addRest(30)">+30</button>
            <button class="btn btn-sm rest-btn strong" @click="stopRest">{{ rest.done ? t('OK') : t('Skip') }}</button>
          </div>
        </div>
      </Transition>
      <div v-if="editingFinished || !allDone || !isComplete(current)" class="row log-row">
        <button
          v-if="!rest.endsAt && !editingFinished && manualRest" class="btn btn-lg rest-now"
          :aria-label="t('Start a {t} rest', { t: restShort(manualRest) })" @click="startManualRest"
        >
          <Icon name="timer" /><span class="t-num">{{ restShort(manualRest) }}</span>
        </button>
        <button class="btn btn-lg btn-plate log grow" :disabled="!canLog" @click="logNow">
          <Icon name="check" />{{ logLabel }}
        </button>
      </div>
      <button v-else class="btn btn-lg btn-block btn-primary log" @click="finishOpen = true">
        <Icon name="trophy" />{{ t('Finish workout') }}
      </button>
    </div>

    <!-- Workout menu -->
    <Sheet v-model="menuOpen" :title="t('Workout')">
      <div class="group">
        <button class="group-row" @click="menuOpen = false; addOpen = true"><Icon name="plus" /><span class="grow">{{ t('Add an exercise') }}</span></button>
        <button v-if="!editingFinished" class="group-row" @click="toggleEasy">
          <Icon name="deload" />
          <div class="grow">
            <div>{{ session.easy ? t('Back to a normal day') : t('Feeling rough? Make today lighter') }}</div>
            <div class="t-tiny t-muted">{{ session.easy ? t('Restores the sets and weights') : t("About 10% lighter and one set fewer on exercises you haven't started") }}</div>
          </div>
        </button>
        <div class="group-row notes-row">
          <textarea v-model="sessionNotes" class="field" rows="2" :placeholder="t('Notes about this session')" :aria-label="t('Session notes')" @blur="saveSessionNotes" />
        </div>
        <button class="group-row t-err" @click="menuOpen = false; discardOpen = true"><Icon name="trash" /><span class="grow">{{ editingFinished ? t('Delete this workout') : t('Discard this workout') }}</span></button>
      </div>
    </Sheet>

    <!-- Exercise menu -->
    <Sheet v-model="exMenuOpen" :title="name(item?.exerciseId)">
      <div class="group">
        <button class="group-row" @click="exMenuOpen = false; swapOpen = true"><Icon name="swap" /><span class="grow">{{ t('Swap for another exercise') }}</span></button>
        <button class="group-row" @click="exMenuOpen = false; infoOpen = true"><Icon name="info" /><span class="grow">{{ t('How to do it') }}</span></button>
        <button class="group-row" @click="exMenuOpen = false; msOpen = true"><Icon name="settings" /><span class="grow">{{ t('Machine settings') }}</span></button>
        <button class="group-row" @click="exMenuOpen = false; openNote()"><Icon name="note" /><span class="grow">{{ state.data.exerciseNotes[item.exerciseId] ? t('Edit your note') : t('Add a note for next time') }}</span></button>
        <button class="group-row" @click="addSet(); exMenuOpen = false"><Icon name="plus" /><span class="grow">{{ t('Add a set') }}</span></button>
        <button v-if="rowCount(current) > Math.max(1, planLogged(current).length)" class="group-row" @click="removeSet(); exMenuOpen = false">
          <Icon name="minus" /><span class="grow">{{ t('Remove a set') }}</span>
        </button>
      </div>
    </Sheet>

    <ExercisePicker
      v-model="swapOpen" :title="t('Swap exercise')"
      :suggested-ids="swapSuggestions" :suggested-label="t('Works the same muscles')"
      :exclude-id="item?.exerciseId" allow-create @pick="doSwap"
    />
    <ExercisePicker v-model="addOpen" :title="t('Add an exercise')" allow-create @pick="doAdd" />
    <MachineSettingsSheet v-if="item" v-model="msOpen" :exercise-id="item.exerciseId" />

    <!-- Quick look at how to do the current exercise -->
    <Sheet v-model="infoOpen" :title="name(item?.exerciseId)">
      <ExerciseDetails v-if="ex" :ex="ex" in-sheet />
      <RouterLink :to="`/exercise/${item?.exerciseId}`" class="btn btn-ghost btn-block full-link" @click="infoOpen = false">
        {{ t('Your history and notes for this exercise') }}
      </RouterLink>
    </Sheet>

    <!-- Note -->
    <Sheet v-model="noteOpen" :title="name(item?.exerciseId)">
      <label class="label" for="ex-note">{{ t('Your note, shown every time you do this exercise') }}</label>
      <textarea id="ex-note" v-model="noteText" class="field" rows="3" :placeholder="t('Grip, cues, how it felt')" />
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="noteOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" @click="saveNote">{{ t('Save note') }}</button>
      </template>
    </Sheet>

    <!-- Edit a logged set -->
    <Sheet v-model="editOpen" :title="editing ? setName(editing) : ''">
      <div v-if="editing" class="inputs">
        <Stepper v-if="showLoad" v-model="editDraft.load" :label="loadLabel" :unit="unitText" :step="inc" :min="0" :decimals="unit !== 'pin'" size="md" />
        <Stepper v-if="isTimed" v-model="editDraft.seconds" :label="t('Seconds')" :step="5" :min="0" size="md" />
        <div v-else-if="editDraft.repsL != null" class="split">
          <Stepper v-model="editDraft.repsL" :label="t('Left reps')" :step="1" :min="0" size="md" />
          <Stepper v-model="editDraft.repsR" :label="t('Right reps')" :step="1" :min="0" size="md" />
        </div>
        <Stepper v-else v-model="editDraft.reps" :label="t('Reps')" :step="1" :min="0" size="md" />
        <template v-if="!isTimed">
          <div>
            <div class="label rir-label">{{ t('Reps left in the tank') }}</div>
            <Segmented v-model="editDraft.rir" :options="rirOptions" allow-none :label="t('Reps left in the tank')" />
          </div>
          <div>
            <div class="label rir-label">{{ t('This set was') }}</div>
            <Segmented v-model="editDraft.type" :options="editTypeOptions" :label="t('Set type')" />
          </div>
        </template>
      </div>
      <p v-if="confirmingDelete" class="note note-warn t-body confirm-q" role="alert">{{ t('Delete this set?') }}</p>
      <template #actions>
        <template v-if="confirmingDelete">
          <button class="btn btn-soft btn-lg" @click="confirmingDelete = false">{{ t('No') }}</button>
          <button class="btn btn-danger btn-lg" @click="removeEditing"><Icon name="trash" />{{ t('Yes, delete') }}</button>
        </template>
        <template v-else>
          <button class="btn btn-danger btn-lg" @click="confirmingDelete = true"><Icon name="trash" />{{ t('Delete') }}</button>
          <button class="btn btn-primary btn-lg" @click="saveEdit">{{ t('Save') }}</button>
        </template>
      </template>
    </Sheet>

    <!-- Finish + check-in -->
    <Sheet v-model="finishOpen" :title="t('Finish workout?')">
      <p class="t-body">
        {{ t('You logged {a} of {b} planned sets.', { a: doneSets, b: plannedSets }) }}
        <span v-if="doneSets < plannedSets" class="t-muted">{{ t("Sets you didn't log just won't be recorded.") }}</span>
      </p>
      <template v-if="doneSets">
        <div class="label check-label">{{ t('How hard was it?') }} <span class="t-faint">{{ t('(optional)') }}</span></div>
        <Segmented v-model="rating.effort" :options="effortOptions" allow-none :label="t('How hard was it?')" />
        <div class="label check-label">{{ t('Your energy today') }}</div>
        <Segmented v-model="rating.energy" :options="energyOptions" allow-none :label="t('Energy')" />
      </template>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="finishOpen = false">{{ t('Keep going') }}</button>
        <button v-if="doneSets" class="btn btn-primary btn-lg" @click="finish">{{ t('Finish') }}</button>
        <button v-else class="btn btn-danger btn-lg" @click="discard">{{ t('Discard') }}</button>
      </template>
    </Sheet>

    <!-- Discard / delete -->
    <Sheet v-model="discardOpen" :title="editingFinished ? t('Delete this workout?') : t('Discard this workout?')">
      <p class="t-body">{{ tn(doneSets, "The {n} logged set from this session will be deleted. This can't be undone.", "All {n} logged sets from this session will be deleted. This can't be undone.") }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="discardOpen = false">{{ t('Keep it') }}</button>
        <button class="btn btn-danger btn-lg" @click="discard">{{ editingFinished ? t('Delete') : t('Discard') }}</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page no-nav">
    <p class="t-h2">{{ t('This workout no longer exists') }}</p>
    <RouterLink to="/" class="btn btn-primary btn-lg btn-block" style="margin-top: 20px">{{ t('Go home') }}</RouterLink>
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
import ExerciseDetails from '../ui/ExerciseDetails.vue'
import { plateStyle } from '../ui/plates.js'
import { toast, hideToast } from '../ui/toast.js'
import {
  state, persist, getSession, exercisesById, imageUrl, suggestionFor, historyFor, logSet, updateSet, deleteSet,
  swapExercise, addItemToSession, finishSession, discardSession, deleteSession, setExerciseNote, setEasyDay, markSessionEdited
} from '../store.js'
import { t, tn, tx } from '../i18n/index.js'
import {
  unitFor, incrementFor, fmtLoad, fillsPlannedSet, SET_TYPES, isBarbellLift, platesPerSide, warmupSets, DEFAULT_PLATES
} from '../lib/training.js'
import { prescription, restLabel, dayTitle, mmss, fmtDate, sessionTitle } from '../lib/format.js'
import { effectiveRest, supersetNext } from '../lib/supersets.js'
import { rest, startRest, stopRest, addRest } from '../lib/restTimer.js'
import { tap, buzz, keepAwake } from '../lib/native.js'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession(route.params.id))
const items = computed(() => session.value?.items || [])
const editingFinished = computed(() => !!session.value?.finishedAt)
const name = (id) => tx(exercisesById.value[id], 'name') || id || ''
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
  nextTick(() => chips[entryOf(i)]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }))
})

// ── Strip entries: a superset is one entry ─────────────────
const entries = computed(() => {
  const out = []
  items.value.forEach((it, i) => {
    const last = out[out.length - 1]
    if (it.group && last?.group === it.group && last.indices[last.indices.length - 1] === i - 1) last.indices.push(i)
    else out.push({ group: it.group || null, indices: [i] })
  })
  return out
})
const entryOf = (i) => entries.value.findIndex(e => e.indices.includes(i))
const entryComplete = (e) => e.indices.every(isComplete)
// Supersets count rounds; single exercises count sets
const entryDone = (e) => (e.indices.length > 1 ? Math.min(...e.indices.map(i => planLogged(i).length)) : planLogged(e.indices[0]).length)
const entryTotal = (e) => Math.max(...e.indices.map(rowCount))
function goEntry (ei, dir) {
  const e = entries.value[ei]
  if (!e) return
  if (e.indices.includes(current.value)) return
  go(e.indices.find(i => !isComplete(i)) ?? e.indices[0], dir)
}

const group = computed(() => {
  const e = entries.value[entryOf(current.value)]
  return e && e.indices.length > 1 ? e : null
})
const letters = ['A', 'B', 'C', 'D', 'E']
const groupRounds = computed(() => (group.value ? Math.max(...group.value.indices.map(rowCount)) : 0))
const groupRest = computed(() => (group.value ? effectiveRest(items.value, group.value.indices[group.value.indices.length - 1]) : 0))
const thumb = computed(() => (ex.value?.images?.[0] ? imageUrl(ex.value.images[0]) : ''))
const infoOpen = ref(false)

const chips = []
const shortName = (id) => name(id)
  .replace(/^(Barbell|Dumbbell|Cable|Machine|Smith Machine|EZ-Bar)\s+/i, '')
  .replace(/\s+(con|en)\s+(barra( EZ)?|mancuernas?|polea|máquina|multipower)$/i, '')
const restShort = (secs) => (secs < 60 ? `${secs} s` : secs % 60 === 0 ? `${secs / 60} min` : mmss(secs))

// ── Sets ───────────────────────────────────────────────────
const logged = (i) => (session.value?.sets || []).filter(s => s.itemIndex === i && s.exerciseId === items.value[i]?.exerciseId)
const planLogged = (i) => logged(i).filter(fillsPlannedSet)
const rowCount = (i) => {
  const it = items.value[i]
  if (!it) return 0
  const planned = Math.max(1, (it.sets || 1) + (it.extraSets || 0) - (it.removedSets || 0))
  return Math.max(planned, planLogged(i).length)
}
function isComplete (i) { return planLogged(i).length >= rowCount(i) }
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
  if (unit.value === 'pin') return t('Pin')
  if (isBodyweight.value) return t('Added weight')
  if (ex.value?.incrementGroup === 'dumbbell') return t('Each dumbbell')
  return t('Weight')
})
const unitText = computed(() => (unit.value === 'pin' ? t('position on the stack') : unit.value))
const restSecs = computed(() => effectiveRest(items.value, current.value))
const groupMates = computed(() => items.value
  .map((it, i) => ({ it, i }))
  .filter(({ it, i }) => it.group && it.group === item.value?.group && i !== current.value)
  .map(({ it }) => it.exerciseId))
const machine = computed(() => state.data.machineSettings[item.value?.exerciseId] || [])

const targetLine = computed(() => {
  const p = session.value?.plan
  if (!p || isTimed.value) return ''
  if (p.deload) return t('Deload: easy sets, 3+ reps left')
  if (p.rir == null) return ''
  return p.rir === 0 ? t('Target: take sets close to failure') : tn(p.rir, 'Target: leave {n} rep in the tank', 'Target: leave {n} reps in the tank')
})

const rirOptions = [0, 1, 2, 3, 4].map(n => ({ label: n === 4 ? '4+' : String(n), value: n }))
const typeOptions = computed(() => [
  { label: t('Drop set'), value: 'drop' }, { label: t('To failure'), value: 'failure' }, { label: t('Max reps'), value: 'amrap' }
])
const editTypeOptions = computed(() => [
  { label: t('Normal'), value: null }, { label: t('Warm-up'), value: 'warmup' }, { label: t('Drop'), value: 'drop' },
  { label: t('Failure'), value: 'failure' }, { label: t('Max reps'), value: 'amrap' }
])

function repsText (s) {
  if (s.repsL != null && s.repsR != null && s.repsL !== s.repsR) return `${s.repsL}/${s.repsR}`
  return String(s.reps)
}
function setText (s) {
  if (s.seconds) return s.load ? t('{load} for {s}s', { load: s.load, s: s.seconds }) : `${s.seconds}s`
  const load = s.unit === 'pin' ? `P${s.load}` : (s.load ? String(s.load) : t('BW'))
  return `${load} × ${repsText(s)}`
}
function setBadge (s) {
  if (s.type === 'warmup' || s.type === 'drop') return t('set|' + SET_TYPES[s.type].short)
  return planLogged(current.value).findIndex(x => x.id === s.id) + 1
}
function setName (s) {
  if (s.type === 'warmup') return t('Warm-up set')
  if (s.type === 'drop') return t('Drop set')
  return t('Set {n}', { n: planLogged(current.value).findIndex(x => x.id === s.id) + 1 })
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
  return setText(s) + (s.rir != null ? t(', {n} left', { n: s.rir }) : '')
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
  if (draft.value.load < bar) return t('Lighter than the {w} bar', { w: `${bar} ${unit.value}` })
  const r = platesPerSide(draft.value.load, bar, DEFAULT_PLATES[unit.value] || [])
  if (!r.perSide.length) return t('Just the bar')
  const extra = Math.abs(r.remainder) > 0.001 ? t(' (closest: {w})', { w: fmtLoad(r.achieved, unit.value) }) : ''
  return t('Each side: {plates}', { plates: r.perSide.join(' + ') }) + extra
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
// Weighted exercises need a real weight (a 0 here would be saved as a bodyweight set and skew the history)
const needsWeight = computed(() => showLoad.value && !isBodyweight.value && !isTimed.value && !(draft.value.load > 0))
const canLog = computed(() => {
  if (isTimed.value) return draft.value.seconds > 0
  const loadOk = !showLoad.value || isBodyweight.value || draft.value.load > 0
  const repsOk = split.value ? (draft.value.repsL > 0 || draft.value.repsR > 0) : draft.value.reps > 0
  return loadOk && repsOk
})
const logLabel = computed(() => {
  if (needsWeight.value) return unit.value === 'pin' ? t('Set the pin first') : t('Set the weight first')
  if (draft.value.type === 'drop') return t('Log drop set')
  const n = planLogged(current.value).length + 1
  if (n > rowCount(current.value)) return t('Log an extra set')
  if (group.value) return t('Log {x}, round {n}', { x: letters[group.value.indices.indexOf(current.value)], n })
  return t('Log set {n}', { n })
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
  const undo = { actionLabel: t('Undo'), action: () => { deleteSet(session.value.id, row.id); stopRest(); go(i) } }
  toast(wasDrop ? t('Drop set of {name} logged', { name: name(it.exerciseId) }) : t('Set {n} of {name} logged', { n: planLogged(i).length, name: name(it.exerciseId) }), undo)
  if (editingFinished.value || wasDrop) return

  // Where to next, and what the rest timer should say
  const e = entries.value[entryOf(i)]
  const firstOpenAfter = (from) => {
    const after = items.value.findIndex((_, j) => j > from && !isComplete(j))
    const any = items.value.findIndex((_, j) => !isComplete(j))
    return after >= 0 ? after : (any >= 0 ? any : i)
  }
  let next = i
  let secs = effectiveRest(items.value, i)
  let sameGroup = false
  if (e.indices.length > 1) {
    // Superset: round by round (A1 B1 C1, rest, A2 B2 C2 …); rest only when a round is finished
    const counts = Object.fromEntries(e.indices.map(j => [j, planLogged(j).length]))
    const rows = Object.fromEntries(e.indices.map(j => [j, rowCount(j)]))
    const res = supersetNext(e.indices, i, counts, rows)
    if (!res.done) {
      next = res.next
      sameGroup = true
      secs = res.rest ? groupRest.value : 0
    } else {
      next = firstOpenAfter(e.indices[e.indices.length - 1])
      secs = groupRest.value
    }
  } else if (isComplete(i)) {
    next = firstOpenAfter(i)
  }
  const label = sameGroup
    ? t('{name}, round {n}', { name: name(items.value[next].exerciseId), n: planLogged(next).length + 1 })
    : t('{name}, set {n}', { name: name(items.value[next].exerciseId), n: planLogged(next).length + 1 })
  if (secs && !allDone.value) startRest(secs, allDone.value ? '' : label)
  else stopRest()
  // In a superset, say what comes next so the round order is obvious
  if (e.indices.length > 1) {
    const L = (j) => letters[e.indices.indexOf(j)]
    const doneMsg = t('{x}, round {n} logged.', { x: L(i), n: planLogged(i).length })
    const nextMsg = sameGroup
      ? (secs ? t('Round done. Rest, then {x}, round {n}.', { x: L(next), n: planLogged(next).length + 1 }) : t('Now {x}, round {n}.', { x: L(next), n: planLogged(next).length + 1 }))
      : t('Superset done.')
    toast(doneMsg + ' ' + nextMsg, undo)
  }
  if (next !== i) setTimeout(() => go(next, sameGroup ? 'swap' : 'slide-next'), sameGroup ? 120 : 350)
}

// Rest by hand: the timer button next to Log starts this exercise's rest (the superset's, inside one)
const manualRest = computed(() => {
  if (!item.value) return 0
  if (group.value) return groupRest.value || item.value.restSec || 90
  return effectiveRest(items.value, current.value) || item.value.restSec || 90
})
function startManualRest () {
  tap()
  const n = planLogged(current.value).length + 1
  startRest(manualRest.value, n <= rowCount(current.value) ? t('{name}, set {n}', { name: name(item.value.exerciseId), n }) : '')
}

// ── Edit a logged set ──────────────────────────────────────
const editOpen = ref(false)
const editing = ref(null)
const editDraft = reactive({ load: null, reps: null, repsL: null, repsR: null, seconds: null, rir: null, type: null })
const confirmingDelete = ref(false)
function openEdit (s) {
  // A set of the other exercise in a superset: switch to it, so the weight unit and steps match
  if (s.itemIndex != null && s.itemIndex !== current.value) go(s.itemIndex, 'swap')
  confirmingDelete.value = false
  editing.value = s
  Object.assign(editDraft, { load: s.load, reps: s.reps, repsL: s.repsL ?? null, repsR: s.repsR ?? null, seconds: s.seconds, rir: s.rir ?? null, type: s.type ?? null })
  editOpen.value = true
}
// Close first, then save: the sheet reacts at once whatever the phone's storage is doing
function saveEdit () {
  const patch = { ...editDraft }
  if (patch.repsL != null && patch.repsR != null) patch.reps = Math.min(patch.repsL, patch.repsR)
  if (!patch.type) { delete patch.type; delete editing.value.type }
  editOpen.value = false
  tap()
  updateSet(session.value.id, editing.value.id, patch)
  toast(t('Set updated'))
}
function removeEditing () {
  const id = editing.value.id
  editOpen.value = false
  confirmingDelete.value = false
  buzz(30)
  deleteSet(session.value.id, id)
  toast(t('Set deleted'))
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
  if (e.target.closest?.('.inputs, .sets, .seg, .warm, .tags, .ss-card')) return // don't hijack controls
  if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - st < 600) {
    const ei = entryOf(current.value)
    if (dx < 0) goEntry(ei + 1, 'slide-next')
    else goEntry(ei - 1, 'slide-prev')
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
  toast(t('Swapped {a} for {b}', { a: was, b: name(id) }))
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
  toast(on ? t('Lighter day: weights and sets reduced') : t('Back to the normal plan'))
}

// ── Notes, tips ────────────────────────────────────────────
const noteOpen = ref(false)
const noteText = ref('')
function openNote () { noteText.value = state.data.exerciseNotes[item.value.exerciseId] || ''; noteOpen.value = true }
function saveNote () { setExerciseNote(item.value.exerciseId, noteText.value.trim()); noteOpen.value = false; toast(t('Note saved')) }
const sessionNotes = ref(session.value?.notes || '')
function saveSessionNotes () { if (session.value) { session.value.notes = sessionNotes.value; persist() } }
function dismissTip () { state.data.tips.workout = true; persist() }

// ── Header clock ───────────────────────────────────────────
const now = ref(Date.now())
let clock = null
onMounted(() => {
  clock = setInterval(() => { now.value = Date.now() }, 1000)
  if (!editingFinished.value) keepAwake(true)
  nextTick(() => chips[entryOf(current.value)]?.scrollIntoView({ inline: 'center', block: 'nearest' }))
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
const effortOptions = computed(() => [1, 2, 3, 4, 5].map(n => ({ label: [t('Easy'), '2', '3', '4', t('effort|Max')][n - 1], value: n })))
const energyOptions = computed(() => [1, 2, 3, 4, 5].map(n => ({ label: [t('Low'), '2', '3', '4', t('High')][n - 1], value: n })))

function leave () {
  saveSessionNotes()
  if (editingFinished.value) {
    markSessionEdited(route.params.id)
    toast(t('Changes saved'))
    // Came from the summary? Step back to it, so Back afterwards doesn't land on the editor again
    if (window.history.state?.back === `/summary/${route.params.id}`) router.back()
    else router.replace(`/summary/${route.params.id}`)
  } else router.push('/')
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
  if (wasFinished) deleteSession(session.value.id)
  else discardSession(session.value.id)
  finishOpen.value = false
  discardOpen.value = false
  router.replace(wasFinished ? '/history' : '/')
  toast(wasFinished ? t('Workout deleted') : t('Workout discarded'))
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

.ex-top { align-items: flex-start; margin-top: 8px; gap: 8px; }
.ex-top h1 { margin-top: 4px; cursor: pointer; }
.ex-top h1.in-ss { font-size: 24px; }
.thumb { flex: 0 0 auto; width: 64px; height: 48px; margin-top: 4px; border-radius: 10px; overflow: hidden; background: var(--card-2); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.info-btn { margin-right: -10px; }
.full-link { margin-top: 18px; }

/* Superset: one card that shows both exercises and the rounds */
.ss-card { margin-top: 10px; padding: 12px; border-radius: 16px; background: var(--card); border: 2px solid var(--plate-bg); }
.ss-head { display: flex; gap: 8px; align-items: flex-start; color: var(--ink-2); padding: 0 4px; }
.ss-head b { color: var(--ink); }
.ss-tabs { display: flex; gap: 6px; margin-top: 10px; }
.ss-tab {
  flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 8px;
  min-height: 48px; padding: 0 10px 0 6px; border-radius: 12px;
  background: var(--card-2); color: var(--ink-2); font-weight: 600; font-size: 15px; text-align: left;
}
.ss-tab.on { background: var(--ink); color: var(--paper); }
.ss-tab.done:not(.on) { color: var(--ok); }
.ss-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ss-letter {
  flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  font-family: var(--font-num); font-weight: 700; font-size: 17px;
  background: var(--card); color: var(--ink);
}
.ss-tab.on .ss-letter { background: var(--plate-bg); color: var(--plate-fg); }
.ss-letter.sm { width: 24px; height: 24px; font-size: 14px; background: var(--card-2); align-self: center; }
.ss-grid { display: grid; gap: 6px; margin-top: 12px; align-items: center; }
.ss-rh { font-family: var(--font); font-size: 12px; font-weight: 600; color: var(--ink-3); text-align: center; }
.ss-cell {
  min-height: 38px; border-radius: 10px; font-size: 16px; font-weight: 600;
  border: 1.5px dashed var(--line); color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px;
}
.ss-cell.done { border: 1.5px solid transparent; background: var(--ok-soft); color: var(--ink); }
.ss-cell.now { border: 1.5px solid var(--ink); color: var(--ink); font-family: var(--font); font-size: 13px; }
.ss-cell.off { visibility: hidden; }
.chip-link { margin-left: -4px; }
.chip.ss { max-width: 280px; }
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
.log { box-shadow: var(--shadow-float); min-width: 0; }
.confirm-q { margin-top: 14px; font-weight: 600; }
.log-row { gap: 10px; flex-wrap: nowrap; }
.rest-now { flex: 0 0 auto; padding: 0 16px; gap: 6px; background: var(--card); color: var(--ink); box-shadow: var(--shadow-float); }
.rest-now .t-num { font-size: 20px; font-weight: 700; }
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
.swap-enter-active, .swap-leave-active { transition: opacity 110ms ease; }
.swap-enter-from, .swap-leave-to { opacity: 0; }
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
