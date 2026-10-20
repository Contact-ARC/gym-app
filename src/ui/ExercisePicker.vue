<template>
  <Sheet :model-value="modelValue" :title="title" @update:model-value="(v) => emit('update:modelValue', v)">
    <input
      v-model="q" class="field" type="search" placeholder="Search exercises" autocomplete="off"
      enterkeyhint="search" aria-label="Search exercises"
    >
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
import { exercisesById } from '../store.js'
import { muscleLabel } from '../lib/format.js'

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
watch(() => props.modelValue, (o) => { if (o) q.value = '' })

const all = computed(() => {
  let list = Object.values(exercisesById.value)
  if (props.onlyIds) list = list.filter(e => props.onlyIds.includes(e.id))
  return list.filter(e => e.id !== props.excludeId).sort((a, b) => a.name.localeCompare(b.name))
})
const suggested = computed(() => props.suggestedIds.map(id => exercisesById.value[id]).filter(e => e && e.id !== props.excludeId))
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
