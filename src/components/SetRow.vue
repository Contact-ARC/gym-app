<template>
  <div class="set-row" :class="{ logged: !!logged && !editing }">
    <div class="idx tabular">{{ index + 1 }}</div>

    <!-- Logged, read-only -->
    <template v-if="logged && !editing">
      <div class="flex-grow-1 tabular text-body-1" @click="startEdit">
        <template v-if="isTime">
          <span v-if="logged.load">{{ fmtLoad(logged.load, logged.unit) }} · </span>{{ logged.seconds }}s
        </template>
        <template v-else>
          {{ isBodyweight && !logged.load ? 'BW' : (isBodyweight ? '+' : '') + fmtLoad(logged.load, logged.unit) }}
          × {{ logged.reps }}
        </template>
        <span v-if="logged.rir != null" class="text-caption muted ml-1">RIR {{ logged.rir }}</span>
      </div>
      <v-btn icon size="small" variant="text" @click="startEdit" aria-label="Edit set"><v-icon>mdi-pencil</v-icon></v-btn>
      <v-icon color="success" class="ml-1">mdi-check-circle</v-icon>
    </template>

    <!-- Editable -->
    <template v-else>
      <v-text-field
        v-if="showLoad"
        v-model.number="load" type="number" inputmode="decimal" class="num-input"
        :label="loadLabel" density="compact" @update:model-value="dirty = true"
      />
      <v-text-field
        v-if="isTime"
        v-model.number="seconds" type="number" inputmode="numeric" class="num-input"
        label="sec" density="compact" @update:model-value="dirty = true"
      />
      <v-text-field
        v-else
        v-model.number="reps" type="number" inputmode="numeric" class="num-input"
        label="reps" density="compact" @update:model-value="dirty = true"
      />
      <v-btn
        v-if="!isTime" variant="tonal" size="small" class="rir" @click="cycleRir"
        :title="'Reps in reserve — how many more you could have done'"
      >
        <div class="d-flex flex-column align-center" style="line-height: 1">
          <span class="text-caption" style="font-size: 0.6rem !important">RIR</span>
          <span>{{ rir == null ? '–' : rir === 4 ? '4+' : rir }}</span>
        </div>
      </v-btn>
      <v-btn v-if="editing" icon size="small" variant="text" color="error" @click="$emit('remove')" aria-label="Delete set">
        <v-icon>mdi-delete</v-icon>
      </v-btn>
      <v-btn icon color="primary" variant="flat" size="small" :disabled="!valid" @click="submit" aria-label="Log set">
        <v-icon>mdi-check</v-icon>
      </v-btn>
    </template>
  </div>
  <div v-if="hint && !logged" class="hint text-caption muted">last time: {{ hint }}</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { fmtLoad } from '../lib/training.js'

const props = defineProps({
  index: Number,
  exercise: Object,
  unit: String, // 'kg' | 'lb' | 'pin'
  isTimeItem: Boolean,
  prefill: Object, // { load, reps, seconds }
  logged: Object, // existing set or null
  hint: String
})
const emit = defineEmits(['log', 'update', 'remove'])

const isTime = computed(() => props.isTimeItem)
const isBodyweight = computed(() => props.exercise?.logType === 'bodyweight')
// Timed exercises only show a load field if the exercise is loadable (e.g. carries)
const showLoad = computed(() => !isTime.value || props.exercise?.loadable)
const loadLabel = computed(() => {
  if (props.unit === 'pin') return 'pin'
  if (isBodyweight.value) return `+${props.unit}`
  // Dumbbells and carries: log the weight of ONE dumbbell
  return props.exercise?.incrementGroup === 'dumbbell' ? `${props.unit} each` : props.unit
})

const load = ref(null)
const reps = ref(null)
const seconds = ref(null)
const rir = ref(null)
const dirty = ref(false)
const editing = ref(false)

function fill (src) {
  load.value = src?.load ?? (isBodyweight.value ? 0 : null)
  reps.value = src?.reps ?? null
  seconds.value = src?.seconds ?? null
}
fill(props.prefill)
watch(() => props.prefill, (p) => { if (!dirty.value && !editing.value) fill(p) }, { deep: true })

const valid = computed(() => {
  if (isTime.value) return seconds.value > 0
  const loadOk = !showLoad.value || isBodyweight.value || (load.value != null && load.value !== '' && load.value >= 0)
  return loadOk && reps.value > 0
})

function cycleRir () {
  rir.value = rir.value == null ? 0 : rir.value >= 4 ? null : rir.value + 1
  dirty.value = true
}

function startEdit () {
  editing.value = true
  load.value = props.logged.load
  reps.value = props.logged.reps
  seconds.value = props.logged.seconds
  rir.value = props.logged.rir
}

function submit () {
  const values = {
    load: showLoad.value && load.value !== '' ? (load.value ?? null) : null,
    unit: props.unit,
    reps: isTime.value ? null : reps.value,
    seconds: isTime.value ? seconds.value : null,
    rir: isTime.value ? null : rir.value
  }
  if (editing.value) {
    emit('update', values)
    editing.value = false
  } else {
    emit('log', values)
    dirty.value = false
    rir.value = null
  }
}
</script>

<style scoped>
.set-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.set-row .v-text-field { flex: 1 1 0; min-width: 0; }
.idx {
  width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%;
  display: grid; place-items: center; font-size: 0.8rem; font-weight: 700;
  background: rgba(128,128,128,0.2);
}
.logged .idx { background: rgb(var(--v-theme-success)); color: #fff; }
.rir { min-width: 46px !important; height: 44px !important; padding: 0 6px !important; }
.hint { margin: -2px 0 4px 34px; }
</style>
