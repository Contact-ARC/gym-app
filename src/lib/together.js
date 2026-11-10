// Training together (0.11): 2 to 4 crew members doing the host's day at the same time.
//
// Each person logs into their own workout as usual; this mirrors those sets to the others and keeps
// track of whose turn it is. The shared workout lives in the crew database (crew_together_* in
// supabase/crew.sql) and a copy is kept in state.data.together, so it carries on after the app restarts.
//
// Staying in sync:
//   - Everything you send goes into an outbox first and is sent in order; each message has its own id, so
//     sending it twice (after a dropped connection) is harmless and nothing is ever lost or doubled.
//   - A Realtime channel says "something changed" the instant it does; the changes themselves are fetched
//     with crew_together_get (only what's new since the last one, by rev).
//   - Every few seconds the phone also checks by itself, in case the channel is down.
//   - With the screen off, "You're up" and "Spot me" come as notifications.
import { computed, watch } from 'vue'
import {
  state, persist, getSession, activeSession, exercisesById, startFreeSession, discardSession,
  onSetChange, onItemsChange, onSessionFinished, onSessionDiscarded
} from '../store.js'
import { crewRpc, crewConfig, inCrew, me } from './crew.js'
import { openChannel } from './realtime.js'
import { nextTurn, doneByMember, currentSets } from './togetherPlan.js'
import { fillsPlannedSet } from './training.js'
import { buzz } from './native.js'
import { toast } from '../ui/toast.js'
import { t } from '../i18n/index.js'

const POLL_LIVE = 8000 // with the Realtime channel up: just a safety net
const POLL_SOLO = 2500 // without it
const NOTE_WAIT = 1200

/** The shared workout you're in (or null) */
export const together = computed(() => state.data.together?.id ? state.data.together : null)
export const inTogether = computed(() => !!together.value && together.value.status !== 'done')
export const isHost = computed(() => !!together.value && together.value.host === me.value)
/** The local workout that belongs to it */
export const togetherSession = computed(() => (together.value ? getSession(together.value.sessionId) : null))
/** Open shared workouts in your crew you could join (from crew_together_open) */
export const openTogether = computed(() => (state.data.togetherOpen || []).filter(o => o.id !== together.value?.id))
/** Whether the instant channel is up (else every few seconds) */
const link = { channel: null, live: false, poll: null, flushing: false, fetching: false, noteTimer: null }
export const connection = computed(() => state.data.together?._live ? 'live' : 'polling')

const tg = () => state.data.together

// ── Plan: the host's day ─────────────────────────────────
function plannedSets (it) {
  return Math.max(1, (Number(it.sets) || 0) + (it.extraSets || 0) - (it.removedSets || 0))
}
/** The day to share, from your workout: its exercises with their sets, reps and rest. Tags each item with its place. */
function planFrom (s) {
  s.items.forEach((it, i) => { it.tg = i })
  return {
    name: s.dayName || '', nameEs: s.dayNameEs || '',
    items: s.items.map(it => ({
      exerciseId: it.exerciseId, sets: plannedSets(it), repRange: it.repRange || null, durationSec: it.durationSec || null,
      restSec: it.restSec ?? null, superset: it.superset ?? null, notes: it.notes || null
    }))
  }
}
/** Make your workout have every item of the plan (new ones added at the end, swaps followed if not started). */
function followPlan (s, plan) {
  if (!s || !plan?.items) return
  let changed = false
  plan.items.forEach((p, i) => {
    const mine = s.items.find(it => it.tg === i)
    if (!mine) {
      s.items.push({
        exerciseId: p.exerciseId, originalExerciseId: p.exerciseId, sets: p.sets, repRange: p.repRange || undefined,
        durationSec: p.durationSec || undefined, restSec: p.restSec ?? 90, superset: p.superset ?? undefined, added: true, tg: i
      })
      changed = true
    } else if (mine.exerciseId !== p.exerciseId && !s.sets.some(x => x.itemIndex === s.items.indexOf(mine))) {
      mine.exerciseId = p.exerciseId
      changed = true
    }
  })
  if (changed) persist()
}

// ── Text for "You're up" ─────────────────────────────────
const exName = (id, es) => {
  const e = exercisesById.value[id]
  return (es ? e?.es?.name : null) || e?.name || id || ''
}
function nextText (plan, st, es) {
  if (!st?.turn) return ''
  const it = plan?.items?.[st.item]
  const done = doneByMember(tg()?.log || [])[st.turn]?.[st.item] || 0
  return `${exName(it?.exerciseId, es)} · ${es ? 'serie' : 'set'} ${Math.min(done + 1, it?.sets || 1)}`
}

// ── Talking to the crew database ─────────────────────────
/** Take in what the server sent: new log rows, the plan, whose turn, who's in. */
function apply (view) {
  const g = tg()
  if (!g || !view) return
  if (view.joined === false) return
  if (view.log?.length) {
    // Our own messages come back with their rev: drop the copies we showed while sending
    const ids = new Set(view.log.map(e => e.member + '|' + e.clientId))
    g.log = [...g.log.filter(e => !(e.pending && ids.has(e.member + '|' + e.clientId))), ...view.log.filter(e => !g.log.some(x => x.rev === e.rev && !x.pending))]
      .sort((a, b) => (a.rev ?? 1e15) - (b.rev ?? 1e15))
  }
  const turnBefore = g.state?.turn
  for (const k of ['code', 'host', 'status', 'plan', 'state', 'members']) if (view[k] !== undefined) g[k] = view[k]
  if (view.rev != null) g.rev = Math.max(g.rev || 0, view.rev)
  // Joined later than the plan changed: follow it
  const s = getSession(g.sessionId)
  followPlan(s, g.plan)
  // Who you trained with, for your workout's crew post (everyone who was in at some point)
  if (s && g.members?.length) {
    const others = g.members.filter(m => m.id !== me.value).map(m => m.name)
    s.togetherWith = [...new Set([...(s.togetherWith || []), ...others])]
  }
  // Names of everyone who's been in, so their sets still have a name after they leave
  g.names = { ...(g.names || {}), ...Object.fromEntries((g.members || []).map(m => [m.id, m.name])) }
  if (g.state?.turn === me.value && turnBefore !== me.value && turnBefore !== undefined) yourTurn()
  if (g.status === 'done') stopLink()
  persist()
}

function yourTurn () {
  buzz(350)
  if (!document.hidden) toast(t("You're up! 💪"))
}

async function fetchNow () {
  const g = tg()
  if (!g?.id || link.fetching || !inCrew.value) return
  link.fetching = true
  try {
    const v = await crewRpc('crew_together_get', { p_id: g.id, p_since: g.rev || 0 })
    if (v?.id || v?.log) apply(v)
    else if (v?.rev != null && v.rev > (g.rev || 0)) {
      // Something changed but we were asked for nothing new: get it all again
      apply(await crewRpc('crew_together_get', { p_id: g.id, p_since: 0 }))
    }
  } catch (e) {
    if (e.code === 'not_found') { endedHere(); return }
  } finally { link.fetching = false }
}

/** Send everything waiting, in order. */
async function flush () {
  const g = tg()
  if (!g?.id || link.flushing || !g.outbox?.length) return
  link.flushing = true
  try {
    while (g.outbox.length) {
      const job = g.outbox[0]
      try {
        const rev = await crewRpc('crew_together_send', {
          p_id: g.id, p_client_id: job.clientId, p_kind: job.kind, p_payload: job.payload || {},
          p_state: job.state || null, p_plan: job.plan || null
        })
        g.outbox.shift()
        persist()
        link.channel?.send('rev', { rev })
      } catch (e) {
        if (e.code === 'offline') break // try again soon
        // The server said no (it ended, or something didn't fit): drop it so the rest can go
        g.outbox.shift()
        persist()
        if (e.code === 'not_found') { endedHere(); return }
      }
    }
  } finally { link.flushing = false }
  fetchNow()
}

function queue (job) {
  const g = tg()
  if (!g) return
  g.outbox = g.outbox || []
  g.outbox.push(job)
  // Show it straight away (it comes back from the server with its number)
  if (job.kind !== 'state') g.log = [...(g.log || []), { rev: null, pending: true, member: me.value, clientId: job.clientId, kind: job.kind, payload: job.payload || {} }]
  if (job.state) g.state = job.state
  if (job.plan) g.plan = job.plan
  persist()
  flush()
}

// ── Connection: the channel and the safety-net checks ────
function startLink () {
  const g = tg()
  if (!g?.id || g.status === 'done' || !crewConfig.value) return
  if (!link.channel) {
    link.channel = openChannel(crewConfig.value, 'together-' + g.id, (event) => { if (event === 'rev') fetchNow() }, (up) => {
      link.live = up
      if (state.data.together) state.data.together._live = up
      schedule()
    })
  }
  schedule()
  fetchNow()
  flush()
}
function schedule () {
  clearInterval(link.poll)
  if (!tg()?.id || document.hidden) return
  link.poll = setInterval(() => { fetchNow(); flush() }, link.live ? POLL_LIVE : POLL_SOLO)
}
function stopLink () {
  clearInterval(link.poll)
  link.poll = null
  link.channel?.close()
  link.channel = null
  link.live = false
}
/** It ended (or you were dropped): keep your workout, forget the shared part. */
function endedHere () {
  stopLink()
  if (state.data.together) {
    state.data.together.status = 'done'
    persist()
  }
}

// ── What you can do ──────────────────────────────────────
/** Start training together with your current workout. */
export async function startTogether () {
  const s = activeSession.value
  if (!s || !inCrew.value) throw new Error(t('Start a workout first.'))
  const plan = planFrom(s)
  const v = await crewRpc('crew_together_start', { p_plan: plan })
  s.together = v.id
  state.data.together = { id: v.id, sessionId: s.id, rev: 0, log: [], outbox: [], status: 'open' }
  apply(v)
  // First turn: you
  queue({ kind: 'state', clientId: 'state-start', state: { item: 0, turn: me.value, next: nextText(plan, { item: 0, turn: me.value }, false), nextEs: nextText(plan, { item: 0, turn: me.value }, true) } })
  startLink()
  return v
}

export async function inviteTogether (memberId) {
  const g = tg()
  if (!g?.id) return
  await crewRpc('crew_together_invite', { p_id: g.id, p_to: memberId })
}

/** Look at one before joining: { id, status, joined, members?, plan? } */
export async function peekTogether (id) {
  return crewRpc('crew_together_get', { p_id: id, p_since: 0 })
}

/**
 * Join by id (an invite) or 4-digit code. Your workout becomes the host's day: a workout you've already
 * logged sets in keeps them and gets the day's exercises added; an empty one is replaced.
 */
export async function joinTogether ({ id = null, code = null }) {
  const v = await crewRpc('crew_together_join', { p_id: id, p_code: code })
  let s = activeSession.value
  if (s && !s.sets.length) { discardSession(s.id); s = null }
  if (!s) {
    const sid = startFreeSession(v.plan?.name || t('Training together'), v.plan?.nameEs || null)
    s = getSession(sid)
  }
  s.together = v.id
  state.data.together = { id: v.id, sessionId: s.id, rev: 0, log: [], outbox: [], status: 'open' }
  apply(v)
  followPlan(s, v.plan)
  persist()
  startLink()
  return s.id
}

/** Leave (your workout stays). The next person becomes host; the last one out ends it. */
export async function leaveTogether () {
  const g = tg()
  if (!g?.id) return
  stopLink()
  try { await flush() } catch { /* best effort */ }
  try { await crewRpc('crew_together_leave', { p_id: g.id }) } catch { /* it may be over already */ }
  state.data.together = null
  persist()
}

/** Host: finish it for everyone. */
export async function endTogether () {
  const g = tg()
  if (!g?.id) return
  try { await crewRpc('crew_together_end', { p_id: g.id }) } catch { /* left anyway below */ }
  await leaveTogether()
}

/** "Spot me": everyone else gets a buzz. */
export function spotMe () {
  queue({ kind: 'spot', clientId: 'spot-' + Date.now(), payload: { at: new Date().toISOString() } })
}

/** Pass your turn (you're on something else, or need longer): it goes to the next person. */
export function passTurn () {
  const g = tg()
  if (!g?.state) return
  const st = nextTurn({ members: g.members.map(m => m.id), plan: g.plan, log: g.log, from: me.value, item: g.state.item ?? 0 })
  // Passing isn't a set: go round once without you
  const order = g.members.map(m => m.id)
  let turn = st.turn
  if (turn === me.value && order.length > 1) turn = order[(order.indexOf(me.value) + 1) % order.length]
  sendState({ item: st.item, turn })
}
/** Move everyone to another exercise (host) */
export function goToItem (item) {
  const g = tg()
  if (!g) return
  const done = doneByMember(g.log)
  const order = g.members.map(m => m.id)
  const turn = order.find(m => (done[m]?.[item] || 0) < (g.plan.items[item]?.sets || 1)) || order[0]
  sendState({ item, turn })
}
function sendState ({ item, turn }) {
  const g = tg()
  const st = { item, turn, next: nextText(g.plan, { item, turn }, false), nextEs: nextText(g.plan, { item, turn }, true) }
  queue({ kind: 'state', clientId: 'state-' + Date.now(), state: st })
}

/** What you're about to lift on an item (and your machine settings), so the bar can be planned. */
export function noteLoad (item, load, unit, ms = null) {
  clearTimeout(link.noteTimer)
  link.noteTimer = setTimeout(() => {
    const g = tg()
    if (!g?.id || g.status === 'done') return
    const last = [...(g.log || [])].reverse().find(e => e.kind === 'note' && e.member === me.value && e.payload?.item === item)
    if (last && last.payload.load === load && last.payload.unit === unit && JSON.stringify(last.payload.ms || null) === JSON.stringify(ms)) return
    queue({ kind: 'note', clientId: `note-${item}-${Date.now()}`, payload: { item, load, unit, ms } })
  }, NOTE_WAIT)
}

// ── Mirroring your sets ──────────────────────────────────
function setPayload (s, row) {
  const it = s.items[row.itemIndex]
  if (it?.tg == null) return null // an exercise of your own, not part of the shared day
  return {
    item: it.tg, setId: row.id, exerciseId: row.exerciseId, load: row.load ?? null, unit: row.unit || null,
    reps: row.reps ?? null, repsL: row.repsL ?? null, repsR: row.repsR ?? null, seconds: row.seconds ?? null,
    type: row.type || null, rir: row.rir ?? null, cardio: row.cardio || null
  }
}
onSetChange(({ op, session: s, set: row }) => {
  const g = tg()
  if (!g?.id || g.status === 'done' || s.id !== g.sessionId) return
  if (op === 'delete') {
    if (s.items[row.itemIndex]?.tg == null) return
    queue({ kind: 'unset', clientId: 'unset-' + row.id, payload: { setId: row.id } })
    return
  }
  const payload = setPayload(s, row)
  if (!payload) return
  const clientId = op === 'log' ? 'set-' + row.id : `set-${row.id}-${Date.now()}`
  // A planned set on the exercise everyone's on: the turn moves on
  let st = null
  if (op === 'log' && fillsPlannedSet(row) && payload.item === (g.state?.item ?? payload.item)) {
    const log = [...(g.log || []), { rev: Infinity, member: me.value, kind: 'set', payload }]
    const n = nextTurn({ members: g.members.map(m => m.id), plan: g.plan, log, from: me.value, item: payload.item })
    st = { item: n.item, turn: n.turn, next: nextText(g.plan, n, false), nextEs: nextText(g.plan, n, true) }
  }
  queue({ kind: 'set', clientId, payload, ...(st ? { state: st } : {}) })
})
// The host changed the day (added or swapped an exercise): everyone follows
onItemsChange(({ session: s }) => {
  const g = tg()
  if (!g?.id || g.status === 'done' || s.id !== g.sessionId || g.host !== me.value) return
  s.items.forEach((it, i) => { if (it.tg == null) it.tg = Math.max(-1, ...s.items.map(x => x.tg ?? -1)) + 1 })
  const plan = { ...g.plan, items: [...g.plan.items] }
  for (const it of s.items) {
    plan.items[it.tg] = { ...(plan.items[it.tg] || {}), exerciseId: it.exerciseId, sets: plannedSets(it), repRange: it.repRange || null, durationSec: it.durationSec || null, restSec: it.restSec ?? null }
  }
  queue({ kind: 'state', clientId: 'plan-' + Date.now(), plan })
})
// Finishing or throwing away your workout takes you out of the shared one
onSessionFinished(({ session: s, edited }) => { if (!edited && tg()?.sessionId === s.id) leaveTogether() })
onSessionDiscarded(({ sessionId }) => { if (tg()?.sessionId === sessionId) leaveTogether() })

// ── Open ones in your crew ───────────────────────────────
export async function refreshOpenTogether () {
  if (!inCrew.value) return
  try {
    state.data.togetherOpen = await crewRpc('crew_together_open')
  } catch { /* older database: nothing to show */ }
}

/** Live view for the workout screen */
export const togetherView = computed(() => {
  const g = together.value
  if (!g) return null
  const done = doneByMember(g.log || [])
  const sets = currentSets(g.log || [])
  return {
    ...g,
    done,
    // The latest sets from the others, newest first
    recent: sets.filter(x => x.member !== me.value).sort((a, b) => (b.rev ?? 1e15) - (a.rev ?? 1e15)).slice(0, 3),
    myTurn: g.state?.turn === me.value,
    turnName: g.members?.find(m => m.id === g.state?.turn)?.name || '',
    sending: (g.outbox || []).length
  }
})

// ── Start-up ─────────────────────────────────────────────
/** After the app starts, and when it comes back: pick up where it was. */
export function initTogether () {
  watch(() => tg()?.id, (id) => { if (id) startLink(); else stopLink() }, { immediate: true })
  document.addEventListener('visibilitychange', () => {
    if (!tg()?.id) return
    if (document.hidden) { clearInterval(link.poll); link.poll = null } else { schedule(); fetchNow(); flush() }
  })
  window.addEventListener('online', () => { flush(); fetchNow() })
}
/** A notification about it arrived while the app is open: check now */
export function pokeTogether () { fetchNow() }
