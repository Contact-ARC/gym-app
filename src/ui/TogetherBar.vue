<template>
  <section v-if="v" class="tbar" :class="{ mine: v.myTurn, over: v.status === 'done' }" aria-live="polite">
    <div class="row top">
      <div class="people" :class="'n' + v.members.length">
        <span
          v-for="m in v.members" :key="m.id" class="person" :class="{ turn: v.state?.turn === m.id }"
          :title="m.name"
        >
          <span class="av" :style="avatarStyle(m.id)">{{ initial(m.id) }}</span>
          <span class="nm truncate">{{ m.id === me ? t('You') : m.name }}</span>
          <span class="cnt t-num">{{ doneOn(m.id) }}/{{ setsOn }}</span>
        </span>
      </div>
      <button class="icon-btn sm" :aria-label="t('Training together: options')" @click="emit('open')"><Icon name="more" :size="20" /></button>
    </div>

    <div class="row status">
      <span class="dot" :class="live ? 'live' : (v.sending ? 'wait' : 'poll')" :title="live ? t('Connected') : t('Checking every few seconds')" />
      <span class="grow t-small">
        <template v-if="v.status === 'done'">{{ t('Training together has ended. Your workout carries on.') }}</template>
        <template v-else-if="!v.state?.turn">{{ t('Everyone has done the planned sets.') }}</template>
        <template v-else-if="v.myTurn"><b>{{ t("You're up") }}</b> · {{ itemName(v.state.item) }}<template v-if="change"> · <b class="chg">{{ change }}</b></template></template>
        <template v-else><b>{{ t("{name}'s up", { name: v.turnName }) }}</b> · {{ itemName(v.state.item) }}</template>
      </span>
      <button v-if="v.status !== 'done'" class="btn btn-sm btn-soft spot" @click="spot"><Icon name="clap" :size="18" />{{ t('Spot me') }}</button>
    </div>

    <!-- What the others just did -->
    <div v-if="v.recent.length" class="recent t-tiny t-muted t-num">
      <span v-for="r in v.recent" :key="r.setId" class="rec">
        <b>{{ nameOf(r.member) }}</b> {{ exName(r.exerciseId) }} {{ setLine(r) }}
      </span>
    </div>
  </section>
</template>

<script setup>
// The strip at the top of a workout you're doing together: who's in, whose turn it is (and the plates to
// change when it's yours), the others' latest sets, and "Spot me".
import { computed } from 'vue'
import Icon from './Icon.vue'
import { toast } from './toast.js'
import { exercisesById } from '../store.js'
import { me } from '../lib/crew.js'
import { togetherView, connection, spotMe } from '../lib/together.js'
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
const setsOn = computed(() => v.value?.plan?.items?.[v.value.state?.item ?? 0]?.sets || 0)
const doneOn = (id) => v.value?.done?.[id]?.[v.value.state?.item ?? 0] || 0
const exName = (id) => tx(exercisesById.value[id], 'name') || id
const itemName = (i) => exName(v.value?.plan?.items?.[i]?.exerciseId)
const nameOf = (id) => (id === me.value ? t('You') : v.value?.members?.find(m => m.id === id)?.name || v.value?.names?.[id] || '?')
const change = computed(() => {
  const c = props.barChange ? plateChangeText(props.barChange) : ''
  return c ? t('{change} a side', { change: c }) : ''
})
function setLine (r) {
  if (r.load > 0 && r.reps) return `${fmtLoad(r.load, r.unit)} × ${r.reps}`
  if (r.reps) return `× ${r.reps}`
  if (r.seconds) return fmtSecs(r.seconds)
  return ''
}
function spot () {
  spotMe()
  toast(t("Asked for a spot"))
}
</script>

<style scoped>
.tbar { margin: 8px 12px 0; padding: 10px 12px; border-radius: 16px; background: var(--card); display: grid; gap: 8px; border: 2px solid transparent; transition: border-color 200ms ease, background-color 200ms ease; }
.tbar.mine { border-color: var(--ok); background: var(--ok-soft); }
.tbar.over { opacity: 0.8; }
.top { gap: 8px; align-items: center; }
.people { flex: 1; min-width: 0; display: grid; gap: 6px; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); }
.people.n2 { --cols: 2; } .people.n3 { --cols: 3; } .people.n4 { --cols: 4; }
.person { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 6px; align-items: center; padding: 4px 6px; border-radius: 12px; min-width: 0; }
.person.turn { background: var(--paper); box-shadow: 0 0 0 2px var(--ink); }
.av { grid-row: 1 / 3; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; }
.nm { font-size: 13px; font-weight: 600; min-width: 0; }
.cnt { font-size: 11px; color: var(--ink-3); }
.people.n4 .av { width: 24px; height: 24px; font-size: 12px; }
.people.n4 .nm { font-size: 12px; }
.status { gap: 8px; align-items: center; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: var(--ink-3); }
.dot.live { background: var(--ok); }
.dot.wait { background: var(--warn); }
.chg { color: var(--ok); }
.spot { flex: 0 0 auto; }
.recent { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.rec b { color: var(--ink-2); }
</style>
