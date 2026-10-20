<template>
  <div class="page">
    <header class="row head">
      <h1 class="t-title grow">{{ t('Progress') }}</h1>
      <RouterLink to="/history" class="btn btn-sm btn-soft"><Icon name="history" :size="20" />{{ t('History') }}</RouterLink>
    </header>

    <div class="quick">
      <RouterLink to="/body" class="qcard">
        <Icon name="scale" />
        <div class="grow">
          <div class="t-h3">{{ t('Body') }}</div>
          <div class="t-tiny t-muted truncate">{{ bodyLine }}</div>
        </div>
      </RouterLink>
      <RouterLink :to="reportLink" class="qcard">
        <Icon name="report" />
        <div class="grow">
          <div class="t-h3">{{ t('Reports') }}</div>
          <div class="t-tiny t-muted truncate">{{ months.length ? monthName(months[0], { month: 'long' }) : t('After your first month') }}</div>
        </div>
      </RouterLink>
    </div>

    <div v-if="!finishedSessions.length" class="card card-pad empty">
      <p class="t-h3">{{ t('Your charts start after your first workout') }}</p>
      <p class="t-small t-muted">{{ t("Finish a session and you'll see your strength trend, records and how often you train.") }}</p>
    </div>

    <template v-else>
      <!-- Consistency -->
      <h2 class="section-h">{{ t('Last 12 weeks') }}</h2>
      <div class="card card-pad">
        <div class="heat" role="img" :aria-label="tn(trainedDays, '{n} training day in the last 12 weeks', '{n} training days in the last 12 weeks')">
          <div v-for="(col, ci) in heat" :key="ci" class="heat-col">
            <div v-for="cell in col" :key="cell.key" class="heat-cell" :class="{ on: cell.on, today: cell.today, future: cell.future }" />
          </div>
        </div>
        <div class="row heat-sum">
          <div class="grow"><span class="t-num big">{{ trainedDays }}</span> <span class="t-small t-muted">{{ tn(trainedDays, 'training day', 'training days') }}</span></div>
          <div><span class="t-num big">{{ perWeek }}</span> <span class="t-small t-muted">{{ t('per week') }}</span></div>
        </div>
        <div class="row streak-row">
          <Icon name="fire" :size="20" :class="streak.weeks ? 't-warn' : 't-muted'" />
          <span class="grow t-small">
            <b>{{ tn(streak.weeks, '{n}-week streak', '{n}-week streak') }}</b>
            <span class="t-muted"> · {{ t('best {n}', { n: streak.best }) }} · {{ tn(streak.min, '{n} workout a week counts', '{n} workouts a week count') }}</span>
          </span>
        </div>
      </div>

      <!-- Recent records -->
      <template v-if="recentPRs.length">
        <h2 class="section-h">{{ t('Records in the last 30 days') }}</h2>
        <div class="group">
          <button v-for="p in recentPRs.slice(0, showAllPRs ? 30 : 5)" :key="p.key" class="group-row pr" @click="select(p.exerciseId)">
            <span class="pr-icon"><Icon name="trophy" :size="18" /></span>
            <div class="grow">
              <div class="t-h3 truncate">{{ exName(p.exerciseId) }}</div>
              <div class="t-small t-num">{{ prText(p, p.unit).main }}<span class="t-muted">, {{ prText(p, p.unit).was }} · {{ relativeDay(p.date) }}</span></div>
            </div>
          </button>
        </div>
        <button v-if="recentPRs.length > 5" class="btn btn-ghost btn-sm more-btn" @click="showAllPRs = !showAllPRs">
          {{ showAllPRs ? t('Show fewer') : t('Show all {n}', { n: recentPRs.length }) }}
        </button>
      </template>

      <!-- Per exercise -->
      <h2 class="section-h">{{ t('Strength') }}</h2>
      <button class="group group-row picker" @click="pickerOpen = true">
        <div class="grow">
          <div class="t-tiny t-muted">{{ t('Exercise') }}</div>
          <div class="t-h3 truncate">{{ exerciseId ? exName(exerciseId) : t('Choose an exercise') }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>

      <div v-if="exerciseId && points.length" class="card card-pad chart-card">
        <div class="row kpis">
          <div class="kpi grow">
            <div class="t-tiny t-muted">{{ repsMode ? t('Most reps') : exUnit === 'pin' ? t('Heaviest pin') : t('Best estimated max') }}</div>
            <div class="t-num kv">{{ repsMode ? bestReps : fmtLoad(exUnit === 'pin' ? bestTop : bestE, exUnit) }}</div>
          </div>
          <div class="kpi">
            <div class="t-tiny t-muted">{{ t('Since first time') }}</div>
            <div class="t-num kv" :class="changeClass">{{ changeStr }}</div>
          </div>
        </div>
        <div v-if="points.length > 1" class="chart">
          <Line :data="lineData" :options="lineOptions" />
        </div>
        <p v-else class="t-small t-muted one">{{ t("One more session and you'll see a trend line.") }}</p>
        <button class="btn btn-ghost btn-sm table-btn" @click="showTable = !showTable">{{ showTable ? t('Hide the numbers') : t('Show the numbers') }}</button>
        <table v-if="showTable" class="tbl t-num">
          <thead><tr><th>{{ t('Date') }}</th><th>{{ t('Best set') }}</th><th>{{ t('Est. max') }}</th></tr></thead>
          <tbody>
            <tr v-for="p in [...points].reverse()" :key="p.date">
              <td>{{ shortDate(p.date) }}</td><td>{{ p.topStr }}</td><td>{{ repsMode ? '–' : fmtLoad(p.e1rm, exUnit) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="t-tiny t-muted explain">
          {{ t('Estimated max is what you could lift once, worked out from your weight and reps. Use it to see the trend, not as a target to test.') }}
        </p>
        <RouterLink :to="`/exercise/${exerciseId}`" class="btn btn-ghost btn-sm table-btn">{{ t('Rep records and history') }}</RouterLink>
      </div>

      <!-- Weekly volume per muscle against the target range -->
      <div class="row vol-h">
        <h2 class="section-h grow">{{ t('Hard sets per muscle') }}</h2>
      </div>
      <Segmented v-model="volWeeks" :options="[{ label: t('This week'), value: 1 }, { label: t('4-week average'), value: 4 }]" :label="t('Period')" />
      <div class="card card-pad vol">
        <div class="row legend t-tiny t-muted">
          <span class="band-key" />{{ t('Target: {a}–{b} sets a week', { a: target[0], b: target[1] }) }}
        </div>
        <div v-for="m in volume" :key="m.muscle" class="vrow">
          <div class="row vtop">
            <span class="grow t-small vname">{{ muscleLabel(m.muscle) }}</span>
            <span class="t-num vnum">{{ fmtNum(m.sets, 1) }}</span>
            <span class="pill vtag" :class="statusClass[m.status]">{{ statusLabel(m) }}</span>
          </div>
          <div class="track" :aria-hidden="true">
            <div class="band" :style="bandStyle" />
            <div class="fill" :class="m.status" :style="{ width: Math.min(100, (m.sets / scaleMax) * 100) + '%' }" />
          </div>
        </div>
        <p v-if="!volume.length" class="t-small t-muted">{{ t('No sets yet in this period.') }}</p>
        <p class="t-tiny t-muted explain">
          {{ t('Main muscle counts as 1 set, helping muscles as half. Warm-ups don\'t count. Change the target in Settings.') }}
          <template v-if="volWeeks === 1 && weekDay < 6">{{ ' ' + t('The week is still going, so low numbers early on are normal.') }}</template>
        </p>
      </div>

      <!-- Records -->
      <h2 class="section-h">{{ t('Best estimated max') }}</h2>
      <div class="group">
        <button v-for="r in records" :key="r.id" class="group-row" @click="select(r.id)">
          <span class="grow t-h3 truncate">{{ r.name }}</span>
          <span class="t-num rec">{{ fmtLoad(r.e1rm, r.unit) }}</span>
        </button>
      </div>
    </template>

    <ExercisePicker v-model="pickerOpen" :title="t('Show progress for')" :only-ids="loggedIds" @pick="select" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend
} from 'chart.js'
import Icon from '../ui/Icon.vue'
import Segmented from '../ui/Segmented.vue'
import ExercisePicker from '../ui/ExercisePicker.vue'
import { state, finishedSessions, exercisesById, historyFor, days, streak } from '../store.js'
import { bestE1RM, heaviest, fmtLoad, unitFor, dateKey, convertLoad, detectPRs } from '../lib/training.js'
import { muscleLabel, monthName, fmtNum, prText, relativeDay, fmtDate } from '../lib/format.js'
import { muscleVolume, monthsWithWorkouts } from '../lib/stats.js'
import { useChartTheme } from '../lib/chartTheme.js'
import { t, tn, tx, locale } from '../i18n/index.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)
ChartJS.defaults.font.family = 'Barlow, system-ui, sans-serif'
ChartJS.defaults.font.size = 13

const route = useRoute()
const ct = useChartTheme()
const showTable = ref(false)
const pickerOpen = ref(false)
const unit = computed(() => state.data.profile.unit)
const exName = (id) => tx(exercisesById.value[id], 'name') || id

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
    // Default to the weighted exercise you've done most often
    const counts = {}
    for (const s of finishedSessions.value) for (const x of s.sets) if (x.load > 0 && x.unit !== 'pin') counts[x.exerciseId] = (counts[x.exerciseId] || 0) + 1
    for (const id of ids) counts[id] = counts[id] || 0
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
      reps: Math.max(0, ...h.sets.map(s => s.reps || 0)),
      topStr: top ? `${fmtLoad(top.load, top.unit)} × ${top.reps}` : h.sets.map(s => (s.reps ? `${t('BW')} × ${s.reps}` : `${s.seconds}s`)).join(', ')
    }
  })
})
const bestE = computed(() => Math.max(0, ...points.value.map(p => p.e1rm)))
const bestTop = computed(() => Math.max(0, ...points.value.map(p => p.top)))
// Bodyweight exercises (no added weight): track reps instead
const repsMode = computed(() => points.value.length > 0 && points.value.every(p => !p.e1rm && !p.top))
const bestReps = computed(() => Math.max(0, ...points.value.map(p => p.reps)))
const change = computed(() => {
  const key = repsMode.value ? 'reps' : exUnit.value === 'pin' ? 'top' : 'e1rm'
  const p = points.value.filter(x => x[key] > 0)
  if (p.length < 2) return null
  return ((p[p.length - 1][key] - p[0][key]) / p[0][key]) * 100
})
const changeStr = computed(() => (change.value == null ? '–' : `${change.value >= 0 ? '+' : ''}${change.value.toFixed(0)}%`))
const changeClass = computed(() => (change.value > 0 ? 't-ok' : change.value < 0 ? 't-err' : ''))
const shortDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })

const lineData = computed(() => ({
  labels: points.value.map(p => shortDate(p.date)),
  datasets: (repsMode.value ? [
    { label: t('Most reps'), data: points.value.map(p => p.reps || null), borderColor: ct.value.series[0], backgroundColor: ct.value.series[0] }
  ] : [
    ...(exUnit.value === 'pin' ? [] : [{ label: t('Estimated max'), data: points.value.map(p => p.e1rm || null), borderColor: ct.value.series[0], backgroundColor: ct.value.series[0] }]),
    { label: t('Heaviest set'), data: points.value.map(p => p.top || null), borderColor: ct.value.series[1], backgroundColor: ct.value.series[1] }
  ]).map(d => ({
    ...d, borderWidth: 2, tension: 0.25, spanGaps: true,
    pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2, pointBorderColor: ct.value.surface
  }))
}))
const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: exUnit.value !== 'pin' && !repsMode.value, position: 'top', align: 'start', labels: { color: ct.value.ink, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14 } },
    tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (c) => `${c.dataset.label}: ${repsMode.value ? c.parsed.y : fmtLoad(c.parsed.y, exUnit.value)}` } }
  },
  scales: {
    x: { ticks: { color: ct.value.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false }, border: { display: false } },
    y: { ticks: { color: ct.value.ink, maxTicksLimit: 5 }, grid: { color: ct.value.grid }, border: { display: false } }
  }
}))

// ── Weekly volume per muscle ──
// Early in the week "this week" is mostly empty, so start on the 4-week average until 2 workouts are in
const weekWorkouts = computed(() => {
  const mon = new Date(state.today + 'T00:00:00'); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
  return finishedSessions.value.filter(s => new Date(s.startedAt) >= mon).length
})
const volWeeks = ref(weekWorkouts.value >= 2 ? 1 : 4)
const target = computed(() => state.data.settings.volumeTarget || [10, 20])
const todayDate = computed(() => new Date(state.today + 'T12:00:00'))
const weekDay = computed(() => (todayDate.value.getDay() + 6) % 7) // Mon = 0
const volume = computed(() => {
  const rows = muscleVolume(state.data.sessions, exercisesById.value, { today: todayDate.value, weeks: volWeeks.value, target: target.value })
  // Muscles this month's routine trains but you haven't hit yet show up as 0
  const have = new Set(rows.map(r => r.muscle))
  for (const d of days.value) {
    for (const it of d.items) {
      for (const m of exercisesById.value[it.exerciseId]?.primary || []) {
        if (!have.has(m)) { have.add(m); rows.push({ muscle: m, sets: 0, status: 'low' }) }
      }
    }
  }
  // This week, before Sunday: being under the range isn't a problem yet, so no orange
  if (volWeeks.value === 1 && weekDay.value < 6) {
    for (const r of rows) if (r.status === 'low') r.status = 'pending'
  }
  return rows
})
const scaleMax = computed(() => Math.max(target.value[1] * 1.25, ...volume.value.map(m => m.sets)))
const bandStyle = computed(() => ({
  left: (target.value[0] / scaleMax.value) * 100 + '%',
  width: ((target.value[1] - target.value[0]) / scaleMax.value) * 100 + '%'
}))
const statusClass = { low: 'pill-warn', ok: 'pill-ok', high: 'pill-info', pending: '' }
const statusLabel = (m) => {
  if (m.status === 'pending') return m.sets ? t('volume|Building up') : t('Not yet')
  return { low: t('Below range'), ok: t('In range'), high: t('Above range') }[m.status]
}

// ── Records in the last 30 days ──
const showAllPRs = ref(false)
const recentPRs = computed(() => {
  const all = [...finishedSessions.value].reverse() // oldest first
  const cutoff = Date.now() - 30 * 86400000
  const out = []
  all.forEach((s, i) => {
    if (new Date(s.startedAt).getTime() < cutoff) return
    for (const p of detectPRs(s, all.slice(0, i), unit.value)) {
      const u = unitFor(exercisesById.value[p.exerciseId], state.data.profile)
      out.push({ ...p, unit: u, date: s.startedAt, key: s.id + p.exerciseId + p.type })
    }
  })
  // One line per exercise per day: the most telling record
  const order = { reps: 0, load: 1, e1rm: 2, time: 3 }
  const best = {}
  for (const p of out) {
    const k = p.exerciseId + dateKey(p.date)
    if (!best[k] || order[p.type] < order[best[k].type]) best[k] = p
  }
  return Object.values(best).sort((a, b) => b.date.localeCompare(a.date))
})

// ── Quick links ──
const months = computed(() => monthsWithWorkouts(state.data.sessions))
const reportLink = computed(() => (months.value.length ? `/report/${months.value[0]}` : '/report'))
const bodyLine = computed(() => {
  const e = [...state.data.body.entries].sort((a, b) => b.date.localeCompare(a.date)).find(x => x.weight != null)
  return e ? `${fmtNum(e.weight, 1)} ${e.unit} · ${relativeDay(e.date + 'T12:00:00')}` : t('Weight, measurements, photos')
})

// ── Records ──
const records = computed(() => loggedIds.value.map(id => {
  const sets = historyFor(id).flatMap(h => h.sets)
  const u = unitFor(exercisesById.value[id], state.data.profile)
  return { id, name: exName(id), e1rm: u === 'pin' ? heaviest(sets, unit.value) : bestE1RM(sets, unit.value), unit: u }
}).filter(r => r.e1rm > 0).sort((a, b) => a.name.localeCompare(b.name, locale())))
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
.rec { font-size: 19px; font-weight: 600; white-space: nowrap; }
.quick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.qcard { display: flex; align-items: center; gap: 10px; padding: 14px; background: var(--card); border-radius: var(--r-card); min-width: 0; }
.qcard:active { background: var(--press); }
.streak-row { gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.t-warn { color: var(--warn); }
.pr { align-items: flex-start; text-align: left; }
.pr-icon { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--warn-soft); color: var(--warn); flex: 0 0 auto; }
.more-btn { margin-top: 6px; }
.vol-h { align-items: flex-end; }
.vol { margin-top: 10px; }
.legend { gap: 8px; margin-bottom: 6px; }
.band-key { width: 22px; height: 10px; border-radius: 3px; background: var(--ok-soft); box-shadow: inset 0 0 0 1px var(--ok); }
.vrow { padding: 10px 0; }
.vrow + .vrow { border-top: 1px solid var(--line); }
.vtop { gap: 8px; }
.vname { font-weight: 600; }
.vnum { font-size: 19px; font-weight: 700; min-width: 34px; text-align: right; }
.vtag { min-height: 26px; padding: 0 10px; font-size: 13px; }
.track { position: relative; height: 10px; border-radius: 5px; background: var(--card-2); margin-top: 8px; overflow: hidden; }
.band { position: absolute; top: 0; bottom: 0; background: var(--ok-soft); box-shadow: inset 0 0 0 1px var(--ok); border-radius: 3px; }
.fill { position: absolute; left: 0; top: 2px; bottom: 2px; border-radius: 4px; transition: width 300ms ease; }
.fill.low { background: var(--warn); }
.fill.ok { background: var(--ok); }
.fill.high { background: var(--info); }
.fill.pending { background: var(--ink-3); }
</style>
