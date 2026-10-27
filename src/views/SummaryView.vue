<template>
  <div class="page no-nav" v-if="session" :style="plateStyle(session.dayIndex ?? -1)">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Close')" @click="router.replace('/')"><Icon name="close" /></button>
    </div>

    <div class="done-head">
      <div class="ring-wrap" :class="{ ringed: !!ring }">
        <svg v-if="ring" class="ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="54" />
          <circle class="ring-fg" :class="{ full: ring.pct >= 1, anim: justFinished }" cx="60" cy="60" r="54" :style="{ '--dash': (ring.pct * RING_LEN).toFixed(1) }" />
        </svg>
        <PlateBadge :index="session.dayIndex ?? -1" :label="session.dayId === 'free' ? '+' : session.dayId" size="lg" />
      </div>
      <h1 class="t-title">{{ justFinished ? t('Workout done') : sessionTitle(session) }}</h1>
      <p class="t-small t-muted">{{ justFinished ? sessionTitle(session) + ', ' : '' }}{{ fmtDate(session.startedAt) }}</p>
      <p v-if="ring" class="t-small ring-txt" :class="{ full: ring.pct >= 1 }">
        <Icon v-if="ring.pct >= 1" name="check" :size="18" />{{ ring.pct >= 1 ? t('Every planned set done') : t('{a} of {b} planned sets', { a: ring.done, b: ring.planned }) }}
      </p>
    </div>

    <div class="stats">
      <div class="stat"><div class="t-num v">{{ fmtMins(sum.minutes) }}</div><div class="t-tiny t-muted">{{ t('minutes') }}</div></div>
      <div class="stat"><div class="t-num v">{{ sum.sets }}</div><div class="t-tiny t-muted">{{ t('sets') }}</div></div>
      <div class="stat"><div class="t-num v">{{ fmtNum(sum.volume, 0) }}</div><div class="t-tiny t-muted">{{ t('{unit} lifted', { unit: sum.unit }) }}</div></div>
    </div>

    <div v-if="justFinished && (streak.weeks || streak.thisWeek)" class="row streak t-small" :class="{ safe: streak.safe }">
      <Icon name="fire" :size="20" />
      <span class="grow">
        <template v-if="streak.safe">{{ tn(streak.weeks, 'Week done: {n}-week streak.', 'Week done: {n}-week streak.') }}</template>
        <template v-else>{{ tn(streak.min - streak.thisWeek, '{n} more workout this week keeps your streak going.', '{n} more workouts this week keep your streak going.') }}</template>
      </span>
    </div>

    <section v-if="prGroups.length">
      <h2 class="section-h">{{ t('New personal records') }}</h2>
      <div class="group">
        <div v-for="g in prGroups" :key="g.id" class="group-row pr">
          <span class="pr-icon"><Icon name="trophy" :size="20" /></span>
          <div class="grow">
            <div class="t-h3">{{ name(g.id) }}</div>
            <div v-for="p in g.prs" :key="p.type" class="t-small t-num">
              {{ prText(p, unitOf(g.id)).main }}<span class="t-muted">, {{ prText(p, unitOf(g.id)).was }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="session.rating?.effort || session.rating?.energy || session.easy" class="row check">
      <span v-if="session.rating?.effort" class="pill">{{ t('Effort {n} of 5', { n: session.rating.effort }) }}</span>
      <span v-if="session.rating?.energy" class="pill">{{ t('Energy {n} of 5', { n: session.rating.energy }) }}</span>
      <span v-if="session.easy" class="pill pill-warn">{{ t('Lighter day') }}</span>
    </div>

    <!-- Goals reached in this workout -->
    <section v-if="reachedGoals.length" class="card card-pad goals-hit">
      <div class="row">
        <span class="g-icon"><Icon name="goal" :size="22" /></span>
        <div class="grow">
          <div class="t-tiny t-muted up">{{ tn(reachedGoals.length, 'Goal reached', 'Goals reached') }}</div>
          <div v-for="g in reachedGoals" :key="g.goal.id" class="t-h3">{{ goalTitle(g.goal, g.p.target, g.p.unit) }}</div>
        </div>
      </div>
    </section>

    <!-- Changes made during the workout -->
    <section v-if="justFinished && changes.length" class="card card-pad keep">
      <div class="t-h3">{{ isFree ? t('Save this workout as one of your days?') : t('Keep these changes?') }}</div>
      <ul v-if="!isFree" class="ch-list t-small">
        <li v-for="(c, i) in changes" :key="i">{{ changeText(c) }}</li>
      </ul>
      <p v-else class="t-small t-muted ch-p">{{ t('It goes to My routines with the exercises and sets you did, ready to do again.') }}</p>
      <div class="keep-acts">
        <button class="btn btn-soft" @click="keep('today')">{{ isFree ? t('No thanks') : t('Just today') }}</button>
        <button v-if="canAlways" class="btn btn-primary" @click="keep('always')">{{ session.source === 'mine' ? t('Update my day') : t('Always for day {id}', { id: session.dayId }) }}</button>
        <button class="btn" :class="isFree ? 'btn-primary' : 'btn-soft'" @click="openMine">{{ t('Save as mine') }}</button>
      </div>
    </section>

    <ChallengeCard v-if="justFinished" compact />

    <section>
      <div class="row what-h">
        <h2 class="section-h grow">{{ t('What you did') }}</h2>
        <RouterLink :to="`/workout/${session.id}`" class="btn btn-sm btn-ghost"><Icon name="edit" :size="18" />{{ t('Edit') }}</RouterLink>
      </div>
      <div class="group">
        <RouterLink v-for="id in sum.exercises" :key="id" :to="`/exercise/${id}`" class="group-row ex-row" :class="{ rec: prIds.has(id) }">
          <div class="grow">
            <div class="row ex-h">
              <span class="t-h3 grow">{{ name(id) }}</span>
              <span v-if="prIds.has(id)" class="pill rec-pill"><Icon name="trophy" :size="16" />{{ t('Record') }}</span>
              <Icon name="chevronRight" class="chev" />
            </div>
            <div class="sets-grid">
              <div v-for="r in setRows(id)" :key="r.id" class="srow" :class="{ wu: r.warm }">
                <span class="sn t-num">{{ r.n }}</span>
                <span class="t-num st">{{ r.text }}</span>
                <span v-if="r.delta" class="delta t-num" :class="r.cls">{{ r.delta }}</span>
              </div>
            </div>
          </div>
        </RouterLink>
      </div>
      <p v-if="hasPrev" class="t-tiny t-muted explain">{{ t('Each set next to the same set last time you did the exercise.') }}</p>
      <p v-if="session.notes" class="card card-pad t-small notes"><Icon name="note" :size="18" />{{ session.notes }}</p>
    </section>

    <p v-if="inCrew && state.data.crew.shareFeed" class="t-tiny t-muted crew-line">
      <Icon name="crew" :size="16" />{{ t('Shared with your crew.') }}
      <RouterLink to="/crew" class="link">{{ t('Open the crew board') }}</RouterLink>
    </p>

    <div class="row actions">
      <button class="btn btn-lg btn-soft grow" :disabled="sharing" @click="shareImage"><Icon name="share" />{{ t('Share image') }}</button>
      <button class="btn btn-lg btn-primary grow" @click="router.replace('/')">{{ t('Done') }}</button>
    </div>
    <div class="row minor">
      <button class="btn btn-ghost grow" @click="share"><Icon name="copy" :size="18" />{{ t('Share as text') }}</button>
      <button class="btn btn-ghost grow t-err" @click="confirmDelete = true"><Icon name="trash" :size="18" />{{ t('Delete') }}</button>
    </div>

    <Transition name="pop">
      <div v-if="badgePop.length" class="badge-scrim" role="dialog" aria-modal="true" :aria-label="t('New badge')" @click.self="badgePop = []">
        <div class="badge-card">
          <div class="burst" aria-hidden="true"><span v-for="i in 12" :key="i" :style="{ '--i': i }" /></div>
          <span class="b-big"><Icon :name="BADGE_ICON[badgeKind(badgePop[0])]" :size="44" /></span>
          <div class="t-tiny t-muted up">{{ tn(badgePop.length, 'New badge', 'New badges') }}</div>
          <div v-for="b in badgePop.slice(0, 3)" :key="b" class="t-h2 b-name">{{ badgeName(b, state.data.profile.unit) }}</div>
          <div v-if="badgePop.length > 3" class="t-small t-muted">{{ tn(badgePop.length - 3, 'and {n} more', 'and {n} more') }}</div>
          <p v-if="inCrew" class="t-small t-muted">{{ state.data.crew.shareFeed ? t('Your crew will see it on the board.') : t('Only you can see it.') }}</p>
          <button class="btn btn-primary btn-lg btn-block" @click="badgePop = []">{{ t('Nice') }}</button>
        </div>
      </div>
    </Transition>

    <Sheet v-model="mineOpen" :title="t('Save as mine')">
      <label class="label" for="sm-name">{{ t('Name') }}</label>
      <input id="sm-name" v-model="mineName" class="field" type="text" maxlength="40">
      <p class="t-small t-muted mt">{{ isFree ? t('A new day in My routines with what you did today.') : t('A copy of this day with today\'s changes, in My routines. The routine\'s day stays as it is.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="mineOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!mineName.trim()" @click="keep('mine')">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <Sheet v-model="confirmDelete" :title="t('Delete this workout?')">
      <p class="t-body">{{ t("It will be removed from your history and charts. This can't be undone.") }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="confirmDelete = false">{{ t('Keep it') }}</button>
        <button class="btn btn-danger btn-lg" @click="del">{{ t('Delete') }}</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page no-nav">
    <p class="t-h2">{{ t('This workout no longer exists') }}</p>
    <RouterLink to="/" class="btn btn-primary btn-lg btn-block" style="margin-top: 20px">{{ t('Go home') }}</RouterLink>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import ChallengeCard from '../ui/ChallengeCard.vue'
import { plateStyle, plateHex } from '../ui/plates.js'
import { toast } from '../ui/toast.js'
import {
  state, getSession, sessionSummary, exercisesById, deleteSession, streak, workoutChanges, keepWorkoutChanges, routine,
  planById, goalsWithProgress, historyFor
} from '../store.js'
import { parseKey } from '../lib/routines.js'
import { goalTitle } from '../lib/goalText.js'
import { fmtLoad, unitFor, convertLoad, isWorkSet } from '../lib/training.js'
import { fmtDate, fmtNum, fmtMins, dayTitle, prText, PR_ORDER, sessionTitle } from '../lib/format.js'
import { shareText } from '../lib/native.js'
import { drawCard, shareCanvas } from '../lib/shareCard.js'
import { inCrew, newBadgesFrom } from '../lib/crew.js'
import { badgeKind } from '../lib/crewStats.js'
import { badgeName } from '../ui/crewUi.js'
import { reducedMotion } from '../ui/motion.js'
import { t, tn, tx } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession(route.params.id))
const sum = computed(() => sessionSummary(session.value))
const name = (id) => tx(exercisesById.value[id], 'name') || id
const unitOf = (id) => unitFor(exercisesById.value[id], state.data.profile)
const justFinished = computed(() => session.value?.finishedAt && Date.now() - new Date(session.value.finishedAt) < 30 * 60000)

const prGroups = computed(() => {
  const m = new Map()
  for (const p of sum.value.prs) { if (!m.has(p.exerciseId)) m.set(p.exerciseId, []); m.get(p.exerciseId).push(p) }
  return [...m].map(([id, prs]) => ({ id, prs: prs.sort((a, b) => PR_ORDER[a.type] - PR_ORDER[b.type]) }))
})

// ── Changes made during the workout ──
const changes = computed(() => workoutChanges(session.value))
const isFree = computed(() => session.value?.source === 'free' || session.value?.dayId === 'free')
const canAlways = computed(() => {
  const s = session.value
  if (!s || isFree.value) return false
  if (s.source === 'mine') return !!planById(parseKey(s.dayKey)?.planId)
  return s.routineMonth === routine.value?.month
})
function changeText (c) {
  if (c.kind === 'swap') return t('{a} → {b}', { a: name(c.from), b: name(c.to) })
  if (c.kind === 'sets') return t('{name}: {a} → {b} sets', { name: name(c.exerciseId), a: c.from, b: c.to })
  return t('Added {name}', { name: name(c.exerciseId) })
}
const mineOpen = ref(false)
const mineName = ref('')
function openMine () {
  const s = session.value
  mineName.value = isFree.value ? t('My day') : t('{day} (mine)', { day: sessionTitle(s) })
  mineOpen.value = true
}
function keep (how) {
  const plan = how === 'today' ? null : keepWorkoutChanges(session.value.id, how, mineName.value.trim())
  if (how === 'today') keepWorkoutChanges(session.value.id, 'today')
  mineOpen.value = false
  if (how === 'always') toast(session.value.source === 'mine' ? t('Your day is updated') : t('Day {id} will have these changes from now on', { id: session.value.dayId }))
  else if (plan) toast(t('Saved to My routines'), { actionLabel: t('Open'), action: () => router.push(`/plan/${plan.id}`) })
}

// Goals this workout reached
const reachedGoals = computed(() => {
  const s = session.value
  if (!s?.finishedAt) return []
  const from = s.startedAt; const to = new Date(new Date(s.finishedAt).getTime() + 120000).toISOString()
  return goalsWithProgress.value.filter(g => g.goal.doneAt && g.goal.doneAt >= from && g.goal.doneAt <= to)
})

// ── Finish ring: work sets done against the plan ──
const RING_LEN = 2 * Math.PI * 54
const ring = computed(() => {
  const s = session.value
  const planned = (s?.items || []).reduce((n, it) => n + (Number(it.sets) || 0), 0)
  if (!planned) return null
  const done = s.sets.filter(isWorkSet).length
  return { done, planned, pct: Math.min(1, done / planned) }
})

// ── Each set against the same set last time ──
const prIds = computed(() => new Set(prGroups.value.map(g => g.id)))
function previousSets (id) {
  // historyFor is newest first: the first one before this workout
  const h = historyFor(id, session.value.id).find(x => x.date < session.value.startedAt)
  return h ? h.sets.filter(isWorkSet) : null
}
const hasPrev = computed(() => sum.value.exercises.some(id => previousSets(id)))
function signed (n, unitStr) {
  const v = Math.round(Math.abs(n) * 100) / 100
  return `${n > 0 ? '+' : '−'}${unitStr(v)}`
}
function deltaOf (s, p) {
  if (!p) return null
  const parts = []
  let score = 0
  if (s.seconds || p.seconds) {
    const d = (s.seconds || 0) - (p.seconds || 0)
    if (d) { parts.push(signed(d, v => `${v} s`)); score = d }
  } else {
    const pl = p.load && p.unit !== s.unit && s.unit !== 'pin' && p.unit !== 'pin' ? convertLoad(p.load, p.unit, s.unit) : (p.load || 0)
    const dl = Math.round(((s.load || 0) - pl) * 100) / 100
    const dr = (s.reps || 0) - (p.reps || 0)
    if (Math.abs(dl) >= 0.01) parts.push(signed(dl, v => s.unit === 'pin' ? tn(v, '{n} pin', '{n} pins') : fmtLoad(v, s.unit)))
    if (dr) parts.push(signed(dr, v => tn(v, '{n} rep', '{n} reps')))
    score = Math.abs(dl) >= 0.01 ? dl : dr
  }
  if (!parts.length) return { text: t('same'), cls: 'd-same' }
  return { text: parts.join(' '), cls: score > 0 ? 'd-up' : 'd-down' }
}
function setRows (id) {
  const prev = previousSets(id)
  let w = 0
  return session.value.sets.filter(s => s.exerciseId === id).map(s => {
    const warm = !isWorkSet(s)
    const d = warm ? null : deltaOf(s, prev?.[w])
    if (!warm) w++
    return { id: s.id, warm, n: warm ? 'W' : w, text: setText(s), delta: d?.text, cls: d?.cls }
  })
}
function setText (s) {
  if (s.seconds) return s.load ? t('{load} for {s}s', { load: fmtLoad(s.load, s.unit), s: s.seconds }) : `${s.seconds}s`
  const reps = s.repsL != null && s.repsR != null && s.repsL !== s.repsR ? `${s.repsL}/${s.repsR}` : s.reps
  const tag = TAGS[s.type] && s.type !== 'warmup' ? ` (${t(TAGS[s.type])})` : ''
  return `${s.load ? fmtLoad(s.load, s.unit) : t('BW')} × ${reps}${tag}`
}

// ── Badges earned by this workout ──
const BADGE_ICON = { workouts: 'train', streak: 'fire', records: 'trophy', plates: 'lifter', total: 'medal' }
const badgePop = ref([])
onMounted(() => {
  if (!justFinished.value) return
  try {
    const fresh = newBadgesFrom(session.value.id)
    if (fresh.length) setTimeout(() => { badgePop.value = fresh }, reducedMotion() ? 0 : 900)
  } catch (e) { /* badges are a bonus; never block the finish screen */ }
})

const TAGS = { warmup: 'warm-up', drop: 'drop', failure: 'to failure', amrap: 'max reps' }
function setsFor (id) {
  return session.value.sets.filter(s => s.exerciseId === id).map(s => {
    if (s.seconds) return s.load ? t('{load} for {s}s', { load: fmtLoad(s.load, s.unit), s: s.seconds }) : `${s.seconds}s`
    const reps = s.repsL != null && s.repsR != null && s.repsL !== s.repsR ? `${s.repsL}/${s.repsR}` : s.reps
    const tag = TAGS[s.type] ? ` (${t(TAGS[s.type])})` : ''
    return `${s.load ? fmtLoad(s.load, s.unit) : t('BW')} × ${reps}${tag}`
  }).join(',  ')
}

async function share () {
  const lines = [
    t('{day}: {min} min, {sets} sets, {vol} {unit} lifted', { day: sessionTitle(session.value), min: fmtMins(sum.value.minutes), sets: sum.value.sets, vol: fmtNum(sum.value.volume, 0), unit: sum.value.unit })
  ]
  for (const g of prGroups.value) lines.push(`🏆 ${name(g.id)}: ${prText(g.prs[0], unitOf(g.id)).main}`)
  for (const id of sum.value.exercises) lines.push(`${name(id)}: ${setsFor(id)}`)
  const r = await shareText(t('Workout'), lines.join('\n'))
  if (r === 'copied') toast(t('Copied to clipboard'))
}

const sharing = ref(false)
async function shareImage () {
  sharing.value = true
  try {
    const s = session.value
    const plate = plateHex(s.dayIndex ?? -1)
    const prItems = prGroups.value.map(g => {
      const txt = prText(g.prs[0], unitOf(g.id))
      return { title: name(g.id), detail: `${txt.main} (${txt.was})`, trophy: true }
    })
    const exItems = sum.value.exercises.filter(id => !prGroups.value.some(g => g.id === id))
      .map(id => ({ title: name(id), detail: setsFor(id) }))
    const who = state.data.profile.name
    const cv = await drawCard({
      accent: plate.bg,
      accentFg: plate.fg,
      badge: s.dayId === 'free' ? '+' : s.dayId,
      kicker: fmtDate(s.startedAt),
      title: sessionTitle(s),
      subtitle: prGroups.value.length ? tn(prGroups.value.length, '{n} new record', '{n} new records') : t('Workout done'),
      stats: [
        { value: fmtMins(sum.value.minutes), label: t('minutes') },
        { value: sum.value.sets, label: t('sets') },
        { value: fmtNum(sum.value.volume, 0), label: t('{unit} lifted', { unit: sum.value.unit }) }
      ],
      heading: prItems.length ? t('Records') : t('Exercises'),
      items: [...prItems, ...exItems],
      footer: [who, streak.value.weeks ? tn(streak.value.weeks, '{n}-week streak', '{n}-week streak') : ''].filter(Boolean).join('  ·  ')
    })
    const r = await shareCanvas(cv, 'workout')
    if (r === 'downloaded') toast(t('Image saved'))
  } catch (e) {
    toast(t("Couldn't make the image: {e}", { e: e.message || e }))
  } finally {
    sharing.value = false
  }
}

const confirmDelete = ref(false)
function del () {
  deleteSession(session.value.id)
  confirmDelete.value = false
  router.replace('/')
  toast(t('Workout deleted'))
}
</script>

<style scoped>
.ring-wrap { position: relative; display: grid; place-items: center; }
.ring-wrap.ringed { width: 120px; height: 120px; }
.ring { position: absolute; inset: 0; width: 120px; height: 120px; transform: rotate(-90deg); }
.ring circle { fill: none; stroke-width: 8; }
.ring-bg { stroke: var(--card-2); }
.ring-fg { stroke: var(--info); stroke-linecap: round; stroke-dasharray: var(--dash) 999; }
.ring-fg.full { stroke: var(--ok); }
.ring-fg.anim { animation: ringIn 900ms cubic-bezier(.2,.8,.2,1) both 150ms; }
@keyframes ringIn { from { stroke-dasharray: 0 999; } }
.ring-txt { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: var(--ink-2); }
.ring-txt.full { color: var(--ok); }
.ex-row { align-items: flex-start; }
.ex-row.rec { box-shadow: inset 4px 0 0 var(--plate-yellow); }
.ex-h { gap: 8px; }
.rec-pill { gap: 4px; background: var(--warn-soft); color: var(--warn); min-height: 26px; padding: 0 10px; font-size: 13px; font-weight: 700; }
.sets-grid { margin-top: 6px; display: grid; gap: 2px; }
.srow { display: flex; align-items: baseline; gap: 10px; font-size: 17px; }
.srow.wu { color: var(--ink-3); }
.sn { width: 18px; color: var(--ink-3); font-size: 14px; font-weight: 700; text-align: center; flex: 0 0 auto; }
.st { color: var(--ink-2); }
.delta { margin-left: auto; font-size: 14px; font-weight: 700; white-space: nowrap; }
.delta.d-up { color: var(--ok); }
.delta.d-down, .delta.d-same { color: var(--ink-3); font-weight: 600; }
.explain { margin: 8px 4px 0; }
.badge-scrim { position: fixed; inset: 0; z-index: 1200; background: rgba(10, 14, 20, 0.55); display: grid; place-items: center; padding: 24px; }
.badge-card { position: relative; width: 100%; max-width: 340px; background: var(--card); border-radius: 24px; padding: 30px 22px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; overflow: hidden; }
.badge-card .btn { margin-top: 12px; }
.b-big { width: 88px; height: 88px; border-radius: 50%; display: grid; place-items: center; background: var(--warn-soft); color: var(--warn); margin-bottom: 6px; animation: bIn 600ms cubic-bezier(.3,1.6,.5,1) both 120ms; }
@keyframes bIn { from { transform: scale(0.3) rotate(-20deg); opacity: 0; } }
.b-name { line-height: 1.2; }
.burst { position: absolute; left: 50%; top: 74px; width: 0; height: 0; pointer-events: none; }
.burst span { position: absolute; width: 8px; height: 8px; border-radius: 2px; background: var(--plate-yellow, #E7B416); transform: rotate(calc(var(--i) * 30deg)) translateY(0); opacity: 0; animation: burst 900ms ease-out both 250ms; }
.burst span:nth-child(3n) { background: var(--plate-red, #C7322B); }
.burst span:nth-child(3n+1) { background: var(--plate-blue, #2457B5); }
@keyframes burst { 0% { opacity: 1; transform: rotate(calc(var(--i) * 30deg)) translateY(0); } 100% { opacity: 0; transform: rotate(calc(var(--i) * 30deg)) translateY(-90px); } }
.pop-enter-active, .pop-leave-active { transition: opacity 200ms ease; }
.pop-enter-from, .pop-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .ring-fg.anim, .b-big, .burst span { animation: none; } .burst { display: none; } }
.done-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; margin: 4px 0 22px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--card); border-radius: var(--r-card); }
.stat { padding: 16px 8px; text-align: center; }
.stat + .stat { border-left: 1px solid var(--line); }
.v { font-size: 34px; font-weight: 700; line-height: 1.05; }
.pr { align-items: flex-start; }
.pr-icon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--warn-soft); color: var(--warn); flex: 0 0 auto; }
.notes { display: flex; gap: 8px; margin-top: 10px; }
.actions { margin-top: 28px; gap: 10px; }
.minor { gap: 10px; margin-top: 8px; }
.streak { gap: 10px; margin-top: 14px; padding: 12px 14px; border-radius: var(--r-card); background: var(--warn-soft); color: var(--warn); }
.streak .grow { color: var(--ink); }
.streak.safe { background: var(--ok-soft); color: var(--ok); }
.crew-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 18px 4px 0; }
.link { font-weight: 600; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.check { flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.what-h { align-items: flex-end; }
.keep { margin-top: 16px; }
.ch-list { margin: 10px 0 0 20px; }
.ch-list li + li { margin-top: 4px; }
.ch-p { margin-top: 6px; }
.keep-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.keep-acts .btn { flex: 1 1 auto; }
.mt { margin-top: 12px; }
.goals-hit { margin-top: 16px; background: var(--ok-soft); }
.goals-hit .row { gap: 12px; align-items: flex-start; }
.g-icon { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--card); color: var(--ok); flex: 0 0 auto; }
.up { letter-spacing: 0.02em; font-weight: 700; }
.what-h .btn { margin-bottom: 4px; }
</style>
