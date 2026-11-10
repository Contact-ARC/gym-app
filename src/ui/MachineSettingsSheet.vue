<template>
  <Sheet :model-value="modelValue" :title="t('Settings for {name}', { name })" @update:model-value="(v) => emit('update:modelValue', v)">
    <p class="t-small t-muted">{{ t('Saved for this exercise and shown every time you do it.') }}</p>
    <div class="rows">
      <div v-for="(r, i) in rows" :key="i" class="ms-row">
        <input v-model="r.label" class="field lbl" type="text" :placeholder="t('Setting')" :aria-label="t('Setting {n} name', { n: i + 1 })" list="ms-labels">
        <input v-model="r.value" class="field val t-num" type="text" inputmode="text" :placeholder="t('Value')" :aria-label="t('Setting {n} value', { n: i + 1 })">
        <button class="icon-btn" :aria-label="t('Remove setting {n}', { n: i + 1 })" @click="rows.splice(i, 1)"><Icon name="close" :size="20" /></button>
      </div>
      <datalist id="ms-labels">
        <option v-for="l in suggestions" :key="l" :value="l" />
      </datalist>
    </div>
    <div class="quick">
      <button v-for="l in unused" :key="l" class="pill" @click="rows.push({ label: l, value: '' })"><Icon name="plus" :size="16" />{{ l }}</button>
    </div>

    <!-- Weight stack: logged in kg/lb, stepping by this machine's plates -->
    <template v-if="stack">
      <h3 class="label stack-h">{{ t('Weight stack') }}</h3>
      <div class="stack-row">
        <div class="grow">
          <div>{{ t('One plate on this stack') }}</div>
          <div class="t-tiny t-muted">{{ t('The + and − buttons jump by this. Stacks differ, so set it per machine.') }}</div>
        </div>
        <Stepper v-model="step" :step="unit === 'kg' ? 0.5 : 1" :min="unit === 'kg' ? 0.5 : 1" :max="unit === 'kg' ? 25 : 50" :decimals="true" :unit="unit" size="md" class="mini" />
      </div>

      <!-- Old sets logged by pin number -->
      <div v-if="pinSets" class="convert card-2">
        <p class="t-small"><b>{{ tn(pinSets, '{n} of your sets here is a pin number.', '{n} of your sets here are pin numbers.') }}</b> {{ t('Turn them into {unit} so your progress and records carry on:', { unit }) }}</p>
        <div class="conv-grid">
          <Stepper v-model="first" :label="t('Pin 1')" :step="step || 1" :min="0" :decimals="true" :unit="unit" size="md" />
          <Stepper v-model="per" :label="t('Each pin after')" :step="unit === 'kg' ? 0.5 : 1" :min="0" :decimals="true" :unit="unit" size="md" />
        </div>
        <p class="t-tiny t-muted t-num">{{ example }}</p>
        <button class="btn btn-soft" :disabled="!(per > 0)" @click="convert">{{ tn(pinSets, 'Convert {n} set', 'Convert {n} sets') }}</button>
      </div>
    </template>

    <template #actions>
      <button class="btn btn-soft btn-lg" @click="emit('update:modelValue', false)">{{ t('Cancel') }}</button>
      <button class="btn btn-primary btn-lg" @click="save">{{ t('Save') }}</button>
    </template>
  </Sheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import Stepper from './Stepper.vue'
import { toast } from './toast.js'
import { state, exercisesById, setMachineSettings, setMachineStep, pinSetCount, convertPinSets } from '../store.js'
import { isStackMachine, logsPins, incrementFor, DEFAULT_INCREMENTS } from '../lib/training.js'
import { t, tn, tx } from '../i18n/index.js'

const props = defineProps({ modelValue: Boolean, exerciseId: String })
const emit = defineEmits(['update:modelValue'])
const ex = computed(() => exercisesById.value[props.exerciseId])
const name = computed(() => tx(ex.value, 'name') || '')
const suggestions = computed(() => ['Seat', 'Back pad', 'Leg pad', 'Pulley height', 'Handle', 'Bench angle', 'Grip', 'Foot position'].map(l => t(l)))
const rows = ref([])
const unit = computed(() => state.data.profile.unit || 'kg')
// The stack section: machines logged by weight (not if you log pin numbers)
const stack = computed(() => isStackMachine(ex.value) && !logsPins(state.data.profile))
const step = ref(null)
const pinSets = ref(0)
const first = ref(null)
const per = ref(null)
watch(() => props.modelValue, (open) => {
  if (!open) return
  rows.value = (state.data.machineSettings[props.exerciseId] || []).map(r => ({ ...r }))
  if (!rows.value.length) rows.value.push({ label: t('Seat'), value: '' })
  if (stack.value) {
    step.value = incrementFor(ex.value, state.data.profile)
    pinSets.value = pinSetCount(props.exerciseId)
    first.value = step.value
    per.value = step.value
  }
})
const unused = computed(() => suggestions.value.filter(l => !rows.value.some(r => r.label === l)).slice(0, 5))
const kgOf = (pin) => Math.round(((first.value || 0) + (pin - 1) * (per.value || 0)) * 100) / 100
const example = computed(() => [1, 5, 10].map(n => t('pin {n} = {w}', { n, w: `${kgOf(n)} ${unit.value}` })).join(' · '))

function saveStep () {
  if (!stack.value) return
  const usual = state.data.profile.increments?.machine || DEFAULT_INCREMENTS[unit.value].machine
  setMachineStep(props.exerciseId, step.value > 0 && Math.abs(step.value - usual) > 0.001 ? step.value : null)
}
function save () {
  setMachineSettings(props.exerciseId, rows.value)
  saveStep()
  emit('update:modelValue', false)
  toast(t('Machine settings saved'))
}
function convert () {
  saveStep()
  const n = convertPinSets(props.exerciseId, first.value || 0, per.value || 0)
  pinSets.value = 0
  toast(tn(n, '{n} set is now in {unit}', '{n} sets are now in {unit}', { unit: unit.value }))
}
</script>

<style scoped>
.rows { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.ms-row { display: flex; gap: 8px; align-items: center; }
.lbl { flex: 1.4 1 0; min-width: 0; }
.val { flex: 1 1 0; min-width: 0; font-size: 20px; }
.quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.stack-h { margin-top: 22px; }
.stack-row { display: flex; align-items: center; gap: 12px; margin-top: 6px; }
.mini { width: 168px; flex: 0 0 auto; }
.mini :deep(.st-btn) { width: 40px; height: 40px; border-radius: 10px; }
.mini :deep(.st-display), .mini :deep(.st-input) { font-size: 24px; height: 36px; line-height: 36px; }
.convert { margin-top: 14px; padding: 14px; border-radius: 14px; background: var(--card-2); display: grid; gap: 10px; }
.conv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.convert .btn { justify-self: start; }
</style>
