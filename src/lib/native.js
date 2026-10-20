// Thin wrappers around Capacitor plugins with browser fallbacks, so `npm run dev` works too.
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { Share } from '@capacitor/share'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Browser } from '@capacitor/browser'
import { t } from '../i18n/index.js'

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

// ── Notifications (rest timer while the app is in the background) ──

const REST_NOTIF_ID = 4242

export async function ensureNotifyPermission () {
  if (!isNative) return false
  try {
    let p = await LocalNotifications.checkPermissions()
    if (p.display === 'prompt' || p.display === 'prompt-with-rationale') {
      p = await LocalNotifications.requestPermissions()
    }
    return p.display === 'granted'
  } catch { return false }
}

export async function scheduleRestNotification (at, body) {
  if (!isNative) return
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: REST_NOTIF_ID,
        title: t('Rest over'),
        body: body || t('Time for your next set 💪'),
        schedule: { at: new Date(at), allowWhileIdle: true }
      }]
    })
  } catch (e) { console.warn('Notification schedule failed', e) }
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
