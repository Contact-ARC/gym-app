// App-wide state. Small enough that a reactive object beats pulling in Pinia.
import { reactive, computed, toRaw } from 'vue'
import { loadData, saveData, emptyData, parseBackup } from './lib/storage.js'
import { DEFAULT_ROUTINES_URL, SUPPORTED_ROUTINE_SCHEMA, APP_VERSION } from './config.js'
import { pickActiveRoutine, compareVersions, dateKey, suggestNext, detectPRs, sessionVolume, resolvePlan, plannedSetsFor } from './lib/training.js'

export const state = reactive({
  ready: false,
  data: emptyData(),
  routineStatus: { loading: false, error: null, lastAttempt: null },
  today: dateKey() // refreshed when the app comes back to the foreground
})

export function touchToday () {
  const k = dateKey()
  if (k !== state.today) state.today = k
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) touchToday() })
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export function persist () {
  return saveData(structuredClone(toRaw(state.data)))
}

export async function initStore () {
  state.data = await loadData()
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
export const exercisesById = computed(() => {
  const map = {}
  for (const ex of state.data.cache.exercises?.exercises || []) map[ex.id] = ex
  return map
})
export const days = computed(() => routine.value?.days || [])

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
  return /^https?:/.test(path) ? path : routinesUrl.value + path
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

async function getJSON (url) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.json()
}

export async function refreshRoutines () {
  const st = state.routineStatus
  st.loading = true
  st.error = null
  st.lastAttempt = new Date().toISOString()
  try {
    const base = routinesUrl.value
    const man = await getJSON(base + 'latest.json')
    const entry = pickActiveRoutine(man.routines)
    if (!entry) throw new Error('latest.json has no routine in effect yet.')
    const [rt, ex] = await Promise.all([
      getJSON(base + entry.file),
      getJSON(base + (man.exercisesFile || 'exercises.json'))
    ])
    if ((rt.schemaVersion || 1) > SUPPORTED_ROUTINE_SCHEMA || (ex.schemaVersion || 1) > SUPPORTED_ROUTINE_SCHEMA) {
      throw new Error('This routine needs a newer app version. Check for an app update.')
    }
    if (!Array.isArray(rt.days) || !rt.days.length) throw new Error('Routine file has no days.')

    const prevMonth = state.data.cache.routine?.month
    state.data.cache = { manifest: man, routine: rt, exercises: ex, fetchedAt: new Date().toISOString() }
    state.data.routineArchive[rt.month] = rt
    // New month → start the A/B/C rotation again from Day A
    if (prevMonth && prevMonth !== rt.month) state.data.nextDayIndex = 0
    if (state.data.nextDayIndex >= rt.days.length) state.data.nextDayIndex = 0
    await persist()
  } catch (e) {
    st.error = e.message || String(e)
  } finally {
    st.loading = false
  }
}

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
  let reason = plan.deload ? 'Deload week' : ''
  if (session?.easy) { factor *= 0.9; reason = reason ? `${reason}, lighter day` : 'Lighter day' }
  return suggestNext({
    item,
    exercise: exercisesById.value[item.exerciseId],
    history: historyFor(item.exerciseId, sessionId),
    profile: state.data.profile,
    loadFactor: factor,
    reason
  })
}

export function startSession (dayIndex) {
  if (activeSession.value) return activeSession.value.id
  const day = days.value[dayIndex]
  if (!day) return null
  const session = {
    id: uid(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    routineMonth: routine.value?.month || null,
    dayIndex,
    dayId: day.id,
    dayName: day.name,
    items: day.items.map((it, i) => ({
      ...structuredClone(toRaw(it)),
      sets: plannedSetsFor(it, i, todayPlan.value),
      routineSets: it.sets,
      originalExerciseId: it.exerciseId
    })),
    plan: { ...todayPlan.value },
    sets: [],
    notes: ''
  }
  state.data.sessions.push(session)
  state.data.activeSessionId = session.id
  persist()
  return session.id
}

/** Ad-hoc session (e.g. a PT session) — starts empty, you add exercises yourself. */
export function startFreeSession (name = 'Free session') {
  if (activeSession.value) return activeSession.value.id
  const session = {
    id: uid(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    routineMonth: routine.value?.month || null,
    dayIndex: null,
    dayId: 'free',
    dayName: name,
    items: [],
    sets: [],
    notes: ''
  }
  state.data.sessions.push(session)
  state.data.activeSessionId = session.id
  persist()
  return session.id
}

export function addItemToSession (sessionId, exerciseId) {
  const s = getSession(sessionId)
  if (!s) return
  const ex = exercisesById.value[exerciseId]
  const item = ex?.logType === 'time'
    ? { exerciseId, originalExerciseId: exerciseId, sets: 3, durationSec: [30, 45], restSec: 60 }
    : { exerciseId, originalExerciseId: exerciseId, sets: 3, repRange: [8, 12], restSec: 90 }
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
  s.sets = s.sets.filter(x => x.id !== setId)
  persist()
}

export function swapExercise (sessionId, itemIndex, newExerciseId) {
  const s = getSession(sessionId)
  if (!s || !s.items[itemIndex]) return
  // Drop sets already logged for the old exercise in this slot
  const oldId = s.items[itemIndex].exerciseId
  s.sets = s.sets.filter(x => !(x.itemIndex === itemIndex && x.exerciseId === oldId))
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
  if (s.dayIndex != null && days.value.length) {
    state.data.nextDayIndex = (s.dayIndex + 1) % days.value.length
  }
  if (state.data.activeSessionId === sessionId) state.data.activeSessionId = null
  persist()
  return s
}

export function discardSession (sessionId) {
  state.data.sessions = state.data.sessions.filter(s => s.id !== sessionId)
  if (state.data.activeSessionId === sessionId) state.data.activeSessionId = null
  persist()
}

export function deleteSession (sessionId) {
  discardSession(sessionId)
}

export function sessionSummary (session) {
  const unit = state.data.profile.unit
  const previous = finishedSessions.value.filter(s => s.id !== session.id && s.startedAt < session.startedAt)
  const mins = session.finishedAt
    ? Math.round((new Date(session.finishedAt) - new Date(session.startedAt)) / 60000)
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
  const data = structuredClone(toRaw(state.data))
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
  state.data = data
  return persist()
}

export const daysSinceBackup = computed(() => {
  const t = state.data.lastBackupAt
  if (!t) return null
  return Math.floor((Date.now() - new Date(t)) / 86400000)
})

export const todayKey = () => dateKey()
