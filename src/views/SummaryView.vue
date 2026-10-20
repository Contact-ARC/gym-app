<template>
  <div class="page no-nav" v-if="session" :style="plateStyle(session.dayIndex ?? -1)">
    <div class="topbar">
      <button class="icon-btn" aria-label="Close" @click="router.replace('/')"><Icon name="close" /></button>
    </div>

    <div class="done-head">
      <PlateBadge :index="session.dayIndex ?? -1" :label="session.dayId === 'free' ? '+' : session.dayId" size="lg" />
      <h1 class="t-title">{{ justFinished ? 'Workout done' : dayTitle(session.dayName, session.dayId) }}</h1>
      <p class="t-small t-muted">{{ justFinished ? dayTitle(session.dayName, session.dayId) + ', ' : '' }}{{ fmtDate(session.startedAt) }}</p>
    </div>

    <div class="stats">
      <div class="stat"><div class="t-num v">{{ sum.minutes ?? '–' }}</div><div class="t-tiny t-muted">minutes</div></div>
      <div class="stat"><div class="t-num v">{{ sum.sets }}</div><div class="t-tiny t-muted">sets</div></div>
      <div class="stat"><div class="t-num v">{{ fmtNum(sum.volume, 0) }}</div><div class="t-tiny t-muted">{{ sum.unit }} lifted</div></div>
    </div>

    <section v-if="prGroups.length">
      <h2 class="section-h">New personal records</h2>
      <div class="group">
        <div v-for="g in prGroups" :key="g.id" class="group-row pr">
          <span class="pr-icon"><Icon name="trophy" :size="20" /></span>
          <div class="grow">
            <div class="t-h3">{{ name(g.id) }}</div>
            <div v-for="p in g.prs" :key="p.type" class="t-small t-num">
              {{ p.type === 'e1rm' ? 'Estimated max' : 'Heaviest set' }} {{ fmtLoad(p.value, unitOf(g.id)) }}
              <span class="t-muted">, was {{ fmtLoad(p.prev, unitOf(g.id)) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div v-if="session.rating?.effort || session.rating?.energy || session.easy" class="row check">
      <span v-if="session.rating?.effort" class="pill">Effort {{ session.rating.effort }} of 5</span>
      <span v-if="session.rating?.energy" class="pill">Energy {{ session.rating.energy }} of 5</span>
      <span v-if="session.easy" class="pill pill-warn">Lighter day</span>
    </div>

    <section>
      <div class="row what-h">
        <h2 class="section-h grow">What you did</h2>
        <RouterLink :to="`/workout/${session.id}`" class="btn btn-sm btn-ghost"><Icon name="edit" :size="18" />Edit</RouterLink>
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

    <div class="row actions">
      <button class="btn btn-lg btn-soft grow" @click="share"><Icon name="share" />Share</button>
      <button class="btn btn-lg btn-primary grow" @click="router.replace('/')">Done</button>
    </div>
    <button class="btn btn-ghost btn-block t-err del" @click="confirmDelete = true"><Icon name="trash" />Delete this workout</button>

    <Sheet v-model="confirmDelete" title="Delete this workout?">
      <p class="t-body">It will be removed from your history and charts. This can't be undone.</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="confirmDelete = false">Keep it</button>
        <button class="btn btn-danger btn-lg" @click="del">Delete</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page no-nav">
    <p class="t-h2">This workout no longer exists</p>
    <RouterLink to="/" class="btn btn-primary btn-lg btn-block" style="margin-top: 20px">Go home</RouterLink>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import { plateStyle } from '../ui/plates.js'
import { toast } from '../ui/toast.js'
import { state, getSession, sessionSummary, exercisesById, deleteSession } from '../store.js'
import { fmtLoad, unitFor } from '../lib/training.js'
import { fmtDate, fmtNum, dayTitle } from '../lib/format.js'
import { shareText } from '../lib/native.js'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession(route.params.id))
const sum = computed(() => sessionSummary(session.value))
const name = (id) => exercisesById.value[id]?.name || id
const unitOf = (id) => unitFor(exercisesById.value[id], state.data.profile)
const justFinished = computed(() => session.value?.finishedAt && Date.now() - new Date(session.value.finishedAt) < 30 * 60000)

const prGroups = computed(() => {
  const m = new Map()
  for (const p of sum.value.prs) { if (!m.has(p.exerciseId)) m.set(p.exerciseId, []); m.get(p.exerciseId).push(p) }
  return [...m].map(([id, prs]) => ({ id, prs }))
})

function setsFor (id) {
  return session.value.sets.filter(s => s.exerciseId === id).map(s => {
    if (s.seconds) return s.load ? `${fmtLoad(s.load, s.unit)} for ${s.seconds}s` : `${s.seconds}s`
    const reps = s.repsL != null && s.repsR != null && s.repsL !== s.repsR ? `${s.repsL}/${s.repsR}` : s.reps
    const tag = s.type === 'warmup' ? ' (warm-up)' : s.type === 'drop' ? ' (drop)' : s.type === 'failure' ? ' (to failure)' : s.type === 'amrap' ? ' (max reps)' : ''
    return `${s.load ? fmtLoad(s.load, s.unit) : 'BW'} × ${reps}${tag}`
  }).join(',  ')
}

async function share () {
  const lines = [
    `${dayTitle(session.value.dayName, session.value.dayId)}: ${sum.value.minutes ?? '?'} min, ${sum.value.sets} sets, ${fmtNum(sum.value.volume, 0)} ${sum.value.unit} lifted`
  ]
  for (const g of prGroups.value) lines.push(`🏆 ${name(g.id)}: new record ${fmtLoad(g.prs[0].value, unitOf(g.id))}`)
  for (const id of sum.value.exercises) lines.push(`${name(id)}: ${setsFor(id)}`)
  const r = await shareText('Workout', lines.join('\n'))
  if (r === 'copied') toast('Copied to clipboard')
}

const confirmDelete = ref(false)
function del () {
  deleteSession(session.value.id)
  confirmDelete.value = false
  router.replace('/')
  toast('Workout deleted')
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
.check { flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.what-h { align-items: flex-end; }
.what-h .btn { margin-bottom: 4px; }
.del { margin-top: 12px; }
</style>
