<template>
  <div class="xd" :class="{ 'in-sheet': inSheet }">
    <p class="t-small t-muted equip">{{ equipmentLine }}</p>

    <!-- Photos: one at a time, arrows either side (faded at the ends), swipe works too -->
    <div v-if="photos.length" class="gallery" :class="{ single: photos.length < 2 }" role="group" :aria-label="t('Photos of the movement')">
      <button v-if="photos.length > 1" class="arrow" :disabled="shown === 0" :aria-label="t('Previous photo')" @click="go(shown - 1)"><Icon name="chevronLeft" /></button>
      <div ref="strip" class="strip" @scroll.passive="onScroll">
        <img
          v-for="(src, i) in photos" :key="src" :src="src" loading="lazy"
          :alt="i === 0 ? t('{name}, start position', { name: tx(ex, 'name') }) : t('{name}, end position', { name: tx(ex, 'name') })"
          @error="(e) => (e.target.style.display = 'none')"
        >
      </div>
      <button v-if="photos.length > 1" class="arrow" :disabled="shown === photos.length - 1" :aria-label="t('Next photo')" @click="go(shown + 1)"><Icon name="chevronRight" /></button>
    </div>
    <div v-if="photos.length > 1" class="dots" aria-hidden="true">
      <span v-for="(_, i) in photos" :key="i" :class="{ on: i === shown }" />
    </div>

    <div class="card card-pad map-card">
      <MuscleMap :primary="ex.primary || []" :secondary="ex.secondary || []" />
      <div class="muscles">
        <span v-for="m in ex.primary || []" :key="'p' + m" class="pill main">{{ muscleLabel(m) }}</span>
        <span v-for="m in ex.secondary || []" :key="'s' + m" class="pill">{{ muscleLabel(m) }}</span>
      </div>
      <p class="t-tiny t-muted legend">{{ t('Solid: main target. Light: also working.') }}</p>
    </div>

    <p v-if="!canDoAtGym(ex, state.data.settings.equipment)" class="note note-warn t-small gym-note">
      {{ t("Your gym doesn't have everything this needs. Check Settings, Your gym.") }}
    </p>

    <button class="btn btn-soft btn-block video" @click="openUrl(videoUrl)">
      <Icon name="video" />{{ ex.videoUrl ? t('Watch the video') : t('Find a form video') }}
    </button>

    <section v-if="setup?.length">
      <h2 class="section-h">{{ t('Set-up') }}</h2>
      <ul class="card card-pad bullets"><li v-for="(s, i) in setup" :key="i">{{ s }}</li></ul>
    </section>

    <section v-if="steps?.length">
      <h2 class="section-h">{{ t('How to do it') }}</h2>
      <ol class="card card-pad steps">
        <li v-for="(s, i) in steps || []" :key="i">
          <span class="step-n t-num">{{ i + 1 }}</span><span>{{ s }}</span>
        </li>
      </ol>
    </section>

    <section v-if="cues?.length">
      <h2 class="section-h">{{ t('Think about') }}</h2>
      <ul class="card card-pad bullets"><li v-for="(s, i) in cues" :key="i">{{ s }}</li></ul>
    </section>

    <section v-if="mistakes?.length">
      <h2 class="section-h">{{ t('Avoid') }}</h2>
      <ul class="card card-pad bullets avoid"><li v-for="(s, i) in mistakes" :key="i">{{ s }}</li></ul>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Icon from './Icon.vue'
import MuscleMap from './MuscleMap.vue'
import { state, imageUrl } from '../store.js'
import { muscleLabel, youtubeSearchUrl } from '../lib/format.js'
import { openUrl } from '../lib/native.js'
import { canDoAtGym } from '../lib/training.js'
import { t, tx } from '../i18n/index.js'

const props = defineProps({
  ex: { type: Object, required: true },
  inSheet: Boolean
})

const photos = computed(() => (props.ex.images || []).map(imageUrl))
const strip = ref(null)
const shown = ref(0)
function onScroll () {
  const el = strip.value
  if (el?.clientWidth) shown.value = Math.round(el.scrollLeft / el.clientWidth)
}
function go (i) {
  const el = strip.value
  if (!el) return
  const n = Math.max(0, Math.min(photos.value.length - 1, i))
  el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  shown.value = n
}
// Another exercise (alternatives link to the same page): back to the first photo
watch(() => props.ex.id, () => { shown.value = 0; if (strip.value) strip.value.scrollLeft = 0 })
const setup = computed(() => tx(props.ex, 'setup'))
const steps = computed(() => tx(props.ex, 'steps'))
const cues = computed(() => tx(props.ex, 'cues'))
const mistakes = computed(() => tx(props.ex, 'mistakes'))
const videoUrl = computed(() => props.ex.videoUrl || youtubeSearchUrl(props.ex.name || ''))
const equipmentLine = computed(() => {
  const e = (tx(props.ex, 'equipment') || []).join(', ')
  const extra = []
  if (props.ex.perSide) extra.push(t('one side at a time'))
  if (props.ex.loadUnit === 'pin') extra.push(t('logged by pin position'))
  return [e.charAt(0).toUpperCase() + e.slice(1), ...extra].filter(Boolean).join('. ')
})
</script>

<style scoped>
.equip { margin-top: 6px; }
.gallery { display: flex; align-items: center; gap: 6px; margin-top: 16px; }
.gallery.single { padding: 0 46px; }
.strip { flex: 1 1 auto; min-width: 0; max-width: 360px; margin: 0 auto; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: 14px; background: var(--card-2); }
.strip::-webkit-scrollbar { display: none; }
.strip img { flex: 0 0 100%; width: 100%; aspect-ratio: 3 / 2; object-fit: cover; scroll-snap-align: center; display: block; }
.arrow { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--card); color: var(--ink); transition: opacity 150ms ease; }
.in-sheet .arrow { background: var(--card-2); }
.arrow:disabled { opacity: 0.3; }
.dots { display: flex; justify-content: center; gap: 6px; margin-top: 8px; }
.dots span { width: 7px; height: 7px; border-radius: 50%; background: var(--ink-3); opacity: 0.35; transition: opacity 150ms ease, transform 150ms ease; }
.dots span.on { opacity: 1; transform: scale(1.15); }
.map-card { margin-top: 16px; }
/* Inside a sheet the background is already the card colour, so cards step down a shade */
.in-sheet .card { background: var(--card-2); }
.in-sheet :deep(.skin > *) { fill: var(--card); }
.in-sheet :deep(.m > *) { stroke: var(--card-2); }
.in-sheet .btn-soft { background: var(--card-2); }
.muscles { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pill.main { background: var(--ink); color: var(--paper); }
.in-sheet .pill:not(.main) { background: var(--card); }
.legend { margin: 8px 2px 0; }
.gym-note { margin-top: 12px; }
.video { margin-top: 14px; }
.bullets { list-style: none; }
.bullets li { position: relative; padding-left: 18px; font-size: 16px; }
.bullets li + li { margin-top: 10px; }
.bullets li::before { content: ''; position: absolute; left: 2px; top: 10px; width: 6px; height: 6px; border-radius: 50%; background: var(--ink-3); }
.avoid li::before { background: var(--err); }
.steps { list-style: none; }
.steps li { display: flex; gap: 12px; font-size: 16px; }
.steps li + li { margin-top: 14px; }
.step-n {
  flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
  background: var(--ink); color: var(--paper); font-size: 16px; font-weight: 700;
}
</style>
