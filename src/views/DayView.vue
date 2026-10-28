<template>
  <div class="page" v-if="day" :style="plateStyle(plateIndex)">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>

    <div class="row head">
      <PlateBadge :index="plateIndex" :label="day.id" size="lg" />
      <div class="grow">
        <h1 class="t-title">{{ dayTitle(tx(day, 'name'), day.id) }}</h1>
        <div class="tags-row sub">
          <span v-if="day.source === 'mine'" class="tag tag-mine">{{ t('Yours') }}</span>
          <span v-else class="tag">{{ t('tag|Routine') }}</span>
          <span v-if="day.edited" class="tag tag-edit">{{ t('Edited') }}</span>
          <span class="t-small t-muted">{{ tn(items.length, '{n} exercise', '{n} exercises') }}<template v-if="day.estMinutes">{{ t(', about {n} min', { n: day.estMinutes }) }}</template></span>
        </div>
      </div>
    </div>
    <p v-if="tx(day, 'notes')" class="t-small t-muted day-notes">{{ tx(day, 'notes') }}</p>

    <div v-if="day.inactive && day.source === 'mine'" class="note note-info t-small plan-note">
      {{ t("This day isn't in this month's days right now. You can still do it today, or use it from its routine.") }}
    </div>
    <div v-else-if="day.inactive" class="note note-info t-small plan-note">
      {{ t("Hidden while you use your own days instead of this month's routine.") }}
    </div>
    <div v-if="day.pendingChange" class="note note-warn t-small plan-note row">
      <span class="grow">{{ t('This day changed this month. Your changes to it are waiting for a decision.') }}</span>
      <button class="btn btn-sm btn-soft" @click="state.reviewDayChange = day.id">{{ t('Decide') }}</button>
    </div>

    <template v-if="day.source === 'routine'">
      <div v-if="todayPlan.deload" class="note note-warn t-small plan-note">
        <b>{{ todayPlan.source === 'date' ? t('Deload today.') : t('Deload week.') }}</b> {{ t('One set fewer, about 10% lighter, and every set ends with 3 or more reps left.') }}
      </div>
      <div v-else-if="todayPlan.rir != null || todayPlan.focus || todayPlan.setDelta" class="note note-info t-small plan-note">
        <b>{{ todayPlan.source === 'date' ? t('Today:') : t('Week {n}:', { n: todayPlan.week }) }}</b>
        <template v-if="todayPlan.rir != null">{{ ' ' + tn(todayPlan.rir, 'leave {n} rep in the tank.', 'leave {n} reps in the tank.') }}</template>
        <template v-if="todayPlan.setDelta > 0">{{ ' ' + (todayPlan.applyTo === 'first' ? tn(todayPlan.setDelta, '{n} extra set on the first exercise.', '{n} extra sets on the first exercise.') : tn(todayPlan.setDelta, '{n} extra set on every exercise.', '{n} extra sets on every exercise.')) }}</template>
        <template v-if="todayPlan.focus">{{ ' ' + tx(todayPlan, 'focus') }}</template>
      </div>
      <div v-if="beginnerSwaps" class="note t-small plan-note track-note">
        <b>{{ t('Beginner track.') }}</b> {{ t('Some exercises are swapped for easier versions or fewer sets. Change it in Settings.') }}
      </div>
    </template>

    <div v-if="gaps.length" class="note note-warn t-small plan-note row gym-note">
      <Icon name="alert" :size="20" />
      <span class="grow">{{ tn(gaps.length, '{n} exercise here needs equipment your gym doesn\'t have. Swap it below.', '{n} exercises here need equipment your gym doesn\'t have. Swap them below.') }}</span>
    </div>

    <ol class="group list">
      <li v-for="(it, i) in items" :key="it.ref || i" class="ex-li">
        <RouterLink :to="`/exercise/${it.exerciseId}`" class="group-row ex-link">
          <span class="num t-num">{{ i + 1 }}</span>
          <div class="grow">
            <div class="t-h3">{{ exName(it.exerciseId) }}</div>
            <div class="t-small t-muted">
              {{ prescription({ ...it, sets: plannedSetsFor(it, i, plan) }, ex(it.exerciseId)) }}, {{ restLabel(effectiveRest(items, i)) }}
            </div>
            <div v-if="inSuperset(items, i) || it.track || it.added || it.swappedFrom" class="row tags">
              <span v-if="inSuperset(items, i)" class="t-tiny t-muted ss"><Icon name="superset" :size="14" />{{ t('Superset') }}</span>
              <span v-if="it.track" class="t-tiny t-muted ss"><Icon name="start" :size="14" />{{ t('Beginner version') }}</span>
              <span v-if="it.added" class="t-tiny ss t-warn"><Icon name="plus" :size="14" />{{ t('Added by you') }}</span>
              <span v-if="it.swappedFrom" class="t-tiny ss t-warn"><Icon name="swap" :size="14" />{{ t('Instead of {name}', { name: exName(it.swappedFrom) }) }}</span>
            </div>
            <div v-if="tx(it, 'notes')" class="t-tiny t-muted item-note">{{ tx(it, 'notes') }}</div>
            <div class="t-tiny suggest">{{ suggestionFor(it).text }}</div>
          </div>
        </RouterLink>
        <button class="icon-btn swap-btn" :aria-label="t('Swap {name}', { name: exName(it.exerciseId) })" @click="openSwap(it)"><Icon name="swap" :size="22" /></button>
        <div v-if="once[it.ref]?.from === it.exerciseId" class="gym-row once">
          <Icon name="swap" :size="16" />
          <span class="grow t-small">{{ t('Next time only: {name}', { name: exName(once[it.ref].to) }) }}</span>
          <button class="btn btn-sm btn-ghost" @click="clearOneTimeSwap(day.key, it.ref)">{{ t('Undo') }}</button>
        </div>
        <div v-else-if="gapRefs.has(it.ref)" class="gym-row lack">
          <Icon name="alert" :size="16" />
          <span class="grow t-small">{{ t('Not in your gym') }}</span>
          <button class="btn btn-sm btn-soft" @click="openSwap(it)"><Icon name="swap" :size="18" />{{ t('Swap') }}</button>
        </div>
      </li>
      <li v-if="!items.length" class="group-row t-muted">{{ t('No exercises yet.') }}</li>
    </ol>
    <p v-if="hasGroups" class="t-tiny t-muted ss-help">
      {{ t('Supersets: do one set of each back to back, then rest.') }}
    </p>

    <!-- Make it yours -->
    <h2 class="section-h">{{ day.source === 'mine' ? t('Your day') : t('Make it yours') }}</h2>
    <div class="group">
      <RouterLink :to="`/edit/${day.key}`" class="group-row">
        <Icon name="adjust" />
        <div class="grow">
          <div class="t-h3">{{ day.source === 'mine' ? t('Edit this day') : t('Adjust this day') }}</div>
          <div class="t-tiny t-muted">{{ day.source === 'mine' ? t('Exercises, sets, reps, rest and name') : t("Add or swap exercises, change sets, reps and rest. You'll still get the routine's updates.") }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
      <button v-if="day.source === 'routine'" class="group-row" @click="openSave">
        <Icon name="mine" />
        <div class="grow">
          <div class="t-h3">{{ t('Save as mine') }}</div>
          <div class="t-tiny t-muted">{{ t('Keeps a copy in My routines, exactly as it is now. The routine never changes it.') }}</div>
        </div>
      </button>
      <RouterLink v-if="day.planId" :to="`/plan/${day.planId}`" class="group-row">
        <Icon name="routines" />
        <div class="grow">
          <div class="t-h3 truncate">{{ plan_?.name || t('Untitled') }}</div>
          <div class="t-tiny t-muted">{{ planStatus(plan_) }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
    </div>

    <!-- Your changes to a repo day -->
    <template v-if="edit?.ops?.length && !edit.pending">
      <h2 class="section-h">{{ t('Your changes') }}</h2>
      <div class="group">
        <div v-for="(op, i) in edit.ops" :key="i" class="group-row change">
          <span class="grow t-small">{{ describeOp(op, edit.ops) }}</span>
          <button class="icon-btn" :aria-label="t('Undo this change')" @click="undo(i)"><Icon name="undo" :size="20" /></button>
        </div>
      </div>
      <button class="btn btn-ghost btn-block reset" @click="resetOpen = true"><Icon name="restore" :size="20" />{{ t('Back to the original') }}</button>
    </template>

    <div class="dock">
      <button v-if="!activeSession" class="btn btn-lg btn-block btn-plate" :disabled="!items.length" @click="start">
        <Icon name="play" />{{ day.source === 'mine' ? t('Start workout') : t('Start day {id}', { id: day.id }) }}
      </button>
      <RouterLink v-else :to="`/workout/${activeSession.id}`" class="btn btn-lg btn-block btn-primary">
        <Icon name="play" />{{ t('Continue current workout') }}
      </RouterLink>
    </div>

    <!-- Save as mine -->
    <Sheet v-model="saveOpen" :title="t('Save as mine')">
      <label class="label" for="mine-name">{{ t('Name') }}</label>
      <input id="mine-name" v-model="saveName" class="field" type="text" maxlength="40">
      <p class="t-small t-muted mt">{{ t('It goes to My routines. From there you can add it to this month\'s days, use it instead of the routine, or keep it for later.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="saveOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!saveName.trim()" @click="saveMine">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <SwapSheet v-model="swap.open" mode="day" :exercise-id="swap.exerciseId" :original-id="swap.originalId" @swap="doSwap" />

    <Sheet v-model="resetOpen" :title="t('Back to the original?')">
      <p class="t-body">{{ tn(edit?.ops?.length || 0, 'Your {n} change to this day will be removed. Your workouts stay as they are.', 'Your {n} changes to this day will be removed. Your workouts stay as they are.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="resetOpen = false">{{ t('Keep them') }}</button>
        <button class="btn btn-danger btn-lg" @click="reset">{{ t('Remove changes') }}</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">{{ t("That day isn't in this month's routine") }}</p>
  </div>
</template>

<script setup>
import { computed, ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import SwapSheet from '../ui/SwapSheet.vue'
import { plateStyle } from '../ui/plates.js'
import { toast } from '../ui/toast.js'
import {
  state, days, findDay, dayIndexOf, exercisesById, activeSession, startSession, suggestionFor, todayPlan, routine,
  routineEdit, undoRoutineEdit, resetRoutineDay, saveDayAsMine, planById, gymGaps, clearOneTimeSwap, swapInDay
} from '../store.js'
import { t, tn, tx } from '../i18n/index.js'
import { plannedSetsFor } from '../lib/training.js'
import { prescription, restLabel, dayTitle, planStatus, monthName } from '../lib/format.js'
import { effectiveRest, inSuperset } from '../lib/supersets.js'
import { describeOp } from '../lib/editText.js'

const route = useRoute()
const router = useRouter()
// Old links used the position in the list (/day/0)
const key = computed(() => {
  const k = String(route.params.key)
  return /^\d+$/.test(k) ? days.value[Number(k)]?.key : k
})
const day = computed(() => (key.value ? findDay(key.value) : null))
const plateIndex = computed(() => { const i = dayIndexOf(key.value); return i >= 0 ? i : 0 })
const ex = (id) => exercisesById.value[id]
const exName = (id) => tx(ex(id), 'name') || id
const items = computed(() => day.value?.items || [])
const plan = computed(() => (day.value?.source === 'routine' ? todayPlan.value : null))
const beginnerSwaps = computed(() => items.value.some(i => i.track))
const hasGroups = computed(() => items.value.some((_, i) => inSuperset(items.value, i)))
const edit = computed(() => (day.value?.source === 'routine' ? routineEdit(day.value.id) : null))
const plan_ = computed(() => (day.value?.planId ? planById(day.value.planId) : null))

// Exercises that need equipment your gym doesn't have, and swaps waiting for the next workout
const gaps = computed(() => gymGaps.value[key.value] || [])
const gapRefs = computed(() => new Set(gaps.value.map(g => g.ref)))
const once = computed(() => state.data.oneTimeSwaps?.[key.value] || {})
// Swap any exercise: next time only, or always (a change to the day)
const swap = reactive({ open: false, ref: '', exerciseId: '', originalId: '' })
function openSwap (it) {
  swap.ref = it.ref
  swap.exerciseId = it.exerciseId
  swap.originalId = it.swappedFrom || ''
  swap.open = true
}
function doSwap ({ id, how }) {
  const from = exName(swap.exerciseId)
  if (!swapInDay(key.value, swap.ref, id, how)) return
  toast(how === 'once' ? t('Next time: {b} instead of {a}', { a: from, b: exName(id) }) : t('{b} instead of {a} from now on', { a: from, b: exName(id) }))
}

function start () {
  const id = startSession(key.value)
  if (id) router.push(`/workout/${id}`)
}

function undo (i) {
  undoRoutineEdit(day.value.id, i)
  toast(t('Change undone'))
}
const resetOpen = ref(false)
function reset () {
  resetRoutineDay(day.value.id)
  resetOpen.value = false
  toast(t('Back to the routine\'s version'))
}

const saveOpen = ref(false)
const saveName = ref('')
function openSave () {
  const m = routine.value?.month ? ' (' + monthName(routine.value.month, { month: 'short' }) + ')' : ''
  saveName.value = dayTitle(tx(day.value, 'name'), day.value.id) + m
  saveOpen.value = true
}
function saveMine () {
  const p = saveDayAsMine(key.value, saveName.value.trim())
  saveOpen.value = false
  if (p) toast(t('Saved to My routines'), { actionLabel: t('Open'), action: () => router.push(`/plan/${p.id}`) })
}
</script>

<style scoped>
.page { padding-bottom: calc(var(--nav-h) + var(--safe-bottom) + 110px); }
.head { gap: 16px; }
.sub { margin-top: 6px; }
.day-notes { margin-top: 14px; }
.plan-note { margin-top: 14px; gap: 10px; }
.list { list-style: none; margin-top: 20px; }
.list li + li .group-row::before {
  content: ''; position: absolute; top: 0; right: 0; left: 60px; border-top: 1px solid var(--line);
}
.list .group-row { align-items: flex-start; padding-top: 14px; padding-bottom: 14px; }
.num {
  width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto; margin-top: 1px;
  display: grid; place-items: center; background: var(--card-2);
  font-size: 16px; font-weight: 700; color: var(--ink-2);
}
.tags { gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.ss { display: flex; gap: 4px; align-items: center; }
.item-note { margin-top: 4px; }
.track-note { background: var(--card); }
.gym-note { align-items: flex-start; }
.ex-li { position: relative; }
.ex-link { padding-right: 56px; }
.swap-btn { position: absolute; right: 6px; top: 8px; color: var(--ink-2); }
.gym-row { display: flex; align-items: center; gap: 8px; margin: -6px 16px 0 60px; padding: 0 0 12px; }
.gym-row.lack { color: var(--warn); }
.gym-row.lack .t-small { font-weight: 600; }
.gym-row.once { color: var(--ink-2); }
.suggest { margin-top: 6px; color: var(--ink-2); }
.ss-help { margin: 10px 4px 0; }
.change { min-height: 52px; padding-top: 6px; padding-bottom: 6px; }
.reset { margin-top: 8px; }
.mt { margin-top: 12px; }
.dock {
  position: fixed; left: 0; right: 0; z-index: 20;
  bottom: calc(var(--nav-h) + var(--safe-bottom));
  padding: 12px 16px; max-width: 640px; margin: 0 auto;
  background: linear-gradient(to top, var(--paper) 70%, rgba(0,0,0,0));
}
</style>
