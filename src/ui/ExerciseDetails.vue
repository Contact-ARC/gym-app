<template>
  <div class="xd" :class="{ 'in-sheet': inSheet }">
    <p class="t-small t-muted equip">{{ equipmentLine }}</p>

    <div v-if="photos.length" class="photos" :aria-label="t('Photos of the movement')">
      <img
        v-for="(src, i) in photos" :key="src" :src="src" loading="lazy"
        :alt="i === 0 ? t('{name}, start position', { name: tx(ex, 'name') }) : t('{name}, end position', { name: tx(ex, 'name') })"
        @error="(e) => (e.target.style.display = 'none')"
      >
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

    <section>
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
import { computed } from 'vue'
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
.photos { display: flex; gap: 8px; overflow-x: auto; margin: 16px -16px 0; padding: 0 16px; scroll-snap-type: x mandatory; scrollbar-width: none; }
.in-sheet .photos { margin: 14px -20px 0; padding: 0 20px; }
.photos::-webkit-scrollbar { display: none; }
.photos img { flex: 0 0 82%; max-width: 420px; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 14px; background: var(--card-2); scroll-snap-align: center; }
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
