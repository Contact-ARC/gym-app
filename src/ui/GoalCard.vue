<template>
  <RouterLink v-if="pinned.length" to="/goals" class="card card-pad gc">
    <div class="row top">
      <span class="g-icon"><Icon name="goal" :size="22" /></span>
      <div class="t-tiny up t-muted grow">{{ pinned.length === 1 ? t('Your goal') : t('Your goals') }}</div>
      <Icon name="chevronRight" class="chev" />
    </div>
    <div v-for="{ goal, p } in pinned" :key="goal.id" class="g">
      <div class="row g-head">
        <span class="t-h3 grow g-title">{{ goalTitle(goal, p.target, p.unit) }}</span>
        <span class="t-small t-num t-muted nowrap">{{ goal.type === 'weekly' ? t('{a} of {b} this week', { a: p.current ?? 0, b: p.target }) : goalValue(goal.type, p.current, p.unit) }}</span>
      </div>
      <div class="bar" :class="{ ok: p.done }" role="progressbar" :aria-valuenow="Math.round(p.pct * 100)" aria-valuemin="0" aria-valuemax="100">
        <div :style="{ width: Math.round(p.pct * 100) + '%' }" />
      </div>
    </div>
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { goalsWithProgress } from '../store.js'
import { goalTitle, goalValue } from '../lib/goalText.js'
import { t } from '../i18n/index.js'

// Up to two pinned goals you haven't reached yet (the weekly one never "finishes")
const pinned = computed(() => goalsWithProgress.value.filter(x => x.goal.pinned && !x.goal.doneAt).slice(0, 2))
</script>

<style scoped>
.gc { display: block; margin-top: 18px; }
.top { gap: 12px; }
.g-icon { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--card-2); color: var(--ink); }
.up { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
.g { margin-top: 14px; }
.g-head { gap: 10px; align-items: baseline; }
.g-title { font-size: 16px; }
.nowrap { white-space: nowrap; }
.bar { height: 8px; border-radius: 4px; background: var(--card-2); margin-top: 8px; overflow: hidden; }
.bar > div { height: 100%; background: var(--ink); border-radius: 4px; transition: width 400ms ease; }
.bar.ok > div { background: var(--ok); }
</style>
