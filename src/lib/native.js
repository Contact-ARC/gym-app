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
// Two of them: a quiet countdown that sits in the status bar while you rest (our own small
// Android plugin, RestTimerPlugin.java, because the system draws the ticking clock), and a
// "Get ready" alert that pops up when the rest is over (scheduled with local notifications).

const REST_NOTIF_ID = 4242
const RestTimer = registerPlugin('RestTimer')
const DONE_CHANNEL = 'rest_ready'
let channelReady = false

/** Countdown notification until `endsAt` (ms). Safe to call again to update it. */
export async function showRestCountdown (endsAt, title, body) {
  if (!isNative) return
  try {
    await RestTimer.show({
      endsAt, title, body: body || '',
      channelName: t('Rest countdown'),
      channelDescription: t('The time left while you rest, in the status bar')
    })
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
  return { ok, permission, countdown: st.countdownChannel, ready: st.readyChannel, exact: st.exact, sdk: st.sdk, error: st.error }
}

/** Android's notification settings for this app (to switch them back on). */
export async function openNotificationSettings () {
  if (!isNative) return
  try { await RestTimer.openSettings() } catch (e) { logError(e, 'open notification settings') }
}

/** "Get ready" alert at `at` (ms). `what` is the set that's next, e.g. "Bench press, set 3". */
export async function scheduleRestNotification (at, what) {
  if (!isNative) return
  try {
    await ensureDoneChannel()
    await LocalNotifications.schedule({
      notifications: [{
        id: REST_NOTIF_ID,
        title: what ? t('Get ready: {what}', { what }) : t('Get ready for your next set'),
        body: t('Rest is over 💪'),
        channelId: DONE_CHANNEL,
        smallIcon: 'ic_stat_rest',
        iconColor: '#2457B5',
        schedule: { at: new Date(at), allowWhileIdle: true }
      }]
    })
  } catch (e) { logError(e, 'rest alert') }
}

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
