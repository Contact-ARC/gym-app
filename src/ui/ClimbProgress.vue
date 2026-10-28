<template>
  <div class="cpg">
    <div v-if="!sessions.length" class="card card-pad empty">
      <p class="t-h3">{{ t("You haven't logged a climb here yet") }}</p>
      <p class="t-small t-muted">{{ t('Start a climbing session from Train. Your hardest sends, flashes, grade pyramid and walls show up here.') }}</p>
    </div>

    <template v-else>
      <!-- Grade scale: one per system you've climbed in (each colour circuit is its own gym) -->
      <div v-if="systems.length > 1" class="chips scales" role="tablist" :aria-label="t('Grades')">
        <button v-for="sy in systems" :key="sy" class="chip" :class="{ on: system === sy }" role="tab" :aria-selected="system === sy" @click="picked = sy">{{ systemLabel(sy, state.data.settings) }}</button>
      </div>

      <!-- Headline -->
      <div class="card card-pad head">
        <div class="row heads">
          <div class="grow">
            <div class="t-tiny t-muted">{{ t('Hardest send') }}</div>
            <div class="t-num big">{{ best?.grade || '–' }}</div>
          </div>
          <div class="right">
            <div class="t-tiny t-muted">{{ t('Hardest flash') }}</div>
            <div class="t-num mid">{{ bestFlash?.grade || '–' }}</div>
          </div>
        </div>
        <div class="row nums t-small">
          <span><b class="t-num">{{ all.sends }}</b> {{ tn(all.sends, 'one|sent', 'sent') }}</span>
          <span><b class="t-num">{{ flashRate }}%</b> {{ t('flashed') }}</span>
          <span><b class="t-num">{{ sessions.length }}</b> {{ tn(sessions.length, 'session', 'sessions') }}</span>
          <span v-if="all.seconds >= 60"><b class="t-num">{{ fmtHours(all.seconds) }}</b> {{ t('on the wall') }}</span>
        </div>
      </div>

      <!-- Hardest send per session -->
      <div class="card card-pad chart-card">
        <div class="t-tiny t-muted">{{ t('Hardest per session') }}</div>
        <div v-if="series.length > 1" class="chart"><Line :data="lineData" :options="lineOptions" /></div>
        <p v-else class="t-small t-muted one">{{ t("One more session in this range and you'll see a trend line.") }}</p>
        <div class="chips ranges" role="tablist" :aria-label="t('Time range')">
          <button v-for="r in ranges" :key="r.value" class="chip" :class="{ on: range === r.value }" role="tab" :aria-selected="range === r.value" @click="range = r.value">{{ r.label }}</button>
        </div>
      </div>

      <!-- Pyramid -->
      <h2 class="section-h">{{ t('Grade pyramid') }}</h2>
      <div class="card card-pad">
        <div class="legend t-tiny t-muted">
          <span><i class="k flash" />{{ t('Flash') }}</span><span><i class="k send" />{{ t('Sent') }}</span><span><i class="k project" />{{ t('Not yet') }}</span>
        </div>
        <div v-for="g in pyramid" :key="g.grade" class="prow">
          <span class="pg t-num">{{ g.grade }}</span>
          <div class="pbar">
            <span class="seg flash" :style="{ width: pct(g.flash) }" />
            <span class="seg send" :style="{ width: pct(g.send) }" />
            <span class="seg project" :style="{ width: pct(g.project) }" />
          </div>
          <span class="pn t-num t-small">{{ g.flash + g.send }}<span class="t-muted">/{{ g.flash + g.send + g.project }}</span></span>
        </div>
        <p v-if="!pyramid.length" class="t-small t-muted">{{ t('Nothing in this range yet.') }}</p>
        <p class="t-tiny t-muted explain">{{ t('Sent out of everything you logged at each grade, in the chosen range.') }}</p>
      </div>

      <!-- Walls -->
      <template v-if="walls.length">
        <h2 class="section-h">{{ t('Walls') }}</h2>
        <div class="group">
          <div v-for="w in walls" :key="w.key" class="group-row">
            <Icon name="wall" :size="20" class="t-muted" />
            <div class="grow">
              <div class="t-h3 truncate">{{ w.wall }}<span v-if="manyGyms" class="t-small t-muted"> · {{ w.gym }}</span></div>
              <div class="t-small t-muted">{{ tn(w.climbs, '{n} climb', '{n} climbs') }} · {{ t('{n} sent', { n: w.sends }) }}</div>
            </div>
            <span v-if="w.top" class="t-num top">{{ w.top }}</span>
          </div>
        </div>
      </template>

      <!-- Records -->
      <h2 class="section-h">{{ t('Records') }}</h2>
      <div class="group">
        <div v-for="r in records" :key="r.label" class="group-row">
          <span class="grow">{{ r.label }}</span>
          <span class="t-small t-muted">{{ r.date ? relativeDay(r.date) : '' }}</span>
          <b class="t-num rv">{{ r.value }}</b>
        </div>
      </div>

      <!-- Every session -->
      <h2 class="section-h">{{ tn(sessions.length, '{n} session', '{n} sessions') }}</h2>
      <div class="group">
        <RouterLink v-for="s in sessions.slice(0, showAll ? 500 : 8)" :key="s.sessionId" :to="`/summary/${s.sessionId}`" class="group-row">
          <div class="grow">
            <div class="t-small t-muted">{{ fmtShort(s.date) }}</div>
            <div class="t-num sline">{{ tn(s.totals.climbs, '{n} climb', '{n} climbs') }} · {{ t('{n} sent', { n: s.totals.sends }) }}<template v-if="s.top"> · {{ t('hardest') }} <b>{{ s.top }}</b></template></div>
          </div>
          <Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
      <button v-if="sessions.length > 8" class="btn btn-ghost btn-sm more" @click="showAll = !showAll">{{ showAll ? t('Show fewer') : t('See all {n}', { n: sessions.length }) }}</button>
    </template>
  </div>
</template>

<script setup>
// The "Your progress" tab for bouldering and roped climbing.
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js'
import Icon from './Icon.vue'
import { state, historyFor } from '../store.js'
import { climbKind, systemFor, gradeList, hardest, climbTotals, isSent, systemLabel, climbGymId, gymById, gymName } from '../lib/climbing.js'
import { relativeDay } from '../lib/format.js'
import { useChartTheme } from '../lib/chartTheme.js'
import { t, tn, locale } from '../i18n/index.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

const props = defineProps({ ex: { type: Object, required: true } })
const ct = useChartTheme()
const kind = computed(() => climbKind(props.ex))
// Newest first: every session with this exercise's climbs
const history = computed(() => historyFor(props.ex.id)
  .map(h => ({ date: h.date, sessionId: h.sessionId, all: h.sets.filter(s => s.climb).map(s => s.climb) }))
  .filter(h => h.all.length))
// Grade systems you've climbed in, most recent first. Grades are only compared within one, so the page
// shows one at a time: your current gym's first.
const systems = computed(() => {
  const seen = []
  for (const h of history.value) for (const c of h.all) if (!seen.includes(c.system)) seen.push(c.system)
  return seen
})
const picked = ref(null)
const system = computed(() => {
  if (picked.value && systems.value.includes(picked.value)) return picked.value
  const here = systemFor(kind.value, state.data.settings)
  return systems.value.includes(here) ? here : (systems.value[0] || here)
})
const grades = computed(() => gradeList(system.value, state.data.settings))

// The sessions with climbs in that system
const sessions = computed(() => history.value
  .map(h => {
    const climbs = h.all.filter(c => c.system === system.value)
    return { date: h.date, sessionId: h.sessionId, climbs, mine: climbs, totals: climbTotals(climbs), top: hardest(climbs)[system.value]?.grade || '' }
  })
  .filter(s => s.climbs.length))
const allClimbs = computed(() => sessions.value.flatMap(s => s.climbs))
const mineAll = allClimbs
const all = computed(() => climbTotals(allClimbs.value))
const flashRate = computed(() => (all.value.sends ? Math.round((all.value.flashes / all.value.sends) * 100) : 0))
const best = computed(() => hardest(mineAll.value)[system.value])
const bestFlash = computed(() => hardest(mineAll.value, { flashOnly: true })[system.value])
const fmtHours = (secs) => (secs >= 3600 ? `${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min` : `${Math.round(secs / 60)} min`)

// ── Range ──
const ranges = computed(() => [
  { label: t('3 months'), value: 91 }, { label: t('6 months'), value: 182 }, { label: t('1 year'), value: 365 }, { label: t('All'), value: 0 }
])
const range = ref(182)
const inRange = computed(() => {
  const from = range.value ? Date.now() - range.value * 86400000 : 0
  return sessions.value.filter(s => new Date(s.date).getTime() >= from)
})

// ── Chart: hardest send and flash per session ──
const rankOrNull = (h) => (h ? h.rank : null)
const series = computed(() => [...inRange.value].reverse().map(s => ({
  date: s.date,
  send: rankOrNull(hardest(s.mine)[system.value]),
  flash: rankOrNull(hardest(s.mine, { flashOnly: true })[system.value])
})).filter(p => p.send != null))
const label = (r) => grades.value[Math.round(r)] ?? ''
const shortDate = (iso) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
const fmtShort = (iso) => new Date(iso).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })
const lineData = computed(() => ({
  labels: series.value.map(p => shortDate(p.date)),
  datasets: [
    { label: t('Hardest send'), data: series.value.map(p => p.send), borderColor: ct.value.series[0], backgroundColor: ct.value.series[0] },
    { label: t('Hardest flash'), data: series.value.map(p => p.flash), borderColor: ct.value.series[1], backgroundColor: ct.value.series[1], spanGaps: true }
  ].map(d => ({ ...d, borderWidth: 2.5, cubicInterpolationMode: 'monotone', pointRadius: 3.5, pointHoverRadius: 6, pointBorderWidth: 2, pointBorderColor: ct.value.surface }))
}))
const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: true, position: 'top', align: 'start', labels: { color: ct.value.ink, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14 } },
    tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (c) => `${c.dataset.label}: ${label(c.parsed.y)}` } }
  },
  scales: {
    x: { ticks: { color: ct.value.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 }, grid: { display: false }, border: { display: false } },
    y: { ticks: { color: ct.value.ink, stepSize: 1, callback: (v) => label(v) }, grid: { color: ct.value.grid }, border: { display: false } }
  }
}))

// ── Pyramid: per grade, hardest first ──
const pyramid = computed(() => {
  const by = {}
  for (const s of inRange.value) {
    for (const c of s.mine) {
      const g = (by[c.rank] ||= { rank: c.rank, grade: c.grade, flash: 0, send: 0, project: 0 })
      g[c.result === 'flash' ? 'flash' : c.result === 'send' ? 'send' : 'project']++
    }
  }
  return Object.values(by).filter(g => g.rank >= 0).sort((a, b) => b.rank - a.rank)
})
const maxRow = computed(() => Math.max(1, ...pyramid.value.map(g => g.flash + g.send + g.project)))
const pct = (n) => `${(n / maxRow.value) * 100}%`

// ── Walls in the range ──
const walls = computed(() => {
  const by = {}
  for (const s of inRange.value) {
    for (const c of s.climbs) {
      if (!c.wall) continue
      const gid = climbGymId(c)
      const key = gid + '|' + c.wall.toLowerCase()
      const w = (by[key] ||= { key, wall: c.wall, gymId: gid, gym: gymName(gymById(state.data.settings, gid)), climbs: 0, sends: 0, list: [] })
      w.climbs++
      if (isSent(c)) w.sends++
      if (c.system === system.value) w.list.push(c)
    }
  }
  return Object.values(by)
    .map(w => ({ ...w, top: hardest(w.list)[system.value]?.grade || '' }))
    .sort((a, b) => b.climbs - a.climbs)
    .slice(0, 8)
})

// Same wall name at two gyms: say which
const manyGyms = computed(() => new Set(walls.value.map(w => w.gymId)).size > 1)

// ── Records ──
const records = computed(() => {
  const out = []
  const when = (pred) => sessions.value.find(s => s.mine.some(pred))?.date
  if (best.value) out.push({ label: t('Hardest send'), value: best.value.grade, date: [...sessions.value].reverse().find(s => s.mine.some(c => isSent(c) && c.rank === best.value.rank))?.date })
  if (bestFlash.value) out.push({ label: t('Hardest flash'), value: bestFlash.value.grade, date: [...sessions.value].reverse().find(s => s.mine.some(c => c.result === 'flash' && c.rank === bestFlash.value.rank))?.date })
  const most = [...sessions.value].sort((a, b) => b.totals.sends - a.totals.sends)[0]
  if (most?.totals.sends) out.push({ label: t('Most sends in a session'), value: String(most.totals.sends), date: most.date })
  const longest = allClimbs.value.filter(c => isSent(c)).sort((a, b) => (b.attempts || 1) - (a.attempts || 1))[0]
  if (longest && longest.attempts > 1) out.push({ label: t('Most tries before a send'), value: `${longest.attempts}`, date: when(c => c === longest) })
  return out
})
const showAll = ref(false)
</script>

<style scoped>
.empty { margin-top: 16px; display: grid; gap: 6px; }
.head { margin-top: 16px; }
.heads { align-items: flex-end; gap: 12px; }
.big { font-size: 44px; font-weight: 700; line-height: 1.05; }
.mid { font-size: 28px; font-weight: 700; }
.right { text-align: right; }
.nums { flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
.scales { margin-top: 16px; }
.chart-card { margin-top: 10px; }
.chart { height: 220px; margin-top: 10px; }
.one { margin: 18px 0 6px; text-align: center; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.ranges { margin-top: 12px; justify-content: center; }
.chip { min-height: 34px; padding: 0 12px; border-radius: 17px; background: var(--card-2); color: var(--ink-2); font-weight: 600; font-size: 14px; }
.chip.on { background: var(--ink); color: var(--paper); }
.legend { display: flex; gap: 14px; margin-bottom: 8px; }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.k { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.prow { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
.pg { width: 44px; font-weight: 700; font-size: 16px; }
.pbar { flex: 1 1 auto; display: flex; height: 16px; border-radius: 5px; background: var(--card-2); overflow: hidden; }
.seg { height: 100%; }
.flash { background: var(--warn); }
.send { background: var(--ok); }
.project { background: var(--ink-3); opacity: 0.45; }
.pn { min-width: 44px; text-align: right; font-weight: 700; }
.explain { margin-top: 8px; }
.top { font-weight: 700; font-size: 18px; }
.rv { font-size: 18px; min-width: 48px; text-align: right; }
.sline { font-size: 16px; margin-top: 2px; }
.more { display: block; margin: 6px auto 0; }
</style>
