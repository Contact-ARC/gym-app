<template>
  <div class="stepper" :class="[`s-${size}`, { empty: modelValue == null }]">
    <div v-if="label" class="st-label">{{ label }}</div>
    <div class="st-row">
      <button
        class="st-btn" type="button" :aria-label="`Decrease ${label || ''}`"
        :disabled="modelValue != null && modelValue <= min"
        @pointerdown.prevent="hold(-1)" @pointerup="release" @pointerleave="release" @pointercancel="release"
        @keydown.enter.prevent="bump(-1)" @keydown.space.prevent="bump(-1)"
      >
        <Icon name="minus" :size="size === 'lg' ? 28 : 22" />
      </button>

      <div class="st-value">
        <input
          v-if="editing"
          ref="input"
          v-model="draft"
          class="st-input t-num"
          type="text"
          :inputmode="decimals ? 'decimal' : 'numeric'"
          enterkeyhint="done"
          @keydown.enter.prevent="commit"
          @blur="commit"
        >
        <button v-else class="st-display t-num" type="button" :aria-label="`${label || 'Value'}: ${display}. Tap to type`" @click="startEdit">
          {{ display }}
        </button>
        <div v-if="unit" class="st-unit">{{ unit }}</div>
      </div>

      <button
        class="st-btn" type="button" :aria-label="`Increase ${label || ''}`"
        :disabled="modelValue != null && max != null && modelValue >= max"
        @pointerdown.prevent="hold(1)" @pointerup="release" @pointerleave="release" @pointercancel="release"
        @keydown.enter.prevent="bump(1)" @keydown.space.prevent="bump(1)"
      >
        <Icon name="plus" :size="size === 'lg' ? 28 : 22" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import { tap } from '../lib/native.js'

const props = defineProps({
  modelValue: { type: Number, default: null },
  step: { type: Number, default: 1 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: null },
  decimals: { type: Boolean, default: false },
  label: String,
  unit: String,
  placeholder: { type: String, default: '—' },
  size: { type: String, default: 'lg' }, // 'lg' | 'md'
  format: Function
})
const emit = defineEmits(['update:modelValue'])

const round = (x) => Math.round(x * 100) / 100

const display = computed(() => {
  const v = props.modelValue
  if (v == null || Number.isNaN(v)) return props.placeholder
  if (props.format) return props.format(v)
  return String(round(v))
})

function set (v) {
  let next = round(v)
  if (next < props.min) next = props.min
  if (props.max != null && next > props.max) next = props.max
  if (next !== props.modelValue) {
    emit('update:modelValue', next)
    tap()
  }
}

function bump (dir) {
  const cur = props.modelValue
  if (cur == null) return set(dir > 0 ? Math.max(props.min, props.step) : props.min)
  // Snap to the step grid first so 61 + 2.5 goes to 62.5, not 63.5
  const snapped = dir > 0
    ? Math.floor(cur / props.step + 1e-9) * props.step + props.step
    : Math.ceil(cur / props.step - 1e-9) * props.step - props.step
  set(snapped)
}

// Press and hold to repeat
let t1 = null; let t2 = null
function hold (dir) {
  bump(dir)
  clearTimeout(t1); clearInterval(t2)
  t1 = setTimeout(() => { t2 = setInterval(() => bump(dir), 90) }, 420)
}
function release () { clearTimeout(t1); clearInterval(t2) }
onBeforeUnmount(release)

// Tap the number to type it
const editing = ref(false)
const draft = ref('')
const input = ref(null)
async function startEdit () {
  draft.value = props.modelValue == null ? '' : String(round(props.modelValue))
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}
function commit () {
  if (!editing.value) return
  editing.value = false
  const txt = String(draft.value).replace(',', '.').trim()
  if (txt === '') return
  const n = Number(txt)
  if (Number.isFinite(n)) set(n)
}
</script>

<style scoped>
.stepper { min-width: 0; }
.st-label { font-size: 14px; font-weight: 600; color: var(--ink-2); text-align: center; margin-bottom: 6px; }
.st-row { display: flex; align-items: center; gap: 6px; }
.st-btn {
  flex: 0 0 auto; display: grid; place-items: center;
  width: 52px; height: 64px; border-radius: 14px;
  background: var(--card-2); color: var(--ink);
  user-select: none; -webkit-user-select: none; touch-action: manipulation;
  transition: transform 80ms ease, background-color 120ms ease;
}
.st-btn:active { transform: scale(0.94); background: var(--line); }
.st-btn:disabled { opacity: 0.35; }
.st-value { flex: 1 1 auto; min-width: 0; text-align: center; }
.st-display, .st-input {
  width: 100%; height: 52px;
  font-family: var(--font-num); font-weight: 600; font-size: 46px; line-height: 52px;
  text-align: center; padding: 0;
  background: transparent; border: 0; outline: none;
}
.st-input { border-bottom: 2px solid var(--ink-3); }
.empty .st-display { color: var(--ink-3); }
.st-unit { font-size: 13px; color: var(--ink-2); margin-top: -2px; }

.s-md .st-btn { width: 44px; height: 48px; border-radius: 12px; }
.s-md .st-display, .s-md .st-input { height: 40px; font-size: 32px; line-height: 40px; }
</style>

<style scoped>
@media (max-height: 720px) {
  .s-lg .st-btn { height: 54px; }
  .s-lg .st-display, .s-lg .st-input { height: 46px; line-height: 46px; font-size: 40px; }
  .st-label { margin-bottom: 4px; }
}
</style>
