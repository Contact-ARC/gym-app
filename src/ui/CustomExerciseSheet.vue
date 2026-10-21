<template>
  <Sheet :model-value="modelValue" :title="form.id ? t('Edit your exercise') : t('Create an exercise')" @update:model-value="(v) => emit('update:modelValue', v)">
    <label class="label" for="cx-name">{{ t('Name') }}</label>
    <input id="cx-name" v-model="form.name" class="field" type="text" maxlength="50" :placeholder="t('For example: Deficit deadlift')">

    <div class="label mt">{{ t('How you log it') }}</div>
    <Segmented v-model="form.kind" :options="kindOptions" :label="t('How you log it')" />
    <p class="t-tiny t-muted help">{{ kindHelp }}</p>

    <template v-if="form.kind === 'weight'">
      <div class="label mt">{{ t('Equipment') }}</div>
      <Segmented v-model="form.equip" :options="equipOptions" :label="t('Equipment')" />
    </template>

    <div class="label mt">{{ t('Muscles') }}</div>
    <p class="t-tiny t-muted help-top">{{ t('Tap once for a main muscle, twice for a helping one. Used for weekly sets per muscle.') }}</p>
    <div class="chips">
      <button
        v-for="m in MUSCLES" :key="m" class="mchip" :class="roleOf(m)" type="button"
        :aria-pressed="!!roleOf(m)" @click="cycle(m)"
      >{{ muscleLabel(m) }}<span v-if="roleOf(m) === 'help'" class="t-tiny"> · {{ t('helping') }}</span></button>
    </div>

    <label class="toggle-row t-small">
      <Toggle v-model="form.perSide" />
      <span class="grow">{{ t('One side at a time') }}</span>
    </label>

    <div class="label mt">{{ t('Photo') }} <span class="t-faint">{{ t('(optional)') }}</span></div>
    <div class="row photo-row">
      <img v-if="form.image" :src="form.image" alt="" class="ph">
      <label class="btn btn-soft btn-sm file-btn">
        <Icon name="camera" :size="18" />{{ form.image ? t('Change photo') : t('Add photo') }}
        <input type="file" accept="image/*" class="hidden-input" @change="pickPhoto">
      </label>
      <button v-if="form.image" class="btn btn-ghost btn-sm" type="button" @click="form.image = ''">{{ t('Remove') }}</button>
    </div>

    <label class="label mt" for="cx-steps">{{ t('How to do it') }} <span class="t-faint">{{ t('(optional, one step per line)') }}</span></label>
    <textarea id="cx-steps" v-model="form.steps" class="field" rows="3" />

    <template #actions>
      <button class="btn btn-soft btn-lg" @click="emit('update:modelValue', false)">{{ t('Cancel') }}</button>
      <button class="btn btn-primary btn-lg" :disabled="!canSave" @click="save">{{ t('Save') }}</button>
    </template>
  </Sheet>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import Sheet from './Sheet.vue'
import Segmented from './Segmented.vue'
import Toggle from './Toggle.vue'
import Icon from './Icon.vue'
import { toast } from './toast.js'
import { saveCustomExercise } from '../store.js'
import { MUSCLE_LABELS, muscleLabel } from '../lib/format.js'
import { imageDataUrl } from '../lib/photos.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  modelValue: Boolean,
  exercise: { type: Object, default: null }, // edit this one; null = new
  startName: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'saved'])
const MUSCLES = Object.keys(MUSCLE_LABELS)
const LOWER = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'lower_back']

const form = reactive({ id: null, name: '', kind: 'weight', equip: 'barbell', primary: [], secondary: [], perSide: false, image: '', steps: '' })
watch(() => props.modelValue, (open) => {
  if (!open) return
  const e = props.exercise
  if (e) {
    Object.assign(form, {
      id: e.id,
      name: e.name || '',
      kind: e.loadUnit === 'pin' ? 'pin' : e.logType === 'bodyweight' ? 'bodyweight' : e.logType === 'time' ? 'time' : 'weight',
      equip: e.incrementGroup === 'dumbbell' ? 'dumbbells' : (e.equipment || []).includes('barbell') ? 'barbell' : 'other',
      primary: [...(e.primary || [])],
      secondary: [...(e.secondary || [])],
      perSide: !!e.perSide,
      image: e.images?.[0] || '',
      steps: (e.steps || []).join('\n')
    })
  } else {
    Object.assign(form, { id: null, name: props.startName || '', kind: 'weight', equip: 'barbell', primary: [], secondary: [], perSide: false, image: '', steps: '' })
  }
})

const kindOptions = computed(() => [
  { label: t('Weight'), value: 'weight' }, { label: t('Pin'), value: 'pin' },
  { label: t('Bodyweight'), value: 'bodyweight' }, { label: t('Time'), value: 'time' }
])
const equipOptions = computed(() => [
  { label: t('Barbell'), value: 'barbell' }, { label: t('Dumbbells'), value: 'dumbbells' }, { label: t('Other'), value: 'other' }
])
const kindHelp = computed(() => ({
  weight: t('Weight and reps, like a barbell or dumbbell lift.'),
  pin: t('A machine or cable where you log the pin position.'),
  bodyweight: t('Reps with your bodyweight, plus extra weight if you add it.'),
  time: t('A hold or carry, logged in seconds.')
}[form.kind]))

const roleOf = (m) => (form.primary.includes(m) ? 'main' : form.secondary.includes(m) ? 'help' : '')
function cycle (m) {
  if (form.primary.includes(m)) { form.primary = form.primary.filter(x => x !== m); form.secondary.push(m) }
  else if (form.secondary.includes(m)) form.secondary = form.secondary.filter(x => x !== m)
  else form.primary.push(m)
}

async function pickPhoto (ev) {
  const f = ev.target.files?.[0]
  ev.target.value = ''
  if (!f) return
  try { form.image = await imageDataUrl(f) } catch { toast(t("Couldn't read that image")) }
}

const canSave = computed(() => form.name.trim().length > 0 && form.primary.length > 0)

function save () {
  const legs = form.primary.some(m => LOWER.includes(m))
  const ex = {
    id: form.id || undefined,
    name: form.name.trim(),
    primary: [...form.primary],
    secondary: [...form.secondary],
    perSide: form.perSide || undefined,
    steps: form.steps.split('\n').map(s => s.trim()).filter(Boolean),
    images: form.image ? [form.image] : []
  }
  if (form.kind === 'weight') {
    ex.logType = 'weight'
    ex.equipment = form.equip === 'barbell' ? ['barbell'] : form.equip === 'dumbbells' ? ['dumbbells'] : []
    ex.incrementGroup = form.equip === 'dumbbells' ? 'dumbbell' : legs ? 'lower' : 'upper'
  } else if (form.kind === 'pin') {
    Object.assign(ex, { logType: 'weight', loadUnit: 'pin', equipment: [] })
  } else if (form.kind === 'bodyweight') {
    Object.assign(ex, { logType: 'bodyweight', incrementGroup: 'dumbbell', equipment: [] })
  } else {
    Object.assign(ex, { logType: 'time', equipment: [] })
  }
  const id = saveCustomExercise(ex)
  emit('update:modelValue', false)
  emit('saved', id)
  toast(form.id ? t('Exercise saved') : t('{name} created', { name: ex.name }))
}
</script>

<style scoped>
.mt { margin-top: 18px; }
.help { margin: 8px 2px 0; }
.help-top { margin: -2px 2px 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.mchip {
  min-height: 38px; padding: 0 14px; border-radius: 19px;
  background: var(--card-2); color: var(--ink-2); font-size: 15px; font-weight: 600;
}
.mchip.main { background: var(--ink); color: var(--paper); }
.mchip.help { background: var(--info-soft); color: var(--info); }
.toggle-row { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.photo-row { gap: 10px; flex-wrap: wrap; }
.ph { width: 72px; height: 54px; border-radius: 10px; object-fit: cover; }
.file-btn { position: relative; overflow: hidden; }
.hidden-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
</style>
