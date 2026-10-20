// Crew board: a small shared feed and weekly board for the group, backed by Supabase.
//
// The app talks to Supabase's REST API with plain fetch (no SDK) and only calls the
// crew_* database functions from supabase/crew.sql. The project URL and public key come
// from latest.json in the routines repo ("crew": { "url", "anonKey" }), so setting it up
// or moving it never needs a new APK.
//
// Workouts are queued locally and sent when there's a connection.
import { reactive, computed } from 'vue'
import { App as CapApp } from '@capacitor/app'
import {
  state, persist, manifest, onSessionFinished, onSessionDeleted, streak, challenge, challengeStatus,
  routine, exercisesById, sessionSummary, finishedSessions
} from '../store.js'
import { weekKey, monthKey, sessionsInMonth, sessionsBetween, weekStart, addDays, workSets, sessionMinutes } from './stats.js'
import { sessionVolume } from './training.js'
import { t, tx } from '../i18n/index.js'
import { APP_VERSION } from '../config.js'

export const crewConfig = computed(() => {
  const c = state.data.crew
  if (c.url && c.anonKey) return { url: c.url.replace(/\/+$/, ''), anonKey: c.anonKey }
  const m = manifest.value?.crew
  return m?.url && m?.anonKey ? { url: m.url.replace(/\/+$/, ''), anonKey: m.anonKey } : null
})
export const crewAvailable = computed(() => !!crewConfig.value)
export const inCrew = computed(() => !!(state.data.crew.memberId && state.data.crew.key))

export const board = reactive({ loading: false, error: null, crew: null, members: [], events: [], fetchedAt: null })

const ERRORS = {
  crew_not_found: "There's no crew with that code. Check it with whoever sent it.",
  code_taken: 'That code is already in use. Try again.',
  crew_full: 'That crew is full (50 people).',
  bad_code: 'Crew codes are 6 letters or numbers.',
  bad_name: 'Pick a name between 1 and 30 characters.',
  not_a_member: "This phone isn't in that crew any more.",
  too_big: 'That was too much data to send.'
}

class CrewError extends Error {
  constructor (code, message) { super(message); this.code = code }
}

async function rpc (fn, body) {
  const cfg = crewConfig.value
  if (!cfg) throw new CrewError('no_config', t("The crew board isn't set up yet."))
  const headers = { apikey: cfg.anonKey, 'Content-Type': 'application/json' }
  // Legacy anon keys are JWTs and also go in Authorization; new publishable keys (sb_publishable_…) don't
  if (cfg.anonKey.startsWith('eyJ')) headers.Authorization = 'Bearer ' + cfg.anonKey
  let res
  try {
    res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    throw new CrewError('offline', t("Couldn't reach the crew board. Check your connection."))
  }
  const text = await res.text()
  if (!res.ok) {
    let msg = ''
    try { msg = JSON.parse(text).message || '' } catch { /* not JSON */ }
    throw new CrewError(msg || String(res.status), ERRORS[msg] ? t(ERRORS[msg]) : t('Crew board error: {e}', { e: msg || res.status }))
  }
  return text ? JSON.parse(text) : null
}

const auth = () => ({ p_member: state.data.crew.memberId, p_key: state.data.crew.key })

function randomKey () {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('')
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I
function randomCode () {
  const b = new Uint8Array(6)
  crypto.getRandomValues(b)
  return [...b].map(x => CODE_CHARS[x % CODE_CHARS.length]).join('')
}

export function normaliseCode (code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function join (code, name, create) {
  const key = randomKey()
  const res = await rpc('crew_join', { p_crew: code, p_name: name.trim(), p_key: key, p_create: create })
  Object.assign(state.data.crew, { code: res.crew, name: name.trim(), memberId: res.member_id, key, queue: [] })
  await persist()
  // Post the last week's workouts so the feed isn't empty
  const since = addDays(new Date(), -7)
  for (const s of finishedSessions.value.filter(x => new Date(x.startedAt) >= since).reverse()) queueWorkout(s)
  await syncNow()
  return res.crew
}

export function createCrew (name) {
  return join(randomCode(), name, true)
}

export function joinCrew (code, name) {
  return join(normaliseCode(code), name, false)
}

export async function leaveCrew () {
  try { await rpc('crew_leave', auth()) } catch (e) { if (e.code !== 'not_a_member') throw e }
  Object.assign(state.data.crew, { code: null, memberId: null, key: null, queue: [], lastSync: null })
  Object.assign(board, { crew: null, members: [], events: [], fetchedAt: null, error: null })
  await persist()
}

export async function renameMe (name) {
  state.data.crew.name = name.trim()
  await persist()
  await pushStats()
}

// ── What gets shared ─────────────────────────────────────

/** Stats shown on the board. Week and month keys let others ignore stale numbers. */
export function myStats () {
  const now = new Date()
  const wk = weekStart(now)
  const thisWeek = sessionsBetween(state.data.sessions, wk, addDays(wk, 7))
  const lastWeek = sessionsBetween(state.data.sessions, addDays(wk, -7), wk)
  const month = monthKey(now)
  const inMonth = sessionsInMonth(state.data.sessions, month)
  const unit = state.data.profile.unit
  const c = challenge.value
  const cs = challengeStatus.value
  return {
    v: 1,
    app: APP_VERSION,
    level: state.data.profile.level,
    week: { key: weekKey(now), workouts: thisWeek.length, sets: thisWeek.reduce((n, s) => n + workSets(s).length, 0) },
    lastWeek: { key: weekKey(addDays(wk, -7)), workouts: lastWeek.length, sets: lastWeek.reduce((n, s) => n + workSets(s).length, 0) },
    streak: { weeks: streak.value.weeks, best: streak.value.best, min: streak.value.min },
    month: {
      key: month,
      workouts: inMonth.length,
      sets: inMonth.reduce((n, s) => n + workSets(s).length, 0),
      volume: Math.round(inMonth.reduce((n, s) => n + sessionVolume(s, unit), 0)),
      unit
    },
    challenge: c && cs ? { month: routine.value.month, title: c.title, value: cs.value, target: cs.target, done: cs.done } : null,
    lastWorkoutAt: finishedSessions.value[0]?.startedAt || null
  }
}

function workoutPayload (s) {
  const sum = sessionSummary(s)
  const ex = exercisesById.value
  // One line per exercise: the most telling record
  const order = { reps: 0, load: 1, e1rm: 2, time: 3 }
  const best = {}
  for (const p of sum.prs) if (!best[p.exerciseId] || order[p.type] < order[best[p.exerciseId].type]) best[p.exerciseId] = p
  return {
    day: s.dayId,
    dayName: s.dayName,
    dayNameEs: s.dayNameEs || undefined,
    minutes: sessionMinutes(s),
    sets: workSets(s).length,
    exercises: sum.exercises.length,
    volume: Math.round(sum.volume),
    unit: sum.unit,
    startedAt: s.startedAt,
    prs: Object.values(best).slice(0, 6).map(p => ({
      exerciseId: p.exerciseId,
      name: ex[p.exerciseId]?.name || p.exerciseId,
      type: p.type,
      value: p.value,
      prev: p.prev,
      load: p.load ?? null,
      unit: s.sets.find(x => x.exerciseId === p.exerciseId)?.unit || sum.unit
    }))
  }
}

function queueWorkout (s) {
  if (!state.data.crew.shareFeed) return
  const q = state.data.crew.queue
  const i = q.findIndex(x => x.clientId === s.id)
  const entry = { op: 'post', clientId: s.id, kind: 'workout', payload: workoutPayload(s) }
  if (i >= 0) q[i] = entry
  else q.push(entry)
}

function queueChallengeDone () {
  const c = challenge.value
  const month = routine.value?.month
  if (!c || !month || !state.data.crew.shareFeed) return
  const rec = (state.data.challenges[month] ||= { manual: 0 })
  if (rec.doneAt) return
  rec.doneAt = new Date().toISOString()
  state.data.crew.queue.push({ op: 'post', clientId: 'challenge-' + month, kind: 'challenge', payload: { month, title: c.title, es: c.es?.title ? { title: c.es.title } : undefined, target: challengeStatus.value.target, type: c.type } })
}

// ── Syncing ──────────────────────────────────────────────

let syncing = null
let lastStatsJSON = ''

async function pushStats (force = false) {
  const stats = myStats()
  const json = JSON.stringify(stats)
  if (!force && json === lastStatsJSON) return
  await rpc('crew_update', { ...auth(), p_name: state.data.crew.name, p_stats: stats })
  lastStatsJSON = json
}

async function flushQueue () {
  const q = state.data.crew.queue
  while (q.length) {
    const job = q[0]
    if (job.op === 'delete') await rpc('crew_unpost', { ...auth(), p_client_id: job.clientId })
    else await rpc('crew_post', { ...auth(), p_client_id: job.clientId, p_kind: job.kind, p_payload: job.payload })
    q.shift()
    await persist()
  }
}

/** Send queued posts and fresh stats. Safe to call often. */
export function syncNow ({ withBoard = false } = {}) {
  if (!inCrew.value || !crewAvailable.value) return Promise.resolve()
  if (syncing) return syncing
  syncing = (async () => {
    try {
      if (challengeStatus.value?.done) queueChallengeDone()
      await flushQueue()
      await pushStats()
      state.data.crew.lastSync = new Date().toISOString()
      if (withBoard) await refreshBoard()
    } catch (e) {
      if (e.code === 'not_a_member') {
        // Removed on the server (or the database was reset): forget the membership
        Object.assign(state.data.crew, { memberId: null, key: null, queue: [] })
        await persist()
      }
      board.error = e.message
    } finally {
      syncing = null
    }
  })()
  return syncing
}

export async function refreshBoard () {
  if (!inCrew.value) return
  board.loading = true
  try {
    const res = await rpc('crew_board', auth())
    board.crew = res.crew
    board.members = res.members || []
    board.events = res.events || []
    board.fetchedAt = new Date().toISOString()
    board.error = null
  } catch (e) {
    board.error = e.message
  } finally {
    board.loading = false
  }
}

export async function highFive (eventId) {
  const ev = board.events.find(e => e.id === eventId)
  const me = state.data.crew.memberId
  if (ev) { // optimistic
    ev.reactions = { ...(ev.reactions || {}) }
    if (ev.reactions[me]) delete ev.reactions[me]
    else ev.reactions[me] = true
  }
  try { await rpc('crew_react', { ...auth(), p_event: eventId }) } catch (e) { board.error = e.message; refreshBoard() }
}

export function initCrew () {
  onSessionFinished(({ session }) => {
    if (!inCrew.value) return
    queueWorkout(session)
    persist()
    syncNow()
  })
  onSessionDeleted(({ session }) => {
    if (!inCrew.value) return
    const q = state.data.crew.queue
    const i = q.findIndex(x => x.clientId === session.id)
    if (i >= 0) q.splice(i, 1)
    else q.push({ op: 'delete', clientId: session.id })
    persist()
    syncNow()
  })
  setTimeout(() => syncNow(), 3000)
  CapApp.addListener('resume', () => syncNow()).catch(() => {})
  if (typeof window !== 'undefined') window.addEventListener('online', () => syncNow())
}

/** For the feed: an exercise name in the reader's language when we have it. */
export function exerciseName (id, fallback) {
  const ex = exercisesById.value[id]
  return ex ? tx(ex, 'name') : (fallback || id)
}
