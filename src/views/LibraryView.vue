<template>
  <div class="page">
    <h1 class="t-title head">Exercises</h1>
    <input v-model="q" class="field search" type="search" placeholder="Search by name or muscle" aria-label="Search exercises" enterkeyhint="search">

    <div class="filters" role="group" aria-label="Filter by muscle">
      <button
        v-for="g in groups" :key="g.key" class="fchip" :class="{ on: group === g.key }"
        :aria-pressed="group === g.key" @click="group = group === g.key ? null : g.key"
      >{{ g.label }}</button>
    </div>
    <label v-if="gymLimited" class="gym-toggle t-small">
      <Toggle v-model="gymOnly" />
      <span>Only what my gym has</span>
    </label>

    <p class="t-small t-muted count">{{ list.length }} exercise{{ list.length === 1 ? '' : 's' }}</p>
    <div class="group">
      <RouterLink v-for="ex in list" :key="ex.id" :to="`/exercise/${ex.id}`" class="group-row">
        <img v-if="ex.images?.length" :src="imageUrl(ex.images[0])" alt="" class="thumb" loading="lazy" @error="(e) => (e.target.style.visibility = 'hidden')">
        <div v-else class="thumb" />
        <div class="grow">
          <div class="t-h3">{{ ex.name }}</div>
          <div class="t-tiny t-muted truncate">{{ (ex.primary || []).map(muscleLabel).join(', ') }}<template v-if="done[ex.id]">, done {{ done[ex.id] }}×</template></div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
      <div v-if="!list.length" class="group-row t-muted">Nothing matches. Try another word or clear the filter.</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from '../ui/Icon.vue'
import Toggle from '../ui/Toggle.vue'
import { state, exercisesById, finishedSessions, imageUrl } from '../store.js'
import { muscleLabel } from '../lib/format.js'
import { canDoAtGym } from '../lib/training.js'

const q = ref('')
const group = ref(null)
const gymOnly = ref(true)
const groups = [
  { key: 'chest', label: 'Chest', m: ['chest'] },
  { key: 'back', label: 'Back', m: ['lats', 'upper_back', 'lower_back', 'traps'] },
  { key: 'shoulders', label: 'Shoulders', m: ['front_delts', 'side_delts', 'rear_delts'] },
  { key: 'arms', label: 'Arms', m: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'Legs', m: ['quads', 'hamstrings', 'adductors', 'calves'] },
  { key: 'glutes', label: 'Glutes', m: ['glutes'] },
  { key: 'core', label: 'Core', m: ['abs', 'obliques'] }
]
const gymLimited = computed(() => Object.values(state.data.settings.equipment || {}).some(v => v === false))
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const done = computed(() => {
  const out = {}
  for (const s of finishedSessions.value) for (const id of new Set(s.sets.map(x => x.exerciseId))) out[id] = (out[id] || 0) + 1
  return out
})

const list = computed(() => {
  const t = norm(q.value.trim())
  const g = groups.find(x => x.key === group.value)
  return Object.values(exercisesById.value)
    .filter(e => !g || (e.primary || []).some(m => g.m.includes(m)))
    .filter(e => !t || norm(e.name).includes(t) || [...(e.primary || []), ...(e.secondary || [])].some(m => norm(muscleLabel(m)).includes(t)))
    .filter(e => !gymLimited.value || !gymOnly.value || canDoAtGym(e, state.data.settings.equipment))
    .sort((a, b) => a.name.localeCompare(b.name))
})
</script>

<style scoped>
.head { margin-top: 8px; }
.search { margin-top: 14px; }
.filters { display: flex; gap: 8px; overflow-x: auto; margin: 12px -16px 0; padding: 0 16px 2px; scrollbar-width: none; }
.filters::-webkit-scrollbar { display: none; }
.fchip { flex: 0 0 auto; min-height: 38px; padding: 0 14px; border-radius: 19px; background: var(--card); color: var(--ink-2); font-size: 15px; font-weight: 600; }
.fchip.on { background: var(--ink); color: var(--paper); }
.gym-toggle { display: flex; align-items: center; gap: 12px; margin: 14px 2px 0; }
.count { margin: 16px 4px 8px; }
.thumb { width: 56px; height: 42px; border-radius: 8px; object-fit: cover; background: var(--card-2); flex: 0 0 auto; }
</style>
