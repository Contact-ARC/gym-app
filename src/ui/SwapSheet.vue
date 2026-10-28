<template>
  <Sheet :model-value="modelValue" :title="t('Swap {name}', { name: name(exerciseId) })" @update:model-value="(v) => emit('update:modelValue', v)">
    <p v-if="missing.length" class="note note-warn t-small why">
      <Icon name="info" :size="18" />
      <span>{{ t('Needs {what}, which is off in Settings, Your gym.', { what: missing.join(', ') }) }}</span>
    </p>

    <div class="section-h">{{ t('Do this instead') }}</div>
    <div class="group" role="radiogroup" :aria-label="t('Do this instead')">
      <div v-for="o in options" :key="o.id" class="group-row opt" :class="{ on: pick === o.id }">
        <button class="pick grow" role="radio" :aria-checked="pick === o.id" @click="pick = o.id">
          <span class="radio" aria-hidden="true"><Icon v-if="pick === o.id" name="checkBold" :size="16" /></span>
          <span class="grow txt">
            <span class="t-h3 block">{{ name(o.id) }}</span>
            <span class="meta">
              <span v-if="o.original" class="m-tag orig">{{ t('Original') }}</span>
              <span v-else-if="o.picked" class="m-tag picked">{{ t('Suggested') }}</span>
              <span v-if="o.level" class="m-tag" :class="o.level">{{ t(MATCH[o.level]) }}</span>
              <span class="t-tiny t-muted truncate">{{ muscles(o.id) }}<template v-if="exerciseUsage[o.id]"> · {{ tn(exerciseUsage[o.id], 'done {n} time', 'done {n} times') }}</template></span>
            </span>
          </span>
        </button>
        <RouterLink :to="`/exercise/${o.id}?tab=how`" class="icon-btn sm" :aria-label="t('How to do {name}', { name: name(o.id) })" @click="emit('update:modelValue', false)"><Icon name="info" :size="20" /></RouterLink>
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
    <p v-if="mode === 'day'" class="t-tiny t-muted mt">{{ t('Next time only: the day stays as it is, and the finish screen asks whether to keep the swap. Always: the day shows it as your change, like any other edit.') }}</p>
    <p v-else-if="mode === 'workout'" class="t-tiny t-muted mt">{{ t('Sets you logged for this exercise today are removed. The finish screen asks whether to keep the swap.') }}</p>

    <template #actions>
      <template v-if="mode === 'day'">
        <button class="btn btn-soft btn-lg" :disabled="!pick" @click="choose('once')">{{ t('Next time only') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!pick" @click="choose('always')">{{ t('Always') }}</button>
      </template>
      <button v-else class="btn btn-primary btn-lg" :disabled="!pick" @click="choose('now')">{{ mode === 'workout' ? t('Swap for this workout') : t('Swap') }}</button>
    </template>
  </Sheet>
  <ExercisePicker v-model="pickerOpen" :title="t('Swap {name}', { name: name(exerciseId) })" :exclude-id="exerciseId" allow-create @pick="(id) => { extra = id; pick = id }" />
</template>

<script setup>
// One swap list for everything: a day's exercise (next time only / always), the exercise you're on in a
// workout, and the day editor. Same ranking whatever the reason for swapping.
import { computed, ref, watch } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import ExercisePicker from './ExercisePicker.vue'
import { state, exercisesById, exerciseUsage } from '../store.js'
import { swapOptions, missingEquipment } from '../lib/training.js'
import { muscleLabel } from '../lib/format.js'
import { t, tn, tx } from '../i18n/index.js'

const props = defineProps({
  modelValue: Boolean,
  exerciseId: { type: String, default: '' },
  // What the routine had before any swap (shown first, as "Original")
  originalId: { type: String, default: '' },
  mode: { type: String, default: 'day' } // day | workout | edit
})
const emit = defineEmits(['update:modelValue', 'swap'])
const MATCH = { close: 'Close match', partial: 'Partial match', loose: 'Loose match' }
const name = (id) => tx(exercisesById.value[id], 'name') || id
const muscles = (id) => (exercisesById.value[id]?.primary || []).map(muscleLabel).join(', ')
const missing = computed(() => missingEquipment(exercisesById.value[props.exerciseId], state.data.settings.equipment).map(l => t(l).toLowerCase()))
const extra = ref(null)
const options = computed(() => {
  const list = swapOptions({
    current: props.exerciseId,
    original: props.originalId || null,
    byId: exercisesById.value,
    available: state.data.settings.equipment,
    usage: exerciseUsage.value
  })
  return extra.value && !list.some(o => o.id === extra.value) ? [{ id: extra.value }, ...list] : list
})
const pick = ref(null)
const pickerOpen = ref(false)
watch(() => [props.modelValue, props.exerciseId], ([open]) => {
  if (open) { extra.value = null; pick.value = options.value[0]?.id || null }
})

function choose (how) {
  if (!pick.value) return
  emit('swap', { id: pick.value, how })
  emit('update:modelValue', false)
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
.m-tag.orig { background: var(--info); color: #fff; }
.m-tag.close { background: var(--ok-soft); color: var(--ok); }
.m-tag.partial { background: var(--warn-soft); color: var(--warn); }
</style>
