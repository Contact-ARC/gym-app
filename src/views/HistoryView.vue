<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">History</h1>
    <p v-if="!finishedSessions.length" class="t-body t-muted empty">Finished workouts show up here.</p>
    <section v-for="g in groups" :key="g.label">
      <h2 class="section-h">{{ g.label }}</h2>
      <div class="group">
        <RouterLink v-for="s in g.sessions" :key="s.id" :to="`/summary/${s.id}`" class="group-row">
          <PlateBadge :index="s.dayIndex ?? -1" :label="s.dayId === 'free' ? '+' : s.dayId" size="sm" />
          <div class="grow">
            <div class="t-h3 truncate">{{ dayTitle(s.dayName, s.dayId) }}</div>
            <div class="t-small t-muted">{{ when(s.startedAt) }}, {{ s.sets.length }} sets, {{ mins(s) }} min</div>
          </div>
          <Icon name="chevronRight" class="chev" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import { finishedSessions } from '../store.js'
import { dayTitle } from '../lib/format.js'

const router = useRouter()
const mins = (s) => Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000)
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

const groups = computed(() => {
  const out = []
  for (const s of finishedSessions.value) {
    const label = new Date(s.startedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    let g = out.find(x => x.label === label)
    if (!g) { g = { label, sessions: [] }; out.push(g) }
    g.sessions.push(s)
  }
  return out
})
</script>

<style scoped>
.empty { margin-top: 12px; }
</style>
