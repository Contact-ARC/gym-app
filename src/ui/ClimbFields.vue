<template>
  <div class="cf">
    <!-- Grade -->
    <div class="label">{{ t('Grade') }}</div>
    <div ref="gradeRow" class="chips-row" role="radiogroup" :aria-label="t('Grade')">
      <button
        v-for="g in grades" :key="g" class="g-chip t-num" :class="{ on: c.grade === g, sw: !!swatch(g) }"
        role="radio" :aria-checked="c.grade === g" :data-on="c.grade === g || null" @click="c.grade = g"
      >
        <span v-if="swatch(g)" class="dot" :style="{ background: swatch(g) }" />{{ g }}
      </button>
    </div>

    <!-- Wall -->
    <div class="label">{{ t('Wall') }} <span class="t-faint">{{ t('(optional)') }}</span></div>
    <div class="chips-row wrap">
      <button
        v-for="w in wallChips" :key="w" class="w-chip" :class="{ on: c.wall === w }"
        :aria-pressed="c.wall === w" @click="c.wall = c.wall === w ? '' : w"
      ><Icon name="wall" :size="16" />{{ w }}</button>
      <button v-if="!adding" class="w-chip add" @click="startAdd"><Icon name="plus" :size="16" />{{ t('New wall') }}</button>
    </div>
    <div v-if="adding" class="row new-wall">
      <input ref="wallInput" v-model="newWall" class="field grow" type="text" maxlength="30" :placeholder="t('Cave, slab, overhang, 45°…')" enterkeyhint="done" @keydown.enter.prevent="addWall">
      <button class="btn btn-soft" :disabled="!newWall.trim()" @click="addWall">{{ t('Add') }}</button>
    </div>

    <!-- Result -->
    <div class="label">{{ t('How did it go?') }}</div>
    <Segmented v-model="c.result" :options="resultOptions" :label="t('How did it go?')" />

    <div class="row two">
      <Stepper v-if="c.result !== 'flash'" v-model="c.attempts" :label="t('Tries')" :min="1" :step="1" size="md" class="grow" />
      <div class="grow time">
        <Stepper v-model="c.seconds" :label="t('Time on it')" :min="0" :step="15" size="md" :format="(v) => (v ? mmss(v) : '—')" />
        <button v-if="timer" class="btn btn-sm timer-btn" :class="timing ? 'btn-primary' : 'btn-soft'" @click="emit('timer')">
          <Icon :name="timing ? 'stop' : 'timer'" :size="18" />{{ timing ? t('Stop') : t('Start timer') }}
        </button>
      </div>
    </div>

    <template v-if="kind === 'route'">
      <div class="label">{{ t('Style') }}</div>
      <Segmented v-model="c.style" :options="[{ label: t('Top rope'), value: 'toprope' }, { label: t('Lead'), value: 'lead' }]" :label="t('Style')" />
    </template>

    <label class="label" :for="noteId">{{ t('Note') }} <span class="t-faint">{{ t('(optional)') }}</span></label>
    <input :id="noteId" v-model="c.note" class="field" type="text" maxlength="60" :placeholder="t('Hold colour, name, beta…')">
  </div>
</template>

<script setup>
// The fields for one climb: grade, wall, result, tries, time, style (routes) and a note.
// Edits the object passed in (a reactive draft owned by the parent).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import Segmented from './Segmented.vue'
import Stepper from './Stepper.vue'
import { swatch, mmss } from '../lib/climbing.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  climb: { type: Object, required: true }, // reactive draft
  kind: { type: String, default: 'boulder' },
  grades: { type: Array, default: () => [] },
  walls: { type: Array, default: () => [] },
  timer: Boolean, // show the start/stop timer button
  timing: Boolean,
  idPrefix: { type: String, default: 'cf' }
})
const emit = defineEmits(['timer'])
const c = props.climb
const noteId = props.idPrefix + '-note'
const resultOptions = [{ label: t('Flash'), value: 'flash' }, { label: t('Sent'), value: 'send' }, { label: t('Not yet'), value: 'project' }]
// A flash is a first-try send
watch(() => c.result, (r) => { if (r === 'flash') c.attempts = 1 })
watch(() => c.attempts, (n) => { if (n > 1 && c.result === 'flash') c.result = 'send' })

const extraWalls = ref([])
const wallChips = computed(() => [...new Set([...props.walls, ...extraWalls.value, ...(c.wall ? [c.wall] : [])])])
const adding = ref(false)
const newWall = ref('')
const wallInput = ref(null)
async function startAdd () {
  adding.value = true
  await nextTick()
  wallInput.value?.focus()
}
function addWall () {
  const w = newWall.value.trim()
  if (!w) return
  if (!extraWalls.value.includes(w)) extraWalls.value.push(w)
  c.wall = w
  newWall.value = ''
  adding.value = false
}

// Keep the chosen grade in view
const gradeRow = ref(null)
function showGrade () {
  const el = gradeRow.value?.querySelector('[data-on]')
  if (el && gradeRow.value) gradeRow.value.scrollLeft = el.offsetLeft - gradeRow.value.clientWidth / 2 + el.clientWidth / 2
}
onMounted(() => nextTick(showGrade))
watch(() => props.grades, () => nextTick(showGrade))
</script>

<style scoped>
.cf { display: grid; gap: 8px; }
.label { margin-top: 10px; }
.chips-row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 2px 16px 4px; scroll-behavior: smooth; }
.chips-row::-webkit-scrollbar { display: none; }
.chips-row.wrap { flex-wrap: wrap; overflow: visible; }
.g-chip {
  flex: 0 0 auto; min-width: 56px; min-height: 48px; padding: 0 14px; border-radius: 14px;
  background: var(--card); color: var(--ink); font-size: 20px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
}
.g-chip.sw { font-size: 16px; font-family: var(--font); }
.g-chip.on { background: var(--ink); color: var(--paper); }
.g-chip.on .dot { box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.55); }
.dot { width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.18); flex: 0 0 auto; }
.w-chip {
  display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 20px;
  background: var(--card); color: var(--ink-2); font-weight: 600; font-size: 15px;
}
.w-chip.on { background: var(--ink); color: var(--paper); }
.w-chip.add { background: transparent; box-shadow: inset 0 0 0 1.5px var(--line); }
.new-wall { gap: 8px; }
.two { gap: 12px; align-items: flex-start; margin-top: 6px; }
.time { display: grid; gap: 8px; }
.timer-btn { justify-self: center; gap: 6px; }
.in-sheet .g-chip:not(.on), .in-sheet .w-chip:not(.on):not(.add) { background: var(--card-2); }
.in-sheet .chips-row { margin: 0 -20px; padding-left: 20px; padding-right: 20px; }
.in-sheet .chips-row.wrap { margin: 0; padding: 2px 0 4px; }
</style>
