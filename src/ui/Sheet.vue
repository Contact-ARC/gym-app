<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="modelValue" class="sheet-root" @keydown.esc="close">
        <div class="backdrop" @click="close" />
        <div
          ref="panel"
          class="sheet"
          role="dialog"
          aria-modal="true"
          :aria-label="title || undefined"
          :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : null"
        >
          <div
            class="handle-zone"
            @touchstart.passive="onStart"
            @touchmove.passive="onMove"
            @touchend="onEnd"
          >
            <div class="handle" />
            <div v-if="title" class="sheet-title t-h2">{{ title }}</div>
          </div>
          <div class="sheet-body">
            <slot />
          </div>
          <div v-if="$slots.actions" class="sheet-actions">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import { pushOverlay } from './overlay.js'

const props = defineProps({
  modelValue: Boolean,
  title: String
})
const emit = defineEmits(['update:modelValue', 'closed'])
const panel = ref(null)

function close () {
  emit('update:modelValue', false)
  emit('closed')
}

let release = null
watch(() => props.modelValue, async (open) => {
  if (open) {
    release = pushOverlay(close)
    await nextTick()
    panel.value?.querySelector('[autofocus]')?.focus()
  } else if (release) {
    release(); release = null
  }
}, { immediate: true })
onBeforeUnmount(() => { if (release) release() })

// Swipe down on the handle area to dismiss
const dragY = ref(0)
let startY = null
function onStart (e) { startY = e.touches[0].clientY }
function onMove (e) {
  if (startY == null) return
  dragY.value = Math.max(0, e.touches[0].clientY - startY)
}
function onEnd () {
  if (dragY.value > 90) close()
  dragY.value = 0
  startY = null
}
</script>

<style scoped>
.sheet-root { position: fixed; inset: 0; z-index: 2000; display: flex; flex-direction: column; justify-content: flex-end; }
.backdrop { position: absolute; inset: 0; background: rgba(10, 16, 24, 0.45); }
.sheet {
  position: relative;
  max-height: 88vh;
  display: flex; flex-direction: column;
  background: var(--card);
  border-radius: var(--r-sheet) var(--r-sheet) 0 0;
  box-shadow: var(--shadow-sheet);
  padding-bottom: var(--safe-bottom);
  transition: transform 220ms cubic-bezier(.2, .8, .2, 1);
  max-width: 640px; width: 100%; margin: 0 auto;
}
.handle-zone { padding: 10px 20px 4px; touch-action: none; }
.handle { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto 10px; }
.sheet-title { padding: 2px 0 6px; }
.sheet-body { overflow-y: auto; padding: 8px 20px 16px; overscroll-behavior: contain; }
.sheet-actions { display: flex; gap: 10px; padding: 8px 20px 16px; }
.sheet-actions > * { flex: 1 1 0; }

.sheet-enter-active, .sheet-leave-active { transition: opacity 200ms ease; }
.sheet-enter-active .sheet, .sheet-leave-active .sheet { transition: transform 240ms cubic-bezier(.2, .8, .2, 1); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: translateY(100%); }
</style>
