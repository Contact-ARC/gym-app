<template>
  <div class="page" v-if="day" :style="plateStyle(index)">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>

    <div class="row head">
      <PlateBadge :index="index" :label="day.id" size="lg" />
      <div class="grow">
        <h1 class="t-title">{{ dayTitle(tx(day, 'name'), day.id) }}</h1>
        <div class="t-small t-muted">{{ tn(items.length, '{n} exercise', '{n} exercises') }}<template v-if="day.estMinutes">{{ t(', about {n} min', { n: day.estMinutes }) }}</template></div>
      </div>
    </div>
    <p v-if="tx(day, 'notes')" class="t-small t-muted day-notes">{{ tx(day, 'notes') }}</p>
    <div v-if="todayPlan.deload" class="note note-warn t-small plan-note">
      <b>{{ todayPlan.source === 'date' ? t('Deload today.') : t('Deload week.') }}</b> {{ t('One set fewer, about 10% lighter, and every set ends with 3 or more reps left.') }}
    </div>
    <div v-else-if="todayPlan.rir != null || todayPlan.focus || todayPlan.setDelta" class="note note-info t-small plan-note">
      <b>{{ todayPlan.source === 'date' ? t('Today:') : t('Week {n}:', { n: todayPlan.week }) }}</b>
      <template v-if="todayPlan.rir != null">{{ ' ' + tn(todayPlan.rir, 'leave {n} rep in the tank.', 'leave {n} reps in the tank.') }}</template>
      <template v-if="todayPlan.setDelta > 0">{{ ' ' + (todayPlan.applyTo === 'first' ? tn(todayPlan.setDelta, '{n} extra set on the first exercise.', '{n} extra sets on the first exercise.') : tn(todayPlan.setDelta, '{n} extra set on every exercise.', '{n} extra sets on every exercise.')) }}</template>
      <template v-if="todayPlan.focus">{{ ' ' + tx(todayPlan, 'focus') }}</template>
    </div>
    <div v-if="beginnerSwaps" class="note t-small plan-note track-note">
      <b>{{ t('Beginner track.') }}</b> {{ t('Some exercises are swapped for easier versions or fewer sets. Change it in Settings.') }}
    </div>

    <ol class="group list">
      <li v-for="(it, i) in items" :key="i">
        <RouterLink :to="`/exercise/${it.exerciseId}`" class="group-row">
          <span class="num t-num">{{ i + 1 }}</span>
          <div class="grow">
            <div class="t-h3">{{ tx(ex(it.exerciseId), 'name') || it.exerciseId }}</div>
            <div class="t-small t-muted">
              {{ prescription({ ...it, sets: plannedSetsFor(it, i, todayPlan) }, ex(it.exerciseId)) }}, {{ restLabel(effectiveRest(items, i)) }}
            </div>
            <div v-if="it.group || it.track" class="row tags">
              <span v-if="it.group" class="t-tiny t-muted ss"><Icon name="superset" :size="14" />{{ t('Superset') }}</span>
              <span v-if="it.track" class="t-tiny t-muted ss"><Icon name="start" :size="14" />{{ t('Beginner version') }}</span>
            </div>
            <div v-if="tx(it, 'notes')" class="t-tiny t-muted item-note">{{ tx(it, 'notes') }}</div>
            <div class="t-tiny suggest">{{ suggestionFor(it).text }}</div>
          </div>
          <Icon name="chevronRight" class="chev" />
        </RouterLink>
      </li>
    </ol>
    <p v-if="hasGroups" class="t-tiny t-muted ss-help">
      {{ t('Supersets: do one set of each back to back, then rest.') }}
    </p>

    <div class="dock">
      <button v-if="!activeSession" class="btn btn-lg btn-block btn-plate" @click="start">
        <Icon name="play" />{{ t('Start day {id}', { id: day.id }) }}
      </button>
      <RouterLink v-else :to="`/workout/${activeSession.id}`" class="btn btn-lg btn-block btn-primary">
        <Icon name="play" />{{ t('Continue current workout') }}
      </RouterLink>
    </div>
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">{{ t("That day isn't in this month's routine") }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import { plateStyle } from '../ui/plates.js'
import { days, exercisesById, activeSession, startSession, suggestionFor, todayPlan, trackItem } from '../store.js'
import { tx } from '../i18n/index.js'
import { plannedSetsFor } from '../lib/training.js'
import { prescription, restLabel, dayTitle } from '../lib/format.js'
import { effectiveRest } from '../lib/supersets.js'

const route = useRoute()
const router = useRouter()
const index = computed(() => Number(route.params.index))
const day = computed(() => days.value[index.value])
const ex = (id) => exercisesById.value[id]
const items = computed(() => (day.value?.items || []).map(trackItem))
const beginnerSwaps = computed(() => items.value.some(i => i.track))
const hasGroups = computed(() => items.value.some(i => i.group))

function start () {
  const id = startSession(index.value)
  if (id) router.push(`/workout/${id}`)
}
</script>

<style scoped>
.page { padding-bottom: calc(var(--nav-h) + var(--safe-bottom) + 110px); }
.head { gap: 16px; }
.day-notes { margin-top: 14px; }
.plan-note { margin-top: 14px; }
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
.tags { gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.ss { display: flex; gap: 4px; align-items: center; }
.item-note { margin-top: 4px; }
.track-note { background: var(--card); }
.suggest { margin-top: 6px; color: var(--ink-2); }
.ss-help { margin: 10px 4px 0; }
.dock {
  position: fixed; left: 0; right: 0; z-index: 20;
  bottom: calc(var(--nav-h) + var(--safe-bottom));
  padding: 12px 16px; max-width: 640px; margin: 0 auto;
  background: linear-gradient(to top, var(--paper) 70%, rgba(0,0,0,0));
}
</style>
