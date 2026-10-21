// Rest timer driven by an absolute end time, so it stays correct if the
// WebView is paused. While the app is in the background a local notification
// is scheduled for the end time; it's cancelled when the app comes back.
import { reactive } from 'vue'
import { App } from '@capacitor/app'
import { buzz, scheduleRestNotification, cancelRestNotification, ensureNotifyPermission, isNative } from './native.js'
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

// Short beeps made on the fly, so there are no sound files to ship
let audio = null
function beep (freq = 880, ms = 140, delay = 0) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)()
    const t = audio.currentTime + delay / 1000
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.frequency.value = freq
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
    osc.connect(gain).connect(audio.destination)
    osc.start(t); osc.stop(t + ms / 1000 + 0.02)
  } catch { /* no audio */ }
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
      if (st.restSound) beep(660, 110)
    }
  }
  if (left === 0 && !rest.done) {
    rest.done = true
    if (!inBackground) {
      if (st.restVibrate) { buzz(350); setTimeout(() => buzz(350), 600) }
      if (st.restSound) { beep(880, 160); beep(880, 160, 260); beep(1175, 260, 520) }
    }
    setTimeout(() => { if (rest.done) stopRest() }, 4000)
  }
}

/** Let Settings preview the sound (also unlocks audio on Android after a tap). */
export function previewRestSound () { beep(880, 160); beep(1175, 260, 260) }

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
}

export async function startRest (seconds, label = '') {
  if (!seconds || seconds <= 0) return
  rest.total = seconds
  rest.endsAt = Date.now() + seconds * 1000
  rest.label = label
  rest.done = false
  warned = false
  save()
  if (state.data.settings.restSound) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume() } catch { /* ignore */ } }
  tick()
  clearInterval(ticker)
  ticker = setInterval(tick, 250)
  if (state.data.settings.restNotify) ensureNotifyPermission()
}

export function addRest (seconds) {
  if (!rest.endsAt) return
  rest.endsAt += seconds * 1000
  rest.total += seconds
  rest.done = false
  if (rest.endsAt - Date.now() > 10500) warned = false
  tick()
  save()
}

export function stopRest () {
  clearInterval(ticker)
  ticker = null
  rest.endsAt = null
  rest.remaining = 0
  rest.done = false
  cancelRestNotification()
  save()
}

if (isNative) {
  App.addListener('appStateChange', async ({ isActive }) => {
    inBackground = !isActive
    if (!isActive && rest.endsAt && !rest.done && state.data.settings.restNotify) {
      await scheduleRestNotification(rest.endsAt, rest.label ? t('Next: {what}', { what: rest.label }) : null)
    } else if (isActive) {
      await cancelRestNotification()
      tick()
    }
  })
}
