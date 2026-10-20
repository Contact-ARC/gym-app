<template>
  <div class="page" v-if="ex">
    <div class="topbar">
      <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ ex.name }}</h1>
    <p class="t-small t-muted equip">{{ equipmentLine }}</p>

    <div class="muscles">
      <span v-for="m in ex.primary || []" :key="'p' + m" class="pill main">{{ muscleLabel(m) }}</span>
      <span v-for="m in ex.secondary || []" :key="'s' + m" class="pill">{{ muscleLabel(m) }}</span>
    </div>
    <p class="t-tiny t-muted legend">Dark: main target. Light: also working.</p>

    <button class="btn btn-soft btn-block video" @click="openUrl(videoUrl)">
      <Icon name="video" />{{ ex.videoUrl ? 'Watch the video' : 'Find a form video' }}
    </button>

    <section v-if="ex.setup?.length">
      <h2 class="section-h">Set-up</h2>
      <ul class="card card-pad bullets"><li v-for="(s, i) in ex.setup" :key="i">{{ s }}</li></ul>
    </section>

    <section>
      <h2 class="section-h">How to do it</h2>
      <ol class="card card-pad steps">
        <li v-for="(s, i) in ex.steps || []" :key="i">
          <span class="step-n t-num">{{ i + 1 }}</span><span>{{ s }}</span>
        </li>
      </ol>
    </section>

    <section v-if="ex.cues?.length">
      <h2 class="section-h">Think about</h2>
      <ul class="card card-pad bullets"><li v-for="(s, i) in ex.cues" :key="i">{{ s }}</li></ul>
    </section>

    <section v-if="ex.mistakes?.length">
      <h2 class="section-h">Avoid</h2>
      <ul class="card card-pad bullets avoid"><li v-for="(s, i) in ex.mistakes" :key="i">{{ s }}</li></ul>
    </section>

    <section>
      <h2 class="section-h">Your note</h2>
      <textarea v-model="note" class="field" rows="2" placeholder="Seat height, grip, how it felt" aria-label="Your note" @blur="saveNote" />
    </section>

    <section>
      <h2 class="section-h">Your history</h2>
      <p v-if="!history.length" class="t-small t-muted">You haven't logged this one yet.</p>
      <template v-else>
        <div class="row stats">
          <div class="card card-pad stat">
            <div class="t-tiny t-muted">{{ unit === 'pin' ? 'Heaviest pin' : 'Best estimated max' }}</div>
            <div class="t-h2 t-num">{{ fmtLoad(best, unit) }}</div>
          </div>
          <div class="card card-pad stat">
            <div class="t-tiny t-muted">Times done</div>
            <div class="t-h2 t-num">{{ history.length }}</div>
          </div>
        </div>
        <div class="group hist">
          <div v-for="h in history.slice(0, 6)" :key="h.sessionId" class="group-row">
            <span class="t-small t-muted when">{{ relativeDay(h.date) }}</span>
            <span class="grow t-num sets-line">{{ h.sets.map(setStr).join(',  ') }}</span>
          </div>
        </div>
        <RouterLink :to="`/progress?exercise=${ex.id}`" class="btn btn-ghost btn-block chart-link"><Icon name="progress" />See the chart</RouterLink>
      </template>
    </section>

    <section v-if="alternatives.length">
      <h2 class="section-h">Alternatives</h2>
      <div class="group">
        <RouterLink v-for="a in alternatives" :key="a.id" :to="`/exercise/${a.id}`" class="group-row">
          <span class="grow t-h3">{{ a.name }}</span><Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
    </section>
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">This exercise isn't in the library</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import { toast } from '../ui/toast.js'
import { state, exercisesById, historyFor, setExerciseNote } from '../store.js'
import { muscleLabel, relativeDay, youtubeSearchUrl } from '../lib/format.js'
import { openUrl } from '../lib/native.js'
import { bestE1RM, heaviest, fmtLoad, unitFor } from '../lib/training.js'

const route = useRoute()
const router = useRouter()
const ex = computed(() => exercisesById.value[route.params.id])
const unit = computed(() => unitFor(ex.value, state.data.profile))
const videoUrl = computed(() => ex.value?.videoUrl || youtubeSearchUrl(ex.value?.name || ''))
const alternatives = computed(() => (ex.value?.alternatives || []).map(id => exercisesById.value[id]).filter(Boolean))
const history = computed(() => (ex.value ? historyFor(ex.value.id) : []))
const best = computed(() => {
  const sets = history.value.flatMap(h => h.sets)
  return unit.value === 'pin' ? heaviest(sets, state.data.profile.unit) : bestE1RM(sets, state.data.profile.unit)
})

const equipmentLine = computed(() => {
  const parts = [...(ex.value?.equipment || [])]
  const e = parts.join(', ')
  const extra = []
  if (ex.value?.perSide) extra.push('one side at a time')
  if (ex.value?.loadUnit === 'pin') extra.push('logged by pin position')
  return [e.charAt(0).toUpperCase() + e.slice(1), ...extra].filter(Boolean).join('. ')
})

const note = ref('')
watch(() => route.params.id, (id) => { note.value = state.data.exerciseNotes[id] || '' }, { immediate: true })
function saveNote () {
  if ((state.data.exerciseNotes[ex.value.id] || '') !== note.value) {
    setExerciseNote(ex.value.id, note.value.trim())
    toast('Note saved')
  }
}

function setStr (s) {
  if (s.seconds) return s.load ? `${fmtLoad(s.load, s.unit)} for ${s.seconds}s` : `${s.seconds}s`
  return `${s.load ? fmtLoad(s.load, s.unit) : 'BW'} × ${s.reps}`
}
</script>

<style scoped>
.equip { margin-top: 6px; }
.muscles { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.pill.main { background: var(--ink); color: var(--paper); }
.legend { margin: 8px 2px 0; }
.video { margin-top: 18px; }
.bullets { list-style: none; }
.bullets li { position: relative; padding-left: 18px; font-size: 16px; }
.bullets li + li { margin-top: 10px; }
.bullets li::before { content: ''; position: absolute; left: 2px; top: 10px; width: 6px; height: 6px; border-radius: 50%; background: var(--ink-3); }
.avoid li::before { background: var(--err); }
.steps { list-style: none; }
.steps li { display: flex; gap: 12px; font-size: 16px; }
.steps li + li { margin-top: 14px; }
.step-n {
  flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  background: var(--ink); color: var(--paper); font-size: 16px; font-weight: 700;
}
.stats { gap: 10px; }
.stat { flex: 1 1 0; padding: 14px 16px; }
.hist { margin-top: 10px; }
.when { width: 92px; flex: 0 0 auto; }
.sets-line { font-size: 18px; }
.chart-link { margin-top: 6px; }
</style>
