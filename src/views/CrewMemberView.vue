<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="back"><Icon name="back" /></button>
      <span class="grow" />
      <button v-if="canRemove" class="icon-btn" :aria-label="t('Remove from the crew')" @click="removeOpen = true"><Icon name="removeUser" /></button>
    </div>

    <p v-if="!member" class="t-small t-muted">{{ board.loading ? t('Loading…') : t('That person isn\'t in the crew any more.') }}</p>

    <template v-else>
      <div class="row who">
        <span class="avatar big" :style="avatarStyle(member.id)">{{ initial(member.id) }}</span>
        <div class="grow">
          <h1 class="t-title name">{{ member.name }}</h1>
          <div class="t-small t-muted">
            <template v-if="isMe">{{ t('You') }}</template><template v-if="member.owner">{{ isMe ? ' · ' : '' }}{{ t('Crew owner') }}</template>
            <template v-if="since">{{ (isMe || member.owner) ? ' · ' : '' }}{{ t('Training since {date}', { date: since }) }}</template>
          </div>
        </div>
        <div class="streak" :class="{ off: !streak }" :aria-label="tn(streak, '{n}-week streak', '{n}-week streak')">
          <Icon name="fire" :size="22" /><span class="t-num">{{ streak }}</span>
        </div>
      </div>

      <div v-if="live" class="note note-ok t-small live row">
        <span class="live-dot" aria-hidden="true" />
        <span>{{ t('Training now') }} · {{ liveText }}</span>
      </div>

      <button v-if="canNudge" class="btn btn-soft btn-block nudge" :disabled="nudging" @click="doNudge">
        <Icon name="wave" />{{ t('Nudge {name} to train', { name: member.name }) }}
      </button>
      <p v-else-if="!isMe && nudged" class="t-small t-muted nudge-note">{{ t('You nudged them this week 👋') }}</p>

      <!-- Numbers -->
      <div class="stats">
        <div v-for="b in blocks" :key="b.key" class="card stat">
          <div class="t-tiny t-muted">{{ b.label }}</div>
          <div class="t-num stat-v">{{ b.tot.workouts }}</div>
          <div class="t-tiny t-muted t-num">{{ tn(b.tot.workouts, 'workout', 'workouts') }} · {{ tn(b.tot.sets, '{n} set', '{n} sets') }}</div>
        </div>
      </div>
      <div class="group all">
        <div class="group-row"><span class="grow">{{ t('Total weight lifted') }}</span><b class="t-num">{{ fmtNum(all.volume, 0) }} {{ unit }}</b></div>
        <div class="group-row"><span class="grow">{{ t('Records') }}</span><b class="t-num">{{ all.records }}</b></div>
        <div class="group-row"><span class="grow">{{ t('Best streak') }}</span><b class="t-num">{{ tn(all.bestStreak, '{n} week', '{n} weeks') }}</b></div>
      </div>

      <!-- Head-to-head -->
      <template v-if="lifts">
        <h2 class="section-h">{{ isMe ? t('Your lifts') : t('Head-to-head') }}</h2>
        <Segmented v-model="basis" :options="[{ label: t('Estimated max'), value: 'e1rm' }, { label: t('Actually lifted'), value: 'actual' }]" :label="t('Count it as')" />
        <div class="card cmp">
          <div v-if="!isMe" class="row cmp-head t-tiny t-muted">
            <span class="grow" />
            <span class="col">{{ member.name }}</span>
            <span class="col">{{ t('You') }}</span>
          </div>
          <div v-for="k in ['squat', 'bench', 'deadlift', 'total']" :key="k" class="row cmp-row">
            <span class="grow">{{ LIFT_LABEL[k] }}</span>
            <span class="col t-num" :class="{ win: !isMe && beats(lifts[k], mine?.[k]) }">{{ lifts[k] ? fmtLoad(lifts[k], unit) : '–' }}</span>
            <span v-if="!isMe" class="col t-num" :class="{ win: beats(mine?.[k], lifts[k]) }">{{ mine?.[k] ? fmtLoad(mine[k], unit) : '–' }}</span>
          </div>
          <div v-if="lifts.dots || (!isMe && mine?.dots)" class="row cmp-row">
            <span class="grow">DOTS</span>
            <span class="col t-num">{{ lifts.dots ? fmtNum(lifts.dots, 1) : '–' }}</span>
            <span v-if="!isMe" class="col t-num">{{ mine?.dots ? fmtNum(mine.dots, 1) : '–' }}</span>
          </div>
        </div>

        <template v-if="chartLifts.length">
          <div class="chips">
            <button v-for="k in chartLifts" :key="k" class="chip" :class="{ on: chartLift === k }" @click="chartLift = k">{{ LIFT_LABEL[k] }}</button>
          </div>
          <div class="card card-pad chart-card">
            <div class="t-tiny t-muted">{{ t('Best estimated max each week (last 6 months)') }}</div>
            <div class="chart"><Line :data="chartData" :options="chartOptions" /></div>
          </div>
        </template>
      </template>

      <!-- Badges -->
      <template v-if="badges.length">
        <h2 class="section-h">{{ t('Badges') }} <span class="t-faint">{{ badges.length }}</span></h2>
        <div class="badges">
          <div v-for="b in badges" :key="b" class="badge" :class="'k-' + badgeKind(b)">
            <span class="b-ic"><Icon :name="BADGE_ICON[badgeKind(b)]" :size="20" /></span>
            <span class="t-small b-t">{{ badgeName(b, memberUnit) }}</span>
          </div>
        </div>
      </template>

      <!-- Shared routines -->
      <template v-if="plans.length">
        <h2 class="section-h">{{ isMe ? t('Your shared routines') : t('Shared routines') }}</h2>
        <div class="group">
          <div v-for="pl in plans" :key="pl.id" class="group-row">
            <div class="grow">
              <div class="t-h3 truncate">{{ pl.name }}</div>
              <div class="t-small t-muted">{{ tn(pl.summary?.days || 0, '{n} day', '{n} days') }} · {{ tn(pl.summary?.exercises || 0, '{n} exercise', '{n} exercises') }}</div>
            </div>
            <button v-if="!isMe" class="btn btn-sm btn-soft" :disabled="copying === pl.id" @click="copyPlan(pl)"><Icon name="copy" :size="18" />{{ t('Copy') }}</button>
          </div>
        </div>
      </template>
      <p v-if="isMe" class="t-tiny t-muted foot">{{ t('Share one of My routines from its page: ⋯ → Share with the crew.') }}</p>

      <!-- Recent posts -->
      <template v-if="posts.length">
        <h2 class="section-h">{{ t('Recent posts') }}</h2>
        <div class="feed">
          <CrewPost v-for="e in posts" :key="e.id" :event="e" />
        </div>
      </template>
    </template>

    <Sheet v-model="removeOpen" :title="t('Remove {name} from the crew?', { name: member?.name || '' })">
      <p class="t-body">{{ t('Their posts and place on the board go. They can join again if they still have the code, so if you want them out for good, start a new crew and invite everyone else.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="removeOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-danger btn-lg" @click="doRemove">{{ t('Remove') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Segmented from '../ui/Segmented.vue'
import CrewPost from '../ui/CrewPost.vue'
import { toast } from '../ui/toast.js'
import { avatarStyle, initial, badgeName } from '../ui/crewUi.js'
import { state } from '../store.js'
import {
  board, inCrew, me, isOwner, memberById, memberTotals, memberLifts, memberLine, liveOf, nudge, removeMember,
  refreshBoard, copySharedPlan
} from '../lib/crew.js'
import { sortBadges, badgeKind } from '../lib/crewStats.js'
import { weekKey, addDays } from '../lib/stats.js'
import { fmtLoad } from '../lib/training.js'
import { fmtNum } from '../lib/format.js'
import { useChartTheme } from '../lib/chartTheme.js'
import { t, tn, tx, locale } from '../i18n/index.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

const route = useRoute()
const router = useRouter()
const ct = useChartTheme()
const id = computed(() => route.params.id)
const member = computed(() => memberById.value[id.value] || null)
const isMe = computed(() => id.value === me.value)
const unit = computed(() => state.data.profile.unit)
const memberUnit = computed(() => member.value?.stats?.pl?.unit || member.value?.stats?.month?.unit || unit.value)

onMounted(() => { if (inCrew.value && !board.fetchedAt) refreshBoard() })

function back () {
  if (window.history.state?.back) router.back()
  else router.replace('/crew')
}

const LIFT_LABEL = computed(() => ({ squat: t('Squat'), bench: t('Bench'), deadlift: t('Deadlift'), total: t('Total') })).value
const BADGE_ICON = { workouts: 'train', streak: 'fire', records: 'trophy', plates: 'lifter', total: 'medal' }

const since = computed(() => {
  const d = member.value?.stats?.all?.since
  return d ? new Date(d + 'T12:00:00').toLocaleDateString(locale(), { month: 'short', year: 'numeric' }) : ''
})
const streak = computed(() => {
  const s = member.value?.stats || {}
  return s.streak?.weeks && s.week?.key >= weekKey(addDays(new Date(state.today + 'T12:00:00'), -7)) ? s.streak.weeks : 0
})
const live = computed(() => liveOf(member.value))
const liveText = computed(() => {
  const l = live.value
  if (!l) return ''
  return `${tx({ n: l.dayName, es: { n: l.dayNameEs } }, 'n') || t('Free session')} · ${t('{n} min', { n: l.minutes })}`
})

const blocks = computed(() => [
  { key: 'week', label: t('This week'), tot: memberTotals(member.value, 'week') },
  { key: 'month', label: t('This month'), tot: memberTotals(member.value, 'month') },
  { key: 'all', label: t('All time'), tot: memberTotals(member.value, 'all') }
])
const all = computed(() => memberTotals(member.value, 'all'))

// ── Nudge ──
const nudged = computed(() => board.nudgesOut.includes(id.value))
const canNudge = computed(() => !isMe.value && !nudged.value && memberTotals(member.value, 'week').workouts === 0)
const nudging = ref(false)
async function doNudge () {
  nudging.value = true
  try {
    await nudge(id.value)
    toast(t('Nudge sent to {name} 👋', { name: member.value.name }))
  } catch (e) { toast(e.message) } finally { nudging.value = false }
}

// ── Lifts ──
const basis = ref(state.data.settings.plBasis || 'e1rm')
const lifts = computed(() => {
  const l = memberLifts(member.value, basis.value)
  return l && ['squat', 'bench', 'deadlift'].some(k => l[k]) ? l : null
})
const mine = computed(() => memberLifts(memberById.value[me.value], basis.value))
const beats = (a, b) => !!a && (!b || a > b + 0.01)

const chartLifts = computed(() => ['squat', 'bench', 'deadlift'].filter(k => memberLine(member.value, k).length))
const chartLift = ref('bench')
const chartLiftNow = computed(() => (chartLifts.value.includes(chartLift.value) ? chartLift.value : chartLifts.value[0]))
const chartData = computed(() => {
  const k = chartLiftNow.value
  const theirs = Object.fromEntries(memberLine(member.value, k))
  const ours = isMe.value ? {} : Object.fromEntries(memberLine(memberById.value[me.value], k))
  const weeks = [...new Set([...Object.keys(theirs), ...Object.keys(ours)])].sort()
  const label = (wk) => new Date(wk + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
  const ds = (name, map, color) => ({
    label: name, data: weeks.map(w => map[w] ?? null), borderColor: color, backgroundColor: color,
    borderWidth: 2, tension: 0.25, spanGaps: true, pointRadius: 3, pointHoverRadius: 5, pointBorderWidth: 2, pointBorderColor: ct.value.surface
  })
  return {
    labels: weeks.map(label),
    datasets: [ds(isMe.value ? t('You') : member.value.name, theirs, ct.value.series[0]), ...(isMe.value ? [] : [ds(t('You'), ours, ct.value.series[1])])]
  }
})
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: !isMe.value, position: 'top', align: 'start', labels: { color: ct.value.ink, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 14 } },
    tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (c) => `${c.dataset.label}: ${fmtLoad(c.parsed.y, unit.value)}` } }
  },
  scales: {
    x: { ticks: { color: ct.value.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 }, grid: { display: false }, border: { display: false } },
    y: { ticks: { color: ct.value.ink, maxTicksLimit: 5 }, grid: { color: ct.value.grid }, border: { display: false } }
  }
}))

// ── Badges, plans, posts ──
const badges = computed(() => sortBadges(member.value?.stats?.badges || []))
const plans = computed(() => board.plans.filter(p => p.member_id === id.value))
const posts = computed(() => board.events.filter(e => e.member_id === id.value).slice(0, 10))
const copying = ref(null)
async function copyPlan (pl) {
  copying.value = pl.id
  try {
    const plan = await copySharedPlan(pl)
    toast(t('Copied to My routines'))
    router.push(`/plan/${plan.id}`)
  } catch (e) { toast(e.message) } finally { copying.value = null }
}

// ── Owner ──
const canRemove = computed(() => isOwner.value && member.value && !isMe.value)
const removeOpen = ref(false)
async function doRemove () {
  try {
    const name = member.value.name
    await removeMember(id.value)
    removeOpen.value = false
    toast(t('{name} was removed from the crew', { name }))
    router.replace('/crew')
  } catch (e) { toast(e.message) }
}
</script>

<style scoped>
.who { gap: 14px; margin-top: 4px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; flex: 0 0 auto; }
.avatar.big { width: 58px; height: 58px; font-size: 26px; }
.name { line-height: 1.1; }
.streak { display: flex; align-items: center; gap: 2px; color: var(--warn); font-size: 22px; font-weight: 700; }
.streak.off { color: var(--ink-3); }
.live { margin-top: 14px; gap: 10px; }
.live-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ok); flex: 0 0 auto; }
.nudge { margin-top: 14px; }
.nudge-note { margin: 12px 4px 0; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 18px; }
.stat { padding: 12px; }
.stat-v { font-size: 30px; font-weight: 700; line-height: 1.1; margin-top: 4px; }
.all { margin-top: 8px; }
.cmp { margin-top: 10px; padding: 6px 16px; }
.cmp-head { padding: 8px 0 2px; }
.cmp-row { padding: 10px 0; }
.cmp-row + .cmp-row { border-top: 1px solid var(--line); }
.col { width: 92px; text-align: right; flex: 0 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cmp-row .col { font-weight: 600; font-size: 17px; }
.col.win { color: var(--ok); }
.chips { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.chip { min-height: 36px; padding: 0 14px; border-radius: 18px; background: var(--card); color: var(--ink-2); font-weight: 600; }
.chip.on { background: var(--ink); color: var(--paper, var(--card)); }
.chart-card { margin-top: 10px; }
.chart { height: 220px; margin-top: 10px; }
.badges { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.badge { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--card); }
.b-ic { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto; background: var(--warn-soft); color: var(--warn); }
.badge.k-workouts .b-ic { background: var(--info-soft, var(--card-2)); color: var(--info, var(--ink-2)); }
.badge.k-streak .b-ic { background: var(--warn-soft); color: var(--warn); }
.badge.k-records .b-ic, .badge.k-total .b-ic { background: var(--ok-soft); color: var(--ok); }
.b-t { font-weight: 600; line-height: 1.2; }
.feed { display: flex; flex-direction: column; gap: 10px; }
.foot { margin: 10px 4px 0; }
</style>
