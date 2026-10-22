// Thin wrappers around Capacitor plugins with browser fallbacks, so `npm run dev` works too.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { Share } from '@capacitor/share'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Browser } from '@capacitor/browser'
import { t } from '../i18n/index.js'
import { logError } from './errors.js'

export const isNative = Capacitor.isNativePlatform()

export async function tap () {
  try { await Haptics.impact({ style: ImpactStyle.Light }) } catch { /* no haptics */ }
}

export async function buzz (ms = 400) {
  try {
    if (isNative) await Haptics.vibrate({ duration: ms })
    else navigator.vibrate?.(ms)
  } catch { /* ignore */ }
}

export async function keepAwake (on) {
  if (!isNative) return
  try { on ? await KeepAwake.keepAwake() : await KeepAwake.allowSleep() } catch { /* ignore */ }
}

export async function openUrl (url) {
  if (isNative) await Browser.open({ url })
  else window.open(url, '_blank', 'noopener')
}

// ── Notifications (rest timer) ──
// Both only for when you're out of the app, and both handled by our own Android plugin
// (RestTimerPlugin.java and friends), so they don't depend on the app's JavaScript running:
//  • a countdown that pops up when you leave the app mid-rest and stays until the rest is over
//    (Android draws the ticking clock; it comes back if swiped away);
//  • a "Get ready" alert at the end, from an exact alarm, skipped if you're in the app (it chimes then).

const REST_NOTIF_ID = 4242
const RestTimer = registerPlugin('RestTimer')
const DONE_CHANNEL = 'rest_ready'
let channelReady = false

const channelText = () => ({
  channelName: t('Rest countdown'),
  channelDescription: t('The time left while you rest, when you leave the app'),
  alertChannelName: t('Rest is over'),
  alertChannelDescription: t('Pops up when it\'s time for your next set')
})

/**
 * Rest until `endsAt` (ms): countdown while you're out of the app, then the "Get ready" alert.
 * `what` is the set that's next ("Bench press, set 3"). Call again to change it (+30 s).
 */
export async function armRestCountdown (endsAt, what) {
  if (!isNative) return
  try {
    await RestTimer.arm({
      endsAt,
      title: what ? t('Next: {what}', { what }) : t('Resting'),
      body: t('Tap to go back to your workout'),
      alertTitle: what ? t('Get ready: {what}', { what }) : t('Get ready for your next set'),
      alertBody: t('Rest is over 💪'),
      doneTitle: t('Go!'),
      ...channelText()
    })
  } catch (e) { logError(e, 'rest countdown') }
}

export async function disarmRestCountdown () {
  if (!isNative) return
  try { await RestTimer.disarm() } catch { /* not there */ }
}

/** Show the countdown right now, in or out of the app (the test in Settings). */
export async function showRestCountdown (endsAt, title, body) {
  if (!isNative) return
  try {
    await RestTimer.show({ endsAt, title, body: body || '', ...channelText() })
  } catch (e) { logError(e, 'rest countdown') }
}

export async function hideRestCountdown () {
  if (!isNative) return
  try { await RestTimer.hide() } catch { /* not there */ }
}

// High importance: pops up over other apps, with the phone's notification sound and vibration.
// Created at launch, so scheduling an alert is a single call (nothing to wait for while the app is closing).
export async function ensureDoneChannel () {
  if (channelReady) return
  try {
    await LocalNotifications.createChannel({
      id: DONE_CHANNEL,
      name: t('Rest is over'),
      description: t('Pops up when it\'s time for your next set'),
      importance: 4,
      visibility: 1,
      vibration: true
    })
    channelReady = true
  } catch { /* older Android: no channels */ }
}

/** Ask for notification permission if Android still allows asking. Returns true when granted. */
export async function ensureNotifyPermission () {
  if (!isNative) return false
  try {
    let p = await LocalNotifications.checkPermissions()
    if (p.display === 'prompt' || p.display === 'prompt-with-rationale') {
      p = await LocalNotifications.requestPermissions()
    }
    return p.display === 'granted'
  } catch (e) { logError(e, 'notify permission'); return false }
}

/**
 * Can the rest notifications show? { ok, permission, countdown, ready, exact, sdk } or null off the phone.
 * ok is false when notifications are off for the app or one of the rest channels was switched off.
 */
export async function notificationStatus () {
  if (!isNative) return null
  let permission = 'unknown'
  try { permission = (await LocalNotifications.checkPermissions()).display } catch { /* ignore */ }
  let st = {}
  try { st = await RestTimer.status() } catch (e) { st = { error: String(e?.message || e) } }
  const off = (imp) => imp === 0
  const ok = permission === 'granted' && st.enabled !== false && !off(st.countdownChannel) && !off(st.readyChannel)
  return { ok, permission, countdown: st.countdownChannel, ready: st.readyChannel, exact: st.exact, sdk: st.sdk, liveUpdates: st.liveUpdates ?? null, error: st.error }
}

/** Android's notification settings for this app (to switch them back on). which: 'liveUpdates' for that screen. */
export async function openNotificationSettings (which = '') {
  if (!isNative) return
  try { await RestTimer.openSettings({ which }) } catch (e) { logError(e, 'open notification settings') }
}

/** Clear a "Rest over" alert left scheduled by 0.5.2 and older (the alert is native since 0.5.3). */
export async function cancelRestNotification () {
  if (!isNative) return
  try { await LocalNotifications.cancel({ notifications: [{ id: REST_NOTIF_ID }] }) } catch { /* ignore */ }
}

// ── Sharing / backup files ──

export async function shareText (title, text) {
  try {
    if (isNative) await Share.share({ title, text, dialogTitle: title })
    else if (navigator.share) await navigator.share({ title, text })
    else return (await copyText(text)) ? 'copied' : 'failed'
    return 'shared'
  } catch (e) {
    if (String(e?.message || e).toLowerCase().includes('cancel')) return 'cancelled'
    throw e
  }
}

/** Save a JSON backup and open the share sheet (Drive, WhatsApp, Files…). */
export async function shareBackupFile (filename, json) {
  if (!isNative) {
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    return 'downloaded'
  }
  const res = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title: t('Gym Crew backup'), files: [res.uri], dialogTitle: t('Save your backup') })
    return 'shared'
  } catch (e) {
    if (String(e?.message || e).toLowerCase().includes('cancel')) return 'cancelled'
    throw e
  }
}

/** Share one or more files already written to disk (uris), e.g. CSVs or an image. */
export async function shareFiles (uris, title) {
  try {
    await Share.share({ title, files: uris, dialogTitle: title })
    return 'shared'
  } catch (e) {
    if (String(e?.message || e).toLowerCase().includes('cancel')) return 'cancelled'
    throw e
  }
}

/** Browser fallback: download a Blob or data URL. */
export function downloadFile (filename, blobOrUrl) {
  const a = document.createElement('a')
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export async function copyText (text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
