<template>
  <Sheet :model-value="modelValue" :title="t('Training together')" @update:model-value="(v) => emit('update:modelValue', v)">
    <!-- Not yet: start with this workout -->
    <template v-if="!g">
      <p class="t-body">{{ t("Share this workout with up to 3 people from your crew. Everyone does this day with their own weights, taking turns, and the app plans the plates when you share a bar.") }}</p>
      <p v-if="error" class="t-small t-err">{{ error }}</p>
    </template>

    <template v-else>
      <!-- The code for whoever's next to you -->
      <div class="code-card">
        <div class="t-tiny t-muted up">{{ t('Code to join') }}</div>
        <div class="code t-num">{{ g.code }}</div>
        <div class="t-tiny t-muted">{{ t('Crew, then Join with a code') }}</div>
      </div>

      <div class="label">{{ t('In it ({n} of 4)', { n: g.members.length }) }}</div>
      <div class="group">
        <div v-for="m in g.members" :key="m.id" class="group-row who">
          <span class="av" :style="avatarStyle(m.id)">{{ initial(m.id) }}</span>
          <span class="grow">{{ m.id === me ? t('You') : m.name }}<span v-if="m.id === g.host" class="t-muted"> · {{ t('host') }}</span></span>
          <span v-if="g.state?.turn === m.id" class="pill pill-ok">{{ t('up now') }}</span>
        </div>
      </div>

      <template v-if="canInvite.length && g.members.length < 4 && g.status !== 'done'">
        <div class="label">{{ t('Invite') }}</div>
        <div class="group">
          <div v-for="m in canInvite" :key="m.id" class="group-row who">
            <span class="av" :style="avatarStyle(m.id)">{{ initial(m.id) }}</span>
            <span class="grow">{{ m.name }}<span v-if="m.live" class="t-muted"> · {{ t('training now') }}</span></span>
            <button class="btn btn-sm" :class="invited[m.id] ? 'btn-ghost' : 'btn-soft'" :disabled="invited[m.id] === 'busy'" @click="invite(m)">
              {{ invited[m.id] === true ? t('Invited ✓') : t('Invite') }}
            </button>
          </div>
        </div>
      </template>

      <!-- Moving on -->
      <template v-if="g.status !== 'done'">
        <div class="label">{{ t('Exercise for everyone') }}</div>
        <div class="group">
          <button v-for="(it, i) in g.plan.items" :key="i" class="group-row who" @click="go(i)">
            <span class="num t-num">{{ i + 1 }}</span>
            <span class="grow truncate">{{ exName(it.exerciseId) }}</span>
            <span class="t-tiny t-muted t-num">{{ doneText(i) }}</span>
            <Icon v-if="g.state?.item === i" name="checkBold" :size="18" />
          </button>
        </div>
        <p class="t-tiny t-muted">{{ t("Anyone can go off and do something else (a machine's taken): just log it, and come back to the shared one after.") }}</p>
      </template>
      <p v-if="error" class="t-small t-err">{{ error }}</p>
    </template>

    <template #actions>
      <button v-if="!g" class="btn btn-primary btn-lg" :disabled="busy" @click="start"><Icon name="team" />{{ busy ? t('Starting…') : t('Start training together') }}</button>
      <template v-else-if="g.status !== 'done'">
        <button v-if="g.state?.turn === me" class="btn btn-soft btn-lg" @click="pass">{{ t('Skip my turn') }}</button>
        <button class="btn btn-soft btn-lg t-err" @click="leave">{{ isHost && g.members.length > 1 ? t('Leave (someone else hosts)') : t('Leave') }}</button>
        <button v-if="isHost && g.members.length > 1" class="btn btn-soft btn-lg t-err" @click="end">{{ t('End for everyone') }}</button>
      </template>
      <button v-else class="btn btn-soft btn-lg" @click="leave">{{ t('Close') }}</button>
    </template>
  </Sheet>
</template>

<script setup>
// Start training together from a workout, show the join code, invite people, move everyone on, leave.
import { computed, reactive, ref, onMounted } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import { toast } from './toast.js'
import { exercisesById } from '../store.js'
import { board, me, liveOf, refreshBoard } from '../lib/crew.js'
import { together, isHost, startTogether, inviteTogether, leaveTogether, endTogether, passTurn, goToItem, togetherView } from '../lib/together.js'
import { avatarStyle, initial } from './crewUi.js'
import { t, tx } from '../i18n/index.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const g = together
const busy = ref(false)
const error = ref('')
const invited = reactive({})
onMounted(() => { if (!board.fetchedAt) refreshBoard() })

const canInvite = computed(() => {
  const inIt = new Set((g.value?.members || []).map(m => m.id))
  return board.members.filter(m => m.id !== me.value && !inIt.has(m.id))
    .map(m => ({ id: m.id, name: m.name, live: !!liveOf(m) }))
    .sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name))
})
const exName = (id) => tx(exercisesById.value[id], 'name') || id
function doneText (i) {
  const v = togetherView.value
  const sets = g.value?.plan?.items?.[i]?.sets || 0
  return (g.value?.members || []).map(m => `${v?.done?.[m.id]?.[i] || 0}/${sets}`).join(' · ')
}

async function start () {
  busy.value = true
  error.value = ''
  try { await startTogether() } catch (e) { error.value = e.message } finally { busy.value = false }
}
async function invite (m) {
  invited[m.id] = 'busy'
  try { await inviteTogether(m.id); invited[m.id] = true; toast(t('Invite sent to {name}', { name: m.name })) } catch (e) { invited[m.id] = false; error.value = e.message }
}
function go (i) {
  goToItem(i)
  emit('update:modelValue', false)
}
function pass () {
  passTurn()
  emit('update:modelValue', false)
}
async function leave () {
  await leaveTogether()
  emit('update:modelValue', false)
  toast(t('You left. Your workout carries on.'))
}
async function end () {
  await endTogether()
  emit('update:modelValue', false)
  toast(t('Ended for everyone. Your workouts carry on.'))
}
</script>

<style scoped>
.code-card { display: grid; justify-items: center; gap: 2px; padding: 14px; border-radius: 16px; background: var(--card-2); margin-bottom: 6px; }
.code { font-size: 44px; font-weight: 700; letter-spacing: 0.18em; font-family: var(--font-num); }
.up { text-transform: uppercase; letter-spacing: 0.06em; }
.label { margin-top: 14px; }
.who { gap: 10px; min-height: 48px; text-align: left; }
.av { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px; flex: 0 0 auto; }
.num { width: 24px; text-align: center; color: var(--ink-3); }
</style>
