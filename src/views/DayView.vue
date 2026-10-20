<template>
  <div class="page" v-if="day" :style="plateStyle(index)">
    <div class="topbar">
      <button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" /></button>
    </div>

    <div class="row head">
      <PlateBadge :index="index" :label="day.id" size="lg" />
      <div class="grow">
        <h1 class="t-title">{{ dayTitle(day.name, day.id) }}</h1>
        <div class="t-small t-muted">{{ day.items.length }} exercises<template v-if="day.estMinutes">, about {{ day.estMinutes }} min</template></div>
      </div>
    </div>
    <p v-if="day.notes" class="t-small t-muted day-notes">{{ day.notes }}</p>
    <div v-if="isDeloadWeek" class="note note-warn t-small" style="margin-top: 14px">
      Deload week. Suggestions are about 10% lighter, and every set should end with 3 or more reps left.
    </div>

    <ol class="group list">
      <li v-for="(it, i) in day.items" :key="i">
        <RouterLink :to="`/exercise/${it.exerciseId}`" class="group-row">
          <span class="num t-num">{{ i + 1 }}</span>
          <div class="grow">
            <div class="t-h3">{{ ex(it.exerciseId)?.name || it.exerciseId }}</div>
            <div class="t-small t-muted">
              {{ prescription(it, ex(it.exerciseId)) }}, {{ restLabel(effectiveRest(day.items, i)) }}
            </div>
            <div v-if="it.group" class="t-tiny t-muted ss"><Icon name="superset" :size="14" />Superset</div>
            <div class="t-tiny suggest">{{ suggestionFor(it).text }}</div>
          </div>
          <Icon name="chevronRight" class="chev" />
        </RouterLink>
      </li>
    </ol>
    <p v-if="hasGroups" class="t-tiny t-muted ss-help">
      Supersets: do one set of each back to back, then rest.
    </p>

    <div class="dock">
      <button v-if="!activeSession" class="btn btn-lg btn-block btn-plate" @click="start">
        <Icon name="play" />Start day {{ day.id }}
      </button>
      <RouterLink v-else :to="`/workout/${activeSession.id}`" class="btn btn-lg btn-block btn-primary">
        <Icon name="play" />Continue current workout
      </RouterLink>
    </div>
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">That day isn't in this month's routine</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import { plateStyle } from '../ui/plates.js'
import { days, exercisesById, activeSession, startSession, suggestionFor, isDeloadWeek } from '../store.js'
import { prescription, restLabel, dayTitle } from '../lib/format.js'
import { effectiveRest } from '../lib/supersets.js'

const route = useRoute()
const router = useRouter()
const index = computed(() => Number(route.params.index))
const day = computed(() => days.value[index.value])
const ex = (id) => exercisesById.value[id]
const hasGroups = computed(() => day.value?.items.some(i => i.group))

function start () {
  const id = startSession(index.value)
  if (id) router.push(`/workout/${id}`)
}
</script>

<style scoped>
.page { padding-bottom: calc(var(--nav-h) + var(--safe-bottom) + 110px); }
.head { gap: 16px; }
.day-notes { margin-top: 14px; }
.list { list-style: none; margin-top: 20px; }
.list li + li .group-row::before {
  content: ''; position: absolute; top: 0; right: 0; left: 60px; border-top: 1px solid var(--line);
}
.list .group-row { align-items: flex-start; padding-top: 14px; padding-bottom: 14px; }
.num {
  width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto; margin-top: 1px;
  display: grid; place-items: center; background: var(--card-2);
  font-size: 16px; font-weight: 700; color: var(--ink-2);
}
.ss { display: flex; gap: 4px; align-items: center; margin-top: 4px; }
.suggest { margin-top: 6px; color: var(--ink-2); }
.ss-help { margin: 10px 4px 0; }
.dock {
  position: fixed; left: 0; right: 0; z-index: 20;
  bottom: calc(var(--nav-h) + var(--safe-bottom));
  padding: 12px 16px; max-width: 640px; margin: 0 auto;
  background: linear-gradient(to top, var(--paper) 70%, rgba(0,0,0,0));
}
</style>
