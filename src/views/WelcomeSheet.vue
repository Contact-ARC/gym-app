<template>
  <Sheet :model-value="open" title="Welcome to Gym Crew" @update:model-value="(v) => !v && finish()">
    <p class="t-body t-muted">Two quick things and you're ready to train.</p>

    <label class="label mt" for="w-name">What should we call you?</label>
    <input id="w-name" v-model="name" class="field" type="text" autocomplete="given-name" placeholder="Your first name" enterkeyhint="done">

    <div class="label mt">You lift in</div>
    <Segmented v-model="unit" :options="[{ label: 'Kilograms', value: 'kg' }, { label: 'Pounds', value: 'lb' }]" label="Units" />

    <p class="t-small t-muted mt">
      Your workouts stay on this phone. Export a backup from Settings every couple of weeks.
    </p>
    <template #actions>
      <button class="btn btn-primary btn-lg" @click="finish">Start training</button>
    </template>
  </Sheet>
</template>

<script setup>
import { computed, ref } from 'vue'
import Sheet from '../ui/Sheet.vue'
import Segmented from '../ui/Segmented.vue'
import { state, persist } from '../store.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR } from '../lib/training.js'

const open = computed(() => state.ready && !state.data.welcomed && !state.data.sessions.length && !state.data.profile.name)
const name = ref('')
const unit = ref(state.data.profile.unit || 'kg')

function finish () {
  const p = state.data.profile
  p.name = name.value.trim()
  if (unit.value !== p.unit) {
    p.unit = unit.value
    p.increments = { ...DEFAULT_INCREMENTS[unit.value] }
    p.bar = DEFAULT_BAR[unit.value]
  }
  state.data.welcomed = true
  persist()
}
</script>

<style scoped>
.mt { margin-top: 20px; }
</style>
