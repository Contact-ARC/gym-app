<template>
  <Sheet :model-value="modelValue" :title="isNew ? t('Add a gym') : t('Edit gym')" @update:model-value="emit('update:modelValue', $event)">
    <div v-if="draft" class="gs">
      <label class="label" for="gym-name">{{ t('Name') }}</label>
      <input id="gym-name" v-model="draft.name" class="field" type="text" maxlength="30" :placeholder="t('e.g. the gym or the area')" enterkeyhint="done">

      <!-- Workouts from before gyms: which gym they were at -->
      <div v-if="earlierChoice" class="earlier card-2">
        <template v-if="earlierChoice === 'here'">
          <Icon name="checkBold" :size="18" /><span class="t-small">{{ t('Your workouts from before you added gyms count as this gym.') }}</span>
        </template>
        <template v-else>
          <span class="t-small grow">{{ t('Your workouts from before you added gyms count as {gym}. Were they here?', { gym: earlierName }) }}</span>
          <button class="btn btn-soft btn-sm" @click="moveEarlier">{{ t('They were here') }}</button>
        </template>
      </div>

      <button class="group-row climb-toggle" :aria-expanded="climbOpen" @click="climbOpen = !climbOpen">
        <span class="grow">
          <span>{{ t('Climbing grades') }}</span>
          <span class="t-small t-muted climb-sum">{{ climbSummary }}</span>
        </span>
        <Icon :name="climbOpen ? 'minus' : 'plus'" :size="20" />
      </button>
      <template v-if="climbOpen">
      <div class="label mt">{{ t('Bouldering grades') }}</div>
      <div class="group radios">
        <button v-for="o in SYSTEMS.boulder" :key="o.value" class="group-row radio-row" role="radio" :aria-checked="draft.boulder === o.value" @click="draft.boulder = o.value">
          <span class="grow">{{ t(o.label) }}</span><Icon v-if="draft.boulder === o.value" name="checkBold" :size="20" />
        </button>
      </div>

      <div class="label mt">{{ t('Route grades') }}</div>
      <div class="group radios">
        <button v-for="o in SYSTEMS.route" :key="o.value" class="group-row radio-row" role="radio" :aria-checked="draft.route === o.value" @click="draft.route = o.value">
          <span class="grow">{{ t(o.label) }}</span><Icon v-if="draft.route === o.value" name="checkBold" :size="20" />
        </button>
      </div>

      <!-- Colour circuit -->
      <template v-if="usesColours">
        <div class="label mt row between">
          <span>{{ t('Colours, easiest first') }}</span>
          <button v-if="draft.colours.length" class="btn btn-ghost btn-sm" @click="draft.colours = []">{{ t('Clear') }}</button>
        </div>
        <div v-if="draft.colours.length" class="circuit">
          <button v-for="(c, i) in draft.colours" :key="c" class="cc" :aria-label="t('Remove {x}', { x: c })" @click="draft.colours.splice(i, 1)">
            <span class="n t-num">{{ i + 1 }}</span><span v-if="swatch(c)" class="dot" :style="{ background: swatch(c) }" />{{ c }}<Icon name="close" :size="14" class="x" />
          </button>
        </div>
        <p v-else class="t-small t-muted">{{ t('Tap the colours below from easiest to hardest.') }}</p>

        <div class="palette">
          <button v-for="c in paletteLeft" :key="c" class="pc" @click="draft.colours.push(c)">
            <span class="dot" :style="{ background: swatch(c) }" />{{ c }}
          </button>
        </div>
        <div class="row add-c">
          <input v-model="custom" class="field grow" type="text" maxlength="20" :placeholder="t('Another colour or name')" enterkeyhint="done" @keydown.enter.prevent="addCustom">
          <button class="btn btn-soft" :disabled="!custom.trim()" @click="addCustom">{{ t('Add') }}</button>
        </div>
        <p class="t-tiny t-muted">{{ t('Tap a colour above to take it out. Climbs you already logged keep their place, so changing the order later won\'t change your records.') }}</p>
      </template>
      </template>
    </div>
    <template #actions>
      <button v-if="!isNew && canRemove" class="btn btn-danger btn-lg" @click="remove"><Icon name="trash" />{{ t('Remove') }}</button>
      <button class="btn btn-primary btn-lg" :disabled="!valid" @click="save">{{ t('Save') }}</button>
    </template>
  </Sheet>
</template>

<script setup>
// Add or change a gym: its name and, for climbing, how it grades boulders and routes and its colour circuit.
// Its bar, plates, equipment and machine settings are set in Settings while you're at it (see switchGym).
import { computed, ref, watch } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import { toast } from './toast.js'
import { state, addGym, updateGym, removeGym, earlierGymId, hasEarlierWorkouts, moveEarlierWorkouts } from '../store.js'
import { SYSTEMS, PALETTE, DEFAULT_COLOURS, swatch, climbGyms, activeGyms, gymName, gymById } from '../lib/climbing.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  modelValue: Boolean,
  gymId: { type: String, default: null } // null = a new gym
})
const emit = defineEmits(['update:modelValue'])

const isNew = computed(() => !props.gymId)
const draft = ref(null)
const custom = ref('')
const climbOpen = ref(false)
watch(() => props.modelValue, (open) => {
  if (!open) return
  const g = climbGyms(state.data.settings).find(x => x.id === props.gymId)
  draft.value = g
    ? { name: g.name || '', boulder: g.boulder || 'font', route: g.route || 'french', colours: [...(g.colours || DEFAULT_COLOURS.map(x => t('colour|' + x)))] }
    : { name: '', boulder: 'font', route: 'french', colours: [] }
  custom.value = ''
  climbOpen.value = false
}, { immediate: true })

const usesColours = computed(() => draft.value && (draft.value.boulder === 'colour' || draft.value.route === 'colour'))
const paletteLeft = computed(() => PALETTE.map(x => t('colour|' + x)).filter(c => !draft.value.colours.some(d => d.toLowerCase() === c.toLowerCase())))
function addCustom () {
  const c = custom.value.trim()
  if (!c) return
  if (!draft.value.colours.some(d => d.toLowerCase() === c.toLowerCase())) draft.value.colours.push(c)
  custom.value = ''
}
const sysName = (kind, v) => (v === 'colour' ? t('Colours') : t(SYSTEMS[kind].find(o => o.value === v)?.label || '').replace(/ \(.*\)$/, ''))
const climbSummary = computed(() => draft.value ? `${sysName('boulder', draft.value.boulder)} · ${sysName('route', draft.value.route)}` : '')
// A circuit needs at least two levels to compare anything
const valid = computed(() => !!draft.value && (!usesColours.value || draft.value.colours.length >= 2))
const canRemove = computed(() => activeGyms(state.data.settings).length > 1)

// Only worth asking once there's more than one gym
const earlierChoice = computed(() => {
  if (isNew.value || !hasEarlierWorkouts.value || activeGyms(state.data.settings).length < 2) return null
  return earlierGymId() === props.gymId ? 'here' : 'elsewhere'
})
const earlierName = computed(() => gymName(gymById(state.data.settings, earlierGymId())))
function moveEarlier () {
  moveEarlierWorkouts(props.gymId)
  toast(t('Your earlier workouts and machine settings are now at {gym}', { gym: draft.value.name.trim() || t('My gym') }))
}

function save () {
  if (!valid.value) return
  const d = draft.value
  const fields = { name: d.name.trim(), boulder: d.boulder, route: d.route, colours: d.colours.length ? [...d.colours] : null }
  if (isNew.value) addGym(fields)
  else updateGym(props.gymId, fields)
  emit('update:modelValue', false)
  toast(t('{gym} saved', { gym: fields.name || t('My gym') }))
}
function remove () {
  const name = gymName(gymById(state.data.settings, props.gymId))
  removeGym(props.gymId)
  emit('update:modelValue', false)
  toast(t('{gym} removed. Your workouts and climbs there are kept.', { gym: name }))
}
</script>

<style scoped>
.gs { display: grid; gap: 8px; }
.earlier { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 12px; background: var(--card-2); margin-top: 8px; }
.climb-toggle { margin-top: 12px; min-height: 56px; border-radius: 12px; background: var(--card-2); text-align: left; }
.climb-toggle .grow { display: grid; }
.mt { margin-top: 12px; }
.between { justify-content: space-between; align-items: center; }
.radios { background: var(--card-2); }
.radio-row { min-height: 52px; text-align: left; }
.radio-row .icon { color: var(--ink); }
.circuit, .palette { display: flex; flex-wrap: wrap; gap: 8px; }
.cc, .pc {
  display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border-radius: 20px;
  font-weight: 600; font-size: 15px;
}
.cc { background: var(--ink); color: var(--paper); }
.cc .n { font-size: 12px; opacity: 0.7; }
.cc .x { opacity: 0.7; }
.cc .dot { box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.55); } /* black still shows on the dark chip */
.pc { background: var(--card-2); color: var(--ink-2); }
.palette { margin-top: 6px; }
.dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.18); flex: 0 0 auto; }
.add-c { gap: 8px; margin-top: 4px; }
</style>
