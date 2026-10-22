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
        <p class="t-tiny t-muted">{{ t('Shared: your name, workouts (each set\'s weight and reps, records) and your totals. Never shared: notes, body weight, photos.') }}</p>
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

      <!-- Someone nudged you -->
      <div v-if="nudgedBy.length" class="note note-info t-small mt row nudge">
        <span class="wave">👋</span>
        <span class="grow">{{ tn(nudgedBy.length, '{names} nudged you to train this week.', '{names} nudged you to train this week.', { names: nudgedBy.join(', ') }) }}</span>
      </div>

      <!-- Training now -->
      <div v-if="liveNow.length" class="card live-card mt">
        <button v-for="m in liveNow" :key="m.id" class="row live-row" @click="openMember(m.id)">
          <span class="live-dot" aria-hidden="true" />
          <span class="grow t-small"><b>{{ m.name }}</b> {{ t('is training now') }}<span class="t-muted"> · {{ liveText(m.live) }}</span></span>
        </button>
      </div>

      <Segmented v-model="tab" class="mt" :options="[{ label: t('Board'), value: 'board' }, { label: t('Feed'), value: 'feed' }]" :label="t('View')" />

      <!-- ── Board ── -->
      <template v-if="tab === 'board'">
        <!-- Crew challenges -->
        <div class="row ch-head">
          <h2 class="section-h grow">{{ t('Crew challenges') }}</h2>
          <button v-if="runningChallenges.length < 3" class="btn btn-sm btn-soft" @click="newChallengeOpen = true"><Icon name="plus" :size="18" />{{ t('New') }}</button>
        </div>
        <p v-if="!runningChallenges.length" class="t-small t-muted hint">{{ t('Set the crew a goal for the week or month: a team target, or a head-to-head.') }}</p>
        <div v-for="c in runningChallenges" :key="c.id" class="card card-pad chal">
          <div class="row">
            <span class="kind-ic" :class="c.kind === 'versus' ? 'vs' : 'team'"><Icon :name="c.kind === 'versus' ? 'versus' : 'team'" :size="20" /></span>
            <div class="grow">
              <div class="t-h3">{{ c.title }}</div>
              <div class="t-tiny t-muted">{{ challengeLine(c) }}</div>
            </div>
            <button v-if="c.created_by === me || isOwner" class="icon-btn sm" :aria-label="t('Remove challenge')" @click="askDeleteChallenge(c)"><Icon name="trash" :size="18" /></button>
          </div>
          <template v-if="c.kind === 'together'">
            <div class="cbar big"><div :style="{ width: pct(c) + '%' }" :class="{ done: standing(c).total >= standing(c).target }" /></div>
            <div class="t-small t-num row between">
              <span><b>{{ metricText(c.metric, standing(c).total, unit, fmtNum) }}</b> {{ t('of {n}', { n: metricNumber(c.metric, standing(c).target) }) }}</span>
              <span class="t-muted">{{ topNames(c) }}</span>
            </div>
          </template>
          <ol v-else class="vs-list">
            <li v-for="(r, i) in standing(c).rows.slice(0, 3)" :key="r.id" class="row t-small" :class="{ me: r.id === me }">
              <span class="t-num pos">{{ i + 1 }}</span>
              <span class="grow truncate">{{ r.id === me ? t('You') : r.name }}</span>
              <span class="t-num"><b>{{ metricText(c.metric, r.value, unit, fmtNum) }}</b></span>
            </li>
          </ol>
        </div>

        <!-- Leaderboards -->
        <h2 class="section-h">{{ t('Leaderboard') }}</h2>
        <div class="chips" role="tablist" :aria-label="t('Period')">
          <button v-for="p in periods" :key="p.value" class="chip" :class="{ on: period === p.value }" role="tab" :aria-selected="period === p.value" @click="period = p.value">{{ p.label }}</button>
        </div>
        <template v-if="period !== 'lifts'">
          <div class="chips sub" role="tablist" :aria-label="t('Rank by')">
            <button v-for="m in metricsFor" :key="m" class="chip sm" :class="{ on: metric === m }" role="tab" :aria-selected="metric === m" @click="metric = m">{{ t(METRICS[m].label) }}</button>
          </div>
          <div v-if="!board.fetchedAt && board.loading" class="t-small t-muted mt">{{ t('Loading…') }}</div>
          <div v-else class="group mt-s">
            <div v-for="(m, i) in ranked" :key="m.id" class="group-row member" :class="{ me: m.id === me }">
              <button class="row grow member-btn" @click="openMember(m.id)">
                <span class="rank t-num" :class="{ top: i === 0 && m.value > 0 }">
                  <Icon v-if="i === 0 && m.value > 0" name="crown" :size="18" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <div class="grow">
                  <div class="t-h3 truncate">
                    <span v-if="m.live" class="live-dot sm" :aria-label="t('Training now')" />{{ m.name }}<span v-if="m.id === me" class="t-muted you"> · {{ t('you') }}</span>
                  </div>
                  <div class="t-small t-muted t-num">{{ metricText(metric, m.value, unit, fmtNum) }}<template v-if="m.sub"> · {{ m.sub }}</template></div>
                  <div v-if="period === 'week' && m.challenge && challenge" class="cbar" :title="tx(challenge, 'title')">
                    <div :style="{ width: Math.round(Math.min(1, m.challenge.value / m.challenge.target) * 100) + '%' }" :class="{ done: m.challenge.done }" />
                  </div>
                </div>
              </button>
              <button v-if="m.canNudge" class="icon-btn sm nudge-btn" :aria-label="t('Nudge {name}', { name: m.name })" @click="doNudge(m)"><Icon name="wave" :size="20" /></button>
              <div class="streak" :class="{ off: !m.streak }" :aria-label="tn(m.streak, '{n}-week streak', '{n}-week streak')">
                <Icon name="fire" :size="18" /><span class="t-num">{{ m.streak }}</span>
              </div>
            </div>
          </div>
          <!-- How the last week / month ended, early in the new one -->
          <template v-if="previous.rows.length">
            <h2 class="section-h">{{ previous.title }}</h2>
            <div class="group">
              <div v-for="(m, i) in previous.rows" :key="'p' + m.id" class="group-row member" :class="{ me: m.id === me }">
                <span class="rank t-num" :class="{ top: i === 0 }">
                  <Icon v-if="i === 0" name="crown" :size="18" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <span class="grow t-h3 truncate">{{ m.name }}<span v-if="m.id === me" class="t-muted you"> · {{ t('you') }}</span></span>
                <span class="t-small t-muted t-num">{{ metricText(metric, m.value, unit, fmtNum) }}</span>
              </div>
            </div>
          </template>
          <p class="t-tiny t-muted mt">
            {{ footnote }}
            <template v-if="period === 'week' && challenge">{{ ' ' + t('The bar is the monthly challenge.') }}</template>
          </p>
        </template>

        <!-- Powerlifting board -->
        <template v-else>
          <Segmented v-model="basis" class="mt-s" :options="[{ label: t('Estimated max'), value: 'e1rm' }, { label: t('Actually lifted'), value: 'actual' }]" :label="t('Count it as')" />
          <div class="chips sub" role="tablist" :aria-label="t('Lift')">
            <button v-for="l in liftChips" :key="l.value" class="chip sm" :class="{ on: lift === l.value }" role="tab" :aria-selected="lift === l.value" @click="lift = l.value">{{ l.label }}</button>
          </div>
          <div v-if="liftRanked.length" class="group mt-s">
            <button v-for="(m, i) in liftRanked" :key="m.id" class="group-row member" :class="{ me: m.id === me }" @click="openMember(m.id)">
              <span class="rank t-num" :class="{ top: i === 0 }">
                <Icon v-if="i === 0" name="crown" :size="18" />
                <template v-else>{{ i + 1 }}</template>
              </span>
              <div class="grow">
                <div class="t-h3 truncate">{{ m.name }}<span v-if="m.id === me" class="t-muted you"> · {{ t('you') }}</span></div>
                <div v-if="m.sub" class="t-small t-muted t-num">{{ m.sub }}</div>
              </div>
              <span class="t-num lift-v">{{ m.text }}</span>
            </button>
          </div>
          <p v-else class="t-small t-muted mt">{{ lift === 'dots' ? t('Nobody is showing their DOTS yet. Turn it on in Crew settings.') : t('Nobody has logged this lift in the last 12 weeks.') }}</p>
          <p class="t-tiny t-muted mt">{{ t('Best of the last 12 weeks, from the lifts each person picked in Progress → Powerlifting. DOTS only shows for people who turned it on.') }}</p>
        </template>

        <!-- Shared routines -->
        <template v-if="board.plans.length">
          <h2 class="section-h">{{ t('Shared routines') }}</h2>
          <div class="group">
            <button v-for="pl in board.plans" :key="pl.id" class="group-row" @click="planOpen = pl">
              <span class="plan-ic"><Icon name="routines" :size="20" /></span>
              <div class="grow">
                <div class="t-h3 truncate">{{ pl.name }}</div>
                <div class="t-small t-muted truncate">{{ memberName(pl.member_id) }} · {{ tn(pl.summary?.days || 0, '{n} day', '{n} days') }} · {{ tn(pl.summary?.exercises || 0, '{n} exercise', '{n} exercises') }}</div>
              </div>
              <Icon name="chevronRight" class="chev" />
            </button>
          </div>
        </template>
      </template>

      <!-- ── Feed ── -->
      <template v-else>
        <p v-if="board.fetchedAt && !board.events.length" class="t-small t-muted mt">{{ t('Nothing yet. Finished workouts show up here.') }}</p>
        <div class="feed mt">
          <CrewPost v-for="e in feed" :key="e.id" :event="e" />
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

      <h3 class="sheet-h">{{ t('Sharing') }}</h3>
      <label class="toggle-row">
        <span class="grow">
          <span class="t-body">{{ t('Post my workouts to the feed') }}</span>
          <span class="t-tiny t-muted block">{{ t('Weekly totals and streak still show on the board.') }}</span>
        </span>
        <Toggle v-model="state.data.crew.shareFeed" @update:model-value="persist" />
      </label>
      <label class="toggle-row mt-s">
        <span class="grow">
          <span class="t-body">{{ t('Show every set') }}</span>
          <span class="t-tiny t-muted block">{{ t('Your posts include each set\'s weight and reps, so the crew can see what you did and copy the workout.') }}</span>
        </span>
        <Toggle v-model="state.data.crew.shareDetails" @update:model-value="persist" />
      </label>
      <label class="toggle-row mt-s">
        <span class="grow">
          <span class="t-body">{{ t('Show my DOTS score') }}</span>
          <span class="t-tiny t-muted block">{{ dotsHint }}</span>
        </span>
        <Toggle v-model="state.data.crew.showDots" @update:model-value="onDots" />
      </label>

      <h3 class="sheet-h">{{ t('Notifications') }}</h3>
      <p v-if="push.available === false" class="t-small t-muted">{{ isNative ? t("This version of the app was built without notifications. They'll come with an update once they're set up.") : t('Notifications only work in the installed app.') }}</p>
      <template v-else>
        <label class="toggle-row">
          <span class="grow">
            <span class="t-body">{{ t('Crew notifications') }}</span>
            <span class="t-tiny t-muted block">{{ pushStatus }}</span>
          </span>
          <Toggle :model-value="pushOn" :disabled="push.busy" @update:model-value="togglePush" />
        </label>
        <button v-if="push.permission === 'denied'" class="btn btn-soft btn-block mt-s" @click="openNotificationSettings()">{{ t('Open notification settings') }}</button>
        <div v-if="pushOn" class="group kinds mt-s">
          <label v-for="k in PUSH_KINDS" :key="k.key" class="group-row toggle-row">
            <span class="grow">
              <span class="t-body">{{ t(k.label) }}</span>
              <span class="t-tiny t-muted block">{{ t(k.hint) }}</span>
            </span>
            <Toggle :model-value="prefs[k.key]" @update:model-value="(v) => setPushPref(k.key, v)" />
          </label>
        </div>
        <p v-if="push.error" class="t-tiny t-err mt-s">{{ push.error }}</p>
      </template>

      <button class="btn btn-ghost btn-block t-err mt" @click="leaveOpen = true"><Icon name="leave" />{{ t('Leave the crew') }}</button>
    </Sheet>

    <Sheet v-model="leaveOpen" :title="t('Leave the crew?')">
      <p class="t-body">{{ t('Your posts and spot on the board are removed for everyone. Your workouts stay on this phone. You can join again with the code.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="leaveOpen = false">{{ t('Stay') }}</button>
        <button class="btn btn-danger btn-lg" @click="doLeave">{{ t('Leave') }}</button>
      </template>
    </Sheet>

    <!-- New crew challenge -->
    <Sheet v-model="newChallengeOpen" :title="t('New crew challenge')">
      <div class="label">{{ t('Kind') }}</div>
      <Segmented v-model="draft.kind" :options="[{ label: t('Team target'), value: 'together' }, { label: t('Head-to-head'), value: 'versus' }]" :label="t('Kind')" />
      <p class="t-tiny t-muted mt-s">{{ draft.kind === 'together' ? t('Everyone adds to one total. Reach the target together.') : t('Most at the end wins.') }}</p>
      <div class="label mt">{{ t('Count') }}</div>
      <Segmented v-model="draft.metric" :options="[{ label: t('Workouts'), value: 'workouts' }, { label: t('Sets'), value: 'sets' }, { label: t('Volume'), value: 'volume' }]" :label="t('Count')" />
      <div class="label mt">{{ t('When') }}</div>
      <Segmented v-model="draft.period" :options="[{ label: t('This week'), value: 'week' }, { label: t('This month'), value: 'month' }]" :label="t('When')" />
      <template v-if="draft.kind === 'together'">
        <Stepper v-model="draft.target" class="mt" :label="t('Target')" :unit="draft.metric === 'volume' ? unit : ''" :step="targetStep" :min="targetStep" size="md" />
        <p class="t-tiny t-muted">{{ targetHint }}</p>
      </template>
      <label class="label mt" for="ch-title">{{ t('Name') }}</label>
      <input id="ch-title" v-model="draft.title" class="field" type="text" maxlength="60" :placeholder="autoTitle">
      <p v-if="draftError" class="note note-warn t-small mt-s">{{ draftError }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="newChallengeOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="draftBusy" @click="doCreateChallenge">{{ t('Start it') }}</button>
      </template>
    </Sheet>

    <Sheet :model-value="!!challengeToDelete" :title="t('Remove this challenge?')" @update:model-value="(v) => { if (!v) challengeToDelete = null }">
      <p class="t-body">{{ t('It disappears for everyone. Nobody\'s workouts change.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="challengeToDelete = null">{{ t('Keep it') }}</button>
        <button class="btn btn-danger btn-lg" @click="doDeleteChallenge">{{ t('Remove') }}</button>
      </template>
    </Sheet>

    <!-- A shared routine -->
    <Sheet :model-value="!!planOpen" :title="planOpen?.name || ''" @update:model-value="(v) => { if (!v) planOpen = null }">
      <template v-if="planOpen">
        <p class="t-small t-muted">{{ t('Shared by {name}', { name: memberName(planOpen.member_id) }) }} · {{ relativeDay(planOpen.updated_at) }}</p>
        <div class="group mt-s">
          <div v-for="(d, i) in (planOpen.summary?.dayNames || [])" :key="i" class="group-row">
            <PlateBadge :index="i" :label="planOpen.summary?.labels?.[i] || '•'" size="sm" />
            <span class="grow">{{ d || t('Day {n}', { n: i + 1 }) }}</span>
          </div>
        </div>
        <p class="t-tiny t-muted mt-s">{{ t('A copy goes to My routines. Change it however you like; it doesn\'t change theirs.') }}</p>
      </template>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="planOpen = null">{{ t('Close') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="copying" @click="copyPlan"><Icon name="copy" />{{ t('Copy to My routines') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Segmented from '../ui/Segmented.vue'
import Toggle from '../ui/Toggle.vue'
import Stepper from '../ui/Stepper.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import CrewPost from '../ui/CrewPost.vue'
import { toast } from '../ui/toast.js'
import { METRICS, metricText } from '../ui/crewUi.js'
import { state, persist, challenge, goalCtx } from '../store.js'
import {
  board, crewAvailable, inCrew, createCrew, joinCrew, leaveCrew, renameMe, syncNow, refreshBoard,
  normaliseCode, me, memberName, isOwner, memberTotals, liveOf, memberLifts, nudge, createChallenge, deleteChallenge,
  challengeStandings, copySharedPlan
} from '../lib/crew.js'
import { push, PUSH_KINDS, pushPrefs, enablePush, disablePush, setPushPref, checkPush } from '../lib/push.js'
import { weekKey, monthKey, addDays } from '../lib/stats.js'
import { bodyweight } from '../lib/goals.js'
import { fmtLoad } from '../lib/training.js'
import { relativeDay, fmtNum, monthName } from '../lib/format.js'
import { shareText, isNative, openNotificationSettings } from '../lib/native.js'
import { t, tn, tx } from '../i18n/index.js'

const router = useRouter()
const tab = ref(sessionGet('crew-tab') || 'board')
watch(tab, (v) => sessionSet('crew-tab', v))
function sessionGet (k) { try { return sessionStorage.getItem(k) } catch { return null } }
function sessionSet (k, v) { try { sessionStorage.setItem(k, v) } catch { /* ignore */ } }

const mode = ref('join')
const name = ref(state.data.crew.name || state.data.profile.name || '')
const code = ref('')
const busy = ref(false)
const error = ref('')
const unit = computed(() => state.data.profile.unit)

onMounted(() => {
  if (inCrew.value) syncNow({ withBoard: true })
  checkPush()
})
// (joining loads the board itself, once your own numbers are up)

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

const openMember = (id) => router.push(`/crew/member/${id}`)

// ── Training now, nudges ──
const liveNow = computed(() => board.members.filter(m => m.id !== me.value).map(m => ({ ...m, live: liveOf(m) })).filter(m => m.live))
function liveText (l) {
  const day = tx({ n: l.dayName, es: { n: l.dayNameEs } }, 'n') || t('Free session')
  return `${day} · ${t('{n} min', { n: l.minutes })}`
}
const myWeek = computed(() => memberTotals(board.members.find(m => m.id === me.value), 'week'))
const nudgedBy = computed(() => (myWeek.value.workouts > 0 ? [] : board.nudgesIn.map(id => memberName(id))))
async function doNudge (m) {
  try {
    await nudge(m.id)
    toast(t('Nudge sent to {name} 👋', { name: m.name }))
  } catch (e) { toast(e.message) }
}

// ── Leaderboards ──
const periods = computed(() => [
  { label: t('This week'), value: 'week' },
  { label: t('This month'), value: 'month' },
  { label: t('All time'), value: 'all' },
  { label: t('Lifts'), value: 'lifts' }
])
const period = ref(sessionGet('crew-period') || 'week')
watch(period, (v) => sessionSet('crew-period', v))
const metric = ref('workouts')
const metricsFor = computed(() => (period.value === 'all' ? ['workouts', 'sets', 'volume', 'records', 'bestStreak'] : ['workouts', 'sets', 'volume', 'records']))
watch(period, () => { if (!metricsFor.value.includes(metric.value)) metric.value = 'workouts' })

const today = computed(() => new Date(state.today + 'T12:00:00'))
const thisWeek = computed(() => weekKey(today.value))
const lastWeekKey = computed(() => weekKey(addDays(today.value, -7)))

/** A streak only counts if it was still alive at their last update. */
function streakOf (m) {
  const s = m.stats || {}
  return s.streak?.weeks && s.week?.key >= lastWeekKey.value ? s.streak.weeks : 0
}

const ranked = computed(() => board.members.map(m => {
  const tot = memberTotals(m, period.value)
  const value = tot[metric.value] || 0
  const ch = challenge.value && m.stats?.challenge?.month === state.data.cache.routine?.month ? m.stats.challenge : null
  const weekTot = period.value === 'week' ? tot : memberTotals(m, 'week')
  const sub = metric.value === 'workouts' ? (tot.sets ? tn(tot.sets, '{n} set', '{n} sets') : '') : (metric.value !== 'bestStreak' ? tn(tot.workouts, '{n} workout', '{n} workouts') : '')
  return {
    id: m.id,
    name: m.name,
    value,
    sub,
    streak: streakOf(m),
    challenge: ch,
    live: !!liveOf(m),
    canNudge: m.id !== me.value && period.value === 'week' && weekTot.workouts === 0 && !board.nudgesOut.includes(m.id),
    tie: [tot.workouts, tot.sets]
  }
}).sort((a, b) => b.value - a.value || b.tie[0] - a.tie[0] || b.tie[1] - a.tie[1] || b.streak - a.streak || a.name.localeCompare(b.name)))

const weekDay = computed(() => (today.value.getDay() + 6) % 7) // Mon = 0
// Early in a new week (Mon–Tue) or month (first 3 days), show how the last one ended
const previous = computed(() => {
  const p = period.value
  const show = (p === 'week' && weekDay.value < 2) || (p === 'month' && today.value.getDate() <= 3)
  if (!show) return { rows: [] }
  const rows = board.members.map(m => ({ id: m.id, name: m.name, value: memberTotals(m, p === 'week' ? 'lastWeek' : 'lastMonth')[metric.value] || 0 }))
    .filter(m => m.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const title = p === 'week' ? t('Last week') : monthName(monthKey(new Date(today.value.getFullYear(), today.value.getMonth() - 1, 15)), { month: 'long' })
  return { rows, title: p === 'week' ? title : title.charAt(0).toUpperCase() + title.slice(1) }
})

const footnote = computed(() => {
  const min = state.data.settings && board.members.length ? (board.members.find(m => m.id === me.value)?.stats?.streak?.min || 2) : 2
  if (period.value === 'all') return t('All time counts every workout on each phone, from before they joined too. The flame is each person\'s week streak.')
  if (metric.value === 'records') return t('A record is an exercise where you beat your best estimated max, heaviest set or longest hold. The flame is each person\'s week streak ({n}+ workouts a week).', { n: min })
  return t('The flame is each person\'s week streak ({n}+ workouts a week). Tap someone to see their profile.', { n: min })
})

// ── Lifts board ──
const basis = ref(state.data.settings.plBasis || 'e1rm')
const lift = ref('total')
const liftChips = computed(() => [
  { label: t('Total'), value: 'total' },
  { label: t('Squat'), value: 'squat' },
  { label: t('Bench'), value: 'bench' },
  { label: t('Deadlift'), value: 'deadlift' },
  { label: 'DOTS', value: 'dots' }
])
const liftRanked = computed(() => board.members.map(m => {
  const l = memberLifts(m, basis.value)
  if (!l) return null
  const v = l[lift.value]
  if (!v) return null
  const sub = lift.value === 'total' || lift.value === 'dots'
    ? [l.squat, l.bench, l.deadlift].every(Boolean) ? `${fmtNum(l.squat, 1)} · ${fmtNum(l.bench, 1)} · ${fmtNum(l.deadlift, 1)}` : ''
    : ''
  return { id: m.id, name: m.name, value: v, text: lift.value === 'dots' ? fmtNum(v, 1) : fmtLoad(v, unit.value), sub }
}).filter(Boolean).sort((a, b) => b.value - a.value))

// ── Crew challenges ──
const runningChallenges = computed(() => board.challenges.filter(c => !c.result))
const standingCache = computed(() => Object.fromEntries(runningChallenges.value.map(c => [c.id, challengeStandings(c)])))
const standing = (c) => standingCache.value[c.id] || { rows: [], total: 0, target: 0 }
const pct = (c) => { const s = standing(c); return s.target ? Math.round(Math.min(1, s.total / s.target) * 100) : 0 }
const metricNumber = (m, v) => (m === 'volume' ? `${fmtNum(v, 0)} ${unit.value}` : fmtNum(v, 0))
function topNames (c) {
  return standing(c).rows.filter(r => r.value > 0).slice(0, 3).map(r => (r.id === me.value ? t('You') : r.name)).join(', ')
}
function challengeLine (c) {
  const what = { workouts: t('Workouts'), sets: t('Sets'), volume: t('Volume') }[c.metric]
  let ends
  if (c.period === 'week') ends = t('ends Sunday')
  else {
    const [y, m] = c.period_key.split('-').map(Number)
    ends = t('ends {date}', { date: new Date(y, m, 0).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) })
  }
  const by = c.created_by ? t('by {name}', { name: memberName(c.created_by) }) : ''
  return [c.kind === 'versus' ? t('Head-to-head') : t('Team target'), what, ends, by].filter(Boolean).join(' · ')
}

const newChallengeOpen = ref(false)
const draft = reactive({ kind: 'together', metric: 'workouts', period: 'week', target: 10, title: '' })
const draftBusy = ref(false)
const draftError = ref('')
const targetStep = computed(() => (draft.metric === 'volume' ? 1000 : draft.metric === 'sets' ? 10 : 1))
// A fair starting target: last period's crew total plus 10%
const suggestedTarget = computed(() => {
  const per = draft.period === 'week' ? 'lastWeek' : 'lastMonth'
  const sum = board.members.reduce((n, m) => n + (memberTotals(m, per)[draft.metric] || 0), 0)
  const base = sum > 0 ? sum * 1.1 : board.members.length * ({ workouts: draft.period === 'week' ? 3 : 12, sets: draft.period === 'week' ? 50 : 200, volume: draft.period === 'week' ? 20000 : 80000 }[draft.metric])
  return Math.max(targetStep.value, Math.ceil(base / targetStep.value) * targetStep.value)
})
watch([() => draft.metric, () => draft.period, newChallengeOpen], () => { draft.target = suggestedTarget.value; draftError.value = '' })
const targetHint = computed(() => (draft.period === 'week' ? t('Suggested from what the crew did last week, plus 10%.') : t('Suggested from what the crew did last month, plus 10%.')))
const autoTitle = computed(() => {
  const when = draft.period === 'week' ? t('this week') : t('this month')
  if (draft.kind === 'versus') return t('Most {what} {when}', { what: { workouts: t('workouts'), sets: t('sets'), volume: t('volume') }[draft.metric], when })
  return t('{n} {what} together {when}', { n: metricNumber(draft.metric, draft.target), what: draft.metric === 'volume' ? '' : { workouts: t('workouts'), sets: t('sets') }[draft.metric], when }).replace(/\s+/g, ' ')
})
async function doCreateChallenge () {
  draftBusy.value = true; draftError.value = ''
  try {
    const target = draft.metric === 'volume' && unit.value === 'lb' ? draft.target * 0.45359237 : draft.target
    await createChallenge({ kind: draft.kind, metric: draft.metric, period: draft.period, target: draft.kind === 'together' ? target : null, title: (draft.title || autoTitle.value).trim() })
    newChallengeOpen.value = false
    draft.title = ''
    toast(t('Challenge started'))
  } catch (e) { draftError.value = e.message } finally { draftBusy.value = false }
}
const challengeToDelete = ref(null)
const askDeleteChallenge = (c) => { challengeToDelete.value = c }
async function doDeleteChallenge () {
  try { await deleteChallenge(challengeToDelete.value.id) } catch (e) { toast(e.message) }
  challengeToDelete.value = null
}

// ── Shared routines ──
const planOpen = ref(null)
const copying = ref(false)
async function copyPlan () {
  copying.value = true
  try {
    const plan = await copySharedPlan(planOpen.value)
    planOpen.value = null
    toast(t('Copied to My routines'))
    router.push(`/plan/${plan.id}`)
  } catch (e) { toast(e.message) } finally { copying.value = false }
}

// ── Feed ──
// Newest first (posts sent later from a queue still land in the right place)
const feed = computed(() => [...board.events].sort((a, b) => String(b.payload.startedAt || b.created_at).localeCompare(String(a.payload.startedAt || a.created_at))))

// ── Settings ──
const settingsOpen = ref(false)
const leaveOpen = ref(false)
const rename = ref(state.data.crew.name || '')
watch(settingsOpen, (o) => { if (o) { rename.value = state.data.crew.name || ''; checkPush() } })
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
const dotsHint = computed(() => {
  if (!state.data.profile.sex || !bodyweight(goalCtx.value, 'kg')) return t('Needs your sex and bodyweight in Body. Others could work out roughly what you weigh from it.')
  return t('On the lifts board. Others could work out roughly what you weigh from it.')
})
function onDots () { persist(); syncNow({ withBoard: true }) }

const prefs = computed(() => pushPrefs())
const pushOn = computed(() => !!state.data.crew.push?.enabled && push.permission === 'granted')
const pushStatus = computed(() => {
  if (push.permission === 'denied') return t('Notifications are blocked for Gym Crew in Android settings.')
  return pushOn.value ? t('Pick which ones below. Each also has its own switch in Android settings.') : t('Workouts, records, comments, nudges and more.')
})
async function togglePush (v) {
  if (v) {
    const ok = await enablePush()
    if (!ok && push.permission === 'denied') toast(t('Notifications are blocked for Gym Crew in Android settings.'))
  } else {
    await disablePush()
  }
}
</script>

<style scoped>
.head { margin-top: 8px; gap: 4px; }
.intro { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.mt { margin-top: 16px; }
.mt-s { margin-top: 10px; }
.code-in { font-size: 24px; letter-spacing: 0.12em; text-transform: uppercase; }
.code-chip { width: 100%; gap: 10px; margin-top: 14px; padding: 12px 16px; background: var(--card); border-radius: var(--r-card); text-align: left; }
.code-chip:active { background: var(--press); }
.code { font-size: 24px; letter-spacing: 0.1em; }
.nudge { gap: 10px; }
.wave { font-size: 22px; }
.live-card { padding: 4px 0; }
.live-row { width: 100%; gap: 10px; padding: 10px 16px; text-align: left; }
.live-row:active { background: var(--press); }
.live-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ok); flex: 0 0 auto; box-shadow: 0 0 0 4px var(--ok-soft); animation: pulse 1.6s ease-in-out infinite; display: inline-block; }
.live-dot.sm { width: 8px; height: 8px; margin-right: 8px; vertical-align: 2px; box-shadow: 0 0 0 3px var(--ok-soft); }
@keyframes pulse { 50% { box-shadow: 0 0 0 7px transparent; } }
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }

.ch-head { align-items: flex-end; }
.ch-head .section-h { margin-bottom: 10px; }
.ch-head .btn { margin-bottom: 6px; }
.hint { margin: -2px 4px 0; }
.chal + .chal { margin-top: 10px; }
.kind-ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto; }
.kind-ic.team { background: var(--ok-soft); color: var(--ok); }
.kind-ic.vs { background: var(--warn-soft); color: var(--warn); }
.icon-btn.sm { width: 40px; height: 40px; color: var(--ink-2); }
.between { justify-content: space-between; margin-top: 8px; }
.vs-list { list-style: none; margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.vs-list li { gap: 10px; }
.vs-list li.me { font-weight: 700; }
.pos { width: 18px; color: var(--ink-3); }

.chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px; }
.chips::-webkit-scrollbar { display: none; }
.chips.sub { margin-top: 10px; }
.chip { flex: 0 0 auto; min-height: 38px; padding: 0 14px; border-radius: 19px; background: var(--card); color: var(--ink-2); font-weight: 600; font-size: 15px; }
.chip.sm { min-height: 34px; padding: 0 12px; font-size: 14px; background: var(--card-2); }
.chip.on { background: var(--ink); color: var(--paper, var(--card)); }

.member { align-items: center; gap: 8px; }
.member.me { background: var(--card-2); }
.member-btn { gap: 12px; text-align: left; padding: 0; min-height: 0; }
button.member { text-align: left; width: 100%; }
.rank { width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; font-size: 17px; font-weight: 700; color: var(--ink-2); background: var(--card-2); }
.member.me .rank { background: var(--card); }
.rank.top { background: var(--warn-soft); color: var(--warn); }
.you { font-weight: 500; }
.cbar { height: 6px; border-radius: 3px; background: var(--line); margin-top: 8px; overflow: hidden; max-width: 220px; }
.cbar.big { height: 10px; border-radius: 5px; max-width: none; margin-top: 14px; }
.cbar > div { height: 100%; background: var(--ink-2); transition: width 400ms ease; }
.cbar > div.done { background: var(--ok); }
.streak { display: flex; align-items: center; gap: 2px; color: var(--warn); font-size: 19px; font-weight: 700; flex: 0 0 auto; }
.streak.off { color: var(--ink-3); }
.nudge-btn { color: var(--ink-2); }
.lift-v { font-size: 20px; font-weight: 700; }
.plan-ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--card-2); color: var(--ink-2); flex: 0 0 auto; }

.feed { display: flex; flex-direction: column; gap: 10px; }
.gap { gap: 8px; }
.sheet-h { font-size: 15px; font-weight: 600; color: var(--ink-2); margin: 22px 2px 10px; }
.toggle-row { display: flex; align-items: center; gap: 12px; }
.kinds .toggle-row { padding-top: 12px; padding-bottom: 12px; }
.block { display: block; }
.spin :deep(svg) { animation: spin 900ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
