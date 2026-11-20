<template>
  <Sheet :model-value="modelValue" :title="t('Training together')" @update:model-value="(v) => emit('update:modelValue', v)">
    <!-- Not yet: start with this workout -->
    <template v-if="!g">
      <p class="t-body">{{ t('Do this workout with up to 3 people from your crew. You each lift your own weights; the app keeps track of turns and plans the plates when you share a bar.') }}</p>
      <p v-if="error" class="t-small t-err">{{ error }}</p>
    </template>

    <template v-else>
      <!-- Who's in (with their latest set), then who you could invite -->
      <div class="group">
        <div v-for="m in g.members" :key="m.id" class="group-row who">
          <span class="av" :class="{ turn: v.turns && g.state?.turn === m.id }" :style="avatarStyle(m.id)">{{ initial(m.id, m.name) }}</span>
          <span class="grow min0">
            <span class="nm">{{ m.id === me ? t('You') : m.name }}<span v-if="m.id === g.host" class="t-muted t-small"> · {{ t('host') }}</span></span>
            <span class="t-tiny t-muted sub truncate">{{ latestText(m.id) }}</span>
          </span>
          <span v-if="v.turns && g.state?.turn === m.id && g.status !== 'done'" class="pill pill-ok">{{ t('up now') }}</span>
          <span v-else class="t-tiny t-muted t-num">{{ doneTotal(m.id) }}/{{ planTotal }}</span>
        </div>
        <template v-if="canInvite.length && g.members.length < 4 && g.status !== 'done'">
          <div v-for="m in canInvite" :key="m.id" class="group-row who">
            <span class="av out" :style="avatarStyle(m.id)">{{ initial(m.id, m.name) }}</span>
            <span class="grow min0">
              <span class="nm">{{ m.name }}</span>
              <span class="t-tiny t-muted sub">{{ m.live ? t('training now') : t('in your crew') }}</span>
            </span>
            <button class="btn btn-sm" :class="invited[m.id] === true ? 'btn-ghost' : 'btn-soft'" :disabled="!!invited[m.id]" @click="invite(m)">
              {{ invited[m.id] === true ? t('Invited ✓') : t('Invite') }}
            </button>
          </div>
        </template>
      </div>

      <template v-if="g.status !== 'done'">
        <div class="group mt-g">
          <!-- Turns: for sharing a bar or machine; off when you're each on your own thing -->
          <label class="group-row set-row">
            <span class="grow">
              <span>{{ t('Take turns') }}</span>
              <span class="t-tiny t-muted sub">{{ v.turns ? t('One at a time on the same exercise, with the plates planned when you share a bar') : t('Everyone at their own pace, on their own machines') }}</span>
            </span>
            <Toggle :model-value="v.turns" @update:model-value="setTurns" />
          </label>
          <!-- Turns on: move everyone to another exercise (folded away until you need it) -->
          <template v-if="v.turns">
            <button class="group-row set-row" :aria-expanded="moveOpen" @click="moveOpen = !moveOpen">
              <span class="grow">
                <span>{{ t('Move everyone to…') }}</span>
                <span class="t-tiny t-muted sub truncate">{{ t('Now: {name}', { name: exName(g.plan.items[g.state?.item ?? 0]?.exerciseId) }) }}</span>
              </span>
              <Icon :name="moveOpen ? 'moveUp' : 'moveDown'" :size="20" class="t-muted" />
            </button>
            <template v-if="moveOpen">
              <button v-for="(it, i) in g.plan.items" :key="i" class="group-row move" :class="{ on: g.state?.item === i }" @click="go(i)">
                <span class="num t-num">{{ i + 1 }}</span>
                <span class="grow truncate">{{ exName(it.exerciseId) }}</span>
                <span class="t-tiny t-muted t-num">{{ doneText(i) }}</span>
              </button>
            </template>
          </template>
          <!-- The code, for whoever's next to you -->
          <div class="group-row set-row">
            <span class="grow">
              <span>{{ t('Code') }} <b class="t-num code">{{ g.code }}</b></span>
              <span class="t-tiny t-muted sub">{{ t('Crew, then Join with a code') }}</span>
            </span>
            <button class="btn btn-sm btn-soft" @click="share"><Icon name="share" :size="18" />{{ t('Share') }}</button>
          </div>
        </div>
      </template>
      <p v-if="error" class="t-small t-err">{{ error }}</p>

      <!-- Leaving, quietly at the bottom -->
      <div class="leave-row">
        <button class="btn btn-ghost btn-sm t-err" @click="leave">{{ g.status === 'done' ? t('Close') : t('Leave') }}</button>
        <button v-if="isHost && g.members.length > 1 && g.status !== 'done'" class="btn btn-ghost btn-sm t-err" @click="end">{{ t('End for everyone') }}</button>
      </div>
      <p v-if="isHost && g.members.length > 1 && g.status !== 'done'" class="t-tiny t-muted center">{{ t('If you leave, someone else becomes the host.') }}</p>
    </template>

    <template v-if="!g || (g.status !== 'done' && (others || (v.turns && v.myTurn)))" #actions>
      <button v-if="!g" class="btn btn-primary btn-lg" :disabled="busy" @click="start"><Icon name="team" />{{ busy ? t('Starting…') : t('Start training together') }}</button>
      <template v-else>
        <button v-if="v.turns && v.myTurn && others" class="btn btn-soft btn-lg" @click="pass">{{ t('Skip my turn') }}</button>
        <button v-if="others" class="btn btn-soft btn-lg" @click="spot"><Icon name="clap" />{{ t('Spot me') }}</button>
      </template>
    </template>
  </Sheet>
</template>

<script setup>
// Training together (0.16): who's in and what they just did, invites, turns on or off, moving everyone on,
// the code, Spot me and leaving. Starting it from a workout too.
import { computed, reactive, ref, onMounted } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import Toggle from './Toggle.vue'
import { toast } from './toast.js'
import { exercisesById } from '../store.js'
import { board, me, liveOf, refreshBoard } from '../lib/crew.js'
import { together, isHost, startTogether, inviteTogether, leaveTogether, endTogether, passTurn, goToItem, setTurns, spotMe, togetherView } from '../lib/together.js'
import { fmtLoad } from '../lib/training.js'
import { fmtSecs } from '../lib/format.js'
import { shareText } from '../lib/native.js'
import { avatarStyle, initial } from './crewUi.js'
import { t, tx } from '../i18n/index.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const g = together
const v = computed(() => togetherView.value || { turns: true })
const busy = ref(false)
const error = ref('')
const invited = reactive({})
const moveOpen = ref(false)
onMounted(() => { if (!board.fetchedAt) refreshBoard() })

const others = computed(() => (g.value?.members || []).length > 1)
const canInvite = computed(() => {
  const inIt = new Set((g.value?.members || []).map(m => m.id))
  return board.members.filter(m => m.id !== me.value && !inIt.has(m.id))
    .map(m => ({ id: m.id, name: m.name, live: !!liveOf(m) }))
    .sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name))
})
const exName = (id) => tx(exercisesById.value[id], 'name') || id
const planTotal = computed(() => (g.value?.plan?.items || []).reduce((n, it) => n + (it.sets || 1), 0))
const doneTotal = (id) => Object.values(v.value?.done?.[id] || {}).reduce((n, x) => n + x, 0)
function doneText (i) {
  const sets = g.value?.plan?.items?.[i]?.sets || 0
  return (g.value?.members || []).map(m => `${v.value?.done?.[m.id]?.[i] || 0}/${sets}`).join(' · ')
}
function setLine (r) {
  if (r.load > 0 && r.reps) return `${fmtLoad(r.load, r.unit)} × ${r.reps}`
  if (r.reps) return `× ${r.reps}`
  if (r.seconds) return fmtSecs(r.seconds) + (r.level != null ? ' · ' + t('level {n}', { n: r.level }) : '')
  return ''
}
function latestText (id) {
  const x = v.value?.latest?.[id]
  return x ? `${exName(x.exerciseId)} ${setLine(x)}`.trim() : t('No sets yet')
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
async function share () {
  const r = await shareText(t('Training together'), t('Join my workout in Gym Crew: Crew, then Join with a code: {code}', { code: g.value.code })).catch(() => 'failed')
  if (r === 'copied') toast(t('Copied to clipboard'))
}
function go (i) {
  goToItem(i)
  moveOpen.value = false
  emit('update:modelValue', false)
}
function pass () {
  passTurn()
  emit('update:modelValue', false)
}
function spot () {
  spotMe()
  emit('update:modelValue', false)
  toast(t('Asked for a spot'))
}
async function leave () {
  const wasDone = g.value?.status === 'done'
  await leaveTogether()
  emit('update:modelValue', false)
  if (!wasDone) toast(t('You left. Your workout carries on.'))
}
async function end () {
  await endTogether()
  emit('update:modelValue', false)
  toast(t('Ended for everyone. Your workouts carry on.'))
}
</script>

<style scoped>
.who { gap: 10px; min-height: 56px; text-align: left; }
.min0 { min-width: 0; display: grid; }
.nm { font-weight: 600; }
.sub { display: block; }
.av { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px; flex: 0 0 auto; }
.av.turn { box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--ink); }
.av.out { opacity: 0.55; }
.mt-g { margin-top: 12px; }
.set-row { gap: 10px; min-height: 56px; text-align: left; }
.code { letter-spacing: 0.12em; font-size: 18px; margin-left: 4px; }
.move { gap: 10px; min-height: 44px; padding-left: 20px; text-align: left; }
.move.on { font-weight: 700; }
.num { width: 22px; text-align: center; color: var(--ink-3); }
.leave-row { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.leave-row .btn { white-space: nowrap; flex: 0 0 auto; }
.center { text-align: center; margin: 2px 0 0; }
</style>
