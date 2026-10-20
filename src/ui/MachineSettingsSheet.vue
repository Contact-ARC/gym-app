<template>
  <Sheet :model-value="modelValue" :title="`Settings for ${name}`" @update:model-value="(v) => emit('update:modelValue', v)">
    <p class="t-small t-muted">Saved for this exercise and shown every time you do it.</p>
    <div class="rows">
      <div v-for="(r, i) in rows" :key="i" class="ms-row">
        <input v-model="r.label" class="field lbl" type="text" placeholder="Setting" :aria-label="`Setting ${i + 1} name`" list="ms-labels">
        <input v-model="r.value" class="field val t-num" type="text" inputmode="text" placeholder="Value" :aria-label="`Setting ${i + 1} value`">
        <button class="icon-btn" :aria-label="`Remove setting ${i + 1}`" @click="rows.splice(i, 1)"><Icon name="close" :size="20" /></button>
      </div>
      <datalist id="ms-labels">
        <option v-for="l in suggestions" :key="l" :value="l" />
      </datalist>
    </div>
    <div class="quick">
      <button v-for="l in unused" :key="l" class="pill" @click="rows.push({ label: l, value: '' })"><Icon name="plus" :size="16" />{{ l }}</button>
    </div>
    <template #actions>
      <button class="btn btn-soft btn-lg" @click="emit('update:modelValue', false)">Cancel</button>
      <button class="btn btn-primary btn-lg" @click="save">Save</button>
    </template>
  </Sheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import { toast } from './toast.js'
import { state, exercisesById, setMachineSettings } from '../store.js'

const props = defineProps({ modelValue: Boolean, exerciseId: String })
const emit = defineEmits(['update:modelValue'])
const name = computed(() => exercisesById.value[props.exerciseId]?.name || '')
const suggestions = ['Seat', 'Back pad', 'Leg pad', 'Pulley height', 'Handle', 'Bench angle', 'Grip', 'Foot position']
const rows = ref([])
watch(() => props.modelValue, (open) => {
  if (open) {
    rows.value = (state.data.machineSettings[props.exerciseId] || []).map(r => ({ ...r }))
    if (!rows.value.length) rows.value.push({ label: 'Seat', value: '' })
  }
})
const unused = computed(() => suggestions.filter(l => !rows.value.some(r => r.label === l)).slice(0, 5))
function save () {
  setMachineSettings(props.exerciseId, rows.value)
  emit('update:modelValue', false)
  toast('Machine settings saved')
}
</script>

<style scoped>
.rows { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.ms-row { display: flex; gap: 8px; align-items: center; }
.lbl { flex: 1.4 1 0; min-width: 0; }
.val { flex: 1 1 0; min-width: 0; font-size: 20px; }
.quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
</style>
