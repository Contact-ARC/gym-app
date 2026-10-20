<template>
  <Sheet :model-value="open" :title="t('Welcome to Gym Crew')" @update:model-value="(v) => !v && finish()">
    <Segmented v-model="lang" :options="LANGS" :label="t('Language')" />
    <p class="t-body t-muted mt-s">{{ t("A few quick things and you're ready to train.") }}</p>

    <label class="label mt" for="w-name">{{ t('What should we call you?') }}</label>
    <input id="w-name" v-model="name" class="field" type="text" autocomplete="given-name" :placeholder="t('Your first name')" enterkeyhint="done">

    <div class="label mt">{{ t('You lift in') }}</div>
    <Segmented v-model="unit" :options="[{ label: t('Kilograms'), value: 'kg' }, { label: t('Pounds'), value: 'lb' }]" :label="t('Units')" />

    <div class="label mt">{{ t('How long have you been lifting?') }}</div>
    <Segmented v-model="level" :options="[{ label: t('Under 6 months'), value: 'beginner' }, { label: t('Longer'), value: 'standard' }]" :label="t('Experience')" />
    <p class="t-tiny t-muted mt-s">{{ t('New lifters get the beginner version of the routine where there is one: simpler exercises and fewer sets. You can change it any time.') }}</p>

    <p class="t-small t-muted mt">
      {{ t('Your workouts stay on this phone. The app saves a weekly backup to Documents/GymCrew, and you can export one from Settings.') }}
    </p>
    <template #actions>
      <button class="btn btn-primary btn-lg" @click="finish">{{ t('Start training') }}</button>
    </template>
  </Sheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Sheet from '../ui/Sheet.vue'
import Segmented from '../ui/Segmented.vue'
import { state, persist } from '../store.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR } from '../lib/training.js'
import { LANGS, i18n } from '../i18n/index.js'

const open = computed(() => state.ready && !state.data.welcomed && !state.data.sessions.length && !state.data.profile.name)
const name = ref('')
const unit = ref(state.data.profile.unit || 'kg')
const level = ref(state.data.profile.level || 'standard')
const lang = ref(i18n.lang)
watch(lang, (l) => { state.data.settings.lang = l })

function finish () {
  const p = state.data.profile
  p.name = name.value.trim()
  p.level = level.value
  if (unit.value !== p.unit) {
    p.unit = unit.value
    p.increments = { ...DEFAULT_INCREMENTS[unit.value] }
    p.bar = DEFAULT_BAR[unit.value]
  }
  state.data.settings.lang = lang.value
  state.data.welcomed = true
  persist()
}
</script>

<style scoped>
.mt { margin-top: 20px; }
.mt-s { margin-top: 12px; }
</style>
