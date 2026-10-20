// Rest timer driven by an absolute end time, so it stays correct if the
// WebView is paused. While the app is in the background a local notification
// is scheduled for the end time; it's cancelled when the app comes back.
import { reactive } from 'vue'
import { App } from '@capacitor/app'
import { buzz, scheduleRestNotification, cancelRestNotification, ensureNotifyPermission, isNative } from './native.js'
import { state } from '../store.js'

export const rest = reactive({
  endsAt: null, // ms timestamp
  total: 0, // seconds
  label: '',
  remaining: 0, // seconds, updated every 250 ms
  done: false
})

let ticker = null
let inBackground = false

function tick () {
  if (!rest.endsAt) return
  const left = Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000))
  rest.remaining = left
  if (left === 0 && !rest.done) {
    rest.done = true
    if (state.data.settings.restVibrate && !inBackground) {
      buzz(350); setTimeout(() => buzz(350), 600)
    }
    setTimeout(() => { if (rest.done) stopRest() }, 4000)
  }
}

export async function startRest (seconds, label = '') {
  if (!seconds || seconds <= 0) return
  rest.total = seconds
  rest.endsAt = Date.now() + seconds * 1000
  rest.label = label
  rest.done = false
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
  tick()
}

export function stopRest () {
  clearInterval(ticker)
  ticker = null
  rest.endsAt = null
  rest.remaining = 0
  rest.done = false
  cancelRestNotification()
}

if (isNative) {
  App.addListener('appStateChange', async ({ isActive }) => {
    inBackground = !isActive
    if (!isActive && rest.endsAt && !rest.done && state.data.settings.restNotify) {
      await scheduleRestNotification(rest.endsAt, rest.label ? `Next: ${rest.label}` : null)
    } else if (isActive) {
      await cancelRestNotification()
      tick()
    }
  })
}
