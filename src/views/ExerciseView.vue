<template>
  <div class="page" v-if="ex">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="back"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ tx(ex, 'name') }}</h1>
    <div v-if="ex.custom" class="row own">
      <span class="tag tag-mine">{{ t('Your exercise') }}</span>
      <span v-if="ex.hidden" class="tag tag-edit">{{ t('Deleted') }}</span>
      <span class="grow" />
      <button class="btn btn-sm btn-soft" @click="editOpen = true"><Icon name="edit" :size="18" />{{ t('Edit') }}</button>
    </div>

    <Segmented v-model="tab" class="tabs" :options="[{ label: t('Your progress'), value: 'progress' }, { label: t('How to do it'), value: 'how' }]" :label="t('View')" />

    <!-- ── Your progress ── -->
    <template v-if="tab === 'progress'">
      <div v-if="!history.length" class="card card-pad empty">
        <p class="t-h3">{{ t("You haven't logged this one yet") }}</p>
        <p class="t-small t-muted">{{ t('Your trend, records and every session will show here after the first time.') }}</p>
      </div>

      <template v-else>
        <!-- Headline -->
        <div class="card card-pad head-card">
          <div class="t-tiny t-muted">{{ headLabel }}</div>
          <div class="row head-row">
            <span class="t-num head-v">{{ headValue }}</span>
            <span v-if="trend" class="trend t-small" :class="trend.cls">{{ trend.text }}</span>
          </div>
          <div class="t-small t-muted head-sub">
            <template v-if="next">{{ t('Last done {when}', { when: relativeDay(history[0].date) }) }}</template>
            <template v-else>{{ t('Last time') }}, {{ relativeDay(history[0].date) }}: <span class="t-num">{{ lastBest }}</span></template>
          </div>
          <div v-if="next" class="next t-small">
            <Icon :name="next.icon" :size="18" /><span>{{ next.text }}</span>
          </div>
        </div>

        <!-- Chart -->
        <div class="card card-pad chart-card">
          <div class="row chart-top">
            <div class="chips" role="tablist" :aria-label="t('What to show')">
              <button v-for="m in metrics" :key="m.value" class="chip" :class="{ on: metric === m.value }" role="tab" :aria-selected="metric === m.value" @click="metric = m.value">{{ m.label }}</button>
            </div>
          </div>
          <div v-if="series.length > 1" class="chart"><Line :data="lineData" :options="lineOptions" /></div>
          <p v-else class="t-small t-muted one">{{ series.length ? t("One more session in this range and you'll see a trend line.") : t('Nothing in this range yet.') }}</p>
          <div class="chips ranges" role="tablist" :aria-label="t('Time range')">
            <button v-for="r in ranges" :key="r.value" class="chip sm" :class="{ on: range === r.value }" role="tab" :aria-selected="range === r.value" @click="range = r.value">{{ r.label }}</button>
          </div>
          <p v-if="metric === 'e1rm'" class="t-tiny t-muted explain">{{ t('Estimated max is what you could lift once, worked out from your weight and reps. Use it to see the trend, not as a target to test.') }}</p>
        </div>

        <!-- Records -->
        <h2 class="section-h">{{ t('Records') }}</h2>
        <div class="group">
          <div v-for="r in bests" :key="r.label" class="group-row">
            <span class="grow">{{ r.label }}</span>
            <span class="t-small t-muted rec-when">{{ r.date ? relativeDay(r.date) : '' }}</span>
            <b class="t-num rec-v">{{ r.value }}</b>
          </div>
        </div>
        <template v-if="records.length">
          <h2 class="section-h">{{ t('Rep records') }}</h2>
          <p class="t-small t-muted rec-help">{{ unit === 'pin' ? t('Most reps you\'ve done at each pin, or heavier.') : t('Most reps you\'ve done at each weight, or heavier.') }}</p>
          <div class="group">
            <div v-for="r in records.slice(0, showAllRecords ? 50 : 6)" :key="r.load" class="group-row">
              <span class="t-num rec-load">{{ r.load ? fmtLoad(r.load, unit) : t('Bodyweight') }}</span>
              <span class="grow t-small t-muted">{{ r.date ? relativeDay(r.date) : '' }}</span>
              <b class="t-num rec-v">{{ tn(r.reps, '{n} rep', '{n} reps') }}</b>
            </div>
          </div>
          <button v-if="records.length > 6" class="btn btn-ghost btn-sm more" @click="showAllRecords = !showAllRecords">{{ showAllRecords ? t('Show fewer') : t('See all {n}', { n: records.length }) }}</button>
        </template>

        <!-- Every session -->
        <h2 class="section-h">{{ tn(history.length, '{n} session', '{n} sessions') }}</h2>
        <div class="group">
          <RouterLink v-for="h in history.slice(0, showAllSessions ? 500 : 8)" :key="h.sessionId" :to="`/summary/${h.sessionId}`" class="group-row sess">
            <div class="grow">
              <div class="t-small t-muted">{{ fmtShort(h.date) }}</div>
              <div class="t-num sets-line">{{ compact(workSetsOf(h)) }}</div>
            </div>
            <Icon name="chevronRight" class="chev" />
          </RouterLink>
        </div>
        <button v-if="history.length > 8" class="btn btn-ghost btn-sm more" @click="showAllSessions = !showAllSessions">{{ showAllSessions ? t('Show fewer') : t('See all {n}', { n: history.length }) }}</button>
      </template>
    </template>

    <!-- ── How to do it ── -->
    <template v-else>
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
    <div class="topbar"><button class="icon-btn" :aria-label="t('Back')" @click="back"><Icon name="back" /></button></div>
    <p class="t-h2">{{ t("This exercise isn't in the library") }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import Icon from '../ui/Icon.vue'
import Segmented from '../ui/Segmented.vue'
import { toast } from '../ui/toast.js'
import ExerciseDetails from '../ui/ExerciseDetails.vue'
import MachineSettingsSheet from '../ui/MachineSettingsSheet.vue'
import CustomExerciseSheet from '../ui/CustomExerciseSheet.vue'
import Sheet from '../ui/Sheet.vue'
import { state, exercisesById, historyFor, setExerciseNote, hideCustomExercise, days, suggestionFor } from '../store.js'
import { relativeDay, fmtNum } from '../lib/format.js'
import { bestE1RM, heaviest, fmtLoad, unitFor, repRecords, bestSeconds, setVolume, isWorkSet } from '../lib/training.js'
import { useChartTheme } from '../lib/chartTheme.js'
import { t, tn, tx, locale } from '../i18n/index.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

const route = useRoute()
const router = useRouter()
const ct = useChartTheme()
const ex = computed(() => exercisesById.value[route.params.id])
const unit = computed(() => unitFor(ex.value, state.data.profile))
const myUnit = computed(() => state.data.profile.unit)
const machine = computed(() => state.data.machineSettings[ex.value?.id] || [])
const msOpen = ref(false)
const editOpen = ref(false)
const delOpen = ref(false)

function back () {
  if (window.history.state?.back) router.back()
  else router.replace('/library')
}
function del () {
  hideCustomExercise(ex.value.id)
  delOpen.value = false
  toast(t('Exercise deleted'))
  back()
}
const alternatives = computed(() => (ex.value?.alternatives || []).map(id => exercisesById.value[id]).filter(Boolean))
const history = computed(() => (ex.value ? historyFor(ex.value.id) : []))
const workSetsOf = (h) => h.sets.filter(isWorkSet)

// Your progress first when there is some; ?tab=how opens the how-to
const tab = ref(route.query.tab === 'how' ? 'how' : 'progress')
watch(() => route.params.id, () => {
  tab.value = route.query.tab === 'how' || !historyFor(route.params.id).length ? 'how' : 'progress'
  showAllRecords.value = false
  showAllSessions.value = false
}, { immediate: false })
if (!history.value.length && route.query.tab !== 'progress') tab.value = 'how'

// ── Per-session numbers ──
const kind = computed(() => {
  if (unit.value === 'pin') return 'pin'
  const sets = history.value.flatMap(workSetsOf)
  if (sets.some(s => s.load > 0 && s.reps)) return 'load'
  if (sets.some(s => s.seconds)) return 'time'
  return 'reps'
})
const points = computed(() => [...history.value].reverse().map(h => {
  const sets = workSetsOf(h)
  return {
    date: h.date,
    e1rm: kind.value === 'load' ? bestE1RM(sets, myUnit.value) : 0,
    top: heaviest(sets, myUnit.value),
    volume: Math.round(sets.reduce((n, s) => n + setVolume(s, myUnit.value), 0)),
    reps: Math.max(0, ...sets.map(s => s.reps || 0)),
    secs: bestSeconds(sets)
  }
}))

const metrics = computed(() => {
  switch (kind.value) {
    case 'load': return [{ label: t('Est. max'), value: 'e1rm' }, { label: t('Heaviest'), value: 'top' }, { label: t('Volume'), value: 'volume' }, { label: t('Reps'), value: 'reps' }]
    case 'pin': return [{ label: t('Heaviest pin'), value: 'top' }, { label: t('Reps'), value: 'reps' }]
    case 'time': return [{ label: t('Longest'), value: 'secs' }]
    default: return [{ label: t('Reps'), value: 'reps' }]
  }
})
const metric = ref('e1rm')
watch(metrics, (m) => { if (!m.some(x => x.value === metric.value)) metric.value = m[0].value }, { immediate: true })

const ranges = computed(() => [
  { label: t('3 months'), value: 91 }, { label: t('6 months'), value: 182 }, { label: t('1 year'), value: 365 }, { label: t('All'), value: 0 }
])
const range = ref(182)
const series = computed(() => {
  const from = range.value ? Date.now() - range.value * 86400000 : 0
  return points.value.filter(p => new Date(p.date).getTime() >= from && p[metric.value] > 0)
})

const fmtMetric = (m, v) => {
  if (m === 'volume') return `${fmtNum(v, 0)} ${myUnit.value}`
  if (m === 'reps') return tn(v, '{n} rep', '{n} reps')
  if (m === 'secs') return `${v} s`
  return fmtLoad(v, unit.value === 'pin' ? 'pin' : myUnit.value)
}

// ── Headline ──
const headMetric = computed(() => ({ load: 'e1rm', pin: 'top', time: 'secs', reps: 'reps' })[kind.value])
const headLabel = computed(() => ({ load: t('Best estimated max'), pin: t('Heaviest pin'), time: t('Longest set'), reps: t('Most reps') })[kind.value])
const headValue = computed(() => fmtMetric(headMetric.value, Math.max(0, ...points.value.map(p => p[headMetric.value]))))
/** Change over the chosen range: "+7.5 kg in 8 weeks" */
const trend = computed(() => {
  const m = headMetric.value
  const from = range.value ? Date.now() - range.value * 86400000 : 0
  const p = points.value.filter(x => x[m] > 0 && new Date(x.date).getTime() >= from)
  if (p.length < 2) return null
  const diff = p[p.length - 1][m] - p[0][m]
  const weeks = Math.max(1, Math.round((new Date(p[p.length - 1].date) - new Date(p[0].date)) / (7 * 86400000)))
  const amount = m === 'reps' ? tn(Math.abs(diff), '{n} rep', '{n} reps') : m === 'secs' ? `${Math.abs(diff)} s` : fmtLoad(Math.round(Math.abs(diff) * 10) / 10, unit.value === 'pin' ? 'pin' : myUnit.value)
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±'
  return {
    text: tn(weeks, '{change} in {n} week', '{change} in {n} weeks', { change: `${sign}${amount}` }),
    cls: diff > 0 ? 'up' : diff < 0 ? 'down' : ''
  }
})
const lastBest = computed(() => {
  const sets = workSetsOf(history.value[0] || { sets: [] })
  return compact(sets)
})
// What the app would suggest next time, if this exercise is in one of your days
const next = computed(() => {
  for (const d of days.value) {
    const it = d.items.find(i => i.exerciseId === ex.value?.id)
    if (it) {
      const s = suggestionFor(it)
      const icon = { up: 'up', down: 'down', deload: 'deload', start: 'start' }[s.kind] || 'same'
      return { text: t('Next time ({day}): {text}', { day: d.id, text: s.text }), icon }
    }
  }
  return null
})

// ── Chart ──
const fmtShort = (iso) => new Date(iso).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })
const shortDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
const lineData = computed(() => ({
  labels: series.value.map(p => shortDate(p.date)),
  datasets: [{
    label: metrics.value.find(m => m.value === metric.value)?.label,
    data: series.value.map(p => p[metric.value]),
    borderColor: ct.value.series[0], backgroundColor: ct.value.dark ? 'rgba(90,139,224,0.14)' : 'rgba(36,87,181,0.10)',
    fill: true, borderWidth: 2.5, cubicInterpolationMode: 'monotone', pointRadius: 3.5, pointHoverRadius: 6, pointBorderWidth: 2, pointBorderColor: ct.value.surface
  }]
}))
const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (c) => fmtMetric(metric.value, c.parsed.y) } }
  },
  scales: {
    x: { ticks: { color: ct.value.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 }, grid: { display: false }, border: { display: false } },
    y: { ticks: { color: ct.value.ink, maxTicksLimit: 5 }, grid: { color: ct.value.grid }, border: { display: false } }
  }
}))

// ── Records ──
function bestOf (key) {
  let best = null
  for (const p of points.value) if (p[key] > 0 && (!best || p[key] > best[key])) best = p
  return best
}
const bests = computed(() => {
  const out = []
  const add = (label, key, m) => { const b = bestOf(key); if (b) out.push({ label, value: fmtMetric(m, b[key]), date: b.date }) }
  if (kind.value === 'load') {
    add(t('Best estimated max'), 'e1rm', 'e1rm')
    add(t('Heaviest set'), 'top', 'top')
    add(t('Most volume in a session'), 'volume', 'volume')
  }
  if (kind.value === 'pin') add(t('Heaviest pin'), 'top', 'top')
  add(t('Most reps in a set'), 'reps', 'reps')
  if (kind.value === 'time') add(t('Longest set'), 'secs', 'secs')
  return out
})
const records = computed(() => {
  const sets = history.value.flatMap(h => h.sets.map(s => ({ ...s, date: h.date })))
  return repRecords(sets, myUnit.value)
})
const showAllRecords = ref(false)
const showAllSessions = ref(false)

// ── How to do it: note ──
const note = ref('')
watch(() => route.params.id, (id) => { note.value = state.data.exerciseNotes[id] || '' }, { immediate: true })
function saveNote () {
  if ((state.data.exerciseNotes[ex.value.id] || '') !== note.value) {
    setExerciseNote(ex.value.id, note.value.trim())
    toast(t('Note saved'))
  }
}

/** "62.5 kg × 7, 7, 5, 5" — sets at the same weight share it; a new weight starts a new group. */
function compact (sets) {
  const groups = []
  for (const s of sets) {
    const g = groups[groups.length - 1]
    if (!s.seconds && g && !g.timed && g.load === s.load && g.unit === s.unit) g.parts.push(repsOf(s))
    else if (s.seconds) groups.push({ timed: true, text: setStr(s) })
    else groups.push({ load: s.load, unit: s.unit, parts: [repsOf(s)] })
  }
  return groups.map(g => g.timed ? g.text : `${g.load ? fmtLoad(g.load, g.unit) : t('BW')} × ${g.parts.join(', ')}`).join(' · ')
}
function repsOf (s) {
  const reps = s.repsL != null && s.repsR != null && s.repsL !== s.repsR ? `${s.repsL}/${s.repsR}` : s.reps
  return s.type === 'drop' ? `${reps} ${t('drop')}` : reps
}
function setStr (s) {
  if (s.seconds) return s.load ? t('{load} for {s}s', { load: fmtLoad(s.load, s.unit), s: s.seconds }) : `${s.seconds}s`
  const reps = s.repsL != null && s.repsR != null && s.repsL !== s.repsR ? `${s.repsL}/${s.repsR}` : s.reps
  const tag = s.type === 'drop' ? ' ' + t('drop') : ''
  return `${s.load ? fmtLoad(s.load, s.unit) : t('BW')} × ${reps}${tag}`
}
</script>

<style scoped>
.tabs { margin-top: 16px; }
.settings-btn { width: 100%; }
.own { margin-top: 8px; gap: 8px; }
.own-del { margin-top: 24px; }
.ms-list { display: flex; flex-wrap: wrap; gap: 6px 16px; }
.ms { font-size: 17px; }
.empty { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.head-card { margin-top: 16px; }
.head-row { gap: 12px; align-items: baseline; flex-wrap: wrap; margin-top: 2px; }
.head-v { font-size: 44px; font-weight: 700; line-height: 1.05; }
.trend { font-weight: 700; padding: 2px 10px; border-radius: 999px; background: var(--card-2); color: var(--ink-2); }
.trend.up { background: var(--ok-soft); color: var(--ok); }
.trend.down { background: var(--warn-soft); color: var(--warn); }
.head-sub { margin-top: 6px; }
.next { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.next :deep(svg) { flex: 0 0 auto; margin-top: 2px; color: var(--ink-2); }
.chart-card { margin-top: 10px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { min-height: 36px; padding: 0 12px; border-radius: 18px; background: var(--card-2); color: var(--ink-2); font-weight: 600; font-size: 14px; }
.chip.sm { min-height: 34px; }
.chip.on { background: var(--ink); color: var(--paper); }
.chart { height: 220px; margin-top: 14px; }
.ranges { margin-top: 12px; justify-content: center; }
.one { margin: 18px 0 6px; text-align: center; }
.explain { margin-top: 10px; }
.rec-help { margin: -4px 4px 10px; }
.rec-when { flex: 0 0 auto; }
.rec-load { font-size: 18px; font-weight: 600; min-width: 80px; }
.rec-v { font-size: 18px; min-width: 64px; text-align: right; }
.more { display: block; margin: 6px auto 0; }
.sess { align-items: center; }
.sets-line { font-size: 17px; margin-top: 2px; }
</style>
