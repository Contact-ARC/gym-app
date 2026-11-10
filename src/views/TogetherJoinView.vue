<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.replace('/crew')"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ t('Train together') }}</h1>

    <div v-if="loading" class="card card-pad t-muted">{{ t('Loading…') }}</div>
    <div v-else-if="error" class="card card-pad">
      <p class="t-body">{{ error }}</p>
      <button class="btn btn-soft" @click="router.replace('/crew')">{{ t('Back to the crew') }}</button>
    </div>
    <div v-else-if="info?.status === 'done'" class="card card-pad">
      <p class="t-h3">{{ t('This one has finished.') }}</p>
      <p class="t-small t-muted">{{ t('Ask for a new invite, or start your own from a workout: ⋯, Train together.') }}</p>
    </div>
    <template v-else-if="info">
      <div class="card card-pad stack">
        <div class="t-tiny t-muted up">{{ t('Invited by {name}', { name: hostName }) }}</div>
        <div class="t-h2">{{ planName || t('A workout') }}</div>
        <ul v-if="info.plan?.items" class="items t-small">
          <li v-for="(it, i) in info.plan.items" :key="i"><span class="t-num">{{ it.sets }} ×</span> {{ exName(it.exerciseId) }}</li>
        </ul>
        <p class="t-small t-muted">{{ busyWorkout ? t("Your workout carries on, with these exercises added. Your weights come from your own history.") : t('You each lift your own weights, from your own history, taking turns.') }}</p>
      </div>
      <button class="btn btn-primary btn-lg btn-block join" :disabled="joining" @click="join"><Icon name="team" />{{ joining ? t('Joining…') : t('Join') }}</button>
    </template>
  </div>
</template>

<script setup>
// Opened from an invite (notification) or a "Join" on the crew screen: who's training, what, and Join.
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import { exercisesById, activeSession } from '../store.js'
import { memberById, inCrew } from '../lib/crew.js'
import { peekTogether, joinTogether, together } from '../lib/together.js'
import { t, tx, i18n } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const info = ref(null)
const loading = ref(true)
const error = ref('')
const joining = ref(false)
const hostName = computed(() => info.value?.members?.find(m => m.id === info.value.host)?.name || memberById.value[info.value?.host]?.name || '')
const planName = computed(() => (i18n.lang === 'es' && info.value?.plan?.nameEs) || info.value?.plan?.name || '')
const busyWorkout = computed(() => !!activeSession.value?.sets?.length)
const exName = (id) => tx(exercisesById.value[id], 'name') || id

onMounted(async () => {
  const id = route.params.id
  // Already in it: straight to the workout
  if (together.value?.id === id && together.value.status !== 'done') { router.replace(`/workout/${together.value.sessionId}`); return }
  if (!inCrew.value) { error.value = t('Join the crew first.'); loading.value = false; return }
  try {
    // Not in it yet the server only says it exists; join shows the rest
    info.value = await peekTogether(id)
    if (info.value.joined === false && info.value.status !== 'done') info.value = { ...info.value, ...(await openInfo(id)) }
  } catch (e) {
    error.value = e.code === 'not_found' ? t('That one has finished or was for another crew.') : e.message
  } finally { loading.value = false }
})
// What the crew list knows about it (host, day name) before joining
async function openInfo (id) {
  const { refreshOpenTogether, openTogether } = await import('../lib/together.js')
  await refreshOpenTogether()
  const o = openTogether.value.find(x => x.id === id)
  return o ? { host: o.host, plan: o.plan, members: [] } : {}
}
async function join () {
  joining.value = true
  try {
    const sid = await joinTogether({ id: route.params.id })
    router.replace(`/workout/${sid}`)
  } catch (e) {
    error.value = e.code === 'together_full' ? t("It's full: 4 people at most.") : e.message
  } finally { joining.value = false }
}
</script>

<style scoped>
.stack { display: grid; gap: 8px; margin-top: 12px; }
.up { text-transform: uppercase; letter-spacing: 0.06em; }
.items { margin: 0; padding-left: 18px; color: var(--ink-2); }
.join { margin-top: 16px; }
</style>
