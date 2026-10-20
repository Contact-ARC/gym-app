<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>

    <!-- No month chosen: list them -->
    <template v-if="!month">
      <h1 class="t-title">{{ t('Monthly reports') }}</h1>
      <p v-if="!months.length" class="t-body t-muted sub">{{ t('Your first report appears after your first workout.') }}</p>
      <div v-else class="group list">
        <RouterLink v-for="m in months" :key="m" :to="`/report/${m}`" class="group-row">
          <Icon name="report" />
          <span class="grow t-h3">{{ monthName(m) }}</span>
          <span class="t-small t-muted">{{ tn(countFor(m), '{n} workout', '{n} workouts') }}</span>
          <Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
    </template>

    <template v-else>
      <div class="row head">
        <button class="icon-btn" :aria-label="t('Previous month')" :disabled="!prevMonth" @click="go(prevMonth)"><Icon name="chevronLeft" /></button>
        <div class="grow center">
          <div class="t-tiny t-muted up">{{ isCurrent ? t('This month so far') : t('Monthly report') }}</div>
          <h1 class="t-title">{{ monthName(month) }}</h1>
        </div>
        <button class="icon-btn" :aria-label="t('Next month')" :disabled="!nextMonth" @click="go(nextMonth)"><Icon name="chevronRight" /></button>
      </div>

      <p v-if="!r.sessions" class="t-body t-muted sub center">{{ t('No workouts this month.') }}</p>

      <template v-else>
        <div class="hero card">
          <div class="t-num hero-n">{{ r.sessions }}</div>
          <div class="t-h3">{{ tn(r.sessions, 'workout', 'workouts') }}</div>
          <div class="t-small t-muted">{{ compareLine }}</div>
        </div>

        <div class="grid">
          <div class="cell"><div class="t-num v">{{ hours }}</div><div class="t-tiny t-muted">{{ t('hours') }}</div></div>
          <div class="cell"><div class="t-num v">{{ r.sets }}</div><div class="t-tiny t-muted">{{ t('hard sets') }}</div></div>
          <div class="cell"><div class="t-num v">{{ fmtNum(r.volume / 1000, 1) }}</div><div class="t-tiny t-muted">{{ r.unit === 'lb' ? t('thousand lb lifted') : t('tonnes lifted') }}</div></div>
          <div class="cell"><div class="t-num v">{{ r.prCount }}</div><div class="t-tiny t-muted">{{ t('records') }}</div></div>
        </div>

        <!-- Calendar -->
        <div class="card cal">
          <div class="cal-row cal-head">
            <span v-for="l in weekdayLabels" :key="l" class="t-tiny t-muted">{{ l }}</span>
          </div>
          <div v-for="(wk, wi) in weeks" :key="wi" class="cal-row">
            <span v-for="d in wk" :key="d.key" class="cd" :class="{ out: !d.inMonth, on: d.sessions.length }" :style="d.sessions.length ? cellStyle(d.sessions[0]) : null">
              <span class="t-num">{{ d.inMonth ? d.day : '' }}</span>
            </span>
          </div>
          <div class="row cal-foot t-small">
            <Icon name="fire" :size="18" class="t-warn" />
            <span>{{ tn(r.bestStreak, 'Best streak so far: {n} week', 'Best streak so far: {n} weeks') }}</span>
          </div>
        </div>

        <!-- Challenge -->
        <div v-if="ch" class="card card-pad chl" :class="{ done: ch.status.done }">
          <div class="row">
            <Icon :name="ch.status.done ? 'trophy' : 'challenge'" />
            <div class="grow">
              <div class="t-tiny t-muted up">{{ t('Challenge') }}</div>
              <div class="t-h3">{{ tx(ch.def, 'title') }}</div>
            </div>
            <span class="t-num chv">{{ fmtNum(ch.status.value, 0) }}/{{ fmtNum(ch.status.target, 0) }}</span>
          </div>
          <div class="bar"><div :style="{ width: Math.round(ch.status.pct * 100) + '%' }" /></div>
        </div>

        <section v-if="r.lifts.length">
          <h2 class="section-h">{{ t('Biggest gains') }}</h2>
          <div class="group">
            <RouterLink v-for="l in r.lifts" :key="l.exerciseId" :to="`/exercise/${l.exerciseId}`" class="group-row">
              <span class="up-icon"><Icon name="up" :size="18" /></span>
              <div class="grow">
                <div class="t-h3 truncate">{{ exName(l.exerciseId) }}</div>
                <div class="t-small t-muted t-num">{{ l.unit === 'pin' ? t('Heaviest pin') : t('Estimated max') }}: {{ fmtLoad(l.from, l.unit) }} → {{ fmtLoad(l.to, l.unit) }}</div>
              </div>
              <b class="t-num t-ok gain">+{{ Math.round(l.pct * 100) }}%</b>
            </RouterLink>
          </div>
        </section>

        <section v-if="r.prs.length">
          <h2 class="section-h">{{ t('Records') }}</h2>
          <div class="group">
            <div v-for="p in prList" :key="p.exerciseId + p.type" class="group-row pr">
              <span class="pr-icon"><Icon name="trophy" :size="18" /></span>
              <div class="grow">
                <div class="t-h3 truncate">{{ exName(p.exerciseId) }}</div>
                <div class="t-small t-num">{{ prText(p, unitOf(p.exerciseId)).main }}<span class="t-muted">, {{ prText(p, unitOf(p.exerciseId)).was }}</span></div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="r.muscles.length">
          <h2 class="section-h">{{ t('Most trained') }}</h2>
          <div class="card card-pad">
            <div v-for="m in r.muscles.slice(0, 6)" :key="m.muscle" class="mrow">
              <span class="t-small mname">{{ muscleLabel(m.muscle) }}</span>
              <div class="mtrack"><div :style="{ width: (m.sets / r.muscles[0].sets) * 100 + '%' }" /></div>
              <span class="t-num t-small mval">{{ fmtNum(m.sets, 1) }}</span>
            </div>
            <p class="t-tiny t-muted mfoot">{{ t('Hard sets this month (helping muscles count half).') }}</p>
          </div>
        </section>

        <button class="btn btn-primary btn-lg btn-block share" :disabled="sharing" @click="shareImage"><Icon name="share" />{{ t('Share image') }}</button>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import { dayPlate } from '../ui/plates.js'
import { toast } from '../ui/toast.js'
import { state, exercisesById, routine } from '../store.js'
import { fmtLoad, unitFor } from '../lib/training.js'
import { monthName, fmtNum, muscleLabel, prText, PR_ORDER } from '../lib/format.js'
import { monthReport, monthsWithWorkouts, calendarMonth, weekStart, addDays, challengeProgress, sessionsInMonth } from '../lib/stats.js'
import { drawCard, shareCanvas } from '../lib/shareCard.js'
import { t, tn, tx, locale } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const month = computed(() => route.params.month || null)
const months = computed(() => monthsWithWorkouts(state.data.sessions))
const isCurrent = computed(() => month.value === state.today.slice(0, 7))
const countFor = (m) => sessionsInMonth(state.data.sessions, m).length
const idx = computed(() => months.value.indexOf(month.value))
const prevMonth = computed(() => (idx.value >= 0 ? months.value[idx.value + 1] : months.value.find(m => m < month.value)) || null)
const nextMonth = computed(() => (idx.value > 0 ? months.value[idx.value - 1] : null))
const go = (m) => m && router.replace(`/report/${m}`)

const unit = computed(() => state.data.profile.unit)
const r = computed(() => monthReport(state.data.sessions, month.value, { unit: unit.value, exercisesById: exercisesById.value }))
const exName = (id) => tx(exercisesById.value[id], 'name') || id
const unitOf = (id) => unitFor(exercisesById.value[id], state.data.profile)
const hours = computed(() => fmtNum(r.value.minutes / 60, 1))
const prList = computed(() => {
  const best = {}
  for (const p of r.value.prs) if (!best[p.exerciseId] || PR_ORDER[p.type] < PR_ORDER[best[p.exerciseId].type]) best[p.exerciseId] = p
  return Object.values(best)
})
const compareLine = computed(() => {
  const d = r.value.sessions - r.value.prevSessions
  if (!r.value.prevSessions) return t('Your first month logged in the app.')
  if (d > 0) return tn(d, '{n} more than last month', '{n} more than last month')
  if (d < 0) return tn(-d, '{n} fewer than last month', '{n} fewer than last month')
  return t('Same as last month')
})

const weeks = computed(() => calendarMonth(month.value, state.data.sessions))
const weekdayLabels = computed(() => {
  const mon = weekStart(new Date())
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i).toLocaleDateString(locale(), { weekday: 'narrow' }).toUpperCase())
})
const cellStyle = (s) => {
  const p = dayPlate(s.dayIndex ?? -1)
  return { background: p.bg, color: p.fg }
}

// The challenge from that month's routine, if it had one
const ch = computed(() => {
  const def = (routine.value?.month === month.value ? routine.value : state.data.routineArchive[month.value])?.challenge
  if (!def) return null
  const status = challengeProgress(def, state.data.sessions, month.value, { unit: unit.value, manual: state.data.challenges[month.value]?.manual || 0 })
  return { def, status }
})

const sharing = ref(false)
async function shareImage () {
  sharing.value = true
  try {
    const items = [
      ...r.value.lifts.map(l => ({ title: exName(l.exerciseId), detail: `${fmtLoad(l.from, l.unit)} → ${fmtLoad(l.to, l.unit)}  (+${Math.round(l.pct * 100)}%)`, trophy: false })),
      ...prList.value.filter(p => !r.value.lifts.some(l => l.exerciseId === p.exerciseId)).map(p => ({ title: exName(p.exerciseId), detail: prText(p, unitOf(p.exerciseId)).main, trophy: true }))
    ]
    const cv = await drawCard({
      accent: '#F2B33D',
      accentFg: '#15202E',
      badge: String(Number(month.value.slice(5))),
      kicker: state.data.profile.name || t('Monthly report'),
      title: monthName(month.value),
      subtitle: ch.value?.status.done ? t('Challenge complete: {c}', { c: tx(ch.value.def, 'title') }) : compareLine.value,
      stats: [
        { value: r.value.sessions, label: tn(r.value.sessions, 'workout', 'workouts') },
        { value: hours.value, label: t('hours') },
        { value: r.value.sets, label: t('hard sets') },
        { value: r.value.prCount, label: t('records') }
      ],
      calendar: { weeks: weeks.value, labels: weekdayLabels.value },
      heading: r.value.lifts.length ? t('Biggest gains') : t('Records'),
      items,
      footer: tn(r.value.bestStreak, 'Best streak so far: {n} week', 'Best streak so far: {n} weeks')
    })
    const res = await shareCanvas(cv, `month-${month.value}`)
    if (res === 'downloaded') toast(t('Image saved'))
  } catch (e) {
    toast(t("Couldn't make the image: {e}", { e: e.message || e }))
  } finally {
    sharing.value = false
  }
}
</script>

<style scoped>
.sub { margin-top: 12px; }
.list { margin-top: 16px; }
.head { gap: 4px; }
.center { text-align: center; }
.up { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
.hero { margin-top: 16px; padding: 20px; text-align: center; }
.hero-n { font-size: 72px; font-weight: 700; line-height: 1; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.cell { background: var(--card); border-radius: var(--r-card); padding: 14px; text-align: center; }
.v { font-size: 30px; font-weight: 700; line-height: 1.1; }
.cal { margin-top: 10px; padding: 12px 10px; }
.cal-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-row + .cal-row { margin-top: 4px; }
.cal-head { text-align: center; font-weight: 700; margin-bottom: 4px; }
.cd { aspect-ratio: 1; max-height: 44px; display: grid; place-items: center; border-radius: 50%; font-size: 16px; color: var(--ink-3); justify-self: center; width: 100%; max-width: 44px; }
.cd.on { font-weight: 700; box-shadow: 0 0 0 1px var(--plate-ring); }
.cd.out { visibility: hidden; }
.cal-foot { gap: 8px; margin-top: 12px; padding: 10px 4px 0; border-top: 1px solid var(--line); }
.t-warn { color: var(--warn); }
.chl { margin-top: 10px; }
.chl .row { gap: 10px; }
.chv { font-size: 20px; font-weight: 700; }
.bar { height: 8px; border-radius: 4px; background: var(--card-2); margin-top: 12px; overflow: hidden; }
.bar > div { height: 100%; background: var(--ink); }
.chl.done .bar > div { background: var(--ok); }
.up-icon { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); flex: 0 0 auto; }
.gain { font-size: 19px; }
.pr { align-items: flex-start; }
.pr-icon { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--warn-soft); color: var(--warn); flex: 0 0 auto; }
.mrow { display: grid; grid-template-columns: 96px 1fr 40px; align-items: center; gap: 10px; padding: 6px 0; }
.mname { font-weight: 600; }
.mtrack { height: 10px; border-radius: 5px; background: var(--card-2); overflow: hidden; }
.mtrack > div { height: 100%; background: var(--ink-2); border-radius: 5px; }
.mval { text-align: right; font-weight: 600; }
.mfoot { margin-top: 8px; }
.share { margin-top: 24px; }
</style>
