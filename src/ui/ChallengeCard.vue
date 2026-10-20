<template>
  <section v-if="c && st" class="card card-pad ch" :class="{ done: st.done }">
    <div class="row top">
      <span class="ch-icon"><Icon :name="st.done ? 'trophy' : 'challenge'" :size="22" /></span>
      <div class="grow">
        <div class="t-tiny up t-muted">{{ st.done ? t('Challenge complete') : t('This month\'s challenge') }}</div>
        <div class="t-h3">{{ tx(c, 'title') }}</div>
      </div>
    </div>
    <p v-if="tx(c, 'description') && !compact" class="t-small t-muted desc">{{ tx(c, 'description') }}</p>
    <div class="bar" role="progressbar" :aria-valuenow="st.value" :aria-valuemin="0" :aria-valuemax="st.target">
      <div :style="{ width: Math.round(st.pct * 100) + '%' }" />
    </div>
    <div class="row foot">
      <span class="t-num val">{{ fmt(st.value) }}<span class="t-muted"> / {{ fmt(st.target) }}</span></span>
      <span class="t-small t-muted grow">{{ unitLabel }}</span>
      <template v-if="c.type === 'manual'">
        <button class="icon-btn sm" :aria-label="t('Take one off')" :disabled="!st.value" @click="bump(-1)"><Icon name="minus" /></button>
        <button class="btn btn-sm btn-primary" @click="bump(1)"><Icon name="plus" :size="18" />{{ t('Log one') }}</button>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { challenge, challengeStatus, bumpChallenge, state } from '../store.js'
import { t, tx } from '../i18n/index.js'
import { fmtNum } from '../lib/format.js'
import { tap } from '../lib/native.js'

defineProps({ compact: Boolean })
const c = challenge
const st = challengeStatus
const fmt = (n) => fmtNum(n, 0)
const unitLabel = computed(() => {
  switch (c.value?.type) {
    case 'workouts': return t('workouts')
    case 'sets': return t('hard sets')
    case 'reps': return t('reps')
    case 'time': return t('seconds')
    case 'volume': return t('{unit} lifted', { unit: state.data.profile.unit })
    default: return tx(c.value, 'unitLabel') || ''
  }
})
function bump (d) { tap(); bumpChallenge(d) }
</script>

<style scoped>
.ch { margin-top: 18px; }
.top { gap: 12px; align-items: center; }
.ch-icon { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--card-2); color: var(--ink); }
.done .ch-icon { background: var(--ok-soft); color: var(--ok); }
.up { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
.desc { margin-top: 10px; }
.bar { height: 10px; border-radius: 5px; background: var(--card-2); margin-top: 14px; overflow: hidden; }
.bar > div { height: 100%; background: var(--ink); border-radius: 5px; transition: width 400ms ease; }
.done .bar > div { background: var(--ok); }
.foot { margin-top: 10px; gap: 8px; align-items: center; }
.val { font-size: 22px; font-weight: 700; }
.icon-btn.sm { width: 40px; height: 40px; }
</style>
