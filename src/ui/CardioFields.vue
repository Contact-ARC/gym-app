<template>
  <div class="cardio">
    <Stepper v-model="minutes" :label="t('Minutes')" :step="1" :min="0" :max="600" :decimals="true" :size="size" />
    <div class="two">
      <Stepper v-model="speed" :label="t('Speed')" :unit="speedUnit(unit)" :step="unit === 'lb' ? 0.1 : 0.5" :min="0" :max="unit === 'lb' ? 15 : 25" :decimals="true" size="md" />
      <Stepper v-model="incline" :label="t('Incline')" unit="%" :step="0.5" :min="0" :max="30" :decimals="true" size="md" />
    </div>
    <p v-if="km > 0" class="t-small t-muted t-num line">{{ line }}</p>
  </div>
</template>

<script setup>
// Time, speed and incline for one treadmill bout. Edits the object passed in: { seconds, speed (km/h), incline }.
import { computed } from 'vue'
import Stepper from './Stepper.vue'
import { speedUnit, toShownSpeed, fromShownSpeed, distanceKm, fmtDistance, KM_PER_MI } from '../lib/cardio.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  c: { type: Object, required: true },
  unit: { type: String, default: 'kg' },
  size: { type: String, default: 'lg' }
})
const c = props.c
const minutes = computed({
  get: () => (c.seconds == null ? null : Math.round((c.seconds / 60) * 100) / 100),
  set: (v) => { c.seconds = v == null ? null : Math.round(v * 60) }
})
const speed = computed({
  get: () => toShownSpeed(c.speed, props.unit),
  set: (v) => { c.speed = fromShownSpeed(v, props.unit) }
})
const incline = computed({
  get: () => c.incline ?? 0,
  set: (v) => { c.incline = v }
})
const km = computed(() => distanceKm(c.seconds, c.speed))
// "≈ 2.5 km · 12:00 per km"
const line = computed(() => {
  const perUnit = props.unit === 'lb' ? KM_PER_MI : 1
  const pace = c.speed > 0 ? Math.round((3600 * perUnit) / c.speed) : 0
  const p = pace ? ` · ${t('{m} per {u}', { m: `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')}`, u: props.unit === 'lb' ? 'mi' : 'km' })}` : ''
  return `≈ ${fmtDistance(km.value, props.unit)}${p}`
})
</script>

<style scoped>
.cardio { display: grid; gap: 14px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.line { text-align: center; margin: -4px 0 0; }
</style>
