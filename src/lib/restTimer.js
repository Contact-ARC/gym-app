// Rest timer driven by an absolute end time, so it stays correct if the WebView is paused.
// While it runs, a countdown notification sits in the status bar (Android ticks it by itself).
// While the app is in the background, a "Get ready" alert is scheduled for the end time;
// it's cancelled when the app comes back to the front (the app beeps and buzzes itself then).
import { reactive } from 'vue'
import { App } from '@capacitor/app'
import {
  buzz, scheduleRestNotification, cancelRestNotification, ensureNotifyPermission, isNative, showRestCountdown, hideRestCountdown
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

function tick () {
  if (!rest.endsAt) return
  const left = Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000))
  rest.remaining = left
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
    hideRestCountdown()
    setTimeout(() => { if (rest.done) stopRest() }, 4000)
  }
}

/** Let Settings preview the sound (also unlocks audio on Android after a tap). */
export function previewRestSound () {
  try { ctx().resume() } catch { /* ignore */ }
  doneChime()
}

/** Countdown in the status bar for the current rest (if notifications are on). */
function showCountdown () {
  if (!rest.endsAt || !state.data.settings.restNotify) return
  showRestCountdown(rest.endsAt, rest.label ? t('Next: {what}', { what: rest.label }) : t('Resting'), t('Tap to go back to your workout'))
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
  showCountdown()
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
    showCountdown()
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
  showCountdown()
}

export function stopRest () {
  clearInterval(ticker)
  ticker = null
  rest.endsAt = null
  rest.remaining = 0
  rest.done = false
  cancelRestNotification()
  hideRestCountdown()
  save()
}

if (isNative) {
  App.addListener('appStateChange', async ({ isActive }) => {
    inBackground = !isActive
    if (!isActive && rest.endsAt && !rest.done && state.data.settings.restNotify) {
      await scheduleRestNotification(rest.endsAt, rest.label || null)
    } else if (isActive) {
      await cancelRestNotification()
      tick()
    }
  })
}
