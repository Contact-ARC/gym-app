<template>
  <Transition name="toast">
    <div v-if="toastState.text" :key="toastState.id" class="toast" :class="{ top: !!top }" :style="top ? { top } : { bottom }" role="status">
      <span class="grow">{{ toastState.text }}</span>
      <button v-if="toastState.action" class="toast-act" @click="runToastAction">{{ toastState.actionLabel }}</button>
    </div>
  </Transition>
</template>

<script setup>
import { toastState, runToastAction } from './toast.js'
defineProps({ bottom: { type: String, default: '16px' }, top: { type: String, default: '' } })
</script>

<style scoped>
.toast {
  position: fixed; left: 12px; right: 12px; z-index: 2500;
  max-width: 560px; margin: 0 auto;
  display: flex; align-items: center; gap: 12px;
  min-height: 52px; padding: 8px 8px 8px 18px; border-radius: 14px;
  background: var(--ink); color: var(--paper);
  box-shadow: var(--shadow-float);
  font-size: 16px; font-weight: 500;
}
.toast-act {
  min-height: 40px; padding: 0 14px; border-radius: 10px;
  font-weight: 700; color: var(--paper);
}
.toast-act:active { background: rgba(255,255,255,0.12); }
.toast-enter-active, .toast-leave-active { transition: opacity 160ms ease, transform 200ms cubic-bezier(.2,.8,.2,1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px); }
.toast.top.toast-enter-from, .toast.top.toast-leave-to { transform: translateY(-12px); }
</style>
