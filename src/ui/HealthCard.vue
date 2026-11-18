<template>
  <div v-if="healthSupported && health.status && health.status !== 'none'" class="card card-pad hc">
    <div class="row head">
      <Icon name="heart" :class="on && health.granted.length ? 'hc-on' : 't-muted'" />
      <div class="grow">
        <div class="t-h3">{{ t('Health Connect') }}</div>
        <div class="t-tiny" :class="health.error ? 't-err' : 't-muted'">{{ line }}</div>
      </div>
    </div>

    <!-- Not on this phone, or too old -->
    <template v-if="health.status === 'not_installed' || health.status === 'update_required'">
      <p class="t-small t-muted">{{ health.status === 'update_required' ? t('Health Connect needs an update before the app can use it.') : t("Health Connect isn't on this phone. On Android 13 and older it's a free app from the Play Store.") }}</p>
      <button class="btn btn-soft btn-block" @click="openHealthStore">{{ health.status === 'update_required' ? t('Update Health Connect') : t('Get Health Connect') }}</button>
    </template>
    <p v-else-if="health.status === 'unsupported'" class="t-small t-muted">{{ t("This phone doesn't support Health Connect.") }}</p>

    <!-- Not connected -->
    <template v-else-if="!on">
      <p class="t-small t-muted">{{ t('Share your workouts, weight and body fat with Samsung Health, Google Fit, Fitbit and other apps, and bring in heart rate from your watch (Garmin, Samsung, Pixel…), weigh-ins from a smart scale and your daily steps.') }}</p>
      <button class="btn btn-primary btn-block" :disabled="health.busy" @click="connect"><Icon name="heart" />{{ health.busy ? t('Connecting…') : t('Connect to Health Connect') }}</button>
      <p class="t-tiny t-muted note">{{ t("You choose what to allow on Health Connect's screen. Your past workouts are sent too.") }}</p>
    </template>

    <!-- Connected -->
    <template v-else>
      <p v-if="!health.granted.length" class="t-small t-err">{{ t('Nothing is allowed at the moment. Open Health Connect to allow what you want to share.') }}</p>
      <div v-else-if="newOnes.length && !h.askedMore" class="more">
        <p class="t-small">{{ t('Gym Crew can now also read workouts from other apps, active calories, sleep, resting heart rate and VO2 max.') }}</p>
        <button class="btn btn-soft btn-sm" :disabled="health.busy" @click="allowMore">{{ t('Allow more') }}</button>
      </div>
      <div class="group">
        <div class="group-row">
          <div class="grow"><div>{{ t('Send workouts') }}</div><div class="t-tiny t-muted">{{ t('Each finished workout, with treadmill distance') }}</div></div>
          <Toggle v-model="h.workouts" :aria-label="t('Send workouts')" @update:model-value="changed" />
        </div>
        <div class="group-row">
          <div class="grow"><div>{{ t('Send weight and body fat') }}</div><div class="t-tiny t-muted">{{ t('From your Body log, and your height') }}</div></div>
          <Toggle v-model="h.body" :aria-label="t('Send weight and body fat')" @update:model-value="changed" />
        </div>
        <div class="group-row">
          <div class="grow"><div>{{ t('Read from other apps') }}</div><div class="t-tiny t-muted">{{ t('Heart rate and calories during workouts, weigh-ins, steps, sleep and workouts from other apps') }}</div></div>
          <Toggle v-model="h.read" :aria-label="t('Read from other apps')" @update:model-value="changed" />
        </div>
      </div>
      <div class="row btns">
        <button class="btn btn-soft grow" @click="openHealthSettings"><Icon name="adjust" />{{ t('Permissions') }}</button>
        <button class="btn btn-soft grow" :disabled="health.busy" @click="refresh"><Icon name="refresh" />{{ t('Sync now') }}</button>
      </div>
      <button class="btn btn-ghost btn-block off" @click="offOpen = true">{{ t('Disconnect') }}</button>
    </template>

    <Sheet v-model="offOpen" :title="t('Disconnect Health Connect?')">
      <p class="t-body">{{ t("The app stops sending and reading, and Health Connect forgets its permissions. What was already sent stays in Health Connect: you can delete it there (Health Connect → App permissions → Gym Crew → Delete app data).") }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="offOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-danger btn-lg" @click="disconnect">{{ t('Disconnect') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
// Settings → Health Connect (0.13): connect, choose what goes each way, permissions, disconnect.
import { computed, ref, onMounted } from 'vue'
import Icon from './Icon.vue'
import Sheet from './Sheet.vue'
import Toggle from './Toggle.vue'
import { toast } from './toast.js'
import { persist } from '../store.js'
import {
  health, healthSupported, healthSettings, healthOn, refreshStatus, connectHealth, disconnectHealth, runHealth,
  openHealthSettings, openHealthStore, missingPermissions
} from '../lib/health.js'
import { t } from '../i18n/index.js'

const h = healthSettings
const on = healthOn
const offOpen = ref(false)

onMounted(() => { refreshStatus() })

const line = computed(() => {
  if (health.error) return health.error
  if (health.status === 'available' && on.value) {
    if (health.busy) return t('Syncing…')
    return health.lastRun ? t('Connected · up to date') : t('Connected')
  }
  if (health.status === 'available') return t('Not connected')
  return ''
})

async function connect () {
  try {
    const ok = await connectHealth()
    toast(ok ? t('Connected to Health Connect') : t('Nothing was allowed, so nothing is shared.'))
  } catch (e) { toast(e.message || String(e)) }
}
// Read permissions added in an update that this phone hasn't been asked for yet
const NEW_IN_013 = ['read:exercise', 'read:activeCalories', 'read:sleep', 'read:restingHeartRate', 'read:vo2max']
const newOnes = computed(() => missingPermissions.value.filter(p => NEW_IN_013.includes(p)))
async function allowMore () {
  h.value.askedMore = true
  try { await connectHealth() } catch (e) { toast(e.message || String(e)) }
}
async function changed () {
  await persist()
  runHealth()
}
async function refresh () {
  health.busy = true
  try { await refreshStatus(); await runHealth() } finally { health.busy = false }
  if (!health.error) toast(t('Health Connect is up to date'))
}
async function disconnect () {
  await disconnectHealth()
  offOpen.value = false
  toast(t('Disconnected from Health Connect'))
}
</script>

<style scoped>
.hc { display: grid; gap: 10px; margin-top: 8px; }
.head { gap: 12px; align-items: center; }
.hc-on { color: var(--err); }
.btns { gap: 8px; }
.note { margin: 0; }
.more { display: grid; gap: 8px; justify-items: start; padding: 10px 12px; border-radius: 12px; background: var(--card-2); }
.more p { margin: 0; }
.off { color: var(--err); }
</style>
