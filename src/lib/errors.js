// A small log of app errors, so a problem on a phone can be reported precisely:
// Settings → "Copy details for a bug report" includes it. Kept on this device only.
import { toast } from '../ui/toast.js'
import { t } from '../i18n/index.js'

const KEY = 'gymcrew.errors'
const MAX = 20
let lastToast = 0

function load () {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function errorLog () { return load() }

export function clearErrorLog () {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Record an error for the bug report without bothering the user. */
export function logError (err, where = '') {
  const msg = String(err?.message || err || 'Unknown error').slice(0, 300)
  const entry = { at: new Date().toISOString(), where, msg, stack: String(err?.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 500) }
  try {
    const list = load()
    list.unshift(entry)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch { /* storage unavailable */ }
  return msg
}

/** Record an error and tell the user something went wrong (at most every few seconds). */
export function reportError (err, where = '') {
  const msg = logError(err, where)
  if (Date.now() - lastToast > 4000) {
    lastToast = Date.now()
    try { toast(t('Something went wrong: {e}', { e: msg })) } catch { /* ignore */ }
  }
}

/** Catch errors from Vue, plain JS and promises. */
export function installErrorHandlers (app) {
  app.config.errorHandler = (err, _vm, info) => { console.error(err); reportError(err, 'vue ' + info) }
  window.addEventListener('error', (e) => reportError(e.error || e.message, 'window'))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    // A cancelled share sheet isn't an error
    if (String(r?.message || r).toLowerCase().includes('cancel')) return
    reportError(r, 'promise')
  })
}
