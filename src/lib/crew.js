// Crew board: a shared feed, leaderboards and challenges for the group, backed by Supabase.
//
// The app talks to Supabase's REST API with plain fetch (no SDK) and only calls the
// crew_* database functions from supabase/crew.sql. The project URL and public key come
// from latest.json in the routines repo ("crew": { "url", "anonKey" }), so setting it up
// or moving it never needs a new APK.
//
// Workouts, badges and shared plans are queued locally and sent when there's a connection.
import { reactive, computed } from 'vue'
import { App as CapApp } from '@capacitor/app'
import {
  state, persist, manifest, onSessionFinished, onSessionDeleted, onSessionStarted, onSessionDiscarded,
  streak, challenge, challengeStatus, routine, exercisesById, sessionSummary, finishedSessions, activeSession,
  goalCtx, importCrewPlan
} from '../store.js'
import { weekKey, monthKey, addDays, workSets, sessionMinutes } from './stats.js'
import { convertLoad } from './training.js'
import { cleanItem } from './routines.js'
import { periodStats, liftNumbers, liftLines, badgeIds, badgeTitle } from './crewStats.js'
import { bodyweight, DEFAULT_LIFTS } from './goals.js'
import { dots } from './body.js'
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

export const board = reactive({
  loading: false, error: null, crew: null, fetchedAt: null,
  members: [], events: [], plans: [], challenges: [], nudgesIn: [], nudgesOut: [], week: null, month: null
})
/** Full comment threads, by post id: { event, comments, loading, error } */
export const threads = reactive({})

const ERRORS = {
  crew_not_found: "There's no crew with that code. Check it with whoever sent it.",
  code_taken: 'That code is already in use. Try again.',
  crew_full: 'That crew is full (50 people).',
  bad_code: 'Crew codes are 6 letters or numbers.',
  bad_name: 'Pick a name between 1 and 30 characters.',
  not_a_member: "This phone isn't in that crew any more.",
  too_big: 'That was too much data to send.',
  not_owner: 'Only the crew\'s owner can do that.',
  already_nudged: 'You already nudged them this week.',
  already_trained: 'They already trained this week.',
  too_many: 'There are already as many as the crew can have. Remove one first.',
  bad_comment: 'Comments are 1 to 500 characters.',
  bad_challenge: 'Check the challenge: it needs a name, and a target for a team challenge.',
  not_found: 'That isn\'t on the board any more.',
  bad_target: "You can't do that to yourself."
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
/** For push.js */
export const crewRpc = (fn, body = {}) => rpc(fn, { ...auth(), ...body })

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
  Object.assign(state.data.crew, { code: res.crew, name: name.trim(), memberId: res.member_id, key, queue: [], sharedPlans: {} })
  await persist()
  // Post the last week's workouts so the feed isn't empty
  const since = addDays(new Date(), -7)
  for (const s of finishedSessions.value.filter(x => new Date(x.startedAt) >= since).reverse()) queueWorkout(s)
  // Your numbers go up first, so the board you then see includes you
  await syncNow({ withBoard: true })
  return res.crew
}

export function createCrew (name) {
  return join(randomCode(), name, true)
}

export function joinCrew (code, name) {
  return join(normaliseCode(code), name, false)
}

function forget () {
  Object.assign(state.data.crew, { code: null, memberId: null, key: null, queue: [], lastSync: null, sharedPlans: {} })
  Object.assign(board, { crew: null, members: [], events: [], plans: [], challenges: [], nudgesIn: [], nudgesOut: [], fetchedAt: null, error: null })
  for (const k of Object.keys(threads)) delete threads[k]
}

export async function leaveCrew () {
  try { await rpc('crew_leave', auth()) } catch (e) { if (e.code !== 'not_a_member') throw e }
  forget()
  await persist()
}

export async function renameMe (name) {
  state.data.crew.name = name.trim()
  await persist()
  await pushStats()
}

// ── What gets shared ─────────────────────────────────────

// The heavy part (records, lifts, badges) is worked out again only when your workouts change
let statsVersion = 0
let memo = { key: '', value: null }
function heavyStats () {
  const unit = state.data.profile.unit
  const lifts = state.data.settings.lifts || DEFAULT_LIFTS
  const key = [statsVersion, unit, state.today, state.data.sessions.length, JSON.stringify(lifts)].join('|')
  if (memo.key === key) return memo.value
  const today = new Date(state.today + 'T12:00:00')
  const ps = periodStats(state.data.sessions, unit, today)
  const value = {
    ...ps,
    pl: liftNumbers(state.data.sessions, lifts, unit, today),
    lines: liftLines(state.data.sessions, lifts, unit, today),
    badges: badgeIds({ sessions: state.data.sessions, unit, lifts, bestStreak: streak.value.best, records: ps.all.records })
  }
  memo = { key, value }
  return value
}

/**
 * Badges this workout earned you, for the pop-up on the finish screen. Works without a crew.
 * `state.data.badgesSeen` remembers what was already shown; the first time it starts from what you
 * had before this workout, so old badges never pop up.
 */
export function newBadgesFrom (sessionId) {
  const unit = state.data.profile.unit
  const lifts = state.data.settings.lifts || DEFAULT_LIFTS
  const now = heavyStats().badges
  if (!state.data.badgesSeen) {
    const others = state.data.sessions.filter(x => x.id !== sessionId)
    const ps = periodStats(others, unit, new Date(state.today + 'T12:00:00'))
    const before = badgeIds({ sessions: others, unit, lifts, bestStreak: streak.value.best, records: ps.all.records })
    state.data.badgesSeen = Object.fromEntries(before.map(id => [id, state.today]))
  }
  const fresh = now.filter(id => !state.data.badgesSeen[id])
  for (const id of fresh) state.data.badgesSeen[id] = state.today
  if (fresh.length) persist()
  return fresh
}

/** Stats shown on the board. Week and month keys let others ignore stale numbers. */
export function myStats () {
  const h = heavyStats()
  const c = challenge.value
  const cs = challengeStatus.value
  const live = activeSession.value && !activeSession.value.finishedAt ? activeSession.value : null
  let pl = h.pl
  if (state.data.crew.showDots) {
    const bw = bodyweight(goalCtx.value, 'kg')
    const sex = state.data.profile.sex
    if (bw && sex) {
      const d = (v) => (v ? dots(convertLoad(v, h.pl.unit, 'kg'), bw, sex) : null)
      pl = { ...pl, dots: { e1rm: d(h.pl.e1rm.total), actual: d(h.pl.actual.total) } }
    }
  }
  return {
    v: 2,
    app: APP_VERSION,
    level: state.data.profile.level,
    week: h.week,
    lastWeek: h.lastWeek,
    month: h.month,
    lastMonth: h.lastMonth,
    all: { ...h.all, bestStreak: streak.value.best },
    streak: { weeks: streak.value.weeks, best: streak.value.best, min: streak.value.min },
    challenge: c && cs ? { month: routine.value.month, title: c.title, value: cs.value, target: cs.target, done: cs.done } : null,
    live: live ? { startedAt: live.startedAt, day: live.dayId, dayName: live.dayName || null, dayNameEs: live.dayNameEs || null } : null,
    pl,
    lines: h.lines,
    badges: h.badges,
    avatar: state.data.crew.avatar || null,
    lastWorkoutAt: finishedSessions.value[0]?.startedAt || null
  }
}

const isCustom = (id) => state.data.customExercises.some(e => e.id === id)
function customDef (id, withImages = false) {
  const e = state.data.customExercises.find(x => x.id === id)
  if (!e) return null
  const { hidden, from, images, ...rest } = JSON.parse(JSON.stringify(e))
  return withImages && images?.length ? { ...rest, images } : rest
}
const planItem = (it) => {
  const c = cleanItem(it)
  delete c.id
  return c
}

/** Every set (weight, reps, type), the day's plan so others can copy it, and your own exercises' definitions. */
function workoutDetail (s) {
  const ex = exercisesById.value
  const order = []
  const by = {}
  for (const x of s.sets || []) {
    if (!by[x.exerciseId]) { by[x.exerciseId] = []; order.push(x.exerciseId) }
    const set = { load: x.load ?? null, unit: x.unit, reps: x.reps ?? null }
    if (x.seconds) set.seconds = x.seconds
    if (x.type && x.type !== 'normal') set.type = x.type
    if (x.rir != null) set.rir = x.rir
    if (x.repsL != null) { set.repsL = x.repsL; set.repsR = x.repsR }
    if (x.climb) set.climb = { ...x.climb }
    by[x.exerciseId].push(set)
  }
  const detail = order.map(id => ({
    id,
    name: ex[id]?.name || id,
    ...(ex[id]?.es?.name ? { es: { name: ex[id].es.name } } : {}),
    sets: by[id]
  }))
  const items = (s.items || []).map(it => planItem({ ...it, sets: it.routineSets ?? it.sets }))
  const customs = [...new Set([...order, ...items.map(i => i.exerciseId)])].filter(isCustom).map(id => customDef(id))
  return { detail, items, customs }
}

function workoutPayload (s) {
  const sum = sessionSummary(s)
  const ex = exercisesById.value
  // One line per exercise: the most telling record
  const order = { grade: 0, flash: 1, reps: 0, load: 1, e1rm: 2, time: 3 }
  const best = {}
  for (const p of sum.prs) if (!best[p.exerciseId] || order[p.type] < order[best[p.exerciseId].type]) best[p.exerciseId] = p
  const payload = {
    day: s.dayId,
    dayName: s.dayName,
    dayNameEs: s.dayNameEs || undefined,
    source: s.source || (s.dayId === 'free' ? 'free' : 'routine'),
    month: s.routineMonth || undefined,
    minutes: sessionMinutes(s),
    sets: workSets(s).length,
    climbs: (s.sets || []).filter(x => x.climb).length || undefined,
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
  if (state.data.crew.shareDetails !== false) {
    const d = workoutDetail(s)
    // The server takes up to ~48 kB; a huge workout drops its plan, then its sets
    if (JSON.stringify(d).length < 40000) Object.assign(payload, d)
    else if (JSON.stringify(d.detail).length < 40000) payload.detail = d.detail
  }
  return payload
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

/** New badges go to the feed. The first time (upgrading to 0.6), what you already had is recorded quietly. */
function checkBadges () {
  const c = state.data.crew
  const ids = heavyStats().badges
  const unit = state.data.profile.unit
  if (!c.badges) {
    c.badges = Object.fromEntries(ids.map(id => [id, state.today]))
    return
  }
  for (const id of ids) {
    if (c.badges[id]) continue
    c.badges[id] = state.today
    if (c.shareFeed) {
      c.queue.push({ op: 'post', clientId: 'badge-' + id, kind: 'badge', payload: { id, unit, title: badgeTitle(id, 'en', unit), es: { title: badgeTitle(id, 'es', unit) } } })
    }
  }
}

// ── Shared plans (My routines → Share with the crew) ─────

function hash (str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return String(h >>> 0)
}

export function planPayload (p) {
  const days = p.days.map(d => ({
    label: d.label, name: d.name || '', ...(d.es?.name ? { es: { name: d.es.name } } : {}), notes: d.notes || '',
    items: (d.items || []).map(planItem)
  }))
  const ids = [...new Set(days.flatMap(d => d.items.map(i => i.exerciseId)))]
  const data = { name: p.name, notes: p.notes || '', days, customs: ids.filter(isCustom).map(id => customDef(id, true)) }
  // Photos of your own exercises come along if they fit
  if (JSON.stringify(data).length > 350000) data.customs = ids.filter(isCustom).map(id => customDef(id))
  const summary = { days: days.length, exercises: ids.length, labels: days.map(d => d.label), dayNames: days.map(d => d.name).slice(0, 8) }
  return { data, summary }
}

async function flushPlans () {
  const c = state.data.crew
  const sent = c.sharedPlans || (c.sharedPlans = {})
  const want = state.data.plans.filter(p => p.crewShare)
  for (const p of want) {
    const { data, summary } = planPayload(p)
    const h = hash(JSON.stringify([p.name, data, summary]))
    if (sent[p.id] === h) continue
    await rpc('crew_share_plan', { ...auth(), p_client_id: p.id, p_name: p.name, p_summary: summary, p_data: data })
    sent[p.id] = h
    await persist()
  }
  for (const id of Object.keys(sent)) {
    if (want.some(p => p.id === id)) continue
    await rpc('crew_unshare_plan', { ...auth(), p_client_id: id })
    delete sent[id]
    await persist()
  }
}

export function setPlanShared (plan, on) {
  plan.crewShare = !!on
  persist()
  return syncNow({ withBoard: true })
}

// ── Syncing ──────────────────────────────────────────────

let syncing = null
let again = false
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

/** Send queued posts, shared plans and fresh stats. Safe to call often. */
export function syncNow ({ withBoard = false } = {}) {
  if (!inCrew.value || !crewAvailable.value) return Promise.resolve()
  if (syncing) {
    // Something changed while sending (a workout started, say): go again afterwards
    again = true
    return syncing.then(() => (withBoard ? refreshBoard() : undefined))
  }
  syncing = (async () => {
    try {
      do {
        again = false
        if (challengeStatus.value?.done) queueChallengeDone()
        checkBadges()
        await flushQueue()
        await pushStats()
        await flushPlans()
      } while (again)
      state.data.crew.lastSync = new Date().toISOString()
      if (withBoard) await refreshBoard()
    } catch (e) {
      if (e.code === 'not_a_member') {
        // Removed on the server (by the owner, or the database was reset): forget the membership
        forget()
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
    Object.assign(board, {
      crew: res.crew,
      members: res.members || [],
      events: res.events || [],
      plans: res.plans || [],
      challenges: res.challenges || [],
      nudgesIn: res.nudgesIn || [],
      nudgesOut: res.nudgesOut || [],
      week: res.week || null,
      month: res.month || null,
      fetchedAt: new Date().toISOString(),
      error: null
    })
  } catch (e) {
    if (e.code === 'not_a_member') { forget(); await persist() }
    board.error = e.message
  } finally {
    board.loading = false
  }
}

// ── Members ──────────────────────────────────────────────

export const me = computed(() => state.data.crew.memberId)
export const memberById = computed(() => Object.fromEntries(board.members.map(m => [m.id, m])))
export const memberName = (id) => (id === me.value ? t('You') : memberById.value[id]?.name || t('Someone'))
export const isOwner = computed(() => !!memberById.value[me.value]?.owner)

const todayDate = () => new Date(state.today + 'T12:00:00')
const keyNow = (period) => (period === 'week' ? weekKey(todayDate()) : monthKey(todayDate()))
const keyBefore = (period) => {
  const d = todayDate()
  return period === 'week' ? weekKey(addDays(d, -7)) : monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 15))
}

/**
 * A member's totals for this week / this month / last week / last month / all time, volume in your unit.
 * Someone who hasn't updated since the period started counts as 0.
 */
export function memberTotals (m, period) {
  const s = m?.stats || {}
  const unit = state.data.profile.unit
  let v = null
  if (period === 'all') v = s.all || null
  else {
    const base = period.replace(/^last/, '').toLowerCase() // week | month
    const key = period.startsWith('last') ? keyBefore(base) : keyNow(base)
    const cap = base[0].toUpperCase() + base.slice(1)
    for (const k of [base, 'last' + cap]) if (s[k]?.key === key) v = s[k]
  }
  const out = { workouts: v?.workouts || 0, sets: v?.sets || 0, records: v?.records || 0, volume: 0, bestStreak: v?.bestStreak ?? s.streak?.best ?? 0 }
  if (v?.volume) out.volume = Math.round(convertLoad(v.volume, v.unit || unit, unit))
  return out
}

/** "Training now": started in the last 3 hours and not finished. */
export function liveOf (m) {
  const l = m?.stats?.live
  if (!l?.startedAt) return null
  const mins = (Date.now() - new Date(l.startedAt)) / 60000
  return mins >= 0 && mins < 180 ? { ...l, minutes: Math.round(mins) } : null
}

/** Someone's squat / bench / deadlift / total in your unit; basis 'e1rm' or 'actual'. */
export function memberLifts (m, basis = 'e1rm') {
  const pl = m?.stats?.pl
  if (!pl) return null
  const unit = state.data.profile.unit
  const conv = (v) => (v ? Math.round(convertLoad(v, pl.unit || unit, unit) * 10) / 10 : null)
  const b = pl[basis] || {}
  return { squat: conv(b.squat), bench: conv(b.bench), deadlift: conv(b.deadlift), total: conv(b.total), dots: pl.dots?.[basis] ?? null }
}

/** Someone's weekly best estimated max for a lift, in your unit: [[weekKey, value]] */
export function memberLine (m, lift) {
  const pts = m?.stats?.lines?.[lift]
  if (!pts) return []
  const from = m.stats?.pl?.unit || state.data.profile.unit
  return pts.map(([wk, v]) => [wk, Math.round(convertLoad(v, from, state.data.profile.unit) * 10) / 10])
}

export async function nudge (memberId) {
  await rpc('crew_nudge', { ...auth(), p_to: memberId })
  if (!board.nudgesOut.includes(memberId)) board.nudgesOut.push(memberId)
}

export async function removeMember (memberId) {
  await rpc('crew_remove', { ...auth(), p_target: memberId })
  await refreshBoard()
}

// ── Reactions and comments ───────────────────────────────

export const REACTIONS = [
  { kind: 'clap', emoji: '👏' },
  { kind: 'fire', emoji: '🔥' },
  { kind: 'strong', emoji: '💪' },
  { kind: 'laugh', emoji: '😂' }
]
/** 0.5 high fives were stored as true */
export const reactionKind = (v) => (v === true ? 'clap' : v)

function applyReaction (ev, kind) {
  if (!ev) return
  const mine = reactionKind(ev.reactions?.[me.value])
  ev.reactions = { ...(ev.reactions || {}) }
  if (mine === kind) delete ev.reactions[me.value]
  else ev.reactions[me.value] = kind
}

export async function react (eventId, kind = 'clap') {
  const evs = [board.events.find(e => e.id === eventId), threads[eventId]?.event].filter(Boolean)
  const before = evs.map(e => e.reactions)
  for (const ev of evs) applyReaction(ev, kind)
  try {
    await rpc('crew_react', { ...auth(), p_event: eventId, p_kind: kind })
  } catch (e) {
    evs.forEach((ev, i) => { ev.reactions = before[i] })
    board.error = e.message
  }
}
export const highFive = (eventId) => react(eventId, 'clap')

export async function loadThread (eventId) {
  const th = (threads[eventId] ||= { event: board.events.find(e => e.id === eventId) || null, comments: [], loading: false, error: null })
  th.loading = true
  try {
    const res = await rpc('crew_thread', { ...auth(), p_event: eventId })
    if (res.event) th.event = res.event
    th.comments = res.comments || []
    th.error = res.event ? null : t(ERRORS.not_found)
  } catch (e) {
    th.error = e.message
  } finally {
    th.loading = false
  }
  return th
}

function updateCount (eventId) {
  const ev = board.events.find(e => e.id === eventId)
  const th = threads[eventId]
  if (!ev || !th) return
  ev.comments = th.comments.length
  const last = th.comments[th.comments.length - 1]
  ev.last_comment = last ? { member_id: last.member_id, body: last.body.slice(0, 140) } : null
}

export async function addComment (eventId, body) {
  const c = await rpc('crew_comment', { ...auth(), p_event: eventId, p_body: body })
  const th = (threads[eventId] ||= { event: board.events.find(e => e.id === eventId) || null, comments: [], loading: false, error: null })
  th.comments.push(c)
  updateCount(eventId)
  return c
}

export async function deleteComment (eventId, commentId) {
  await rpc('crew_uncomment', { ...auth(), p_comment: commentId })
  const th = threads[eventId]
  if (th) th.comments = th.comments.filter(c => c.id !== commentId)
  updateCount(eventId)
}

// ── Copying workouts and plans ───────────────────────────

/** A routine item from a posted exercise when the post has no plan (posts from 0.5). */
function itemFromDetail (d) {
  const work = d.sets.filter(s => s.type !== 'warmup' && s.type !== 'drop')
  const reps = work.map(s => s.reps).filter(Boolean)
  const secs = work.map(s => s.seconds).filter(Boolean)
  const it = { exerciseId: d.id, sets: Math.max(1, work.length) }
  if (secs.length && !reps.length) it.durationSec = [Math.min(...secs), Math.max(...secs)]
  else if (reps.length) it.repRange = [Math.min(...reps), Math.max(...reps)]
  return it
}

export function canCopyWorkout (ev) {
  return ev?.kind === 'workout' && !!(ev.payload?.items?.length || ev.payload?.detail?.length)
}

/** Save someone's workout as a day in My routines. Returns the new plan. */
export function copyWorkout (ev) {
  const p = ev.payload
  const owner = memberById.value[ev.member_id]?.name || t('Someone')
  const day = tx({ dayName: p.dayName, es: { dayName: p.dayNameEs } }, 'dayName') || t('Workout')
  const items = p.items?.length ? p.items : (p.detail || []).map(itemFromDetail)
  return importCrewPlan({
    name: t("{name}'s {day}", { name: owner, day }),
    days: [{ label: (p.day && p.day.length <= 2 && p.day !== 'free' ? p.day : day.charAt(0)).toUpperCase(), name: day, items }],
    customs: p.customs || [],
    from: { kind: 'crew', member: owner, eventId: ev.id }
  })
}

/** Copy a plan someone shared into My routines. Returns the new plan. */
export async function copySharedPlan (planRow) {
  const full = await rpc('crew_get_plan', { ...auth(), p_plan: planRow.id })
  if (!full?.data?.days) throw new CrewError('not_found', t(ERRORS.not_found))
  const owner = memberById.value[full.member_id]?.name || t('Someone')
  return importCrewPlan({
    name: `${full.data.name || full.name} · ${owner}`,
    notes: full.data.notes || '',
    days: full.data.days,
    customs: full.data.customs || [],
    from: { kind: 'crew', member: owner, planId: full.id }
  })
}

// ── Crew challenges ──────────────────────────────────────

export async function createChallenge ({ kind, metric, period, target, title }) {
  await rpc('crew_challenge_create', { ...auth(), p_kind: kind, p_metric: metric, p_period: period, p_target: target ?? null, p_title: title })
  await refreshBoard()
}

export async function deleteChallenge (id) {
  await rpc('crew_challenge_delete', { ...auth(), p_id: id })
  await refreshBoard()
}

/** A running challenge's standings: everyone's number (volume in your unit) and the team total. */
export function challengeStandings (ch) {
  const unit = state.data.profile.unit
  const rows = board.members.map(m => {
    const s = m.stats || {}
    let v = null
    for (const k of ch.period === 'week' ? ['week', 'lastWeek'] : ['month', 'lastMonth']) if (s[k]?.key === ch.period_key) v = s[k]
    let value = v?.[ch.metric] || 0
    // Challenge volume is counted in kg on the server; show it in your unit
    if (ch.metric === 'volume' && v) value = Math.round(convertLoad(v.volume || 0, v.unit || unit, unit))
    return { id: m.id, name: m.name, value }
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const total = rows.reduce((n, r) => n + r.value, 0)
  const target = ch.metric === 'volume' && ch.target ? Math.round(convertLoad(Number(ch.target), 'kg', unit)) : Number(ch.target || 0)
  return { rows, total, target }
}

// ── Wiring ───────────────────────────────────────────────

export function initCrew () {
  onSessionFinished(({ session }) => {
    statsVersion++
    if (!inCrew.value) return
    queueWorkout(session)
    persist()
    syncNow()
  })
  onSessionDeleted(({ session }) => {
    statsVersion++
    if (!inCrew.value) return
    const q = state.data.crew.queue
    const i = q.findIndex(x => x.clientId === session.id)
    if (i >= 0) q.splice(i, 1)
    else q.push({ op: 'delete', clientId: session.id })
    persist()
    syncNow()
  })
  // "Training now" on the board
  onSessionStarted(() => { if (inCrew.value) syncNow() })
  onSessionDiscarded(() => { if (inCrew.value) syncNow() })
  setTimeout(() => syncNow(), 3000)
  CapApp.addListener('resume', () => syncNow()).catch(() => {})
  if (typeof window !== 'undefined') window.addEventListener('online', () => syncNow())
}

/** For the feed: an exercise name in the reader's language when we have it. */
export function exerciseName (id, fallback, fallbackEs) {
  const ex = exercisesById.value[id]
  if (ex) return tx(ex, 'name')
  return tx({ name: fallback || id, es: fallbackEs ? { name: fallbackEs } : undefined }, 'name')
}
