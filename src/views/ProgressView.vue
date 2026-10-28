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
      <RouterLink to="/goals" class="qcard wide">
        <Icon name="goal" />
        <div class="grow">
          <div class="t-h3">{{ t('Goals') }}</div>
          <div class="t-tiny t-muted truncate">{{ goalsLine }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
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
            <b>{{ streak.weeks ? tn(streak.weeks, '{n}-week streak', '{n}-week streak') : t('No streak right now') }}</b>
            <span class="t-muted"> · {{ t('best {n}', { n: streak.best }) }} · {{ tn(streak.min, '{n} workout a week counts', '{n} workouts a week count') }}</span>
          </span>
        </div>
      </div>

      <!-- Recent records -->
      <template v-if="recentPRs.length">
        <h2 class="section-h">{{ t('Records in the last 30 days') }}</h2>
        <div class="group">
          <button v-for="p in recentPRs.slice(0, showAllPRs ? 30 : 3)" :key="p.key" class="group-row pr" @click="select(p.exerciseId)">
            <span class="pr-icon"><Icon name="trophy" :size="18" /></span>
            <div class="grow">
              <div class="t-h3 truncate">{{ exName(p.exerciseId) }}</div>
              <div class="t-small t-num">{{ prText(p, p.unit).main }}<span class="t-muted">, {{ prText(p, p.unit).was }} · {{ relativeDay(p.date) }}</span></div>
            </div>
          </button>
        </div>
        <button v-if="recentPRs.length > 3" class="btn btn-ghost btn-sm more-btn" @click="showAllPRs = !showAllPRs">
          {{ showAllPRs ? t('Show fewer') : t('See all {n}', { n: recentPRs.length }) }}
        </button>
      </template>

      <!-- Per exercise: each opens its own page -->
      <div class="row vol-h">
        <h2 class="section-h grow">{{ t('Your exercises') }}</h2>
        <button class="btn btn-sm btn-ghost pl-change" @click="pickerOpen = true"><Icon name="search" :size="18" />{{ t('Find') }}</button>
      </div>
      <div class="group">
        <RouterLink v-for="r in exList.slice(0, showAllEx ? 500 : 6)" :key="r.id" :to="`/exercise/${r.id}?tab=progress`" class="group-row exr">
          <div class="grow ex-txt">
            <div class="t-h3 truncate">{{ r.name }}</div>
            <div class="t-small t-muted truncate">{{ r.sub }}</div>
          </div>
          <svg v-if="r.spark" class="spark" viewBox="0 0 64 24" aria-hidden="true"><polyline :points="r.spark" /></svg>
          <div class="ex-best">
            <div class="t-num rec">{{ r.best }}</div>
            <div v-if="r.change" class="t-tiny t-num" :class="r.change.cls">{{ r.change.text }}</div>
          </div>
        </RouterLink>
      </div>
      <button v-if="exList.length > 6" class="btn btn-ghost btn-sm more-btn" @click="showAllEx = !showAllEx">
        {{ showAllEx ? t('Show fewer') : t('See all {n}', { n: exList.length }) }}
      </button>
      <p class="t-tiny t-muted explain">{{ t('Most recent first. The number is your best estimated max, or your best set for bodyweight and timed exercises. Tap one for its chart, records and every session.') }}</p>

      <!-- Powerlifting: squat, bench, deadlift, total, DOTS -->
      <template v-if="pl.any">
        <div class="row vol-h">
          <h2 class="section-h grow">{{ t('Powerlifting') }}</h2>
          <button class="btn btn-sm btn-ghost pl-change" @click="liftsOpen = true">{{ t('Change lifts') }}</button>
        </div>
        <Segmented :model-value="plBasis" :options="[{ label: t('Estimated max'), value: 'e1rm' }, { label: t('Actually lifted'), value: 'actual' }]" :label="t('Count it as')" @update:model-value="setBasis" />
        <div class="group pl">
          <button v-for="k in ['squat', 'bench', 'deadlift']" :key="k" class="group-row" @click="pl.ids[k] && exercisesById[pl.ids[k]] ? select(pl.ids[k]) : (liftsOpen = true)">
            <div class="grow">
              <div class="t-h3">{{ t(LIFT_LABELS[k]) }}</div>
              <div class="t-tiny t-muted truncate">{{ pl.ids[k] && exercisesById[pl.ids[k]] ? exName(pl.ids[k]) : t('Choose the exercise') }}</div>
            </div>
            <div class="right">
              <div class="t-num pl-v">{{ pl[k] ? fmtLoad(pl[k], unit) : '–' }}</div>
              <div v-if="pl[k] && bwKg" class="t-tiny t-muted t-num">{{ t('{x}× bodyweight', { x: fmtNum(convertLoad(pl[k], unit, 'kg') / bwKg, 2) }) }}</div>
            </div>
          </button>
          <div class="group-row total">
            <span class="grow t-h3">{{ t('Total') }}</span>
            <span class="t-num pl-v">{{ pl.complete ? fmtLoad(pl.total, unit) : '–' }}</span>
          </div>
          <div class="group-row">
            <div class="grow">
              <div class="t-h3">{{ t('DOTS') }}</div>
              <div class="t-tiny t-muted">{{ dotsHint }}</div>
            </div>
            <span class="t-num pl-v">{{ dotsV != null ? fmtNum(dotsV, 1) : '–' }}</span>
          </div>
        </div>
        <p class="t-tiny t-muted explain">{{ t('Your best in the last 12 weeks. Bodyweight is your 7-day average from Body.') }}</p>
      </template>

      <!-- Weekly volume per muscle against the target range -->
      <div class="row vol-h">
        <h2 class="section-h grow">{{ t('Hard sets per muscle') }}</h2>
      </div>
      <Segmented v-model="volWeeks" :options="[{ label: t('This week'), value: 1 }, { label: t('4-week average'), value: 4 }]" :label="t('Period')" />
      <div class="card card-pad vol">
        <div class="row legend t-tiny t-muted">
          <span class="band-key" />{{ t('Target: {a}–{b} sets a week', { a: target[0], b: target[1] }) }}
        </div>
        <div v-for="m in volume.slice(0, showAllVol ? 50 : 6)" :key="m.muscle" class="vrow">
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
        <button v-if="volume.length > 6" class="btn btn-ghost btn-sm more-btn" @click="showAllVol = !showAllVol">
          {{ showAllVol ? t('Show fewer') : t('See all {n}', { n: volume.length }) }}
        </button>
        <p class="t-tiny t-muted explain">
          {{ t('Main muscle counts as 1 set, helping muscles as half. Warm-ups don\'t count. Change the target in Settings.') }}
          <template v-if="volWeeks === 1 && weekDay < 6">{{ ' ' + t('The week is still going, so low numbers early on are normal.') }}</template>
        </p>
      </div>

    </template>

    <ExercisePicker v-model="pickerOpen" :title="t('Show progress for')" :only-ids="loggedIds" @pick="select" />

    <Sheet v-model="liftsOpen" :title="t('Your powerlifting lifts')">
      <p class="t-small t-muted">{{ t('Pick the exercise that counts for each lift. Create your own if it isn\'t in the list.') }}</p>
      <div class="group lifts">
        <button v-for="k in ['squat', 'bench', 'deadlift']" :key="k" class="group-row" @click="liftKey = k; liftPickOpen = true">
          <div class="grow">
            <div class="t-tiny t-muted">{{ t(LIFT_LABELS[k]) }}</div>
            <div class="t-h3">{{ pl.ids[k] && exercisesById[pl.ids[k]] ? exName(pl.ids[k]) : t('Choose the exercise') }}</div>
          </div>
          <Icon name="chevronRight" class="chev" />
        </button>
      </div>
      <template #actions>
        <button class="btn btn-primary btn-lg" @click="liftsOpen = false">{{ t('Done') }}</button>
      </template>
    </Sheet>
    <ExercisePicker v-model="liftPickOpen" :title="t(LIFT_LABELS[liftKey] || 'Squat')" allow-create @pick="setLift" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Segmented from '../ui/Segmented.vue'
import ExercisePicker from '../ui/ExercisePicker.vue'
import Sheet from '../ui/Sheet.vue'
import { state, persist, finishedSessions, exercisesById, historyFor, days, streak, goalsWithProgress, goalCtx } from '../store.js'
import { plTotal, bodyweight } from '../lib/goals.js'
import { dots } from '../lib/body.js'
import { bestE1RM, heaviest, fmtLoad, unitFor, dateKey, convertLoad, detectPRs, isWorkSet, bestSeconds } from '../lib/training.js'
import { muscleLabel, monthName, fmtNum, prText, relativeDay } from '../lib/format.js'
import { muscleVolume, monthsWithWorkouts } from '../lib/stats.js'
import { t, tn, tx, locale } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const pickerOpen = ref(false)
const unit = computed(() => state.data.profile.unit)
const exName = (id) => tx(exercisesById.value[id], 'name') || id

// ── Goals summary ──
const goalsLine = computed(() => {
  const all = goalsWithProgress.value
  if (!all.length) return t('Set a target for a lift, your body or your week')
  const open = all.filter(g => !g.goal.doneAt).length
  const done = all.length - open
  return [open ? tn(open, '{n} in progress', '{n} in progress') : '', done ? tn(done, '{n} reached', '{n} reached') : ''].filter(Boolean).join(' · ')
})

// ── Powerlifting ──
const LIFT_LABELS = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift' }
const plBasis = computed(() => state.data.settings.plBasis || 'e1rm')
const pl = computed(() => {
  const ids = state.data.settings.lifts || {}
  const r = plTotal(state.data.sessions, ids, { basis: plBasis.value, unit: unit.value, today: new Date(state.today + 'T12:00:00') })
  const logged = new Set(loggedIds.value)
  return { ...r, ids, any: ['squat', 'bench', 'deadlift'].some(k => ids[k] && logged.has(ids[k])) }
})
const bwKg = computed(() => bodyweight(goalCtx.value, 'kg'))
const dotsV = computed(() => (pl.value.complete && bwKg.value ? dots(convertLoad(pl.value.total, unit.value, 'kg'), bwKg.value, state.data.profile.sex) : null))
const dotsHint = computed(() => {
  if (!pl.value.complete) return t('Needs all three lifts')
  if (!bwKg.value) return t('Log your weight in Body')
  if (!state.data.profile.sex) return t('Set your sex in Body to see it')
  return t('Compares lifters of different bodyweights')
})
function setBasis (v) { state.data.settings.plBasis = v; persist() }
const liftsOpen = ref(false)
const liftPickOpen = ref(false)
const liftKey = ref('squat')
function setLift (id) {
  state.data.settings.lifts = { ...state.data.settings.lifts, [liftKey.value]: id }
  persist()
}

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

// ── Your exercises ──
const loggedIds = computed(() => [...new Set(finishedSessions.value.flatMap(s => s.sets.map(x => x.exerciseId)))])
const showAllEx = ref(false)
const showAllVol = ref(false)
// Old links to /progress?exercise=… go to the exercise's own page
if (route.query.exercise) router.replace(`/exercise/${route.query.exercise}?tab=progress`)
function select (id) { router.push(`/exercise/${id}?tab=progress`) }

const exList = computed(() => loggedIds.value.map(id => {
  const ex = exercisesById.value[id]
  const u = unitFor(ex, state.data.profile)
  const hist = historyFor(id) // newest first
  const per = hist.slice(0, 10).reverse().map(h => {
    const sets = h.sets.filter(isWorkSet)
    if (u === 'pin') return heaviest(sets, unit.value)
    return bestE1RM(sets, unit.value) || bestSeconds(sets) || Math.max(0, ...sets.map(x => x.reps || 0))
  })
  const all = hist.flatMap(h => h.sets.filter(isWorkSet))
  let best
  const e = u === 'pin' ? heaviest(all, unit.value) : bestE1RM(all, unit.value)
  if (e) best = fmtLoad(e, u === 'pin' ? 'pin' : unit.value)
  else if (bestSeconds(all)) best = `${bestSeconds(all)} s`
  else best = tn(Math.max(0, ...all.map(x => x.reps || 0)), '{n} rep', '{n} reps')
  const vals = per.filter(v => v > 0)
  let spark = null; let change = null
  if (vals.length > 1) {
    const lo = Math.min(...vals); const hi = Math.max(...vals); const span = hi - lo || 1
    spark = vals.map((v, i) => `${(i / (vals.length - 1) * 62 + 1).toFixed(1)},${(22 - (v - lo) / span * 20).toFixed(1)}`).join(' ')
    const pct = ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100
    if (Math.abs(pct) >= 1) change = { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`, cls: pct > 0 ? 't-ok' : 't-muted' }
  }
  return {
    id, name: exName(id), best, spark, change, last: hist[0]?.date || '',
    sub: `${relativeDay(hist[0]?.date)} · ${tn(hist.length, '{n} session', '{n} sessions')}`
  }
}).sort((a, b) => b.last.localeCompare(a.last)))

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

.exr { gap: 10px; }
.ex-txt { min-width: 0; }
.spark { width: 64px; height: 24px; flex: 0 0 auto; }
.spark polyline { fill: none; stroke: var(--info); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.ex-best { text-align: right; min-width: 72px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 17px; margin-top: 6px; }
.tbl th { text-align: left; font-family: var(--font); font-size: 13px; font-weight: 600; color: var(--ink-2); padding: 6px 4px; }
.tbl td { padding: 8px 4px; border-top: 1px solid var(--line); }
.explain { margin-top: 12px; }
.rec { font-size: 19px; font-weight: 600; white-space: nowrap; }
.quick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.qcard { display: flex; align-items: center; gap: 10px; padding: 14px; background: var(--card); border-radius: var(--r-card); min-width: 0; }
.qcard:active { background: var(--press); }
.qcard.wide { grid-column: 1 / -1; }
.pl { margin-top: 10px; }
.pl .right { text-align: right; }
.pl-v { font-size: 20px; font-weight: 700; }
.pl .total { background: var(--card-2); }
.pl-change { margin-bottom: 4px; }
.lifts { margin-top: 12px; background: var(--card-2); }
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
