<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="back"><Icon name="back" /></button>
      <span class="t-h3">{{ t('Post') }}</span>
      <span class="icon-btn" aria-hidden="true" />
    </div>

    <p v-if="!inCrew" class="t-small t-muted">{{ t('Join a crew to see posts.') }}</p>
    <p v-else-if="!event && th?.loading" class="t-small t-muted">{{ t('Loading…') }}</p>
    <p v-else-if="!event" class="note note-warn t-small">{{ th?.error || t('That isn\'t on the board any more.') }}</p>

    <template v-else>
      <CrewPost :event="event" full />

      <!-- Every set -->
      <template v-if="event.kind === 'workout' && p.detail?.length">
        <h2 class="section-h">{{ t('What they did') }}</h2>
        <div class="group">
          <div v-for="d in p.detail" :key="d.id" class="group-row ex">
            <div class="grow">
              <div class="t-h3">{{ exerciseName(d.id, d.name, d.es?.name) }}</div>
              <div class="sets">
                <span v-for="(s, i) in d.sets" :key="i" class="set t-num" :class="{ warm: s.type === 'warmup' }">
                  <span v-if="s.type && s.type !== 'normal'" class="tag-s">{{ setTag(s.type) }}</span>{{ setText(s) }}
                </span>
              </div>
            </div>
            <span v-if="prFor(d.id)" class="pr-ic" :title="t('Record')"><Icon name="trophy" :size="18" /></span>
          </div>
        </div>
        <p v-if="event.member_id !== me && sameRoutine" class="t-tiny t-muted foot">{{ t('This is a day from this month\'s routine, the same one you have.') }}</p>
      </template>
      <p v-else-if="event.kind === 'workout'" class="t-small t-muted foot">{{ event.member_id === me ? t('This post has no set details. New posts include them unless "Show every set" is off in Crew settings.') : t('{name} isn\'t sharing set details.', { name: memberName(event.member_id) }) }}</p>

      <button v-if="canCopyWorkout(event)" class="btn btn-soft btn-block copy" @click="copy">
        <Icon name="copy" />{{ event.member_id === me ? t('Save as a day in My routines') : t('Save their workout to My routines') }}
      </button>

      <!-- Comments -->
      <h2 class="section-h">{{ t('Comments') }}</h2>
      <p v-if="th?.loading && !comments.length" class="t-small t-muted">{{ t('Loading…') }}</p>
      <p v-else-if="!comments.length" class="t-small t-muted">{{ t('No comments yet.') }}</p>
      <div v-else class="comments">
        <div v-for="c in comments" :key="c.id" class="row cmt">
          <button class="avatar" :style="avatarStyle(c.member_id)" :aria-label="memberName(c.member_id)" @click="router.push(`/crew/member/${c.member_id}`)">{{ initial(c.member_id) }}</button>
          <div class="grow bubble">
            <div class="t-tiny"><b>{{ memberName(c.member_id) }}</b> <span class="t-muted">· {{ when(c.created_at) }}</span></div>
            <div class="t-body body">{{ c.body }}</div>
          </div>
          <button v-if="c.member_id === me || isOwner" class="icon-btn sm" :aria-label="t('Delete comment')" @click="remove(c)"><Icon name="trash" :size="18" /></button>
        </div>
      </div>

      <form class="row composer" @submit.prevent="send">
        <textarea
          ref="box" v-model="draft" class="field grow" rows="1" maxlength="500" :placeholder="t('Add a comment…')"
          @input="grow" @keydown.enter.exact.prevent="send"
        />
        <button class="btn btn-primary send" type="submit" :disabled="!draft.trim() || sending" :aria-label="t('Send')"><Icon name="send" /></button>
      </form>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import CrewPost from '../ui/CrewPost.vue'
import { toast } from '../ui/toast.js'
import { avatarStyle, initial } from '../ui/crewUi.js'
import { state } from '../store.js'
import {
  board, threads, inCrew, me, isOwner, memberName, exerciseName, loadThread, addComment, deleteComment,
  canCopyWorkout, copyWorkout, refreshBoard
} from '../lib/crew.js'
import { convertLoad, fmtLoad } from '../lib/training.js'
import { relativeDay } from '../lib/format.js'
import { t, locale } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.id))
const th = computed(() => threads[id.value])
const event = computed(() => th.value?.event || board.events.find(e => e.id === id.value) || null)
const p = computed(() => event.value?.payload || {})
const comments = computed(() => th.value?.comments || [])
const unit = computed(() => state.data.profile.unit)

onMounted(async () => {
  if (!inCrew.value) return
  if (!board.fetchedAt) refreshBoard()
  await loadThread(id.value)
})
watch(id, (v) => { if (inCrew.value && v) loadThread(v) })

function back () {
  if (window.history.state?.back) router.back()
  else router.replace('/crew')
}

const sameRoutine = computed(() => p.value.source === 'routine' && p.value.month && p.value.month === state.data.cache.routine?.month)
const prFor = (exId) => (p.value.prs || []).some(r => r.exerciseId === exId)
const TAGS = { warmup: 'set|W', drop: 'set|D', failure: 'F', amrap: 'MAX' }
const setTag = (type) => t(TAGS[type] || type)

function setText (s) {
  const reps = s.repsL != null ? `${s.repsL}/${s.repsR}` : s.reps
  const load = s.load != null && s.load !== 0
    ? (s.unit === 'pin' ? t('pin {n}', { n: s.load }) : fmtLoad(Math.round(convertLoad(s.load, s.unit || unit.value, unit.value) * 10) / 10, unit.value))
    : null
  let out = ''
  if (s.seconds) out = load ? `${load} · ${s.seconds} s` : `${s.seconds} s`
  else out = load ? `${load} × ${reps ?? '–'}` : t('{n} reps', { n: reps ?? '–' })
  if (s.rir != null) out += ` @${s.rir}`
  return out
}

function when (iso) {
  const d = new Date(iso)
  const day = relativeDay(iso)
  return `${day}, ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`
}

const draft = ref('')
const sending = ref(false)
const box = ref(null)
function grow () {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 140) + 'px'
}
async function send () {
  const body = draft.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    await addComment(id.value, body)
    draft.value = ''
    await nextTick()
    grow()
  } catch (e) { toast(e.message) } finally { sending.value = false }
}
async function remove (c) {
  try { await deleteComment(id.value, c.id) } catch (e) { toast(e.message) }
}

function copy () {
  const plan = copyWorkout(event.value)
  toast(t('Saved to My routines'))
  router.push(`/plan/${plan.id}`)
}
</script>

<style scoped>
.section-h { margin-top: 24px; }
.ex { align-items: flex-start; }
.sets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.set { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 8px; background: var(--card-2); font-size: 15px; font-weight: 600; }
.set.warm { color: var(--ink-3); }
.tag-s { font-size: 11px; font-weight: 700; color: var(--ink-2); padding: 0 4px; border-radius: 4px; background: var(--line); }
.pr-ic { color: var(--warn); margin-top: 2px; }
.foot { margin: 10px 4px 0; }
.copy { margin-top: 14px; }
.comments { display: flex; flex-direction: column; gap: 10px; }
.cmt { align-items: flex-start; gap: 10px; }
.avatar { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; flex: 0 0 auto; }
.bubble { background: var(--card); border-radius: 14px; padding: 8px 12px; }
.body { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 2px; }
.icon-btn.sm { width: 40px; height: 40px; color: var(--ink-3); }
.composer { margin-top: 16px; align-items: flex-end; gap: 8px; position: sticky; bottom: calc(var(--nav-h, 64px) + var(--safe-bottom, 0px) + 8px); }
.composer .field { min-height: 48px; max-height: 140px; }
.send { min-width: 52px; min-height: 48px; padding: 0 14px; }
</style>
