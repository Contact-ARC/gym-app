<template>
  <Sheet :model-value="modelValue" :title="t('Swap {name}', { name: name(exerciseId) })" @update:model-value="(v) => emit('update:modelValue', v)">
    <p v-if="missing.length" class="note note-warn t-small why">
      <Icon name="info" :size="18" />
      <span>{{ t('Needs {what}, which is off in Settings, Your gym.', { what: missing.join(', ') }) }}</span>
    </p>

    <div class="section-h">{{ t('Do this instead') }}</div>
    <div class="group" role="radiogroup" :aria-label="t('Do this instead')">
      <div v-for="id in options" :key="id" class="group-row opt" :class="{ on: pick === id }">
        <button class="pick grow" role="radio" :aria-checked="pick === id" @click="pick = id">
          <span class="radio" aria-hidden="true"><Icon v-if="pick === id" name="checkBold" :size="16" /></span>
          <span class="grow txt">
            <span class="t-h3 block">{{ name(id) }}</span>
            <span class="meta">
              <span v-if="handPicked(id)" class="m-tag picked">{{ t('Suggested') }}</span>
              <span v-if="match(id)" class="m-tag" :class="match(id)">{{ t(MATCH[match(id)]) }}</span>
              <span class="t-tiny t-muted truncate">{{ muscles(id) }}<template v-if="exerciseUsage[id]"> · {{ tn(exerciseUsage[id], 'done {n} time', 'done {n} times') }}</template></span>
            </span>
          </span>
        </button>
        <RouterLink :to="`/exercise/${id}?tab=how`" class="icon-btn sm" :aria-label="t('How to do {name}', { name: name(id) })" @click="emit('update:modelValue', false)"><Icon name="info" :size="20" /></RouterLink>
      </div>
      <div class="group-row opt">
        <button class="pick grow" @click="pickerOpen = true">
          <span class="radio" aria-hidden="true"><Icon name="search" :size="16" /></span>
          <span class="grow txt t-h3">{{ t('Something else…') }}</span>
        </button>
      </div>
    </div>
    <p v-if="!options.length" class="t-small t-muted mt">{{ t('Nothing in the library matches. Pick something else, or add your own exercise.') }}</p>

    <p class="t-tiny t-muted mt">{{ t('Suggested ones are picked for this exercise. The match says how closely each works the same main and secondary muscles.') }}</p>
    <p class="t-tiny t-muted mt">{{ t('Next time only: the day stays as it is, and the finish screen asks whether to keep the swap. Always: the day shows it as your change, like any other edit.') }}</p>

    <template #actions>
      <button class="btn btn-soft btn-lg" :disabled="!pick" @click="apply('once')">{{ t('Next time only') }}</button>
      <button class="btn btn-primary btn-lg" :disabled="!pick" @click="apply('always')">{{ t('Always') }}</button>
    </template>
  </Sheet>
  <ExercisePicker v-model="pickerOpen" :title="t('Swap {name}', { name: name(exerciseId) })" :exclude-id="exerciseId" allow-create @pick="(id) => { extra = id; pick = id }" />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import ExercisePicker from './ExercisePicker.vue'
import { toast } from './toast.js'
import { state, exercisesById, exerciseUsage, swapInDay } from '../store.js'
import { gymAlternatives, missingEquipment, exerciseMatch } from '../lib/training.js'
import { muscleLabel } from '../lib/format.js'
import { t, tn, tx } from '../i18n/index.js'

const props = defineProps({
  modelValue: Boolean,
  dayKey: { type: String, default: '' },
  itemRef: { type: String, default: '' },
  exerciseId: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'done'])
const name = (id) => tx(exercisesById.value[id], 'name') || id
const muscles = (id) => (exercisesById.value[id]?.primary || []).map(muscleLabel).join(', ')
const missing = computed(() => missingEquipment(exercisesById.value[props.exerciseId], state.data.settings.equipment).map(l => t(l).toLowerCase()))
const extra = ref(null)
// Hand-picked alternatives from the library, and how closely each option works the same muscles
const MATCH = { close: 'Close match', partial: 'Partial match', loose: 'Loose match' }
const handPicked = (id) => (exercisesById.value[props.exerciseId]?.alternatives || []).includes(id)
const match = (id) => exerciseMatch(exercisesById.value[props.exerciseId], exercisesById.value[id])?.level || null
const options = computed(() => {
  const list = gymAlternatives(exercisesById.value[props.exerciseId], exercisesById.value, state.data.settings.equipment, exerciseUsage.value)
  return extra.value && !list.includes(extra.value) ? [extra.value, ...list] : list
})
const pick = ref(null)
const pickerOpen = ref(false)
watch(() => [props.modelValue, props.exerciseId], ([open]) => {
  if (open) { extra.value = null; pick.value = options.value[0] || null }
})

function apply (how) {
  if (!pick.value) return
  const from = name(props.exerciseId)
  const to = name(pick.value)
  if (!swapInDay(props.dayKey, props.itemRef, pick.value, how)) return
  emit('update:modelValue', false)
  emit('done')
  toast(how === 'once' ? t('Next time: {b} instead of {a}', { a: from, b: to }) : t('{b} instead of {a} from now on', { a: from, b: to }))
}
</script>

<style scoped>
.why { display: flex; gap: 8px; align-items: flex-start; }
.why :deep(svg) { flex: 0 0 auto; margin-top: 2px; }
.opt { gap: 4px; padding-top: 0; padding-bottom: 0; }
.pick { display: flex; align-items: center; gap: 12px; min-height: 60px; text-align: left; min-width: 0; padding: 8px 0; }
.txt { min-width: 0; }
.block { display: block; }
.radio { width: 26px; height: 26px; border-radius: 50%; flex: 0 0 auto; display: grid; place-items: center; box-shadow: inset 0 0 0 2px var(--line); color: var(--paper); }
.opt.on .radio { background: var(--ink); box-shadow: none; }
.opt .radio :deep(svg) { color: inherit; }
.opt:not(.on) .radio :deep(svg) { color: var(--ink-3); }
.mt { margin-top: 12px; }
.meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; min-width: 0; }
.meta .truncate { min-width: 0; }
.m-tag { flex: 0 0 auto; font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 6px; background: var(--card-2); color: var(--ink-2); }
.m-tag.picked { background: var(--ink); color: var(--paper); }
.m-tag.close { background: var(--ok-soft); color: var(--ok); }
.m-tag.partial { background: var(--warn-soft); color: var(--warn); }
</style>
