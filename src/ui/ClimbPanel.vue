<template>
  <div class="cp">
    <!-- Where (only when you've set up more than one gym) -->
    <div v-if="gyms.length > 1" class="gyms" role="radiogroup" :aria-label="t('Gym')">
      <button
        v-for="g in gyms" :key="g.id" class="gym-chip" :class="{ on: g.id === gymId }" role="radio" :aria-checked="g.id === gymId"
        @click="pickGym(g.id)"
      ><Icon name="place" :size="16" />{{ gymName(g) }}</button>
    </div>

    <!-- This session so far -->
    <div v-if="mine.length" class="totals t-small">
      <span><b class="t-num">{{ tot.climbs }}</b> {{ tn(tot.climbs, 'climb', 'climbs') }}</span>
      <span><b class="t-num">{{ tot.sends }}</b> {{ tn(tot.sends, 'one|sent', 'sent') }}</span>
      <span><b class="t-num">{{ tot.flashes }}</b> {{ tn(tot.flashes, 'flash', 'flashes') }}</span>
      <span v-if="top"><span class="t-muted">{{ t('hardest') }}</span> <b class="t-num">{{ top }}</b></span>
    </div>

    <div v-if="mine.length" class="list">
      <button v-for="s in [...mine].reverse()" :key="s.id" class="climb" :class="[s.climb.result, { fresh: s.id === fresh }]" @click="openEdit(s)">
        <span class="grade t-num" :style="gradeStyle(s.climb.grade)">{{ s.climb.grade }}</span>
        <span class="grow txt">
          <span class="res"><Icon :name="RESULT_ICON[s.climb.result]" :size="15" />{{ t(RESULT_LABEL[s.climb.result]) }}<template v-if="s.climb.result !== 'flash' && s.climb.attempts > 1"> · {{ tn(s.climb.attempts, '{n} try', '{n} tries') }}</template><template v-if="s.climb.style === 'lead'"> · {{ t('lead') }}</template></span>
          <span class="t-tiny t-muted truncate">{{ [s.climb.wall, s.climb.note].filter(Boolean).join(' · ') || t('No wall') }}</span>
        </span>
        <span v-if="s.climb.seconds" class="t-small t-muted t-num">{{ mmss(s.climb.seconds) }}</span>
        <Icon v-if="recordIds.has(s.id)" name="trophy" :size="18" class="rec" />
      </button>
    </div>
    <p v-else class="t-small t-muted empty">{{ t('Log each problem or route as you finish it: the grade, the wall, whether you flashed it, and how long it took.') }}</p>

    <h2 class="section-h">{{ mine.length ? t('Next climb') : t('First climb') }}</h2>
    <ClimbFields :key="gymId" :climb="draft" :kind="kind" :grades="grades" :walls="walls" timer :timing="!!timerStart" id-prefix="cp" @timer="toggleTimer" />

    <Sheet v-model="editOpen" :title="t('Edit climb')">
      <ClimbFields v-if="editOpen" :climb="editDraft" :kind="kind" :grades="editGrades" :walls="walls" class="in-sheet" id-prefix="ce" />
      <template #actions>
        <button class="btn btn-danger btn-lg" @click="removeEdit"><Icon name="trash" />{{ t('Delete') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!editDraft.grade" @click="saveEdit">{{ t('Save') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
// Logging climbs in a workout: one card per climb (newest first, tap to change), then the next climb's
// fields. The workout's dock button calls log().
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Sheet from './Sheet.vue'
import ClimbFields from './ClimbFields.vue'
import { toast } from './toast.js'
import { state, getSession, exercisesById, finishedSessions, logSet, updateSet, deleteSet, persist, setClimbGym } from '../store.js'
import {
  climbKind, systemFor, gradeList, rankOf, swatch, hardest, climbTotals, climbsIn, isSent, mmss, RESULT_ICON, RESULT_LABEL,
  activeGyms, currentGymId, gymName, climbGymId
} from '../lib/climbing.js'
import { buzz } from '../lib/native.js'
import { t, tn } from '../i18n/index.js'

const props = defineProps({
  sessionId: { type: String, required: true },
  itemIndex: { type: Number, required: true },
  exerciseId: { type: String, required: true }
})
const emit = defineEmits(['logged'])

const session = computed(() => getSession(props.sessionId))
const ex = computed(() => exercisesById.value[props.exerciseId])
const kind = computed(() => climbKind(ex.value))
// The gym: this session's, or where you climbed last
const gyms = computed(() => activeGyms(state.data.settings))
const gymId = computed(() => session.value?.climbGym || currentGymId(state.data.settings))
function pickGym (id) {
  if (id === gymId.value) return
  setClimbGym(props.sessionId, id)
  resetDraft(false)
}
const system = computed(() => systemFor(kind.value, state.data.settings, gymId.value))
const grades = computed(() => gradeList(system.value, state.data.settings))
const mine = computed(() => (session.value?.sets || []).filter(s => s.itemIndex === props.itemIndex && s.exerciseId === props.exerciseId && s.climb))
const tot = computed(() => climbTotals(climbsIn(mine.value)))
const top = computed(() => hardest(climbsIn(mine.value))[system.value]?.grade || '')

// Earlier climbs of the same kind (bouldering or routes), newest first
const past = computed(() => {
  const out = []
  for (const s of finishedSessions.value) {
    for (const x of s.sets) {
      if (x.climb && climbKind(exercisesById.value[x.exerciseId]) === kind.value) out.push({ ...x.climb, ts: x.ts || s.startedAt, at: climbGymId(x.climb) })
    }
  }
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
})
// Walls at this gym: this session's first, then the ones you've used most recently
const walls = computed(() => [...new Set([
  ...mine.value.filter(s => climbGymId(s.climb) === gymId.value).map(s => s.climb.wall).reverse(),
  ...past.value.filter(c => c.at === gymId.value).map(c => c.wall)
].filter(Boolean))].slice(0, 10))
// Records against everything before this workout, so the trophy shows the moment you send it
const recordIds = computed(() => {
  const before = past.value.filter(c => c.system === system.value)
  let best = hardest(before)[system.value]?.rank ?? null
  if (best == null) return new Set() // first time climbing this kind: that's the baseline
  const out = new Set()
  for (const s of mine.value) {
    if (s.climb.system !== system.value || !isSent(s.climb)) continue
    if (s.climb.rank > best) { out.add(s.id); best = s.climb.rank }
  }
  return out
})

// ── Next climb ──
function startGrade () {
  const last = [...mine.value].reverse().map(s => s.climb).find(c => c.system === system.value) || past.value.find(c => c.system === system.value)
  if (last && grades.value.includes(last.grade)) return last.grade
  return grades.value[Math.min(grades.value.length - 1, Math.floor(grades.value.length / 3))]
}
const draft = reactive({ grade: '', wall: '', result: 'send', attempts: 1, seconds: 0, note: '', style: 'toprope' })
function resetDraft (keep = true) {
  if (!keep || !grades.value.includes(draft.grade)) draft.grade = startGrade()
  if (!keep) draft.wall = [...mine.value].reverse().find(s => climbGymId(s.climb) === gymId.value)?.climb.wall || ''
  Object.assign(draft, { result: 'send', attempts: 1, seconds: 0, note: '' })
}
resetDraft(false)
watch(grades, () => { if (!grades.value.includes(draft.grade)) draft.grade = startGrade() })

// Timer: kept on the session so it survives leaving the screen
const timerStart = computed(() => (session.value?.climbTimer?.itemIndex === props.itemIndex ? session.value.climbTimer.startedAt : null))
let tick = null
function runTick () {
  clearInterval(tick)
  if (!timerStart.value) return
  const upd = () => { draft.seconds = Math.round((Date.now() - new Date(timerStart.value)) / 1000) }
  upd()
  tick = setInterval(upd, 1000)
}
watch(timerStart, runTick, { immediate: true })
onBeforeUnmount(() => clearInterval(tick))
function toggleTimer () {
  const s = session.value
  if (!s) return
  if (timerStart.value) {
    draft.seconds = Math.round((Date.now() - new Date(timerStart.value)) / 1000)
    s.climbTimer = null
  } else {
    s.climbTimer = { startedAt: new Date(Date.now() - (draft.seconds || 0) * 1000).toISOString(), itemIndex: props.itemIndex }
  }
  persist()
}

const canLog = computed(() => !!draft.grade && grades.value.includes(draft.grade))
const fresh = ref(null)
function log () {
  if (!canLog.value || !session.value) return null
  if (timerStart.value) toggleTimer()
  const climb = {
    kind: kind.value,
    system: system.value,
    grade: draft.grade,
    rank: rankOf(draft.grade, system.value, state.data.settings),
    wall: draft.wall.trim(),
    result: draft.result,
    attempts: draft.result === 'flash' ? 1 : Math.max(1, draft.attempts || 1),
    seconds: Math.round(draft.seconds || 0),
    note: draft.note.trim(),
    gym: gymId.value
  }
  if (kind.value === 'route') climb.style = draft.style
  const row = logSet(session.value.id, {
    exerciseId: props.exerciseId,
    itemIndex: props.itemIndex,
    setIndex: mine.value.length,
    load: null,
    unit: null,
    reps: null,
    seconds: null,
    climb
  })
  const record = recordIds.value.has(row.id)
  fresh.value = row.id
  setTimeout(() => { if (fresh.value === row.id) fresh.value = null }, 1200)
  buzz(record ? 220 : 30)
  const what = `${climb.grade} · ${t(RESULT_LABEL[climb.result])}`
  toast(record ? '🏆 ' + t('New hardest send!') + ' ' + what : t('{what} logged', { what }), {
    actionLabel: t('Undo'), action: () => deleteSet(session.value.id, row.id)
  })
  resetDraft()
  emit('logged', row)
  return row
}

// ── Change a logged climb ──
const editOpen = ref(false)
const editId = ref(null)
// A climb keeps its own gym's grades, even if you've moved gyms since
const editSystem = computed(() => mine.value.find(x => x.id === editId.value)?.climb.system || system.value)
const editGrades = computed(() => gradeList(editSystem.value, state.data.settings))
const editDraft = reactive({ grade: '', wall: '', result: 'send', attempts: 1, seconds: 0, note: '', style: 'toprope' })
function openEdit (s) {
  editId.value = s.id
  Object.assign(editDraft, { style: 'toprope', ...s.climb })
  editOpen.value = true
}
function saveEdit () {
  const s = mine.value.find(x => x.id === editId.value)
  if (!s) { editOpen.value = false; return }
  const sys = s.climb.system
  const climb = {
    ...s.climb,
    grade: editDraft.grade,
    rank: rankOf(editDraft.grade, sys, state.data.settings),
    wall: (editDraft.wall || '').trim(),
    result: editDraft.result,
    attempts: editDraft.result === 'flash' ? 1 : Math.max(1, editDraft.attempts || 1),
    seconds: Math.round(editDraft.seconds || 0),
    note: (editDraft.note || '').trim()
  }
  if (kind.value === 'route') climb.style = editDraft.style
  updateSet(session.value.id, s.id, { climb })
  editOpen.value = false
  toast(t('Climb updated'))
}
function removeEdit () {
  const s = mine.value.find(x => x.id === editId.value)
  editOpen.value = false
  if (!s) return
  deleteSet(session.value.id, s.id)
  toast(t('Climb deleted'), { actionLabel: t('Undo'), action: () => { session.value.sets.push(s); persist() } })
}

function gradeStyle (g) {
  const c = swatch(g)
  return c ? { background: c, color: ['#F4F5F7', '#F2C230'].includes(c) ? '#15202E' : '#fff' } : null
}

defineExpose({ canLog, log })
</script>

<style scoped>
.cp { margin-top: 14px; }
.gyms { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 -16px 10px; padding: 2px 16px 4px; }
.gyms::-webkit-scrollbar { display: none; }
.gym-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 20px; background: var(--card); color: var(--ink-2); font-weight: 600; font-size: 15px; }
.gym-chip.on { background: var(--ink); color: var(--paper); }
.totals { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px 14px; background: var(--card); border-radius: var(--r-card); }
.list { display: grid; gap: 6px; margin-top: 10px; }
.climb { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--card); border-radius: 14px; text-align: left; min-height: 60px; }
.climb.fresh { animation: cIn 420ms cubic-bezier(.2,.8,.3,1.2); }
@keyframes cIn { from { transform: scale(0.94); opacity: 0.4; } }
.grade { min-width: 54px; height: 40px; padding: 0 8px; border-radius: 10px; display: grid; place-items: center; background: var(--ink); color: var(--paper); font-size: 19px; font-weight: 700; }
.climb.project .grade { background: var(--card-2); color: var(--ink-2); }
.txt { display: grid; min-width: 0; }
.res { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 15px; }
.climb.flash .res { color: var(--warn); }
.climb.send .res { color: var(--ok); }
.climb.project .res { color: var(--ink-2); }
.rec { color: var(--warn); flex: 0 0 auto; }
.empty { margin: 12px 4px 0; }
@media (prefers-reduced-motion: reduce) { .climb.fresh { animation: none; } }
</style>
