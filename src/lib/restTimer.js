// Rest timer driven by an absolute end time, so it stays correct if the WebView is paused.
// In the app: just the on-screen timer and the chime. Out of the app: a countdown notification
// (armed here, posted by Android the moment you leave, ticking by itself) and a "Get ready" alert
// at the end. The alert is scheduled as soon as the rest starts, so it fires whether or not the app
// gets a chance to run when you leave; if you're still in the app at the end it's called off just before.
import { reactive } from 'vue'
import { App } from '@capacitor/app'
import {
  buzz, scheduleRestNotification, cancelRestNotification, ensureNotifyPermission, isNative, armRestCountdown, disarmRestCountdown,
  notificationStatus
} from './native.js'
import { state, persist } from '../store.js'
import { t } from '../i18n/index.js'

export const rest = reactive({
  endsAt: null, // ms timestamp
  total: 0, // seconds
  label: '',
  remaining: 0, // seconds, updated every 250 ms
  done: false
})

/** Set when the notifications can't show (blocked for the app, or a channel switched off), so the workout can say so. */
export const notifyProblem = reactive({ status: null, dismissed: false })

let ticker = null
let inBackground = false
let warned = false

// Chimes made on the fly, so there are no sound files to ship.
// A bell-like tone (fundamental + soft overtones) in the 1–1.6 kHz range cuts through music
// without being shrill; a compressor lifts the level so it's clearly audible at normal volume.
let audio = null
let out = null
function ctx () {
  audio = audio || new (window.AudioContext || window.webkitAudioContext)()
  if (!out) {
    const comp = audio.createDynamicsCompressor()
    comp.threshold.value = -20; comp.knee.value = 8; comp.ratio.value = 6
    comp.attack.value = 0.003; comp.release.value = 0.25
    out = audio.createGain()
    out.gain.value = 1
    out.connect(comp).connect(audio.destination)
  }
  return audio
}
function ding (freq, at, dur, vol) {
  const a = ctx()
  const t0 = a.currentTime + at
  for (const [mult, type, share] of [[1, 'sine', 1], [2, 'triangle', 0.3], [3, 'sine', 0.1]]) {
    const osc = a.createOscillator()
    const g = a.createGain()
    osc.type = type
    osc.frequency.value = freq * mult
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * share), t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(out)
    osc.start(t0); osc.stop(t0 + dur + 0.05)
  }
}
const loud = () => state.data.settings.restSoundLevel !== 'soft'
/** End of rest: a rising three-note chime, played twice when set to loud (about 2 seconds). */
function doneChime () {
  try {
    const v = loud() ? 0.9 : 0.4
    const notes = [[784, 0], [1047, 0.18], [1319, 0.36]]
    for (const [f, at] of notes) ding(f, at, 0.55, v)
    if (loud()) for (const [f, at] of notes) ding(f, at + 0.95, 0.6, v)
  } catch { /* no audio */ }
}
/** 10 seconds left: one short note. */
function warnChime () {
  try { ding(1047, 0, 0.35, loud() ? 0.6 : 0.3) } catch { /* no audio */ }
}

let alertCancelled = false
function tick () {
  if (!rest.endsAt) return
  const left = Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000))
  rest.remaining = left
  // In the app at the end: the app chimes itself, so the pop-up isn't needed
  if (!inBackground && !alertCancelled && rest.endsAt - Date.now() < 1200) {
    alertCancelled = true
    cancelRestNotification()
  }
  const st = state.data.settings
  if (!warned && left <= 10 && left > 0 && rest.total > 20) {
    warned = true
    if (!inBackground) {
      if (st.restWarn) buzz(120)
      if (st.restSound) warnChime()
    }
  }
  if (left === 0 && !rest.done) {
    rest.done = true
    if (!inBackground) {
      if (st.restVibrate) { buzz(350); setTimeout(() => buzz(350), 600) }
      if (st.restSound) doneChime()
    }
    disarmRestCountdown()
    // Tidy up, but leave the "Get ready" alert alone: on some phones (OnePlus, Xiaomi…) the alarm
    // behind it can arrive a few seconds late while the screen is off, and cancelling it here would lose it
    setTimeout(() => { if (rest.done) stopRest({ keepAlert: true }) }, 4000)
  }
}

/** Let Settings preview the sound (also unlocks audio on Android after a tap). */
export function previewRestSound () {
  try { ctx().resume() } catch { /* ignore */ }
  doneChime()
}

/** Countdown (for when you leave the app) and the "Get ready" alert for the current rest, if notifications are on. */
function notifyRest () {
  if (!rest.endsAt || !state.data.settings.restNotify) return
  armRestCountdown(rest.endsAt, rest.label ? t('Next: {what}', { what: rest.label }) : t('Resting'), t('Tap to go back to your workout'))
  alertCancelled = false
  scheduleRestNotification(rest.endsAt, rest.label || null)
}

/** Check once per rest start whether Android will actually show them. */
async function checkNotifications () {
  const st = await notificationStatus()
  notifyProblem.status = st && !st.ok ? st : null
}

// The running timer is saved with the data, so closing the app mid-rest doesn't lose it
function save () {
  const next = rest.endsAt ? { endsAt: rest.endsAt, total: rest.total, label: rest.label } : null
  if (JSON.stringify(next) === JSON.stringify(state.data.restState ?? null)) return
  state.data.restState = next
  persist()
}

/** Pick up a rest that was running when the app was closed. Call once after the store loads. */
export function resumeRest () {
  const r = state.data.restState
  if (!r?.endsAt || !state.data.activeSessionId) return
  if (r.endsAt <= Date.now()) { state.data.restState = null; return }
  Object.assign(rest, { endsAt: r.endsAt, total: r.total, label: r.label || '', done: false })
  warned = r.endsAt - Date.now() <= 10500
  tick()
  clearInterval(ticker)
  ticker = setInterval(tick, 250)
  notifyRest()
}

export async function startRest (seconds, label = '') {
  if (!seconds || seconds <= 0) return
  rest.total = seconds
  rest.endsAt = Date.now() + seconds * 1000
  rest.label = label
  rest.done = false
  warned = false
  save()
  if (state.data.settings.restSound) { try { ctx().resume() } catch { /* ignore */ } }
  tick()
  clearInterval(ticker)
  ticker = setInterval(tick, 250)
  if (state.data.settings.restNotify) {
    await ensureNotifyPermission()
    notifyRest()
    checkNotifications()
  }
}

export function addRest (seconds) {
  if (!rest.endsAt) return
  rest.endsAt += seconds * 1000
  rest.total += seconds
  rest.done = false
  if (rest.endsAt - Date.now() > 10500) warned = false
  tick()
  save()
  notifyRest()
}

/** Stop the rest. Skipping it early also calls off the "Get ready" alert; once the time is up it's left to show. */
export function stopRest ({ keepAlert = false } = {}) {
  const early = rest.endsAt && rest.endsAt - Date.now() > 1000
  clearInterval(ticker)
  ticker = null
  rest.endsAt = null
  rest.remaining = 0
  rest.done = false
  if (!keepAlert && (early || !inBackground)) cancelRestNotification()
  disarmRestCountdown()
  save()
}

if (isNative) {
  App.addListener('appStateChange', async ({ isActive }) => {
    inBackground = !isActive
    if (!isActive && rest.endsAt && !rest.done && alertCancelled && state.data.settings.restNotify) {
      // Left the app in the last second, after the alert was called off: put it back
      alertCancelled = false
      await scheduleRestNotification(rest.endsAt, rest.label || null)
    } else if (isActive) {
      // Back in the app: clear an alert that already popped up
      if (!rest.endsAt || rest.done || rest.endsAt <= Date.now()) await cancelRestNotification()
      tick()
    }
  })
}
