// App-wide state. Small enough that a reactive object beats pulling in Pinia.
import { reactive, computed, toRaw } from 'vue'
import { loadData, saveData, emptyData, parseBackup, onSaveError } from './lib/storage.js'
import { DEFAULT_ROUTINES_URL, SUPPORTED_ROUTINE_SCHEMA, APP_VERSION } from './config.js'
import { pickActiveRoutine, compareVersions, dateKey, suggestNext, detectPRs, sessionVolume, resolvePlan, plannedSetsFor, applyTrack, canDoAtGym } from './lib/training.js'
import { challengeProgress, weekStreak, weekKey, STREAK_MIN } from './lib/stats.js'
import {
  buildDays, planDayView, parseKey, planActive, planExpired, makeUse, snapshotDay, reconcileEdit, applyEdits, withRefs,
  editedOldDay, planFromDays, sessionChanges, changesToOps, applyChangesToPlanDay, dayFromSession, opSwap, uid as rid
} from './lib/routines.js'
import { weeklyTarget, goalProgress } from './lib/goals.js'
import { t } from './i18n/index.js'
import { reportError } from './lib/errors.js'

export const state = reactive({
  ready: false,
  data: emptyData(),
  routineStatus: { loading: false, error: null, errorKind: null, lastAttempt: null }, // errorKind: offline | server | data
  saveError: null, // set while saving to the phone keeps failing
  notice: null, // one-off message for the app shell to show (e.g. data restored from a backup)
  reviewDayChange: null, // day id whose "the routine changed this day" choice was asked for from its screen
  today: dateKey() // refreshed when the app comes back to the foreground
})

export function touchToday () {
  const k = dateKey()
  if (k !== state.today) {
    state.today = k
    expirePlans()
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) touchToday() })
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// Plain copy of data that may contain Vue proxies (JSON is enough: everything we store is JSON)
export const plain = (x) => JSON.parse(JSON.stringify(toRaw(x)))

/** Save everything. Never throws: a problem is reported (banner + error log) instead of stopping the caller. */
export function persist () {
  try {
    return saveData(toRaw(state.data)) // saveData turns it into JSON straight away
  } catch (e) {
    console.error('Save failed', e)
    state.saveError = String(e?.message || e)
    reportError(e, 'save')
    return Promise.resolve()
  }
}

// Other modules (crew feed, automatic backups) react to workouts starting, finishing or being deleted
const hooks = { finished: [], deleted: [], started: [], discarded: [] }
export function onSessionFinished (fn) { hooks.finished.push(fn) }
export function onSessionDeleted (fn) { hooks.deleted.push(fn) }
/** A workout started, or one in progress was thrown away (crew: "training now"). */
export function onSessionStarted (fn) { hooks.started.push(fn) }
export function onSessionDiscarded (fn) { hooks.discarded.push(fn) }
function emit (kind, payload) {
  for (const fn of hooks[kind]) { try { fn(payload) } catch (e) { console.warn(kind, 'hook failed', e) } }
}

export async function initStore () {
  const { data, status } = await loadData()
  state.data = data
  if (status === 'unreadable') {
    // The data file is damaged: fall back to the newest automatic backup rather than starting empty
    try {
      const { listAutoBackups, readBackup, backupDate } = await import('./lib/backup.js')
      const [latest] = await listAutoBackups()
      if (latest) {
        state.data = parseBackup(await readBackup(latest))
        const d = backupDate(latest.name)
        state.notice = { key: 'Your data file was damaged, so the app loaded your automatic backup from {when}.', vars: { when: d ? dateKey(d) : latest.name } }
        await persist()
      } else {
        state.notice = { key: "Your data file couldn't be read. A copy was kept; import a backup from Settings if you have one." }
      }
    } catch {
      state.notice = { key: "Your data file couldn't be read. A copy was kept; import a backup from Settings if you have one." }
    }
  }
  onSaveError((err) => { state.saveError = err ? String(err.message || err) : null })
  expirePlans()
  reconcileEdits()
  state.ready = true
  refreshRoutines() // background; cached copy is used meanwhile
}

// ── Routine + exercise library ───────────────────────────

export const routinesUrl = computed(() => {
  let u = state.data.settings.routinesUrl || DEFAULT_ROUTINES_URL
  if (!u.endsWith('/')) u += '/'
  return u
})

export const routine = computed(() => state.data.cache.routine)
export const manifest = computed(() => state.data.cache.manifest)
/** Every exercise: the repo's library plus your own (ids starting with "my-"). Hidden ones stay for history. */
export const exercisesById = computed(() => {
  const map = {}
  for (const ex of state.data.cache.exercises?.exercises || []) map[ex.id] = ex
  for (const ex of state.data.customExercises || []) map[ex.id] = { ...ex, custom: true }
  return map
})

/**
 * This month's days: the repo's days (with your changes and the beginner track applied),
 * then the days from My routines you're using. Each has a stable `key` (r-A, p-<plan>-<day>).
 */
export const days = computed(() => buildDays({
  routine: routine.value,
  level: state.data.profile.level,
  edits: state.data.routineEdits,
  plans: state.data.plans,
  today: state.today
}))
export const routineReplaced = computed(() => state.data.plans.some(p => planActive(p, state.today) && p.use.mode === 'replace'))

/** A day by key, including ones not showing this month (a plan you aren't using, a replaced repo day). */
export function findDay (key) {
  const d = days.value.find(x => x.key === key)
  if (d) return d
  const k = parseKey(key)
  if (k?.source === 'mine') {
    const p = planById(k.planId)
    const pd = p?.days.find(x => x.id === k.dayId)
    return pd ? { ...planDayView(p, pd), inactive: true } : null
  }
  if (k?.source === 'routine' && routine.value) {
    const r = buildDays({ routine: routine.value, level: state.data.profile.level, edits: state.data.routineEdits, today: state.today })
    const rd = r.find(x => x.key === key)
    return rd ? { ...rd, inactive: true } : null
  }
  return null
}
export const dayIndexOf = (key) => days.value.findIndex(d => d.key === key)

/** Next day in the rotation (first one after a new month or when the remembered day is gone). */
export const nextDayIndex = computed(() => Math.max(0, dayIndexOf(state.data.nextDayKey)))
export const nextDay = computed(() => days.value[nextDayIndex.value] || null)

/** A routine item as the user will do it (beginner track swaps in its overrides). */
export function trackItem (item) {
  return applyTrack(item, state.data.profile.level)
}
export const hasBeginnerTrack = computed(() => (routine.value?.days || []).some(d => d.items.some(i => i.beginner)))

// ── Monthly challenge (from the routine file) ────────────
export const challenge = computed(() => routine.value?.challenge || null)
export const challengeStatus = computed(() => {
  const c = challenge.value
  if (!c) return null
  const month = routine.value.month
  return challengeProgress(c, state.data.sessions, month, {
    unit: state.data.profile.unit,
    manual: state.data.challenges[month]?.manual || 0
  })
})
export function bumpChallenge (delta) {
  const month = routine.value?.month
  if (!month) return
  const c = (state.data.challenges[month] ||= { manual: 0 })
  c.manual = Math.max(0, (c.manual || 0) + delta)
  persist()
}

/** Workouts a week that keep the streak going: your "workouts per week" goal from the week you set it, otherwise 2. */
export const weeklyMin = computed(() => weeklyTarget(state.data.goals) || STREAK_MIN)
export const streak = computed(() => {
  const [y, m, d] = state.today.split('-').map(Number)
  const g = state.data.goals.find(x => x.type === 'weekly' && !x.archived)
  const from = g?.createdAt ? weekKey(g.createdAt) : null
  const min = g ? (wk) => (!from || wk >= from ? weeklyMin.value : STREAK_MIN) : STREAK_MIN
  return weekStreak(state.data.sessions, new Date(y, m - 1, d, 12), min)
})

/** Today's targets from the routine: week number, reps in reserve, deload, set changes. */
export const todayPlan = computed(() => {
  const [y, m, d] = state.today.split('-').map(Number)
  return resolvePlan(routine.value, new Date(y, m - 1, d))
})
export const currentWeek = computed(() => todayPlan.value.week)
export const isDeloadWeek = computed(() => todayPlan.value.deload)

/** Exercise photos live in the routines repo; paths in exercises.json are relative to it. */
export function imageUrl (path) {
  if (!path) return ''
  return /^(https?|data):/.test(path) ? path : routinesUrl.value + path
}

export const updateAvailable = computed(() => {
  const v = manifest.value?.app?.version
  return v && compareVersions(v, APP_VERSION) > 0 ? manifest.value.app : null
})

export const newRoutineToAnnounce = computed(() => {
  const r = routine.value
  if (!r) return null
  return r.month !== state.data.lastSeenRoutineMonth ? r : null
})

export function markRoutineSeen () {
  state.data.lastSeenRoutineMonth = routine.value?.month || null
  persist()
}

function fail (kind, message) {
  const e = new Error(message)
  e.kind = kind
  return e
}

async function getJSON (url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  let res
  try {
    res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', signal: ctrl.signal })
  } catch {
    // No connection, or it took too long (weak signal)
    throw fail('offline', t('No connection'))
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw fail('server', t('GitHub answered {code}', { code: res.status }))
  try { return await res.json() } catch { throw fail('data', t('A routine file is damaged: {file}', { file: url.split('/').pop().split('?')[0] })) }
}

let refreshing = null
/** Download latest.json, this month's routine and the exercise list. One run at a time. */
export function refreshRoutines () {
  if (refreshing) return refreshing
  refreshing = doRefresh().finally(() => { refreshing = null })
  return refreshing
}

/** Check again if the last try failed or was a while ago (on reopening the app, reconnecting, every few hours). */
export function autoRefresh () {
  const st = state.routineStatus
  const last = st.lastAttempt ? Date.now() - new Date(st.lastAttempt).getTime() : Infinity
  if (st.error ? last > 30 * 1000 : last > 2 * 3600 * 1000) refreshRoutines()
}

async function doRefresh () {
  const st = state.routineStatus
  st.loading = true
  st.lastAttempt = new Date().toISOString()
  try {
    const base = routinesUrl.value
    const man = await getJSON(base + 'latest.json')
    // The manifest alone is enough to know about app updates, even if the rest fails
    state.data.cache.manifest = man
    const entry = pickActiveRoutine(man.routines)
    if (!entry) throw fail('data', t('latest.json has no routine in effect yet.'))
    const [rt, ex] = await Promise.all([
      getJSON(base + entry.file),
      getJSON(base + (man.exercisesFile || 'exercises.json'))
    ])
    if ((rt.schemaVersion || 1) > SUPPORTED_ROUTINE_SCHEMA || (ex.schemaVersion || 1) > SUPPORTED_ROUTINE_SCHEMA) {
      throw fail('data', t('This routine needs a newer app version. Check for an app update.'))
    }
    if (!Array.isArray(rt.days) || !rt.days.length) throw fail('data', t('Routine file has no days.'))

    const prevMonth = state.data.cache.routine?.month
    state.data.cache = { manifest: man, routine: rt, exercises: ex, fetchedAt: new Date().toISOString() }
    state.data.routineArchive[rt.month] = rt
    // New month → start the rotation again from the first day
    if (prevMonth && prevMonth !== rt.month) state.data.nextDayKey = null
    reconcileEdits()
    st.error = null
    st.errorKind = null
    await persist()
  } catch (e) {
    st.error = e.message || String(e)
    st.errorKind = e.kind || 'data'
  } finally {
    st.loading = false
  }
}

/**
 * Only worth mentioning on Home when the saved routine might really be out of date:
 * older than a week, or from an earlier month (a new month's routine may be waiting).
 */
export const routineWarning = computed(() => {
  const st = state.routineStatus
  if (!st.error || st.loading || !routine.value) return null
  const fetched = state.data.cache.fetchedAt
  const old = !fetched || Date.now() - new Date(fetched).getTime() > 7 * 86400000
  const newMonth = routine.value.month < state.today.slice(0, 7)
  return old || newMonth ? { kind: st.errorKind, fetchedAt: fetched } : null
})

// ── Sessions ─────────────────────────────────────────────

export const finishedSessions = computed(() =>
  state.data.sessions.filter(s => s.finishedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
)

export const activeSession = computed(() =>
  state.data.sessions.find(s => s.id === state.data.activeSessionId) || null
)

export function getSession (id) {
  return state.data.sessions.find(s => s.id === id) || null
}

/** Finished sessions that include this exercise, newest first, with only its sets. */
export function historyFor (exerciseId, excludeSessionId = null) {
  const out = []
  for (const s of finishedSessions.value) {
    if (s.id === excludeSessionId) continue
    const sets = s.sets.filter(x => x.exerciseId === exerciseId)
    if (sets.length) out.push({ date: s.startedAt, sessionId: s.id, sets })
  }
  return out
}

export function suggestionFor (item, sessionId = null) {
  const session = sessionId ? getSession(sessionId) : null
  const plan = session ? (session.plan || {}) : todayPlan.value
  let factor = plan.loadFactor ?? 1
  let reason = plan.deload ? t('Deload week') : ''
  if (session?.easy) { factor *= 0.9; reason = reason ? t('{a}, lighter day', { a: reason }) : t('Lighter day') }
  return suggestNext({
    item,
    exercise: exercisesById.value[item.exerciseId],
    history: historyFor(item.exerciseId, sessionId),
    profile: state.data.profile,
    loadFactor: factor,
    reason
  })
}

// Your own days don't follow the repo's week plan (deload weeks, reps in reserve)
const OWN_PLAN = { week: 1, rir: null, focus: '', deload: false, setDelta: 0, loadFactor: 1, applyTo: 'all', source: null }

/** Start a day by key (or by its position in this month's days). */
export function startSession (keyOrIndex) {
  if (activeSession.value) return activeSession.value.id
  const key = typeof keyOrIndex === 'number' ? days.value[keyOrIndex]?.key : keyOrIndex
  const day = key ? findDay(key) : null
  if (!day) return null
  const idx = dayIndexOf(key)
  const plan = day.source === 'routine' ? { ...todayPlan.value } : { ...OWN_PLAN }
  const session = {
    id: uid(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    routineMonth: routine.value?.month || null,
    dayIndex: idx >= 0 ? idx : 0,
    dayKey: key,
    source: day.source,
    planId: day.planId || null,
    dayId: day.id,
    dayName: day.name,
    dayNameEs: day.es?.name || null,
    items: day.items.map((raw, i) => {
      const it = trackItem(plain(raw))
      delete it.added // added by your changes to the day, not during this workout
      delete it.swappedFrom
      return {
        ...it,
        sets: plannedSetsFor(it, i, plan),
        routineSets: it.sets,
        originalExerciseId: it.exerciseId
      }
    }),
    plan,
    sets: [],
    notes: ''
  }
  // "Next workout only" swaps picked on the day's screen. They show up as normal workout changes,
  // so the finish screen still asks whether to keep them.
  const once = state.data.oneTimeSwaps?.[key]
  if (once) {
    for (const it of session.items) {
      const sw = it.ref && once[it.ref]
      if (sw && sw.from === it.exerciseId && exercisesById.value[sw.to]) it.exerciseId = sw.to
    }
    delete state.data.oneTimeSwaps[key]
  }
  state.data.sessions.push(session)
  state.data.activeSessionId = session.id
  persist()
  emit('started', { session })
  return session.id
}

/** Ad-hoc session (e.g. a PT session) — starts empty, you add exercises yourself. */
export function startFreeSession (name = t('Free session')) {
  if (activeSession.value) return activeSession.value.id
  const session = {
    id: uid(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    routineMonth: routine.value?.month || null,
    dayIndex: null,
    dayId: 'free',
    source: 'free',
    dayName: name,
    items: [],
    sets: [],
    notes: ''
  }
  state.data.sessions.push(session)
  state.data.activeSessionId = session.id
  persist()
  emit('started', { session })
  return session.id
}

export function addItemToSession (sessionId, exerciseId) {
  const s = getSession(sessionId)
  if (!s) return
  const ex = exercisesById.value[exerciseId]
  const item = ex?.logType === 'time'
    ? { exerciseId, originalExerciseId: exerciseId, sets: 3, durationSec: [30, 45], restSec: 60, added: true }
    : { exerciseId, originalExerciseId: exerciseId, sets: 3, repRange: [8, 12], restSec: 90, added: true }
  s.items.push(item)
  persist()
}

export function logSet (sessionId, set) {
  const s = getSession(sessionId)
  if (!s) return null
  const row = { id: uid(), ts: new Date().toISOString(), ...set }
  s.sets.push(row)
  persist()
  return row
}

export function updateSet (sessionId, setId, patch) {
  const s = getSession(sessionId)
  const row = s?.sets.find(x => x.id === setId)
  if (!row) return
  Object.assign(row, patch)
  persist()
}

export function deleteSet (sessionId, setId) {
  const s = getSession(sessionId)
  if (!s) return
  s.sets = toRaw(s.sets).filter(x => x.id !== setId)
  persist()
}

export function swapExercise (sessionId, itemIndex, newExerciseId) {
  const s = getSession(sessionId)
  if (!s || !s.items[itemIndex]) return
  // Drop sets already logged for the old exercise in this slot
  const oldId = s.items[itemIndex].exerciseId
  s.sets = toRaw(s.sets).filter(x => !(x.itemIndex === itemIndex && x.exerciseId === oldId))
  s.items[itemIndex].exerciseId = newExerciseId
  persist()
}

/** "Rough day": ~10% lighter suggestions and one set fewer on exercises you haven't started. */
export function setEasyDay (sessionId, on) {
  const s = getSession(sessionId)
  if (!s) return
  s.easy = on
  s.items.forEach((it, i) => {
    const started = s.sets.some(x => x.itemIndex === i)
    if (started) return
    const planned = (it.sets || 1) + (it.extraSets || 0) - (it.removedSets || 0)
    if (on && planned > 1) { it.removedSets = (it.removedSets || 0) + 1; it.easyRemoved = true }
    if (!on && it.easyRemoved) { it.removedSets = Math.max(0, (it.removedSets || 0) - 1); it.easyRemoved = false }
  })
  persist()
}

export function setMachineSettings (exerciseId, rows) {
  const clean = rows.map(r => ({ label: r.label.trim(), value: String(r.value ?? '').trim() })).filter(r => r.label && r.value)
  if (clean.length) state.data.machineSettings[exerciseId] = clean
  else delete state.data.machineSettings[exerciseId]
  persist()
}

export function finishSession (sessionId, rating = null) {
  const s = getSession(sessionId)
  if (!s) return null
  if (rating && (rating.effort || rating.energy)) s.rating = rating
  s.finishedAt = new Date().toISOString()
  // Next in the rotation: the day after this one (workouts started before 0.5 have no key)
  const key = s.dayKey || (s.dayIndex != null && s.dayId !== 'free' ? `r-${s.dayId}` : null)
  const i = key ? dayIndexOf(key) : -1
  if (i >= 0 && days.value.length) state.data.nextDayKey = days.value[(i + 1) % days.value.length].key
  const firstFinish = !s.postedAt
  if (state.data.activeSessionId === sessionId) state.data.activeSessionId = null
  checkGoals()
  persist()
  emit('finished', { session: s, firstFinish })
  return s
}

/** After editing a finished workout: refresh what other modules derived from it (crew post). */
export function markSessionEdited (sessionId) {
  const s = getSession(sessionId)
  if (s?.finishedAt) emit('finished', { session: s, edited: true })
}

export function discardSession (sessionId) {
  const wasActive = state.data.activeSessionId === sessionId
  state.data.sessions = toRaw(state.data.sessions).filter(s => s.id !== sessionId)
  if (wasActive) state.data.activeSessionId = null
  persist()
  if (wasActive) emit('discarded', { sessionId })
}

export function deleteSession (sessionId) {
  const s = getSession(sessionId)
  discardSession(sessionId)
  if (s?.finishedAt) emit('deleted', { session: s })
}

export function sessionSummary (session) {
  const unit = state.data.profile.unit
  const previous = finishedSessions.value.filter(s => s.id !== session.id && s.startedAt < session.startedAt)
  const mins = session.finishedAt
    ? Math.max(0, (new Date(session.finishedAt) - new Date(session.startedAt)) / 60000)
    : null
  return {
    minutes: mins,
    sets: session.sets.length,
    volume: sessionVolume(session, unit),
    unit,
    prs: detectPRs(session, previous, unit),
    exercises: [...new Set(session.sets.map(s => s.exerciseId))]
  }
}

export function setExerciseNote (exerciseId, text) {
  state.data.exerciseNotes[exerciseId] = text
  persist()
}

// ── Backup ───────────────────────────────────────────────

export function exportJSON () {
  const data = plain(state.data)
  data.exportedAt = new Date().toISOString()
  data.exportedBy = `Gym Crew ${APP_VERSION}`
  return JSON.stringify(data, null, 2)
}

export function markBackedUp () {
  state.data.lastBackupAt = new Date().toISOString()
  persist()
}

export function importJSON (text) {
  const data = parseBackup(text)
  // Keep this device's routine settings; take everything else from the backup
  data.settings.routinesUrl = state.data.settings.routinesUrl
  // Don't greet a restore with last month's report popup; it's still in Progress → Reports
  const thisMonth = dateKey().slice(0, 7)
  for (const s of data.sessions) {
    const m = dateKey(s.startedAt).slice(0, 7)
    if (s.finishedAt && m < thisMonth) data.reportsSeen[m] = true
  }
  state.data = data
  return persist()
}

export const daysSinceBackup = computed(() => {
  const t = state.data.lastBackupAt
  if (!t) return null
  return Math.floor((Date.now() - new Date(t)) / 86400000)
})

export const todayKey = () => dateKey()

// ── Body: weight, measurements, progress photos ──────────

export const MEASUREMENTS = ['waist', 'neck', 'chest', 'arm', 'thigh', 'hips']

export function saveBodyEntry (entry) {
  const list = state.data.body.entries
  const clean = { ...entry }
  for (const k of ['weight', 'bodyFat', ...MEASUREMENTS]) {
    clean[k] = clean[k] == null || clean[k] === '' || !isFinite(clean[k]) ? null : Number(clean[k])
  }
  if (!clean.id) clean.id = uid()
  const i = list.findIndex(e => e.id === clean.id)
  if (i >= 0) list[i] = clean
  else list.push(clean)
  list.sort((a, b) => a.date.localeCompare(b.date))
  // Keep the profile's bodyweight in step with the newest weigh-in (used for bodyweight exercises)
  const latest = [...list].reverse().find(e => e.weight != null)
  if (latest && latest.unit === state.data.profile.unit) state.data.profile.bodyweight = latest.weight
  const reached = checkGoals()
  persist()
  return { ...clean, reached }
}

export function deleteBodyEntry (id) {
  state.data.body.entries = toRaw(state.data.body.entries).filter(e => e.id !== id)
  persist()
}

export function addPhotoRecord (rec) {
  state.data.body.photos.push({ id: rec.id || uid(), ...rec })
  state.data.body.photos.sort((a, b) => a.date.localeCompare(b.date))
  persist()
}

export function removePhotoRecord (id) {
  state.data.body.photos = toRaw(state.data.body.photos).filter(p => p.id !== id)
  persist()
}

export const newId = uid

// ── Your changes to this month's days ────────────────────

/** Check your changes against a new month's routine (same workout → carry them over; different → ask). */
export function reconcileEdits () {
  const rt = routine.value
  if (!rt?.days) return
  let changed = false
  for (const [dayId, e] of Object.entries(state.data.routineEdits)) {
    if (e.pending?.month === rt.month) continue
    const newDay = rt.days.find(d => d.id === dayId)
    const r = reconcileEdit(plain(e), newDay, rt.month)
    if (r.kind === 'same') continue
    changed = true
    if (r.kind === 'rebase') {
      const skip = new Set(r.skipped.map(o => JSON.stringify(o)))
      e.ops = plain(e.ops).filter(o => !skip.has(JSON.stringify(o)))
      if (r.skipped.length) state.data.editNotices.push({ dayId, month: rt.month, skipped: r.skipped.length, name: newDay.name, nameEs: newDay.es?.name || null })
      e.base = snapshotDay(plain(newDay))
      e.baseMonth = rt.month
      e.pending = null
      if (!e.ops.length) delete state.data.routineEdits[dayId]
    } else {
      e.pending = { month: rt.month, kind: r.kind, toName: newDay?.name || null, toNameEs: newDay?.es?.name || null }
    }
  }
  if (changed) persist()
}

/** Days whose changes are waiting for a decision because the repo changed the workout. */
export const pendingDayChanges = computed(() => Object.entries(state.data.routineEdits)
  .filter(([, e]) => e.pending && e.pending.month === routine.value?.month)
  .map(([dayId, e]) => ({ dayId, ...e.pending, fromName: e.base?.name, fromNameEs: e.base?.es?.name, baseMonth: e.baseMonth, count: e.ops.length })))

export function routineEdit (dayId) {
  return state.data.routineEdits[dayId] || null
}

/** Change a repo day: fn receives the current edit list and returns the new one. */
export function changeRoutineDay (dayId, fn) {
  const rt = routine.value
  const day = rt?.days.find(d => d.id === dayId)
  if (!day) return
  let e = state.data.routineEdits[dayId]
  if (!e || e.pending || e.baseMonth !== rt.month) {
    state.data.routineEdits[dayId] = { baseMonth: rt.month, base: snapshotDay(plain(day)), ops: [], pending: null }
    e = state.data.routineEdits[dayId]
  }
  e.ops = fn(plain(e.ops))
  e.updatedAt = new Date().toISOString()
  if (!e.ops.length) delete state.data.routineEdits[dayId]
  persist()
}

export function undoRoutineEdit (dayId, index) {
  changeRoutineDay(dayId, ops => {
    const op = ops[index]
    // Undoing an added exercise also drops the moves and changes made to it
    if (op?.op === 'add') return ops.filter((o, i) => i !== index && o.ref !== op.ref)
    return ops.filter((_, i) => i !== index)
  })
}

export function resetRoutineDay (dayId) {
  delete state.data.routineEdits[dayId]
  persist()
}

/**
 * The repo changed a day you'd adjusted.
 *   mine: save the old version (with your changes) to My routines · fit: keep the changes that still apply · drop
 */
export function resolveDayChange (dayId, choice, planName = '') {
  const e = state.data.routineEdits[dayId]
  if (!e) return null
  let plan = null
  if (choice === 'mine') {
    const old = editedOldDay(plain(e), state.data.profile.level)
    plan = planFromDays(planName || old.name, [old], { kind: 'day', month: e.baseMonth, dayId })
    state.data.plans.push(plan)
    delete state.data.routineEdits[dayId]
  } else if (choice === 'fit') {
    const rt = routine.value
    const newDay = rt?.days.find(d => d.id === dayId)
    if (!newDay) delete state.data.routineEdits[dayId]
    else {
      const { skipped } = applyEdits(withRefs(newDay.items), plain(e.ops))
      const skip = new Set(skipped.map(o => JSON.stringify(o)))
      e.ops = plain(e.ops).filter(o => !skip.has(JSON.stringify(o)))
      e.base = snapshotDay(plain(newDay))
      e.baseMonth = rt.month
      e.pending = null
      if (!e.ops.length) delete state.data.routineEdits[dayId]
    }
  } else delete state.data.routineEdits[dayId]
  persist()
  return plan
}

export function dismissEditNotice () {
  state.data.editNotices.shift()
  persist()
}

// ── Exercises your gym can't do ──────────────────────────

/** Days with exercises that need equipment switched off in Settings, Your gym: { [dayKey]: [{ ref, index, exerciseId }] } */
export const gymGaps = computed(() => {
  const eq = state.data.settings.equipment || {}
  if (!Object.values(eq).some(v => v === false)) return {}
  const out = {}
  for (const d of days.value) {
    const once = state.data.oneTimeSwaps?.[d.key] || {}
    const list = d.items
      .map((it, index) => ({ ref: it.ref, index, exerciseId: it.exerciseId }))
      .filter(x => !canDoAtGym(exercisesById.value[x.exerciseId], eq) && once[x.ref]?.from !== x.exerciseId)
    if (list.length) out[d.key] = list
  }
  return out
})

/** How many workouts each exercise was in, for ordering suggestions. */
export const exerciseUsage = computed(() => {
  const out = {}
  for (const s of finishedSessions.value) for (const id of new Set(s.sets.map(x => x.exerciseId))) out[id] = (out[id] || 0) + 1
  return out
})

/**
 * Swap an exercise in one of this month's days.
 *   how: 'once' (only the next workout of this day) or 'always' (a change to the day, shown as Edited)
 */
export function swapInDay (dayKey, ref, toId, how) {
  const d = findDay(dayKey)
  const it = d?.items.find(x => x.ref === ref)
  if (!it || !toId) return false
  if (how === 'once') {
    if (!state.data.oneTimeSwaps) state.data.oneTimeSwaps = {}
    state.data.oneTimeSwaps[dayKey] = { ...(state.data.oneTimeSwaps[dayKey] || {}), [ref]: { from: it.exerciseId, to: toId } }
    persist()
    return true
  }
  clearOneTimeSwap(dayKey, ref)
  if (d.source === 'routine') {
    changeRoutineDay(d.id, ops => opSwap(ops, ref, toId))
  } else if (d.source === 'mine') {
    const pd = planById(d.planId)?.days.find(x => x.id === d.planDayId)
    if (!pd) return false
    applyChangesToPlanDay(pd, [{ kind: 'swap', ref, to: toId }])
    persist()
  } else return false
  return true
}

export function clearOneTimeSwap (dayKey, ref) {
  const m = state.data.oneTimeSwaps?.[dayKey]
  if (!m?.[ref]) return
  delete m[ref]
  if (!Object.keys(m).length) delete state.data.oneTimeSwaps[dayKey]
  persist()
}

// ── My routines ──────────────────────────────────────────

export const planById = (id) => state.data.plans.find(p => p.id === id) || null
export const isPlanActive = (p) => planActive(p, state.today)

function addPlan (plan) {
  state.data.plans.push(plan)
  persist()
  return planById(plan.id)
}

/** Save one of this month's days (as you do it now, with your changes) to My routines. */
export function saveDayAsMine (key, name) {
  const d = findDay(key)
  if (!d) return null
  return addPlan(planFromDays(name, [plain(d)], { kind: 'day', month: routine.value?.month || null, dayId: d.id }))
}

/** Keep a copy of this month's whole routine (with your changes). */
export function copyMonthToMine (name) {
  const r = buildDays({ routine: routine.value, level: state.data.profile.level, edits: state.data.routineEdits, today: state.today })
  if (!r.length) return null
  return addPlan(planFromDays(name, plain(r), { kind: 'month', month: routine.value.month }))
}

/** A badge letter not taken by this month's days or the plan's other days (E after A–D). */
export function freeDayLetter (plan = null) {
  const used = new Set([...days.value.map(d => d.id), ...(routine.value?.days || []).map(d => d.id), ...(plan?.days || []).map(d => d.label)])
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !used.has(l)) || '•'
}

export function newPlan (name, firstDay = { label: 'E', name: '', items: [] }) {
  return addPlan(planFromDays(name, [firstDay], { kind: 'new' }))
}

export function addPlanDay (planId, day) {
  const p = planById(planId)
  if (!p) return null
  const d = planFromDays('', [day]).days[0]
  p.days.push(d)
  persist()
  return d
}

export function deletePlanDay (planId, dayId) {
  const p = planById(planId)
  if (!p) return
  p.days = plain(p.days).filter(d => d.id !== dayId)
  persist()
}

/** Use a plan: { mode: 'add'|'replace', until: 'month'|'date'|'forever', weeks, endsOn }. */
export function usePlan (planId, opts) {
  const p = planById(planId)
  if (!p) return
  p.use = makeUse(opts, state.today)
  p.lastUse = { mode: opts.mode, until: opts.until, weeks: opts.weeks || null }
  state.data.planNotices = state.data.planNotices.filter(id => id !== planId)
  persist()
}

export function stopPlan (planId) {
  const p = planById(planId)
  if (!p) return
  p.use = null
  persist()
}

/** Back to this month's routine: plans that replaced it go back to My routines (nothing is deleted). */
export function restoreRoutine () {
  for (const p of state.data.plans) if (planActive(p, state.today) && p.use.mode === 'replace') p.use = null
  persist()
}

export function deletePlan (planId) {
  state.data.plans = plain(state.data.plans).filter(p => p.id !== planId)
  state.data.planNotices = state.data.planNotices.filter(id => id !== planId)
  persist()
}

/**
 * A plan (or one workout) copied from a crewmate. Their own exercises come too; if you already have one
 * with the same id but it's a different exercise, theirs gets a new id.
 * @param {{ name, days: [{ label, name, items }], customs?: object[], from?: object }} p
 */
export function importCrewPlan ({ name, notes = '', days, customs = [], from = null }) {
  const map = {}
  const mine = state.data.customExercises
  for (const c of customs || []) {
    if (!c?.id || !c.name) continue
    const have = mine.find(e => e.id === c.id)
    if (have && have.name.trim().toLowerCase() === c.name.trim().toLowerCase()) {
      if (have.hidden) have.hidden = false
      continue
    }
    if (exercisesById.value[c.id] && !have) continue // it's in the library after all
    const id = have ? 'my-' + rid() : c.id
    map[c.id] = id
    mine.push({ ...plain(c), id, from: 'crew' })
  }
  const plan = planFromDays(name, days.map(d => ({
    ...d,
    items: (d.items || []).filter(it => it?.exerciseId).map(it => ({ ...it, exerciseId: map[it.exerciseId] || it.exerciseId }))
  })), from)
  if (notes) plan.notes = notes
  return addPlan(plan)
}

export function duplicatePlan (planId, name) {
  const p = planById(planId)
  if (!p) return null
  return addPlan(planFromDays(name, plain(p.days), { kind: 'copy', planId }))
}

/** Plans whose time ran out go back to My routines; mention it once. */
export function expirePlans () {
  let changed = false
  for (const p of state.data.plans) {
    if (planExpired(p, state.today)) {
      p.lastUse = { ...(p.lastUse || {}), mode: p.use.mode, until: p.use.until }
      p.use = null
      if (!state.data.planNotices.includes(p.id)) state.data.planNotices.push(p.id)
      changed = true
    }
  }
  if (changed) persist()
}

export function dismissPlanNotices () {
  state.data.planNotices = []
  persist()
}

// ── "Keep these changes?" after a workout ────────────────

export function workoutChanges (session) {
  if (!session || session.changesHandled) return []
  return sessionChanges(plain(session))
}

/**
 * how: 'always' (this day from now on) or 'mine' (save as a day in My routines). Returns the new plan for 'mine'.
 */
export function keepWorkoutChanges (sessionId, how, name = '') {
  const s = getSession(sessionId)
  if (!s) return null
  const changes = sessionChanges(plain(s))
  let plan = null
  if (how === 'always') {
    if (s.source === 'mine') {
      const k = parseKey(s.dayKey)
      const d = planById(k?.planId)?.days.find(x => x.id === k.dayId)
      if (d) applyChangesToPlanDay(d, changes)
    } else if (s.source !== 'free' && s.routineMonth === routine.value?.month) {
      changeRoutineDay(s.dayId, ops => changesToOps(ops, changes))
    }
  } else if (how === 'mine') {
    if (s.source === 'free' || !s.dayKey) {
      plan = planFromDays(name, [{ ...dayFromSession(plain(s), name), label: freeDayLetter() }], { kind: 'session' })
    } else {
      // The day as it was, with the workout's changes on top
      const d = findDay(s.dayKey)
      if (d) {
        plan = planFromDays(name, [plain(d)], { kind: 'day', month: routine.value?.month || null, dayId: d.id })
        const pd = plan.days[0]
        const idOf = {}
        d.items.forEach((it, i) => { if (pd.items[i]) idOf[it.ref] = 'm:' + pd.items[i].id })
        const mapped = changes.map(c => ({ ...c, ref: c.ref ? idOf[c.ref] : c.ref, after: c.after?.ref ? { ...c.after, ref: idOf[c.after.ref] } : c.after }))
        applyChangesToPlanDay(pd, mapped)
      } else plan = planFromDays(name, [{ ...dayFromSession(plain(s), name), label: freeDayLetter() }], { kind: 'session' })
    }
    state.data.plans.push(plan)
  }
  s.changesHandled = how
  persist()
  return plan ? planById(plan.id) : null
}

// ── Your own exercises ───────────────────────────────────

export function saveCustomExercise (ex) {
  const list = state.data.customExercises
  const clean = plain(ex)
  if (!clean.id) clean.id = 'my-' + rid()
  const i = list.findIndex(e => e.id === clean.id)
  if (i >= 0) list[i] = clean
  else list.push(clean)
  persist()
  return clean.id
}

/** "Delete" hides it: workouts and records that used it keep its name. */
export function hideCustomExercise (id, hidden = true) {
  const ex = state.data.customExercises.find(e => e.id === id)
  if (!ex) return
  ex.hidden = hidden
  persist()
}

// ── Goals ────────────────────────────────────────────────

export const goalCtx = computed(() => ({
  sessions: state.data.sessions,
  entries: state.data.body.entries,
  profile: state.data.profile,
  lifts: state.data.settings.lifts,
  plBasis: state.data.settings.plBasis,
  today: new Date(state.today + 'T12:00:00')
}))

export const goalsWithProgress = computed(() => state.data.goals
  .filter(g => !g.archived)
  .map(g => ({ goal: g, p: goalProgress(g, goalCtx.value) })))

export function saveGoal (goal) {
  const list = state.data.goals
  const clean = plain(goal)
  if (!clean.id) { clean.id = rid(); clean.createdAt = new Date().toISOString() }
  if (clean.pinned == null) clean.pinned = list.filter(g => g.pinned && !g.doneAt).length < 2
  // Only one "workouts per week" goal at a time
  if (clean.type === 'weekly') state.data.goals = plain(list).filter(g => g.type !== 'weekly' || g.id === clean.id)
  const l = state.data.goals
  const i = l.findIndex(g => g.id === clean.id)
  if (i >= 0) l[i] = clean
  else l.push(clean)
  checkGoals()
  persist()
  return clean.id
}

export function deleteGoal (id) {
  state.data.goals = plain(state.data.goals).filter(g => g.id !== id)
  persist()
}

/** Mark goals you've just reached. Returns them (for a celebration). */
export function checkGoals () {
  const reached = []
  for (const g of state.data.goals) {
    if (g.doneAt || g.archived || g.type === 'weekly') continue
    if (goalProgress(g, goalCtx.value).done) {
      g.doneAt = new Date().toISOString()
      reached.push(g)
    }
  }
  return reached
}
