<template>
  <div v-if="day" class="page" :style="plateStyle(plateIndex)">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="done"><Icon name="back" /></button>
      <span class="t-h3">{{ mine ? t('Edit day') : t('Adjust day {id}', { id: day.id }) }}</span>
      <button class="btn btn-sm btn-primary" @click="done">{{ t('Done') }}</button>
    </div>

    <!-- Your own day: badge, name, notes -->
    <template v-if="mine">
      <div class="row name-row">
        <label class="lab-field">
          <span class="label">{{ t('Badge') }}</span>
          <input v-model="form.label" class="field t-num badge-in" maxlength="2" :aria-label="t('Badge')" @blur="saveHeader">
        </label>
        <label class="grow">
          <span class="label">{{ t('Name') }}</span>
          <input v-model="form.name" class="field" maxlength="40" :placeholder="t('For example: Arms and shoulders')" @blur="saveHeader">
        </label>
      </div>
      <label class="label mt" for="d-notes">{{ t('Notes') }} <span class="t-faint">{{ t('(optional)') }}</span></label>
      <textarea id="d-notes" v-model="form.notes" class="field" rows="2" :placeholder="t('Warm-up, what to focus on…')" @blur="saveHeader" />
    </template>
    <div v-else class="note note-info t-small intro">
      <h1 class="t-h3">{{ dayTitle(tx(day, 'name'), day.id) }}</h1>
      {{ t("Your changes sit on top of the routine's day, so you still get its updates. They're saved as you go.") }}
    </div>

    <h2 class="section-h">{{ t('Exercises') }}</h2>
    <ol class="group list">
      <li v-for="(it, i) in items" :key="it.ref" class="item">
        <button class="group-row row-btn" @click="openItem(i)">
          <span class="num t-num">{{ i + 1 }}</span>
          <div class="grow">
            <div class="t-h3">{{ exName(it.exerciseId) }}</div>
            <div class="t-small t-muted">{{ prescription(it, ex(it.exerciseId)) }}, {{ restLabel(it.restSec ?? 90) }}</div>
            <div v-if="inSuperset(items, i) || it.added || it.swappedFrom" class="row tags">
              <span v-if="inSuperset(items, i)" class="t-tiny t-muted ss"><Icon name="superset" :size="14" />{{ t('Superset') }}</span>
              <span v-if="!mine && it.added" class="t-tiny ss t-warn"><Icon name="plus" :size="14" />{{ t('Added by you') }}</span>
              <span v-if="it.swappedFrom" class="t-tiny ss t-warn"><Icon name="swap" :size="14" />{{ t('Instead of {name}', { name: exName(it.swappedFrom) }) }}</span>
            </div>
          </div>
        </button>
        <div class="moves">
          <button class="icon-btn mv" :disabled="i === 0" :aria-label="t('Move up')" @click="move(i, -1)"><Icon name="moveUp" /></button>
          <button class="icon-btn mv" :disabled="i === items.length - 1" :aria-label="t('Move down')" @click="move(i, 1)"><Icon name="moveDown" /></button>
        </div>
      </li>
      <li v-if="!items.length" class="group-row t-muted">{{ t('No exercises yet. Add the first one.') }}</li>
    </ol>
    <button class="btn btn-soft btn-block add" @click="addAt = 'end'; pickOpen = true"><Icon name="plus" />{{ t('Add an exercise') }}</button>

    <template v-if="!mine && edited">
      <button class="btn btn-ghost btn-block" @click="resetAll"><Icon name="restore" :size="20" />{{ t('Back to the original') }}</button>
    </template>
    <template v-if="mine && planDays > 1">
      <button class="btn btn-ghost btn-block t-err" @click="delOpen = true"><Icon name="trash" :size="20" />{{ t('Delete this day') }}</button>
    </template>

    <!-- One exercise -->
    <Sheet v-model="itemOpen" :title="cur ? exName(draft.exerciseId) : ''">
      <template v-if="cur">
        <button class="group group-row ex-pick" @click="swapOpen = true">
          <div class="grow">
            <div class="t-tiny t-muted">{{ t('Exercise') }}</div>
            <div class="t-h3">{{ exName(draft.exerciseId) }}</div>
          </div>
          <span class="t-small link">{{ t('Change') }}</span>
        </button>

        <div class="grid2 mt">
          <Stepper v-model="draft.sets" :label="t('Sets')" :step="1" :min="1" :max="12" size="md" />
          <Stepper v-model="draft.rest" :label="t('Rest')" :step="15" :min="0" :max="600" size="md" :format="mmss" />
        </div>
        <div class="label mt">{{ timed ? t('Seconds per set') : t('Reps per set') }}</div>
        <div class="grid2">
          <Stepper v-model="draft.lo" :label="t('From')" :step="timed ? 5 : 1" :min="1" :max="draft.hi || 999" size="md" />
          <Stepper v-model="draft.hi" :label="t('To')" :step="timed ? 5 : 1" :min="draft.lo || 1" :max="timed ? 600 : 100" size="md" />
        </div>

        <label class="label mt" for="it-notes">{{ t('Notes') }} <span class="t-faint">{{ t('(optional)') }}</span></label>
        <textarea id="it-notes" v-model="draft.notes" class="field" rows="2" :placeholder="t('Grip, tempo, set-up…')" />

        <label v-if="curIndex < items.length - 1" class="toggle-row t-small">
          <Toggle v-model="draft.superset" />
          <span class="grow">{{ t('Superset with the next exercise ({name})', { name: exName(items[curIndex + 1].exerciseId) }) }}</span>
        </label>

        <button class="btn btn-ghost btn-block mt" @click="addAt = cur.ref; itemOpen = false; pickOpen = true"><Icon name="plus" :size="20" />{{ t('Add an exercise after this one') }}</button>
        <p v-if="confirmRemove" class="note note-warn t-body confirm-q" role="alert">{{ t('Remove {name} from this day?', { name: exName(cur.exerciseId) }) }}</p>
      </template>
      <template #actions>
        <template v-if="confirmRemove">
          <button class="btn btn-soft btn-lg" @click="confirmRemove = false">{{ t('No') }}</button>
          <button class="btn btn-danger btn-lg" @click="removeCur"><Icon name="trash" />{{ t('Yes, remove') }}</button>
        </template>
        <template v-else>
          <button class="btn btn-danger btn-lg" @click="confirmRemove = true"><Icon name="trash" />{{ t('Remove') }}</button>
          <button class="btn btn-primary btn-lg" :disabled="!draft.lo || !draft.hi" @click="saveItem">{{ t('Save') }}</button>
        </template>
      </template>
    </Sheet>

    <ExercisePicker v-model="pickOpen" :title="t('Add an exercise')" allow-create @pick="picked" />
    <SwapSheet v-model="swapOpen" mode="edit" :exercise-id="draft.exerciseId || ''" :original-id="cur?.swappedFrom || ''" @swap="({ id }) => { addAt = null; picked(id) }" />

    <Sheet v-model="delOpen" :title="t('Delete this day?')">
      <p class="t-body">{{ t('It will be removed from this routine. Workouts you did with it stay in your history.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="delOpen = false">{{ t('Keep it') }}</button>
        <button class="btn btn-danger btn-lg" @click="deleteDay">{{ t('Delete') }}</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">{{ t("That day isn't in this month's routine") }}</p>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Stepper from '../ui/Stepper.vue'
import Toggle from '../ui/Toggle.vue'
import ExercisePicker from '../ui/ExercisePicker.vue'
import SwapSheet from '../ui/SwapSheet.vue'
import { plateStyle } from '../ui/plates.js'
import { toast } from '../ui/toast.js'
import {
  state, persist, findDay, dayIndexOf, exercisesById, planById, changeRoutineDay, routineEdit, resetRoutineDay, deletePlanDay
} from '../store.js'
import { opSet, opSwap, opRemove, opAdd, opMove, patchItem, parseKey, cleanItem, uid } from '../lib/routines.js'
import { prescription, restLabel, dayTitle, mmss } from '../lib/format.js'
import { t, tx } from '../i18n/index.js'
import { tap } from '../lib/native.js'
import { inSuperset } from '../lib/supersets.js'

const route = useRoute()
const router = useRouter()
const key = computed(() => String(route.params.key))
const parsed = computed(() => parseKey(key.value))
const mine = computed(() => parsed.value?.source === 'mine')
const day = computed(() => findDay(key.value))
const plateIndex = computed(() => Math.max(0, dayIndexOf(key.value)))
const ex = (id) => exercisesById.value[id]
const exName = (id) => tx(ex(id), 'name') || id
const items = computed(() => day.value?.items || [])
const edited = computed(() => !mine.value && !!routineEdit(day.value?.id)?.ops?.length)
let changed = false

// ── Where changes go: edits on a repo day, or straight into your own day ──
const planDay = computed(() => (mine.value ? planById(parsed.value.planId)?.days.find(d => d.id === parsed.value.dayId) : null))
const planDays = computed(() => (mine.value ? planById(parsed.value.planId)?.days.length || 0 : 0))
const at = (ref) => planDay.value.items.findIndex(it => 'm:' + it.id === ref)
const store = {
  set (ref, patch) {
    if (!mine.value) return changeRoutineDay(day.value.id, ops => opSet(ops, ref, patch))
    const i = at(ref); if (i >= 0) patchItem(planDay.value.items[i], patch); persist()
  },
  swap (ref, id) {
    if (!mine.value) return changeRoutineDay(day.value.id, ops => opSwap(ops, ref, id))
    const i = at(ref); if (i >= 0) { planDay.value.items[i].exerciseId = id; delete planDay.value.items[i].es } persist()
  },
  remove (ref) {
    if (!mine.value) return changeRoutineDay(day.value.id, ops => opRemove(ops, ref))
    const i = at(ref); if (i >= 0) planDay.value.items.splice(i, 1); persist()
  },
  add (item, after) {
    if (!mine.value) return changeRoutineDay(day.value.id, ops => opAdd(ops, item, after).ops)
    const it = cleanItem(item)
    const i = after && after !== 'end' ? at(after) : -1
    if (after === 'end' || i < 0) planDay.value.items.push(it)
    else planDay.value.items.splice(i + 1, 0, it)
    persist()
  },
  move (ref, after) {
    if (!mine.value) return changeRoutineDay(day.value.id, ops => opMove(ops, ref, after))
    const i = at(ref); if (i < 0) return
    const [it] = planDay.value.items.splice(i, 1)
    if (after == null) planDay.value.items.unshift(it)
    else planDay.value.items.splice(at(after) + 1, 0, it)
    persist()
  }
}

// ── Your own day: badge, name, notes ──
const form = reactive({ label: '', name: '', notes: '' })
watch(planDay, (d) => { if (d) Object.assign(form, { label: d.label || '', name: d.name || '', notes: d.notes || '' }) }, { immediate: true })
function saveHeader () {
  const d = planDay.value
  if (!d) return
  const label = form.label.trim().toUpperCase().slice(0, 2) || (form.name.trim().charAt(0).toUpperCase() || '•')
  if (d.label === label && d.name === form.name.trim() && (d.notes || '') === form.notes.trim()) return
  d.label = label
  form.label = label
  if (d.name !== form.name.trim()) { d.name = form.name.trim(); if (d.es) delete d.es.name }
  d.notes = form.notes.trim()
  changed = true
  persist()
}

// ── One exercise ──
const itemOpen = ref(false)
const curIndex = ref(-1)
const cur = computed(() => items.value[curIndex.value] || null)
const draft = reactive({ exerciseId: null, sets: 3, lo: 8, hi: 12, rest: 90, notes: '', superset: false })
const timed = computed(() => ex(draft.exerciseId)?.logType === 'time' || (!!cur.value?.durationSec && !ex(draft.exerciseId)))
const confirmRemove = ref(false)

function openItem (i) {
  curIndex.value = i
  const it = items.value[i]
  const range = it.durationSec || it.repRange || [8, 12]
  const next = items.value[i + 1]
  Object.assign(draft, {
    exerciseId: it.exerciseId, sets: it.sets || 3, lo: range[0], hi: range[1], rest: it.restSec ?? 90,
    notes: tx(it, 'notes') || '', superset: !!(it.group && next?.group === it.group)
  })
  confirmRemove.value = false
  itemOpen.value = true
}

function saveItem () {
  const it = cur.value
  const i = curIndex.value
  if (draft.exerciseId !== it.exerciseId) store.swap(it.ref, draft.exerciseId)
  const patch = {}
  if (draft.sets !== it.sets) patch.sets = draft.sets
  const lo = Math.min(draft.lo, draft.hi); const hi = Math.max(draft.lo, draft.hi)
  if (timed.value) { if (!it.durationSec || it.durationSec[0] !== lo || it.durationSec[1] !== hi) patch.durationSec = [lo, hi] }
  else if (!it.repRange || it.repRange[0] !== lo || it.repRange[1] !== hi) patch.repRange = [lo, hi]
  if (draft.rest !== (it.restSec ?? 90)) patch.restSec = draft.rest
  if (draft.notes.trim() !== (tx(it, 'notes') || '')) patch.notes = draft.notes.trim() || null
  if (Object.keys(patch).length) store.set(it.ref, patch)
  // Superset with the next exercise
  const next = items.value[i + 1]
  const linked = !!(it.group && next?.group === it.group)
  if (next && draft.superset !== linked) {
    if (draft.superset) {
      const g = it.group || next.group || 'G' + uid().slice(-5)
      if (it.group !== g) store.set(it.ref, { group: g })
      if (next.group !== g) store.set(next.ref, { group: g })
    } else {
      // Split the superset after this exercise; anything left on its own isn't a superset any more
      const g = it.group
      const list = items.value
      const tail = []
      for (let k = i + 1; list[k]?.group === g; k++) tail.push(list[k].ref)
      if (list[i - 1]?.group !== g) store.set(it.ref, { group: null })
      if (tail.length === 1) store.set(tail[0], { group: null })
      else { const ng = 'G' + uid().slice(-5); for (const r of tail) store.set(r, { group: ng }) }
    }
  }
  changed = true
  itemOpen.value = false
  tap()
  toast(t('Saved'))
}

function removeCur () {
  const it = cur.value
  itemOpen.value = false
  confirmRemove.value = false
  store.remove(it.ref)
  changed = true
  toast(t('{name} removed', { name: exName(it.exerciseId) }))
}

function move (i, dir) {
  const list = items.value
  const it = list[i]
  const j = i + dir
  if (j < 0 || j >= list.length) return
  // After moving, it sits after the item that will be just before it
  const after = dir < 0 ? (j === 0 ? null : list[j - 1].ref) : list[j].ref
  store.move(it.ref, after)
  changed = true
  tap()
}

// ── Picking an exercise: add (addAt = 'end' or a ref) or swap (addAt = null) ──
const pickOpen = ref(false)
const swapOpen = ref(false)
const addAt = ref('end')
function newItem (id) {
  const e = ex(id)
  return e?.logType === 'time'
    ? { exerciseId: id, sets: 3, durationSec: [30, 45], restSec: 60 }
    : { exerciseId: id, sets: 3, repRange: e?.logType === 'bodyweight' ? [8, 15] : [8, 12], restSec: 90 }
}
function picked (id) {
  if (addAt.value !== null) {
    store.add(newItem(id), addAt.value)
    changed = true
    toast(t('{name} added', { name: exName(id) }))
    return
  }
  // Swap inside the item sheet: switching between a timed and a rep exercise changes the range
  const wasTimed = timed.value
  draft.exerciseId = id
  if (timed.value !== wasTimed) {
    const r = timed.value ? [30, 45] : [8, 12]
    draft.lo = r[0]; draft.hi = r[1]
  }
}

function resetAll () {
  resetRoutineDay(day.value.id)
  toast(t("Back to the routine's version"))
}

const delOpen = ref(false)
function deleteDay () {
  deletePlanDay(parsed.value.planId, parsed.value.dayId)
  delOpen.value = false
  router.replace(`/plan/${parsed.value.planId}`)
  toast(t('Day deleted'))
}

function done () {
  saveHeader()
  if (changed) toast(t('Changes saved'))
  router.back()
}
</script>

<style scoped>
.intro .t-h3 { margin-bottom: 4px; }
.name-row { align-items: flex-end; gap: 10px; }
.lab-field { width: 76px; flex: 0 0 auto; }
.badge-in { text-align: center; font-size: 22px; font-weight: 700; text-transform: uppercase; }
.mt { margin-top: 16px; }
.list { list-style: none; }
.item { display: flex; align-items: stretch; position: relative; }
.item + .item::before { content: ''; position: absolute; top: 0; right: 0; left: 60px; border-top: 1px solid var(--line); }
.row-btn { align-items: flex-start; padding-top: 14px; padding-bottom: 14px; flex: 1 1 auto; min-width: 0; padding-right: 4px; }
.moves { display: flex; flex-direction: column; justify-content: center; padding-right: 6px; }
.mv { width: 40px; height: 36px; border-radius: 10px; }
.mv:disabled { opacity: 0.25; }
.num {
  width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto; margin-top: 1px;
  display: grid; place-items: center; background: var(--card-2);
  font-size: 16px; font-weight: 700; color: var(--ink-2);
}
.tags { gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.ss { display: flex; gap: 4px; align-items: center; }
.add { margin: 12px 0 8px; }
.ex-pick { width: 100%; }
.link { font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.toggle-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.confirm-q { margin-top: 14px; }
</style>
