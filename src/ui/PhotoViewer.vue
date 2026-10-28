<template>
  <Teleport to="body">
    <Transition name="pv">
      <div v-if="modelValue" class="pv" role="dialog" aria-modal="true" :aria-label="title">
        <div class="pv-top">
          <span class="t-small pv-count t-num">{{ shown + 1 }} / {{ photos.length }}</span>
          <button class="pv-btn" :aria-label="t('Close')" @click="close"><Icon name="close" /></button>
        </div>
        <div ref="strip" class="pv-strip" @scroll.passive="onScroll">
          <div v-for="(p, i) in photos" :key="p.src" class="pv-slide" @click.self="close">
            <img :src="p.src" :alt="p.alt" draggable="false">
          </div>
        </div>
        <template v-if="photos.length > 1">
          <button class="pv-btn pv-arrow left" :disabled="shown === 0" :aria-label="t('Previous photo')" @click="go(shown - 1)"><Icon name="chevronLeft" /></button>
          <button class="pv-btn pv-arrow right" :disabled="shown === photos.length - 1" :aria-label="t('Next photo')" @click="go(shown + 1)"><Icon name="chevronRight" /></button>
          <div class="pv-dots" aria-hidden="true"><span v-for="(_, i) in photos" :key="i" :class="{ on: i === shown }" /></div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
// Full-screen photos: swipe or use the arrows; the X, the Android back button or Escape closes.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { pushOverlay } from './overlay.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  modelValue: Boolean,
  photos: { type: Array, default: () => [] }, // [{ src, alt }]
  start: { type: Number, default: 0 },
  title: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'index'])
const strip = ref(null)
const shown = ref(0)

function close () { emit('update:modelValue', false) }
function onScroll () {
  const el = strip.value
  if (el?.clientWidth) {
    shown.value = Math.round(el.scrollLeft / el.clientWidth)
    emit('index', shown.value)
  }
}
function go (i) {
  const el = strip.value
  if (!el) return
  const n = Math.max(0, Math.min(props.photos.length - 1, i))
  el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  shown.value = n
  emit('index', n)
}
function onKey (e) {
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowRight') go(shown.value + 1)
  else if (e.key === 'ArrowLeft') go(shown.value - 1)
}

let release = null
watch(() => props.modelValue, async (open) => {
  if (open) {
    release = pushOverlay(close)
    window.addEventListener('keydown', onKey)
    shown.value = props.start
    await nextTick()
    if (strip.value) strip.value.scrollLeft = props.start * strip.value.clientWidth
  } else {
    if (release) { release(); release = null }
    window.removeEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => {
  if (release) release()
  window.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.pv { position: fixed; inset: 0; z-index: 2600; background: #05080C; color: #fff; }
.pv-strip { position: absolute; inset: 0; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.pv-strip::-webkit-scrollbar { display: none; }
.pv-slide { flex: 0 0 100%; height: 100%; display: grid; place-items: center; scroll-snap-align: center; }
.pv-slide img { max-width: 100%; max-height: 100%; object-fit: contain; user-select: none; }
.pv-top {
  position: absolute; z-index: 2; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between;
  padding: calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 10px) 12px 10px 20px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
}
.pv-count { color: rgba(255, 255, 255, 0.85); font-weight: 600; }
.pv-btn {
  width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
  background: rgba(255, 255, 255, 0.14); color: #fff; transition: opacity 150ms ease;
}
.pv-btn:disabled { opacity: 0.25; }
.pv-arrow { position: absolute; z-index: 2; top: 50%; transform: translateY(-50%); }
.pv-arrow.left { left: 10px; }
.pv-arrow.right { right: 10px; }
.pv-dots {
  position: absolute; z-index: 2; left: 0; right: 0; bottom: calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 24px);
  display: flex; justify-content: center; gap: 8px;
}
.pv-dots span { width: 8px; height: 8px; border-radius: 50%; background: #fff; opacity: 0.35; transition: opacity 150ms ease; }
.pv-dots span.on { opacity: 1; }
.pv-enter-active, .pv-leave-active { transition: opacity 180ms ease; }
.pv-enter-from, .pv-leave-to { opacity: 0; }
</style>
