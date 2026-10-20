<template>
  <button
    type="button" role="switch" :aria-checked="modelValue" class="toggle" :class="{ on: modelValue }"
    @click="flip"
  ><span class="knob" /></button>
</template>

<script setup>
import { tap } from '../lib/native.js'
const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
function flip () { emit('update:modelValue', !props.modelValue); tap() }
</script>

<style scoped>
.toggle {
  flex: 0 0 auto; width: 52px; height: 32px; border-radius: 16px; padding: 3px;
  background: var(--line); transition: background-color 160ms ease;
}
.toggle.on { background: var(--ok); }
.knob {
  display: block; width: 26px; height: 26px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: transform 180ms cubic-bezier(.2,.8,.2,1);
}
.on .knob { transform: translateX(20px); }
</style>
