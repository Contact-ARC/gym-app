<template>
  <div class="page">
    <header class="row head">
      <h1 class="t-title grow">Progress</h1>
      <RouterLink to="/history" class="btn btn-sm btn-soft"><Icon name="history" :size="20" />History</RouterLink>
    </header>

    <div v-if="!finishedSessions.length" class="card card-pad empty">
      <p class="t-h3">Your charts start after your first workout</p>
      <p class="t-small t-muted">Finish a session and you'll see your strength trend, records and how often you train.</p>
    </div>

    <template v-else>
      <!-- Consistency -->
      <h2 class="section-h">Last 12 weeks</h2>
      <div class="card card-pad">
        <div class="heat" role="img" :aria-label="`${trainedDays} training days in the last 12 weeks`">
          <div v-for="(col, ci) in heat" :key="ci" class="heat-col">
            <div v-for="cell in col" :key="cell.key" class="heat-cell" :class="{ on: cell.on, today: cell.today, future: cell.future }" />
          </div>
        </div>
        <div class="row heat-sum">
          <div class="grow"><span class="t-num big">{{ trainedDays }}</span> <span class="t-small t-muted">training day{{ trainedDays === 1 ? '' : 's' }}</span></div>
          <div><span class="t-num big">{{ perWeek }}</span> <span class="t-small t-muted">per week</span></div>
        </div>
      </div>

      <!-- Per exercise -->
      <h2 class="section-h">Strength</h2>
      <button class="group group-row picker" @click="pickerOpen = true">
        <div class="grow">
          <div class="t-tiny t-muted">Exercise</div>
          <div class="t-h3 truncate">{{ exName(exerciseId) }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>

      <div v-if="exerciseId && points.length" class="card card-pad chart-card">
        <div class="row kpis">
          <div class="kpi grow">
            <div class="t-tiny t-muted">{{ exUnit === 'pin' ? 'Heaviest pin' : 'Best estimated max' }}</div>
            <div class="t-num kv">{{ fmtLoad(exUnit === 'pin' ? bestTop : bestE, exUnit) }}</div>
          </div>
          <div class="kpi">
            <div class="t-tiny t-muted">Since first time</div>
            <div class="t-num kv" :class="changeClass">{{ changeStr }}</div>
          </div>
        </div>
        <div v-if="points.length > 1" class="chart">
          <Line :data="lineData" :options="lineOptions" />
        </div>
        <p v-else class="t-small t-muted one">One more session and you'll see a trend line.</p>
        <button class="btn btn-ghost btn-sm table-btn" @click="showTable = !showTable">{{ showTable ? 'Hide' : 'Show' }} the numbers</button>
        <table v-if="showTable" class="tbl t-num">
          <thead><tr><th>Date</th><th>Best set</th><th>Est. max</th></tr></thead>
          <tbody>
            <tr v-for="p in [...points].reverse()" :key="p.date">
              <td>{{ shortDate(p.date) }}</td><td>{{ p.topStr }}</td><td>{{ fmtLoad(p.e1rm, exUnit) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="t-tiny t-muted explain">
          Estimated max is what you could lift once, worked out from your weight and reps. Use it to see the trend, not as a target to test.
        </p>
      </div>

      <!-- Muscle balance -->
      <h2 class="section-h">Sets per muscle, last 7 days</h2>
      <div class="card card-pad">
        <div v-if="muscleRows.length" :style="{ height: 30 * muscleRows.length + 36 + 'px' }">
          <Bar :data="barData" :options="barOptions" />
        </div>
        <p v-else class="t-small t-muted">No sets in the last 7 days.</p>
        <p class="t-tiny t-muted explain">Main muscle counts as 1 set, helping muscles as half. Around 10–20 sets a week per muscle is a common target.</p>
      </div>

      <!-- Records -->
      <h2 class="section-h">Records</h2>
      <div class="group">
        <button v-for="r in records" :key="r.id" class="group-row" @click="select(r.id)">
          <span class="grow t-h3 truncate">{{ r.name }}</span>
          <span class="t-num rec">{{ fmtLoad(r.e1rm, r.unit) }}</span>
        </button>
      </div>
    </template>

    <ExercisePicker v-model="pickerOpen" title="Show progress for" :only-ids="loggedIds" @pick="select" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Tooltip, Legend
} from 'chart.js'
import Icon from '../ui/Icon.vue'
import ExercisePicker from '../ui/ExercisePicker.vue'
import { state, finishedSessions, exercisesById, historyFor } from '../store.js'
import { bestE1RM, heaviest, fmtLoad, unitFor, setsPerMuscle, dateKey, convertLoad } from '../lib/training.js'
import { muscleLabel } from '../lib/format.js'
import { useChartTheme } from '../lib/chartTheme.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, BarElement, Tooltip, Legend)
ChartJS.defaults.font.family = 'Barlow, system-ui, sans-serif'
ChartJS.defaults.font.size = 13

const route = useRoute()
const ct = useChartTheme()
const showTable = ref(false)
const pickerOpen = ref(false)
const unit = computed(() => state.data.profile.unit)
const exName = (id) => exercisesById.value[id]?.name || id || 'Choose an exercise'

// ── Heatmap: 12 columns (weeks), 7 rows (Mon–Sun) ──
const trainedSet = computed(() => new Set(finishedSessions.value.map(s => dateKey(s.startedAt))))
const heat = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(today); start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7 * 11)
  return Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = new Date(start); day.setDate(start.getDate() + w * 7 + d)
    const key = dateKey(day)
    return { key, on: trainedSet.value.has(key), today: key === dateKey(today), future: day > today }
  }))
})
const trainedDays = computed(() => heat.value.flat().filter(c => c.on).length)
const perWeek = computed(() => {
  const first = finishedSessions.value[finishedSessions.value.length - 1]
  const weeks = first ? Math.min(12, Math.max(1, Math.ceil((Date.now() - new Date(first.startedAt)) / (7 * 86400000)))) : 12
  return (trainedDays.value / weeks).toFixed(1)
})

// ── Exercise trend ──
const loggedIds = computed(() => [...new Set(finishedSessions.value.flatMap(s => s.sets.map(x => x.exerciseId)))])
const exerciseId = ref(route.query.exercise || null)
watch(loggedIds, (ids) => {
  if (!exerciseId.value && ids.length) {
    // Default to the exercise you've done most often
    const counts = {}
    for (const s of finishedSessions.value) for (const x of s.sets) counts[x.exerciseId] = (counts[x.exerciseId] || 0) + 1
    exerciseId.value = ids.slice().sort((a, b) => counts[b] - counts[a])[0]
  }
}, { immediate: true })
function select (id) {
  exerciseId.value = id
  showTable.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const exUnit = computed(() => unitFor(exercisesById.value[exerciseId.value], state.data.profile))
const points = computed(() => {
  if (!exerciseId.value) return []
  return historyFor(exerciseId.value).slice().reverse().map(h => {
    const weighted = h.sets.filter(s => s.reps && s.load > 0)
    const top = weighted.reduce((b, s) => (!b || convertLoad(s.load, s.unit, unit.value) > convertLoad(b.load, b.unit, unit.value) ? s : b), null)
    return {
      date: h.date,
      e1rm: bestE1RM(h.sets, unit.value),
      top: heaviest(h.sets, unit.value),
      topStr: top ? `${fmtLoad(top.load, top.unit)} × ${top.reps}` : h.sets.map(s => (s.reps ? `BW × ${s.reps}` : `${s.seconds}s`)).join(', ')
    }
  })
})
const bestE = computed(() => Math.max(0, ...points.value.map(p => p.e1rm)))
const bestTop = computed(() => Math.max(0, ...points.value.map(p => p.top)))
const change = computed(() => {
  const key = exUnit.value === 'pin' ? 'top' : 'e1rm'
  const p = points.value.filter(x => x[key] > 0)
  if (p.length < 2) return null
  return ((p[p.length - 1][key] - p[0][key]) / p[0][key]) * 100
})
const changeStr = computed(() => (change.value == null ? '–' : `${change.value >= 0 ? '+' : ''}${change.value.toFixed(0)}%`))
const changeClass = computed(() => (change.value > 0 ? 't-ok' : change.value < 0 ? 't-err' : ''))
const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

const lineData = computed(() => ({
  labels: points.value.map(p => shortDate(p.date)),
  datasets: [
    ...(exUnit.value === 'pin' ? [] : [{ label: 'Estimated max', data: points.value.map(p => p.e1rm || null), borderColor: ct.value.series[0], backgroundColor: ct.value.series[0] }]),
    { label: 'Heaviest set', data: points.value.map(p => p.top || null), borderColor: ct.value.series[1], backgroundColor: ct.value.series[1] }
  ].map(d => ({
    ...d, borderWidth: 2, tension: 0.25, spanGaps: true,
    pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2, pointBorderColor: ct.value.surface
  }))
}))
const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: exUnit.value !== 'pin', position: 'top', align: 'start', labels: { color: ct.value.ink, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14 } },
    tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (c) => `${c.dataset.label}: ${fmtLoad(c.parsed.y, exUnit.value)}` } }
  },
  scales: {
    x: { ticks: { color: ct.value.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false }, border: { display: false } },
    y: { ticks: { color: ct.value.ink, maxTicksLimit: 5 }, grid: { color: ct.value.grid }, border: { display: false } }
  }
}))

// ── Muscle balance ──
const muscleRows = computed(() => {
  const cutoff = Date.now() - 7 * 86400000
  const recent = finishedSessions.value.filter(s => new Date(s.startedAt).getTime() >= cutoff)
  return Object.entries(setsPerMuscle(recent, exercisesById.value)).sort((a, b) => b[1] - a[1])
})
const barData = computed(() => ({
  labels: muscleRows.value.map(([m]) => muscleLabel(m)),
  datasets: [{
    label: 'Sets', data: muscleRows.value.map(([, v]) => v),
    backgroundColor: ct.value.series[0], borderRadius: 4, borderSkipped: 'start', barPercentage: 0.72, categoryPercentage: 0.9
  }]
}))
const barOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (c) => `${c.parsed.x} sets` } } },
  scales: {
    x: { ticks: { color: ct.value.ink, precision: 0 }, grid: { color: ct.value.grid }, border: { display: false }, beginAtZero: true },
    y: { ticks: { color: ct.value.ink }, grid: { display: false }, border: { display: false } }
  }
}))

// ── Records ──
const records = computed(() => loggedIds.value.map(id => {
  const sets = historyFor(id).flatMap(h => h.sets)
  const u = unitFor(exercisesById.value[id], state.data.profile)
  return { id, name: exName(id), e1rm: u === 'pin' ? heaviest(sets, unit.value) : bestE1RM(sets, unit.value), unit: u }
}).filter(r => r.e1rm > 0).sort((a, b) => a.name.localeCompare(b.name)))
</script>

<style scoped>
.head { margin-top: 8px; }
.empty { margin-top: 20px; }
.empty p + p { margin-top: 6px; }

.heat { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; }
.heat-col { display: grid; grid-template-rows: repeat(7, 1fr); gap: 4px; }
.heat-cell { aspect-ratio: 1; border-radius: 4px; background: var(--card-2); }
.heat-cell.on { background: var(--ink); }
.heat-cell.future { background: transparent; }
.heat-cell.today { box-shadow: inset 0 0 0 2px var(--ink-3); }
.heat-sum { margin-top: 14px; }
.big { font-size: 26px; font-weight: 700; }

.picker { width: 100%; }
.chart-card { margin-top: 10px; }
.kpis { align-items: flex-start; }
.kv { font-size: 30px; font-weight: 700; line-height: 1.1; }
.kpi:last-child { text-align: right; }
.chart { height: 240px; margin-top: 14px; }
.one { margin-top: 12px; }
.table-btn { margin-top: 8px; padding: 0 8px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 17px; margin-top: 6px; }
.tbl th { text-align: left; font-family: var(--font); font-size: 13px; font-weight: 600; color: var(--ink-2); padding: 6px 4px; }
.tbl td { padding: 8px 4px; border-top: 1px solid var(--line); }
.explain { margin-top: 12px; }
.rec { font-size: 19px; font-weight: 600; }
</style>
