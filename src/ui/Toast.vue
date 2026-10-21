<template>
  <Transition :name="flung ? 'toast-fling' : 'toast'">
    <div
      v-if="toastState.text" :key="toastState.id" class="toast" :class="{ top: !!top, dragging: dragging }"
      :style="[top ? { top } : { bottom }, dx || dy ? { transform: `translate(${dx}px, ${dy}px)`, opacity: fade } : null, flung ? { '--fling': flungX + 'px' } : null]"
      role="status"
      @touchstart.passive="onStart" @touchmove.passive="onMove" @touchend="onEnd" @touchcancel="reset"
    >
      <span class="grow">{{ toastState.text }}</span>
      <button v-if="toastState.action" class="toast-act" @click="runToastAction">{{ toastState.actionLabel }}</button>
    </div>
  </Transition>
</template>

<script setup>
// Swipe a message sideways (or towards its edge of the screen) to dismiss it
import { computed, ref } from 'vue'
import { toastState, runToastAction, hideToast } from './toast.js'
const props = defineProps({ bottom: { type: String, default: '16px' }, top: { type: String, default: '' } })

const dx = ref(0)
const dy = ref(0)
const dragging = ref(false)
const flung = ref(false)
const flungX = ref(0)
let sx = 0; let sy = 0
const fade = computed(() => Math.max(0.2, 1 - Math.abs(dx.value) / 260))

function onStart (e) {
  sx = e.touches[0].clientX; sy = e.touches[0].clientY
  dragging.value = true; flung.value = false
}
function onMove (e) {
  if (!dragging.value) return
  dx.value = e.touches[0].clientX - sx
  const rawY = e.touches[0].clientY - sy
  // Only follow the finger vertically towards the edge the message sits on
  dy.value = props.top ? Math.min(0, rawY) : Math.max(0, rawY)
}
function onEnd () {
  const away = Math.abs(dx.value) > 70 || Math.abs(dy.value) > 28
  if (away) {
    flungX.value = Math.abs(dx.value) > 70 ? Math.sign(dx.value) * 420 : 0
    flung.value = true
    hideToast()
  }
  reset()
}
function reset () { dx.value = 0; dy.value = 0; dragging.value = false }
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
  touch-action: pan-y;
}
.toast.dragging { transition: none; }
.toast-act {
  min-height: 40px; padding: 0 14px; border-radius: 10px;
  font-weight: 700; color: var(--paper);
}
.toast-act:active { background: rgba(255,255,255,0.12); }
.toast-enter-active, .toast-leave-active { transition: opacity 160ms ease, transform 200ms cubic-bezier(.2,.8,.2,1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px); }
.toast.top.toast-enter-from, .toast.top.toast-leave-to { transform: translateY(-12px); }
.toast-fling-leave-active { transition: opacity 180ms ease, transform 180ms ease-out; }
.toast-fling-leave-to { opacity: 0; transform: translateX(var(--fling, 0)) translateY(var(--fling-y, 0)); }
</style>
