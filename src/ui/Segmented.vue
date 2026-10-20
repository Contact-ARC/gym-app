<template>
  <div class="seg" role="radiogroup" :aria-label="label">
    <button
      v-for="o in options" :key="String(o.value)"
      type="button" role="radio"
      class="seg-opt" :class="{ on: o.value === modelValue }"
      :aria-checked="o.value === modelValue"
      @click="pick(o.value)"
    >{{ o.label }}</button>
  </div>
</template>

<script setup>
import { tap } from '../lib/native.js'
const props = defineProps({
  modelValue: [String, Number, Boolean],
  options: { type: Array, required: true }, // [{ label, value }]
  label: String,
  allowNone: Boolean
})
const emit = defineEmits(['update:modelValue'])
function pick (v) {
  if (props.allowNone && v === props.modelValue) emit('update:modelValue', null)
  else emit('update:modelValue', v)
  tap()
}
</script>

<style scoped>
.seg { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--card-2); }
.card .seg { background: var(--paper); }
.seg-opt {
  flex: 1 1 0; min-height: 40px; padding: 0 6px; border-radius: 10px;
  font-size: 15px; font-weight: 600; color: var(--ink-2);
  white-space: nowrap;
  transition: background-color 140ms ease, color 140ms ease;
}
.seg-opt.on { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.card .seg-opt.on { background: var(--card); }
:root[data-theme="dark"] .seg-opt.on { background: #3A4456; }
</style>
