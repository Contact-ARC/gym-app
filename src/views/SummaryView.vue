<template>
  <div class="page no-nav" v-if="session" :style="plateStyle(session.dayIndex ?? -1)">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Close')" @click="router.replace('/')"><Icon name="close" /></button>
    </div>

    <div class="done-head">
      <PlateBadge :index="session.dayIndex ?? -1" :label="session.dayId === 'free' ? '+' : session.dayId" size="lg" />
      <h1 class="t-title">{{ justFinished ? t('Workout done') : sessionTitle(session) }}</h1>
      <p class="t-small t-muted">{{ justFinished ? sessionTitle(session) + ', ' : '' }}{{ fmtDate(session.startedAt) }}</p>
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

    <ChallengeCard v-if="justFinished" compact />

    <section>
      <div class="row what-h">
        <h2 class="section-h grow">{{ t('What you did') }}</h2>
        <RouterLink :to="`/workout/${session.id}`" class="btn btn-sm btn-ghost"><Icon name="edit" :size="18" />{{ t('Edit') }}</RouterLink>
      </div>
      <div class="group">
        <RouterLink v-for="id in sum.exercises" :key="id" :to="`/exercise/${id}`" class="group-row">
          <div class="grow">
            <div class="t-h3">{{ name(id) }}</div>
            <div class="t-num sets-line">{{ setsFor(id) }}</div>
          </div>
        </RouterLink>
      </div>
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
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import ChallengeCard from '../ui/ChallengeCard.vue'
import { plateStyle, plateHex } from '../ui/plates.js'
import { toast } from '../ui/toast.js'
import { state, getSession, sessionSummary, exercisesById, deleteSession, streak } from '../store.js'
import { fmtLoad, unitFor } from '../lib/training.js'
import { fmtDate, fmtNum, fmtMins, dayTitle, prText, PR_ORDER, sessionTitle } from '../lib/format.js'
import { shareText } from '../lib/native.js'
import { drawCard, shareCanvas } from '../lib/shareCard.js'
import { inCrew } from '../lib/crew.js'
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
.done-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; margin: 4px 0 22px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--card); border-radius: var(--r-card); }
.stat { padding: 16px 8px; text-align: center; }
.stat + .stat { border-left: 1px solid var(--line); }
.v { font-size: 34px; font-weight: 700; line-height: 1.05; }
.pr { align-items: flex-start; }
.pr-icon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--warn-soft); color: var(--warn); flex: 0 0 auto; }
.sets-line { font-size: 18px; color: var(--ink-2); margin-top: 2px; }
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
.what-h .btn { margin-bottom: 4px; }
</style>
