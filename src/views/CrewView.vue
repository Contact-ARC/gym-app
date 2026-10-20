<template>
  <div class="page">
    <header class="row head">
      <h1 class="t-title grow">{{ t('Crew') }}</h1>
      <button v-if="inCrew" class="icon-btn" :class="{ spin: board.loading }" :aria-label="t('Refresh')" @click="refresh"><Icon name="refresh" /></button>
      <button v-if="inCrew" class="icon-btn" :aria-label="t('Crew settings')" @click="settingsOpen = true"><Icon name="more" /></button>
    </header>

    <!-- Not set up on the server side yet -->
    <div v-if="!crewAvailable" class="card card-pad intro">
      <Icon name="crew" :size="32" />
      <p class="t-h3">{{ t('Train together') }}</p>
      <p class="t-small t-muted">{{ t('A shared board for your group: who trained this week, streaks, records and the monthly challenge.') }}</p>
      <p class="t-small t-muted">{{ t("It needs a one-time setup by whoever looks after the routines. Until then everything else works as normal.") }}</p>
      <RouterLink to="/settings#crew" class="btn btn-soft btn-block mt">{{ t('Crew server settings') }}</RouterLink>
    </div>

    <!-- Join or start a crew -->
    <template v-else-if="!inCrew">
      <div class="card card-pad intro">
        <Icon name="crew" :size="32" />
        <p class="t-h3">{{ t('Train together') }}</p>
        <p class="t-small t-muted">{{ t('See who trained this week, keep each other\'s streaks going and chase the monthly challenge together.') }}</p>
        <p class="t-tiny t-muted">{{ t('Shared: your name, workouts (day, time, sets, records) and weekly totals. Never shared: notes, body weight, photos.') }}</p>
      </div>

      <label class="label mt" for="c-name">{{ t('Your name in the crew') }}</label>
      <input id="c-name" v-model="name" class="field" type="text" maxlength="30" autocomplete="given-name" :placeholder="t('Your first name')">

      <Segmented v-model="mode" class="mt" :options="[{ label: t('Join a crew'), value: 'join' }, { label: t('Start a crew'), value: 'start' }]" :label="t('Join or start')" />

      <template v-if="mode === 'join'">
        <label class="label mt" for="c-code">{{ t('Crew code') }}</label>
        <input id="c-code" v-model="code" class="field t-num code-in" type="text" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC123">
        <button class="btn btn-primary btn-lg btn-block mt" :disabled="busy || !name.trim() || normaliseCode(code).length < 6" @click="doJoin">
          <Icon name="join" />{{ t('Join') }}
        </button>
      </template>
      <template v-else>
        <p class="t-small t-muted mt">{{ t("You'll get a code to send to your friends.") }}</p>
        <button class="btn btn-primary btn-lg btn-block mt" :disabled="busy || !name.trim()" @click="doCreate">
          <Icon name="plus" />{{ t('Start a crew') }}
        </button>
      </template>
      <p v-if="error" class="note note-warn t-small mt">{{ error }}</p>
    </template>

    <!-- In a crew -->
    <template v-else>
      <button class="code-chip row" @click="invite">
        <span class="t-tiny t-muted">{{ t('Crew code') }}</span>
        <b class="t-num code">{{ state.data.crew.code }}</b>
        <span class="grow" />
        <Icon name="share" :size="18" />
        <span class="t-small">{{ t('Invite') }}</span>
      </button>

      <p v-if="board.error" class="note note-warn t-small mt">{{ board.error }}</p>
      <p v-if="state.data.crew.queue.length" class="t-tiny t-muted mt">{{ tn(state.data.crew.queue.length, '{n} update waiting to send', '{n} updates waiting to send') }}</p>

      <Segmented v-model="tab" class="mt" :options="[{ label: t('This week'), value: 'board' }, { label: t('Feed'), value: 'feed' }]" :label="t('View')" />

      <!-- Weekly board -->
      <template v-if="tab === 'board'">
        <div v-if="!board.fetchedAt && board.loading" class="t-small t-muted mt">{{ t('Loading…') }}</div>
        <div v-else class="group mt">
          <div v-for="(m, i) in ranked" :key="m.id" class="group-row member" :class="{ me: m.id === me }">
            <span class="rank t-num" :class="{ top: i === 0 && m.week.workouts > 0 }">
              <Icon v-if="i === 0 && m.week.workouts > 0" name="crown" :size="18" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <div class="grow">
              <div class="t-h3 truncate">{{ m.name }}<span v-if="m.id === me" class="t-muted you"> · {{ t('you') }}</span></div>
              <div class="t-small t-muted">
                {{ tn(m.week.workouts, '{n} workout', '{n} workouts') }} · {{ tn(m.week.sets, '{n} set', '{n} sets') }}
                <template v-if="m.lastSeen"> · {{ t('updated {when}', { when: m.lastSeen }) }}</template>
              </div>
              <div v-if="m.challenge && challenge" class="cbar" :title="tx(challenge, 'title')">
                <div :style="{ width: Math.round(Math.min(1, m.challenge.value / m.challenge.target) * 100) + '%' }" :class="{ done: m.challenge.done }" />
              </div>
            </div>
            <div class="streak" :class="{ off: !m.streak }" :aria-label="tn(m.streak, '{n}-week streak', '{n}-week streak')">
              <Icon name="fire" :size="18" /><span class="t-num">{{ m.streak }}</span>
            </div>
          </div>
        </div>
        <!-- Mondays and Tuesdays: the new week is nearly empty, so show how last week ended -->
        <template v-if="lastWeekRanked.length && weekDay < 2">
          <h2 class="section-h">{{ t('Last week') }}</h2>
          <div class="group">
            <div v-for="(m, i) in lastWeekRanked" :key="'lw' + m.id" class="group-row member" :class="{ me: m.id === me }">
              <span class="rank t-num" :class="{ top: i === 0 }">
                <Icon v-if="i === 0" name="crown" :size="18" />
                <template v-else>{{ i + 1 }}</template>
              </span>
              <span class="grow t-h3 truncate">{{ m.name }}<span v-if="m.id === me" class="t-muted you"> · {{ t('you') }}</span></span>
              <span class="t-small t-muted">{{ tn(m.workouts, '{n} workout', '{n} workouts') }} · {{ tn(m.sets, '{n} set', '{n} sets') }}</span>
            </div>
          </div>
        </template>
        <p class="t-tiny t-muted mt">
          {{ t('Ranked by workouts this week, then sets. The flame is each person\'s week streak ({n}+ workouts a week).', { n: streak.min }) }}
          <template v-if="challenge">{{ ' ' + t('The bar is the monthly challenge.') }}</template>
        </p>
      </template>

      <!-- Feed -->
      <template v-else>
        <p v-if="board.fetchedAt && !board.events.length" class="t-small t-muted mt">{{ t('Nothing yet. Finished workouts show up here.') }}</p>
        <div class="feed mt">
          <article v-for="e in feed" :key="e.id" class="card post">
            <div class="row post-head">
              <span class="avatar" :style="avatarStyle(e.member_id)">{{ initial(e.member_id) }}</span>
              <div class="grow">
                <div class="t-small"><b>{{ who(e.member_id) }}</b> {{ e.kind === 'challenge' ? t('completed the challenge') : t('finished a workout') }}</div>
                <div class="t-tiny t-muted">{{ relativeDay(e.payload.startedAt || e.created_at) }}</div>
              </div>
              <PlateBadge v-if="e.kind === 'workout' && e.payload.day" :index="plateIndex(e.payload.day)" :label="e.payload.day === 'free' ? '+' : e.payload.day" size="sm" />
              <span v-else-if="e.kind === 'challenge'" class="ch-icon"><Icon name="trophy" :size="20" /></span>
            </div>

            <template v-if="e.kind === 'workout'">
              <div class="t-h3 post-title">{{ sessionTitle({ dayName: e.payload.dayName, dayNameEs: e.payload.dayNameEs, dayId: e.payload.day }) }}</div>
              <div class="t-small t-muted t-num">
                {{ t('{n} min', { n: fmtMins(e.payload.minutes) }) }} · {{ tn(e.payload.sets, '{n} set', '{n} sets') }}<template v-if="e.payload.volume"> · {{ fmtNum(e.payload.volume, 0) }} {{ e.payload.unit }}</template>
              </div>
              <ul v-if="e.payload.prs?.length" class="prs">
                <li v-for="p in e.payload.prs" :key="p.exerciseId + p.type" class="t-small">
                  <Icon name="trophy" :size="16" class="gold" />
                  <span><b>{{ exerciseName(p.exerciseId, p.name) }}</b> {{ prText(p, p.unit).main }}</span>
                </li>
              </ul>
            </template>
            <div v-else class="t-h3 post-title">{{ tx(e.payload, 'title') }}</div>

            <div class="row post-foot">
              <button
                class="clap" :class="{ on: e.reactions?.[me] }" :disabled="e.member_id === me"
                :aria-pressed="!!e.reactions?.[me]" :aria-label="t('High five')" @click="highFive(e.id)"
              >
                <Icon name="clap" :size="18" />
                <span v-if="clapCount(e)" class="t-num">{{ clapCount(e) }}</span>
              </button>
              <span v-if="clapNames(e)" class="t-tiny t-muted truncate">{{ clapNames(e) }}</span>
            </div>
          </article>
        </div>
      </template>
    </template>

    <!-- Crew settings -->
    <Sheet v-model="settingsOpen" :title="t('Crew settings')">
      <div class="label">{{ t('Your name in the crew') }}</div>
      <div class="row gap">
        <input v-model="rename" class="field grow" type="text" maxlength="30">
        <button class="btn btn-soft" :disabled="!rename.trim() || rename.trim() === state.data.crew.name" @click="saveName">{{ t('Save') }}</button>
      </div>
      <label class="toggle-row mt">
        <span class="grow">
          <span class="t-body">{{ t('Post my workouts to the feed') }}</span>
          <span class="t-tiny t-muted block">{{ t('Weekly totals and streak still show on the board.') }}</span>
        </span>
        <Toggle v-model="state.data.crew.shareFeed" @update:model-value="persist" />
      </label>
      <button class="btn btn-ghost btn-block t-err mt" @click="leaveOpen = true"><Icon name="leave" />{{ t('Leave the crew') }}</button>
    </Sheet>

    <Sheet v-model="leaveOpen" :title="t('Leave the crew?')">
      <p class="t-body">{{ t('Your posts and spot on the board are removed for everyone. Your workouts stay on this phone. You can join again with the code.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="leaveOpen = false">{{ t('Stay') }}</button>
        <button class="btn btn-danger btn-lg" @click="doLeave">{{ t('Leave') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Segmented from '../ui/Segmented.vue'
import Toggle from '../ui/Toggle.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import { toast } from '../ui/toast.js'
import { dayPlate } from '../ui/plates.js'
import { state, persist, days, challenge, streak } from '../store.js'
import {
  board, crewAvailable, inCrew, createCrew, joinCrew, leaveCrew, renameMe, syncNow, refreshBoard,
  highFive, normaliseCode, exerciseName
} from '../lib/crew.js'
import { weekKey } from '../lib/stats.js'
import { relativeDay, dayTitle, fmtNum, fmtMins, prText, sessionTitle } from '../lib/format.js'
import { shareText } from '../lib/native.js'
import { t, tn, tx } from '../i18n/index.js'

const me = computed(() => state.data.crew.memberId)
const tab = ref('board')
const mode = ref('join')
const name = ref(state.data.crew.name || state.data.profile.name || '')
const code = ref('')
const busy = ref(false)
const error = ref('')

onMounted(() => { if (inCrew.value) syncNow({ withBoard: true }) })
watch(inCrew, (v) => { if (v) refreshBoard() })

async function refresh () {
  await syncNow()
  await refreshBoard()
}

async function doJoin () {
  busy.value = true; error.value = ''
  try {
    const c = await joinCrew(code.value, name.value)
    toast(t('You joined crew {code}', { code: c }))
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
async function doCreate () {
  busy.value = true; error.value = ''
  try {
    await createCrew(name.value)
    toast(t('Crew created. Send the code to your friends.'))
    invite()
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

async function invite () {
  const msg = t('Join my crew in Gym Crew: open the Crew tab and enter the code {code}', { code: state.data.crew.code })
  const r = await shareText(t('Crew invite'), msg)
  if (r === 'copied') toast(t('Copied to clipboard'))
}

// ── Board ──
const thisWeek = computed(() => weekKey(new Date(state.today + 'T12:00:00')))
const ranked = computed(() => board.members.map(m => {
  const s = m.stats || {}
  const fresh = s.week?.key === thisWeek.value
  const ch = challenge.value && s.challenge?.month === state.data.cache.routine?.month ? s.challenge : null
  return {
    id: m.id,
    name: m.name,
    week: fresh ? s.week : { workouts: 0, sets: 0 },
    // A streak only counts if it was still alive at their last update
    streak: s.streak?.weeks && (fresh || s.week?.key >= weekKeyOffset(-1)) ? s.streak.weeks : 0,
    challenge: ch,
    lastSeen: m.id === me.value ? '' : (m.updated_at ? relativeDay(m.updated_at) : '')
  }
}).sort((a, b) => b.week.workouts - a.week.workouts || b.week.sets - a.week.sets || b.streak - a.streak || a.name.localeCompare(b.name)))
const weekDay = computed(() => (new Date(state.today + 'T12:00:00').getDay() + 6) % 7) // Mon = 0
// Last week's final numbers: the snapshot people sent this week, or their last update if it was last week
const lastWeekRanked = computed(() => {
  const key = weekKeyOffset(-1)
  return board.members.map(m => {
    const s = m.stats || {}
    const w = s.lastWeek?.key === key ? s.lastWeek : s.week?.key === key ? s.week : null
    return w ? { id: m.id, name: m.name, workouts: w.workouts, sets: w.sets } : null
  }).filter(m => m && m.workouts > 0)
    .sort((a, b) => b.workouts - a.workouts || b.sets - a.sets || a.name.localeCompare(b.name))
})
function weekKeyOffset (n) {
  const d = new Date(state.today + 'T12:00:00')
  d.setDate(d.getDate() + 7 * n)
  return weekKey(d)
}

// ── Feed ──
const memberById = computed(() => Object.fromEntries(board.members.map(m => [m.id, m])))
const who = (id) => (id === me.value ? t('You') : memberById.value[id]?.name || t('Someone'))
const initial = (id) => (memberById.value[id]?.name || '?').trim().charAt(0).toUpperCase()
const AVATAR = ['var(--plate-red)', 'var(--plate-blue)', 'var(--plate-yellow)', 'var(--plate-green)', 'var(--ink-2)']
function avatarStyle (id) {
  const i = board.members.findIndex(m => m.id === id)
  const bg = AVATAR[(i < 0 ? 4 : i) % AVATAR.length]
  return { background: bg, color: bg.includes('yellow') ? '#15202E' : '#FFFFFF' }
}
const plateIndex = (dayId) => {
  const i = days.value.findIndex(d => d.id === dayId)
  return i >= 0 ? i : (dayId === 'free' ? -1 : 'ABCDE'.indexOf(dayId))
}
// Newest workout first (posts sent later from a queue still land in the right place)
const feed = computed(() => [...board.events].sort((a, b) => String(b.payload.startedAt || b.created_at).localeCompare(String(a.payload.startedAt || a.created_at))))
const clapCount = (e) => Object.keys(e.reactions || {}).length
const clapNames = (e) => Object.keys(e.reactions || {}).map(who).join(', ')

// ── Settings ──
const settingsOpen = ref(false)
const leaveOpen = ref(false)
const rename = ref(state.data.crew.name || '')
watch(settingsOpen, (o) => { if (o) rename.value = state.data.crew.name || '' })
async function saveName () {
  try { await renameMe(rename.value); toast(t('Name updated')); refreshBoard() } catch (e) { toast(e.message) }
}
async function doLeave () {
  try {
    await leaveCrew()
    leaveOpen.value = false; settingsOpen.value = false
    toast(t('You left the crew'))
  } catch (e) { toast(e.message) }
}
</script>

<style scoped>
.head { margin-top: 8px; gap: 4px; }
.intro { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.mt { margin-top: 16px; }
.code-in { font-size: 24px; letter-spacing: 0.12em; text-transform: uppercase; }
.code-chip { width: 100%; gap: 10px; margin-top: 14px; padding: 12px 16px; background: var(--card); border-radius: var(--r-card); text-align: left; }
.code-chip:active { background: var(--press); }
.code { font-size: 24px; letter-spacing: 0.1em; }
.member { align-items: center; }
.member.me { background: var(--card-2); }
.rank { width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; font-size: 17px; font-weight: 700; color: var(--ink-2); background: var(--card-2); }
.member.me .rank { background: var(--card); }
.rank.top { background: var(--warn-soft); color: var(--warn); }
.you { font-weight: 500; }
.cbar { height: 6px; border-radius: 3px; background: var(--line); margin-top: 8px; overflow: hidden; max-width: 220px; }
.cbar > div { height: 100%; background: var(--ink-2); }
.cbar > div.done { background: var(--ok); }
.streak { display: flex; align-items: center; gap: 2px; color: var(--warn); font-size: 19px; font-weight: 700; }
.streak.off { color: var(--ink-3); }
.feed { display: flex; flex-direction: column; gap: 10px; }
.post { padding: 14px 16px; }
.post-head { gap: 10px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; flex: 0 0 auto; }
.ch-icon { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); }
.post-title { margin-top: 10px; }
.prs { list-style: none; margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.prs li { display: flex; gap: 6px; align-items: flex-start; }
.gold { color: var(--warn); margin-top: 2px; }
.post-foot { gap: 10px; margin-top: 10px; }
.clap { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 18px; background: var(--card-2); color: var(--ink-2); font-weight: 700; }
.clap.on { background: var(--warn-soft); color: var(--warn); }
.clap:disabled { opacity: 0.6; }
.gap { gap: 8px; }
.toggle-row { display: flex; align-items: center; gap: 12px; }
.block { display: block; }
.spin :deep(svg) { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
