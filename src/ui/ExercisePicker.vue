<template>
  <Sheet :model-value="modelValue" :title="title" @update:model-value="(v) => emit('update:modelValue', v)">
    <input
      v-model="q" class="field" type="search" placeholder="Search exercises" autocomplete="off"
      enterkeyhint="search" aria-label="Search exercises"
    >
    <label v-if="gymLimited" class="gym-toggle t-small">
      <Toggle v-model="gymOnly" />
      <span>Only what my gym has</span>
    </label>
    <template v-if="!q && suggested.length">
      <div class="section-h">{{ suggestedLabel }}</div>
      <div class="group">
        <button v-for="ex in suggested" :key="'s' + ex.id" class="group-row" @click="pick(ex.id)">
          <div class="grow">
            <div class="t-h3">{{ ex.name }}</div>
            <div class="t-tiny t-muted truncate">{{ musclesOf(ex) }}</div>
          </div>
        </button>
      </div>
    </template>
    <div class="section-h">{{ q ? `${filtered.length} found` : 'All exercises' }}</div>
    <div class="group">
      <button v-for="ex in filtered" :key="ex.id" class="group-row" @click="pick(ex.id)">
        <div class="grow">
          <div class="t-h3">{{ ex.name }}</div>
          <div class="t-tiny t-muted truncate">{{ musclesOf(ex) }}</div>
        </div>
      </button>
      <div v-if="!filtered.length" class="group-row t-muted">No exercise matches “{{ q }}”.</div>
    </div>
  </Sheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Sheet from './Sheet.vue'
import Toggle from './Toggle.vue'
import { state, exercisesById } from '../store.js'
import { muscleLabel } from '../lib/format.js'
import { canDoAtGym } from '../lib/training.js'

const props = defineProps({
  modelValue: Boolean,
  title: { type: String, default: 'Choose exercise' },
  suggestedIds: { type: Array, default: () => [] },
  suggestedLabel: { type: String, default: 'Suggested' },
  excludeId: String,
  onlyIds: Array
})
const emit = defineEmits(['update:modelValue', 'pick'])
const q = ref('')
const gymOnly = ref(true)
watch(() => props.modelValue, (o) => { if (o) q.value = '' })
const gymLimited = computed(() => Object.values(state.data.settings.equipment || {}).some(v => v === false))
const atGym = (e) => !gymLimited.value || !gymOnly.value || canDoAtGym(e, state.data.settings.equipment)

const all = computed(() => {
  let list = Object.values(exercisesById.value)
  if (props.onlyIds) list = list.filter(e => props.onlyIds.includes(e.id))
  return list.filter(e => e.id !== props.excludeId && atGym(e)).sort((a, b) => a.name.localeCompare(b.name))
})
const suggested = computed(() => props.suggestedIds.map(id => exercisesById.value[id]).filter(e => e && e.id !== props.excludeId && atGym(e)))
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const filtered = computed(() => {
  const t = norm(q.value.trim())
  if (!t) return all.value
  return all.value.filter(e => norm(e.name).includes(t) || (e.primary || []).some(m => norm(muscleLabel(m)).includes(t)))
})
const musclesOf = (ex) => [...(ex.primary || [])].map(muscleLabel).join(', ')

function pick (id) {
  emit('pick', id)
  emit('update:modelValue', false)
}
</script>

<style scoped>
.gym-toggle { display: flex; align-items: center; gap: 12px; margin: 14px 2px 0; }
</style>
