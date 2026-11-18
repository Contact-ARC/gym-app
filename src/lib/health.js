// Health Connect (0.13): your workouts and body log out to Health Connect, and from it: heart rate during
// workouts (from a watch), weigh-ins from other apps (a smart scale, Samsung Health…) and daily steps.
//
// The native side is HealthBridgePlugin.kt. Health Connect is per phone, so what's below lives in
// state.data.health on this phone only (it isn't saved to the account; every phone connects for itself).
// Writing compares what there is now with what was last written (healthRecords.js), so it only sends
// changes, and deletes in Health Connect what was deleted here.
import { reactive, computed } from 'vue'
import { registerPlugin } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { state, persist, plain, onPersist, onDataReplaced, onSessionFinished, exercisesById, saveBodyEntry } from '../store.js'
import { isNative } from './native.js'
import { healthRecords, healthChanges, recordHash, importedEntries, otherWorkouts, sleepNights, dailyLatest, localDay } from './healthRecords.js'
import { t } from '../i18n/index.js'
import { backgroundBadges } from './myBadges.js'
import { badgeTitle } from '../ui/badgeUi.js'
import { toast, toastState } from '../ui/toast.js'

const Native = registerPlugin('HealthBridge')
function bridge () {
  if (import.meta.env.VITE_TEST_HOOKS && typeof window !== 'undefined' && window.__gymTestHealth) return window.__gymTestHealth
  return isNative ? Native : null
}

export const ALL_PERMISSIONS = [
  'write:exercise', 'write:distance', 'write:weight', 'write:bodyFat', 'write:height',
  'read:weight', 'read:bodyFat', 'read:heartRate', 'read:steps',
  'read:exercise', 'read:activeCalories', 'read:sleep', 'read:restingHeartRate', 'read:vo2max'
]
/** Permissions the app could use but this phone hasn't allowed (e.g. ones added in an update) */
export const missingPermissions = computed(() => ALL_PERMISSIONS.filter(p => !health.granted.includes(p)))

/** status: null (checking) | available | not_installed | update_required | unsupported | none (not Android) */
export const health = reactive({ status: null, granted: [], busy: false, error: null, lastRun: null })
export const healthSupported = computed(() => !!bridge())
const has = (key) => health.granted.includes(key)

function settings () {
  if (!state.data.health) {
    state.data.health = { on: false, workouts: true, body: true, read: true, written: {}, imported: [], ignored: [], hrTries: {}, steps: [], others: [], sleep: [], resting: [], vo2: [], lastBodyRead: null }
  }
  // 0.14: day-by-day history kept for the activity badges (the lists above are just the recent ones shown)
  const h = state.data.health
  if (!h.stepLog) h.stepLog = {}
  if (!h.sleepLog) h.sleepLog = {}
  if (!h.otherLog) h.otherLog = {}
  return h
}
export const healthSettings = computed(() => settings())
export const healthOn = computed(() => !!state.data.health?.on)

// ── Connecting ────────────────────────────────────────────
export async function refreshStatus () {
  const b = bridge()
  if (!b) { health.status = 'none'; return }
  try {
    const r = await b.status()
    health.status = r.status
    health.granted = r.granted || []
  } catch (e) {
    health.status = 'unsupported'
    health.error = String(e?.message || e)
  }
}

/** Health Connect's own permission screen, then the first sync (past workouts included) */
export async function connectHealth () {
  const b = bridge()
  if (!b) return
  health.busy = true
  health.error = null
  try {
    const r = await b.request({ permissions: ALL_PERMISSIONS })
    health.granted = r.granted || []
    if (!health.granted.length) return false
    const h = settings()
    h.on = true
    await persist()
    await runHealth()
    return true
  } catch (e) {
    health.error = String(e?.message || e)
    throw e
  } finally { health.busy = false }
}

/** Stop: Health Connect forgets the permissions. What was written there stays there (delete it in Health Connect). */
export async function disconnectHealth () {
  const b = bridge()
  const h = settings()
  try { await b?.revokeAll() } catch { /* already gone */ }
  h.on = false
  h.written = {}
  h.steps = []
  h.others = []
  h.sleep = []
  h.resting = []
  h.vo2 = []
  health.granted = []
  await persist()
}

export const openHealthSettings = () => bridge()?.openSettings()
export const openHealthStore = () => bridge()?.openStore()

// ── Keeping Health Connect in step ────────────────────────
let running = null
/** Write what changed, then read heart rate, steps and weigh-ins. Calls while one runs share it. */
export function runHealth () {
  if (!running) running = doRun().finally(() => { running = null })
  return running
}

// Saves made while a run is going (its own, or a weigh-in it adds) don't schedule another run
let inRun = false
async function doRun () {
  const b = bridge()
  const h = state.data.health
  if (!b || !h?.on) return
  inRun = true
  health.error = null
  const before = JSON.stringify(h)
  try {
    if (health.status !== 'available') await refreshStatus()
    if (health.status !== 'available') return
    await writeChanges(b, h)
    if (h.read) await readOthers(b, h)
    health.lastRun = Date.now()
  } catch (e) {
    health.error = String(e?.message || e)
  } finally {
    const fresh = backgroundBadges()
    if (JSON.stringify(h) !== before || touched || fresh.length) await persist()
    touched = false
    inRun = false
    if (fresh.length) announce(fresh)
  }
}

/** "New badge: Daily steps · Silver" (or "+2 more"), with a way to see them */
function announce (list) {
  const first = badgeTitle(list[0].id, list[0].level, 1, t, state.data.profile.unit)
  const text = list.length === 1 ? t('New badge: {b}', { b: first }) : t('New badges: {b} and {n} more', { b: first, n: list.length - 1 })
  const show = () => toast(text, { actionLabel: t('See'), action: () => import('../router.js').then(m => m.default.push('/badges')), ms: 6000 })
  // After any message already on screen (like "Connected to Health Connect", shown when the first run ends)
  setTimeout(() => (toastState.text ? setTimeout(show, 3600) : show()), 300)
}
let touched = false // a workout got its heart rate

async function writeChanges (b, h) {
  const wanted = healthRecords(plain({ sessions: state.data.sessions, body: state.data.body, profile: state.data.profile }), {
    workouts: h.workouts && has('write:exercise'),
    body: h.body,
    exercisesById: exercisesById.value,
    title: t('Workout')
  })
  // Only kinds switched on and allowed. Switching one off (or taking the permission away) leaves what was
  // written in Health Connect alone: it isn't treated as deleted.
  const NEED = { session: 'write:exercise', weight: 'write:weight', fat: 'write:bodyFat', height: 'write:height' }
  const active = (kind) => (kind === 'session' ? h.workouts : h.body) && has(NEED[kind])
  for (const [key, r] of [...wanted]) if (!active(r.kind)) wanted.delete(key)
  const written = Object.fromEntries(Object.entries(h.written).filter(([k]) => active(k.slice(0, k.indexOf(':')))))
  const { write, remove, blocked } = healthChanges(wanted, written)
  if (blocked) health.error = t('Most of your data was missing, so nothing was deleted from Health Connect.')
  for (let i = 0; i < write.length; i += 50) {
    const batch = write.slice(i, i + 50).map(r => (r.kind === 'height' ? { ...r, time: new Date().toISOString() } : r))
    const res = await b.write({ records: batch })
    const ok = new Set(res.written || [])
    for (const r of batch) {
      const key = `${r.kind}:${r.id}`
      if (ok.has(r.id)) h.written[key] = recordHash(wanted.get(key))
    }
    if (res.failed?.length) health.error = t("Some things couldn't be written to Health Connect: {e}", { e: res.failed[0].error })
  }
  if (remove.length) {
    await b.remove({ items: remove.map(({ kind, id }) => ({ kind, id })) })
    for (const r of remove) delete h.written[r.key]
  }
}

/** Keep a date- or id-keyed log to its newest `max` entries */
function trimLog (log, max) {
  const keys = Object.keys(log)
  if (keys.length <= max) return
  const order = keys.sort((a, b) => String(log[a]?.date || a).localeCompare(String(log[b]?.date || b)))
  for (const k of order.slice(0, keys.length - max)) delete log[k]
}

async function readOthers (b, h) {
  settings() // the 0.14 logs on a phone connected before them
  // Heart rate and active calories during recent workouts (a watch may sync a while after the workout)
  const wantHr = has('read:heartRate')
  const wantKcal = has('read:activeCalories')
  if (wantHr || wantKcal) {
    const now = Date.now()
    const missing = (s) => (wantHr && !s.hr) || (wantKcal && s.kcal == null)
    const recent = state.data.sessions.filter(s =>
      s.finishedAt && missing(s) && now - new Date(s.finishedAt) > 3 * 60000 && now - new Date(s.finishedAt) < 30 * 86400000 &&
      (h.hrTries[s.id] || 0) < 4
    ).slice(-30)
    if (recent.length) {
      const res = await b.heartRate({ windows: recent.map(s => ({ id: s.id, start: new Date(s.startedAt).toISOString(), end: new Date(s.finishedAt).toISOString() })) })
      const byId = new Map((res.results || []).map(r => [r.id, r]))
      for (const s of recent) {
        const r = byId.get(s.id)
        let found = false
        if (r?.avg && !s.hr) { s.hr = { avg: Math.round(r.avg), max: Math.round(r.max || r.avg) }; found = true }
        if (r?.kcal > 0 && s.kcal == null) { s.kcal = Math.round(r.kcal); found = true }
        if (found) touched = true
        if (missing(s)) h.hrTries[s.id] = (h.hrTries[s.id] || 0) + 1
        else delete h.hrTries[s.id]
      }
    }
  }
  // Workouts other apps or a watch recorded (shown in History)
  if (has('read:exercise')) {
    const since = new Date(Date.now() - 30 * 86400000)
    const res = await b.readWorkouts({ since: since.toISOString() })
    const list = otherWorkouts(res.workouts || [], state.data.sessions)
    h.others = list.slice(0, 60)
    // The log: what the last 30 days say now (deleted or merged ones drop out), older ones kept
    const from = localDay(since.toISOString())
    for (const [id, o] of Object.entries(h.otherLog)) if (o.date >= from) delete h.otherLog[id]
    for (const o of list) h.otherLog[o.id] = { date: o.date, minutes: o.minutes, type: o.type }
    trimLog(h.otherLog, 3000)
  } else h.others = []
  if (has('read:sleep')) {
    const days = Object.keys(h.sleepLog).length ? 8 : 30
    const res = await b.sleep({ since: new Date(Date.now() - days * 86400000).toISOString() })
    const nights = sleepNights(res.sessions || [])
    h.sleep = nights.slice(-7)
    for (const n of nights) h.sleepLog[n.date] = n.minutes
    trimLog(h.sleepLog, 800)
  } else h.sleep = []
  if (has('read:restingHeartRate') || has('read:vo2max')) {
    const res = await b.vitals({ since: new Date(Date.now() - 30 * 86400000).toISOString() })
    h.resting = dailyLatest(res.resting || [], 'bpm')
    h.vo2 = dailyLatest(res.vo2 || [], 'value').map(v => ({ ...v, value: Math.round(v.value * 10) / 10 }))
  } else { h.resting = []; h.vo2 = [] }
  if (has('read:steps')) {
    // The first time, the 30 days Health Connect lets an app see back; then the last week
    const res = await b.steps({ days: Object.keys(h.stepLog).length ? 7 : 30 })
    const list = (res.days || []).map(d => ({ date: d.date, count: Math.round(d.count) }))
    h.steps = list.slice(-7)
    for (const d of list) h.stepLog[d.date] = d.count
    trimLog(h.stepLog, 800)
  }
  if (has('read:weight') || has('read:bodyFat')) {
    const entries = state.data.body.entries
    const have = new Set(entries.map(e => e.id))
    // Imported weigh-ins you deleted here don't come back
    for (const id of h.imported) if (!have.has(id) && !h.ignored.includes(id)) h.ignored.push(id)
    const since = Math.max(Date.now() - 30 * 86400000, (h.lastBodyRead || 0) - 2 * 86400000)
    const res = await b.readBody({ since: new Date(since).toISOString() })
    const known = new Set([...have, ...h.ignored, ...h.imported])
    const { entries: add, seen } = importedEntries(res, { unit: state.data.profile.unit, known })
    for (const e of add) saveBodyEntry(e)
    h.imported = [...new Set([...h.imported, ...seen])].slice(-2000)
    h.lastBodyRead = Date.now()
  }
}

// ── Starting up ───────────────────────────────────────────
let timer = null
function soon (ms) {
  clearTimeout(timer)
  timer = setTimeout(() => runHealth(), ms)
}

export async function initHealth () {
  if (!bridge()) { health.status = 'none'; return }
  await refreshStatus()
  // A backup from elsewhere doesn't know what this phone wrote: start over (Health Connect updates, no copies)
  onDataReplaced(() => { if (state.data.health) state.data.health.written = {} })
  onPersist(() => { if (state.data.health?.on && !inRun) soon(10000) })
  onSessionFinished(() => { if (state.data.health?.on) soon(2000) })
  CapApp.addListener('resume', () => { if (state.data.health?.on) refreshStatus().then(() => soon(1500)) }).catch(() => {})
  setInterval(() => { if (state.data.health?.on && (typeof document === 'undefined' || !document.hidden)) runHealth() }, 30 * 60000)
  if (state.data.health?.on) soon(4000)
}
