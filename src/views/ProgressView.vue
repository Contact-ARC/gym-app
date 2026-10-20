<template>
  <div class="page">
    <div class="d-flex align-center">
      <div class="page-title flex-grow-1">Progress</div>
      <v-btn variant="text" to="/history" prepend-icon="mdi-history">History</v-btn>
    </div>

    <div v-if="!finishedSessions.length" class="text-body-2 muted mt-6">
      Finish your first workout and your charts will show up here.
    </div>

    <template v-else>
      <!-- Consistency -->
      <div class="section-label">Consistency · last 12 weeks</div>
      <div class="heat-grid" role="img" :aria-label="`${trainedDays} training days in the last 12 weeks`">
        <div v-for="(col, ci) in heat" :key="ci" class="heat-col">
          <div v-for="cell in col" :key="cell.key" class="heat-cell" :class="{ on: cell.on, today: cell.today }" :title="cell.key" />
        </div>
      </div>
      <div class="text-caption muted mt-1">{{ trainedDays }} training day{{ trainedDays === 1 ? '' : 's' }} · {{ perWeek }} per week on average</div>

      <!-- Per exercise -->
      <div class="section-label">Exercise</div>
      <v-select v-model="exerciseId" :items="loggedExercises" item-title="name" item-value="id" label="Exercise" />

      <template v-if="exerciseId && points.length">
        <div class="d-flex ga-2 my-3">
          <v-card variant="tonal" class="flex-1 pa-3">
            <div class="text-caption muted">Best est. 1RM</div>
            <div class="text-h6 tabular">{{ fmtLoad(bestE, exUnit) }}</div>
          </v-card>
          <v-card variant="tonal" class="flex-1 pa-3">
            <div class="text-caption muted">Change</div>
            <div class="text-h6 tabular">{{ changeStr }}</div>
          </v-card>
          <v-card variant="tonal" class="flex-1 pa-3">
            <div class="text-caption muted">Sessions</div>
            <div class="text-h6 tabular">{{ points.length }}</div>
          </v-card>
        </div>
        <div v-if="points.length > 1" style="height: 240px">
          <Line :data="lineData" :options="lineOptions" />
        </div>
        <div v-else class="text-body-2 muted">One more session and you'll get a trend line.</div>
        <v-btn variant="text" size="small" class="px-0 mt-1" @click="showTable = !showTable">
          {{ showTable ? 'Hide' : 'Show' }} table
        </v-btn>
        <v-table v-if="showTable" density="compact" class="tabular">
          <thead><tr><th>Date</th><th>Top set</th><th>Est. 1RM</th></tr></thead>
          <tbody>
            <tr v-for="p in [...points].reverse()" :key="p.date">
              <td>{{ shortDate(p.date) }}</td>
              <td>{{ p.topStr }}</td>
              <td>{{ fmtLoad(p.e1rm, exUnit) }}</td>
            </tr>
          </tbody>
        </v-table>
        <div class="text-caption muted mt-2">
          Est. 1RM is calculated from reps × weight (plus reps in reserve when you log them). It's a trend tool, not a max-out prediction.
        </div>
      </template>

      <!-- Muscle balance -->
      <div class="section-label">Sets per muscle · last 7 days</div>
      <div v-if="muscleRows.length" :style="{ height: 28 * muscleRows.length + 40 + 'px' }">
        <Bar :data="barData" :options="barOptions" />
      </div>
      <div v-else class="text-body-2 muted">No sets in the last 7 days.</div>
      <div class="text-caption muted mt-1">Main muscle = 1 set, assisting muscle = ½ set. Roughly 10–20 sets a week per muscle is a common target range.</div>

      <!-- Records -->
      <div class="section-label">Records</div>
      <v-list bg-color="transparent" density="compact" class="pa-0">
        <v-list-item
          v-for="r in records" :key="r.id" :title="r.name" rounded="lg"
          @click="exerciseId = r.id"
        >
          <template #append>
            <span class="tabular text-body-2">{{ fmtLoad(r.e1rm, r.unit) }}</span>
          </template>
        </v-list-item>
      </v-list>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, BarElement, Tooltip, Legend, Filler
} from 'chart.js'
import { state, finishedSessions, exercisesById, historyFor } from '../store.js'
import { bestE1RM, heaviest, fmtLoad, unitFor, setsPerMuscle, dateKey, convertLoad } from '../lib/training.js'
import { muscleLabel } from '../lib/format.js'
import { useChartTheme } from '../lib/chartTheme.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, BarElement, Tooltip, Legend, Filler)

const route = useRoute()
const ct = useChartTheme()
const showTable = ref(false)
const unit = computed(() => state.data.profile.unit)

// ── Heatmap ──
const trainedSet = computed(() => new Set(finishedSessions.value.map(s => dateKey(s.startedAt))))
const heat = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const mondayOffset = (today.getDay() + 6) % 7
  const start = new Date(today); start.setDate(today.getDate() - mondayOffset - 7 * 11)
  const cols = []
  for (let w = 0; w < 12; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d)
      const key = dateKey(day)
      col.push({ key, on: trainedSet.value.has(key), today: key === dateKey(today) })
    }
    cols.push(col)
  }
  return cols
})
const trainedDays = computed(() => heat.value.flat().filter(c => c.on).length)
const perWeek = computed(() => (trainedDays.value / 12).toFixed(1))

// ── Exercise trend ──
const loggedExercises = computed(() => {
  const ids = new Set(finishedSessions.value.flatMap(s => s.sets.map(x => x.exerciseId)))
  return [...ids].map(id => ({ id, name: exercisesById.value[id]?.name || id })).sort((a, b) => a.name.localeCompare(b.name))
})
const exerciseId = ref(route.query.exercise || null)
watch(loggedExercises, (list) => {
  if (!exerciseId.value && list.length) exerciseId.value = list[0].id
}, { immediate: true })

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
      topStr: top ? `${fmtLoad(top.load, top.unit)} × ${top.reps}` : h.sets.map(s => s.reps ? `BW×${s.reps}` : `${s.seconds}s`).join(', ')
    }
  }).filter(p => p.e1rm > 0 || p.topStr)
})
const bestE = computed(() => Math.max(0, ...points.value.map(p => p.e1rm)))
const changeStr = computed(() => {
  const p = points.value.filter(x => x.e1rm > 0)
  if (p.length < 2) return '—'
  const d = p[p.length - 1].e1rm - p[0].e1rm
  const pct = (d / p[0].e1rm) * 100
  return `${d >= 0 ? '+' : ''}${pct.toFixed(0)}%`
})

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

const lineData = computed(() => ({
  labels: points.value.map(p => shortDate(p.date)),
  datasets: [
    {
      label: 'Est. 1RM', data: points.value.map(p => p.e1rm || null),
      borderColor: ct.value.series[0], backgroundColor: ct.value.series[0],
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0.25, spanGaps: true
    },
    {
      label: 'Heaviest set', data: points.value.map(p => p.top || null),
      borderColor: ct.value.series[1], backgroundColor: ct.value.series[1],
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0.25, spanGaps: true
    }
  ]
}))

const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'top', align: 'start', labels: { color: ct.value.ink, boxWidth: 12, boxHeight: 12, usePointStyle: true } },
    tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtLoad(c.parsed.y, exUnit.value)}` } }
  },
  scales: {
    x: { ticks: { color: ct.value.ink, maxRotation: 0, autoSkip: true }, grid: { display: false } },
    y: { ticks: { color: ct.value.ink }, grid: { color: ct.value.grid }, title: { display: true, text: exUnit.value, color: ct.value.ink } }
  }
}))

// ── Muscle balance ──
const muscleRows = computed(() => {
  const cutoff = Date.now() - 7 * 86400000
  const recent = finishedSessions.value.filter(s => new Date(s.startedAt).getTime() >= cutoff)
  const counts = setsPerMuscle(recent, exercisesById.value)
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})
const barData = computed(() => ({
  labels: muscleRows.value.map(([m]) => muscleLabel(m)),
  datasets: [{
    label: 'Sets', data: muscleRows.value.map(([, v]) => v),
    backgroundColor: ct.value.series[0], borderRadius: 4, borderSkipped: 'start', barPercentage: 0.7
  }]
}))
const barOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.x} sets` } } },
  scales: {
    x: { ticks: { color: ct.value.ink, precision: 0 }, grid: { color: ct.value.grid }, beginAtZero: true },
    y: { ticks: { color: ct.value.ink }, grid: { display: false } }
  }
}))

// ── Records ──
const records = computed(() => loggedExercises.value.map(({ id, name }) => {
  const sets = historyFor(id).flatMap(h => h.sets)
  return { id, name, e1rm: bestE1RM(sets, unit.value), unit: unitFor(exercisesById.value[id], state.data.profile) }
}).filter(r => r.e1rm > 0).sort((a, b) => a.name.localeCompare(b.name)))
</script>

<style scoped>
.flex-1 { flex: 1 1 0; }
</style>
