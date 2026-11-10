<template>
  <div class="sb card">
    <div class="row head">
      <b class="grow">{{ t('Shared bar') }}</b>
      <span class="t-small t-muted">{{ t('plates per side') }}</span>
    </div>

    <!-- Everyone warms up on the lightest person's ramp -->
    <div v-if="shared.warmups.length" class="part">
      <div class="t-tiny t-muted up">{{ t('Warm up together') }}</div>
      <div v-for="(w, k) in shared.warmups" :key="'w' + k" class="line">
        <span class="t-num grow v">{{ w.load ? fmtLoad(w.load, unit) : t('Bar only') }} × {{ w.reps }}</span>
        <span class="t-num do" :class="{ quiet: !change(w) }">{{ change(w) || t('Empty bar') }}</span>
      </div>
    </div>

    <!-- Working sets: lightest first, each adds on top of the one before -->
    <div class="part">
      <div class="t-tiny t-muted up">{{ t('Working sets, lightest first') }}</div>
      <div v-for="o in rows" :key="o.id" class="line" :class="{ me: o.id === meId }">
        <span class="av" :style="avatarStyle(o.id)">{{ initial(o.id) }}</span>
        <span class="grow"><span class="t-num v">{{ fmtLoad(o.load, unit) }}</span> <span class="t-small t-muted">{{ o.id === meId ? t('you') : nameOf(o.id) }}</span></span>
        <span class="t-num do">{{ o.todo }}</span>
      </div>
      <p class="t-tiny t-muted foot">{{ t('Going back to someone lighter: take off what was added after them.') }}</p>
    </div>
  </div>
</template>

<script setup>
// Training together on one bar: the shared warm-up and the order of working weights, so each change of
// lifter is only adding or taking off plates (see sharedBar in lib/togetherPlan.js).
import { computed } from 'vue'
import { fmtLoad } from '../lib/training.js'
import { plateText, plateChangeText } from '../lib/format.js'
import { avatarStyle, initial } from './crewUi.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  shared: { type: Object, required: true },
  members: { type: Array, default: () => [] },
  meId: { type: String, default: '' },
  unit: { type: String, default: 'kg' }
})
const nameOf = (id) => props.members.find(m => m.id === id)?.name || '?'
const change = (w) => plateChangeText(w)
const lastWarm = computed(() => props.shared.warmups.at(-1)?.perSide || null)
// What to do for each: the first from the last warm-up, then each adds its plates on top
const rows = computed(() => props.shared.order.map((o, k) => ({
  ...o,
  todo: k > 0 ? t('Add {p}', { p: plateText(o.add) })
    : lastWarm.value ? (plateChangeText(diff(lastWarm.value, o.perSide)) || t('Same as the last warm-up'))
      : t('Add {p}', { p: plateText(o.perSide) })
})))
function diff (a, b) {
  const left = [...b]
  const remove = []
  for (const p of a) { const i = left.findIndex(x => Math.abs(x - p) < 1e-9); if (i >= 0) left.splice(i, 1); else remove.push(p) }
  return { add: left, remove }
}
</script>

<style scoped>
.sb { margin-top: 14px; padding: 12px 14px; display: grid; gap: 10px; }
.head { align-items: baseline; gap: 8px; }
.part { display: grid; gap: 2px; }
.up { text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
.line { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 4px; border-radius: 10px; }
.line.me { background: var(--card-2); }
.v { font-size: 17px; font-weight: 600; }
.do { font-size: 15px; font-weight: 600; white-space: nowrap; }
.do.quiet { font-weight: 500; color: var(--ink-3); }
.av { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; flex: 0 0 auto; }
.foot { margin: 4px 4px 0; }
</style>
