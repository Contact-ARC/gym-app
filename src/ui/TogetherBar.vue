<template>
  <!-- 0.16: one slim line. Faces (a ring on whoever's up) and what's happening; tap for everything else -->
  <button v-if="v" class="tbar" :class="{ mine: v.turns && v.myTurn, over: v.status === 'done' }" aria-live="polite" @click="emit('open')">
    <span class="faces" :aria-label="t('Training together: options')">
      <span
        v-for="m in v.members" :key="m.id" class="av" :class="{ turn: v.turns && v.state?.turn === m.id }"
        :style="avatarStyle(m.id)" :title="m.id === me ? t('You') : m.name"
      >{{ initial(m.id, m.name) }}</span>
    </span>
    <span class="grow t-small status">
      <template v-if="v.status === 'done'">{{ t('Training together has ended. Your workout carries on.') }}</template>
      <template v-else-if="v.members.length < 2">{{ t('Waiting for your crew') }} · <span class="t-num">{{ t('code {code}', { code: v.code }) }}</span></template>
      <template v-else-if="v.turns && !v.state?.turn">{{ t('Everyone has done the planned sets.') }}</template>
      <template v-else-if="v.turns && v.myTurn"><b>{{ t("You're up") }}</b> · <b v-if="change" class="chg">{{ change }}</b><template v-else>{{ itemName(v.state.item) }}</template></template>
      <template v-else-if="v.turns"><b>{{ t("{name}'s up", { name: v.turnName }) }}</b> · {{ itemName(v.state.item) }}</template>
      <template v-else-if="lastOther"><b>{{ nameOf(lastOther.member) }}</b> · {{ exName(lastOther.exerciseId) }} {{ setLine(lastOther) }}</template>
      <template v-else>{{ t('Training with {names}', { names: othersNames }) }}</template>
    </span>
    <span v-if="v.sending && !live" class="sending t-tiny">{{ t('Sending…') }}</span>
    <Icon name="chevronRight" :size="18" class="chev" />
  </button>
</template>

<script setup>
// The line at the top of a workout you're doing together (0.16): who's in, whose turn it is (and the plates to
// change when it's yours) or, without turns, what the others just did. Tapping it opens the together sheet,
// which has the rest (invites, the code, turns on or off, Spot me, leaving).
import { computed } from 'vue'
import Icon from './Icon.vue'
import { exercisesById } from '../store.js'
import { me } from '../lib/crew.js'
import { togetherView, connection } from '../lib/together.js'
import { fmtLoad } from '../lib/training.js'
import { plateChangeText, fmtSecs } from '../lib/format.js'
import { avatarStyle, initial } from './crewUi.js'
import { t, tx } from '../i18n/index.js'

const props = defineProps({
  barChange: { type: Object, default: null } // { add, remove } a side when it's your turn on a shared bar
})
const emit = defineEmits(['open'])
const v = togetherView
const live = computed(() => connection.value === 'live')
const exName = (id) => tx(exercisesById.value[id], 'name') || id
const itemName = (i) => exName(v.value?.plan?.items?.[i]?.exerciseId)
const nameOf = (id) => (id === me.value ? t('You') : v.value?.members?.find(m => m.id === id)?.name || v.value?.names?.[id] || '?')
const othersNames = computed(() => (v.value?.members || []).filter(m => m.id !== me.value).map(m => m.name).join(', '))
const lastOther = computed(() => v.value?.recent?.[0] || null)
const change = computed(() => {
  const c = props.barChange ? plateChangeText(props.barChange) : ''
  return c ? t('{change} a side', { change: c }) : ''
})
function setLine (r) {
  if (r.load > 0 && r.reps) return `${fmtLoad(r.load, r.unit)} × ${r.reps}`
  if (r.reps) return `× ${r.reps}`
  if (r.seconds) return fmtSecs(r.seconds) + (r.level != null ? ' · ' + t('level {n}', { n: r.level }) : '')
  return ''
}
</script>

<style scoped>
.tbar { display: flex; align-items: center; gap: 10px; width: calc(100% - 24px); margin: 8px 12px 0; padding: 8px 10px 8px 8px; min-height: 48px; border-radius: 14px; background: var(--card); border: 2px solid transparent; text-align: left; color: inherit; font: inherit; transition: border-color 200ms ease, background-color 200ms ease; }
.tbar.mine { border-color: var(--ok); background: var(--ok-soft); }
.tbar.over { opacity: 0.8; }
.faces { display: flex; flex: 0 0 auto; padding-left: 4px; }
.av { width: 28px; height: 28px; margin-left: -6px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; box-shadow: 0 0 0 2px var(--card); }
.tbar.mine .av { box-shadow: 0 0 0 2px var(--ok-soft); }
.av.turn { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--ink); z-index: 1; }
.status { min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.chg { color: var(--ok); }
.sending { color: var(--warn); flex: 0 0 auto; }
.chev { color: var(--ink-3); flex: 0 0 auto; }
</style>
