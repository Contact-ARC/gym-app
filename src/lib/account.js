// Gym Crew accounts (0.12): sign in with Google, and a Supabase session for saving your data.
//
// Google's own account picker on the phone (Android Credential Manager, through
// @capgo/capacitor-social-login) gives a signed ID token; Supabase Auth checks it and returns a session
// (POST /auth/v1/token?grant_type=id_token). Like the crew board, this is plain fetch, no SDK.
//
// The session (refresh token) is kept in its own file, gym-account.json, NOT in the data file, so it
// never ends up in a JSON backup you share. Signing in is optional: the app works the same without it.
//
// Setup (once): latest.json → "crew": { "url", "anonKey", "googleClientId" } where googleClientId is the
// Web OAuth client ID from Google Cloud. See README, "Accounts".
import { reactive, computed } from 'vue'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { crewConfig } from './crew.js'
import { manifest } from '../store.js'
import { isNative } from './native.js'
import { t } from '../i18n/index.js'

const FILE = 'gym-account.json'
const BUCKET = 'progress-photos'

/** { userId, email, name, picture, accessToken, refreshToken, expiresAt } or null when signed out */
export const account = reactive({ session: null, loaded: false, busy: false, error: null })
export const signedIn = computed(() => !!account.session?.refreshToken)
export const googleClientId = computed(() => manifest.value?.crew?.googleClientId || null)
export const accountsAvailable = computed(() => !!(crewConfig.value && googleClientId.value))

export class AccountError extends Error {
  constructor (code, message) { super(message); this.code = code }
}

const ERRORS = {
  not_signed_in: 'Sign in again to keep saving to your account.',
  other_account: 'That crew membership belongs to another Google account.',
  record_too_big: 'One item was too big to save to your account.',
  offline: "Couldn't reach your account. Check your connection.",
  cancelled: 'Sign-in was cancelled.',
  not_set_up: "Accounts aren't set up yet (README, Accounts)."
}
const errText = (code, fallback) => (ERRORS[code] ? t(ERRORS[code]) : fallback || t('Account error: {e}', { e: code }))

// ── Keeping the session ───────────────────────────────────
async function readFile () {
  try {
    const res = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
    const text = typeof res.data === 'string' ? res.data : await res.data.text()
    return JSON.parse(text)
  } catch { return null }
}
async function writeFile (obj) {
  try {
    if (obj) await Filesystem.writeFile({ path: FILE, directory: Directory.Data, data: JSON.stringify(obj), encoding: Encoding.UTF8 })
    else await Filesystem.deleteFile({ path: FILE, directory: Directory.Data })
  } catch { /* nothing to delete, or storage trouble: the session just won't survive a restart */ }
}

export async function loadAccount () {
  const s = await readFile()
  account.session = s?.refreshToken ? s : null
  account.loaded = true
}

function fromAuthResponse (r) {
  const u = r.user || {}
  const meta = u.user_metadata || {}
  return {
    userId: u.id,
    email: u.email || meta.email || null,
    name: meta.full_name || meta.name || null,
    picture: meta.avatar_url || meta.picture || null,
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: r.expires_at ? r.expires_at * 1000 : Date.now() + (r.expires_in || 3600) * 1000
  }
}

// ── Talking to Supabase Auth ──────────────────────────────
function cfgOrThrow () {
  const cfg = crewConfig.value
  if (!cfg) throw new AccountError('not_set_up', errText('not_set_up'))
  return cfg
}

async function authFetch (path, body, bearer) {
  const cfg = cfgOrThrow()
  const headers = { apikey: cfg.anonKey, 'Content-Type': 'application/json' }
  if (bearer) headers.Authorization = 'Bearer ' + bearer
  let res
  try {
    res = await fetch(`${cfg.url}/auth/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) })
  } catch { throw new AccountError('offline', errText('offline')) }
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  if (!res.ok) {
    const code = json?.error_code || json?.error || String(res.status)
    throw new AccountError(code, json?.msg || json?.error_description || json?.message || errText(code))
  }
  return json
}

let refreshing = null
/** A valid access token, refreshing it first when it's about to run out. */
export async function accessToken () {
  const s = account.session
  if (!s) throw new AccountError('not_signed_in', errText('not_signed_in'))
  if (s.accessToken && s.expiresAt - Date.now() > 60000) return s.accessToken
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await authFetch('token?grant_type=refresh_token', { refresh_token: s.refreshToken })
        account.session = { ...s, ...fromAuthResponse(r) }
        await writeFile(account.session)
      } catch (e) {
        // A refresh token that Supabase no longer accepts (signed out elsewhere, account deleted): sign out here too
        if (e.code !== 'offline') await forgetSession()
        throw e
      } finally { refreshing = null }
    })()
  }
  await refreshing
  return account.session.accessToken
}

/** Call one of the account functions in supabase/account.sql (or a crew one that needs the account). */
export async function accountRpc (fn, body = {}, retried = false) {
  const cfg = cfgOrThrow()
  const token = await accessToken()
  let res
  try {
    res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch { throw new AccountError('offline', errText('offline')) }
  const text = await res.text()
  if (res.status === 401 && !retried) {
    // The token ran out between the check and the call
    account.session = { ...account.session, expiresAt: 0 }
    return accountRpc(fn, body, true)
  }
  if (!res.ok) {
    let msg = ''
    try { msg = JSON.parse(text).message || '' } catch { /* not JSON */ }
    // The account was deleted (on another phone, or in the dashboard): signed out here too
    if (msg === 'not_signed_in') await forgetSession()
    throw new AccountError(msg || String(res.status), errText(msg, t('Account error: {e}', { e: msg || res.status })))
  }
  return text ? JSON.parse(text) : null
}

// ── Photos in private storage ─────────────────────────────
const objectPath = (name) => `${account.session.userId}/${name}`

export async function uploadObject (name, base64) {
  const cfg = cfgOrThrow()
  const token = await accessToken()
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  let res
  try {
    res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${objectPath(name)}`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: bytes
    })
  } catch { throw new AccountError('offline', errText('offline')) }
  if (!res.ok) throw new AccountError(String(res.status), t('Account error: {e}', { e: (await res.text()).slice(0, 120) || res.status }))
}

/** The file as base64, or null when it isn't there (yet). */
export async function downloadObject (name) {
  const cfg = cfgOrThrow()
  const token = await accessToken()
  let res
  try {
    res = await fetch(`${cfg.url}/storage/v1/object/authenticated/${BUCKET}/${objectPath(name)}`, {
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token }
    })
  } catch { throw new AccountError('offline', errText('offline')) }
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) throw new AccountError(String(res.status), t('Account error: {e}', { e: res.status }))
  const buf = new Uint8Array(await res.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function deleteObjects (names) {
  if (!names.length) return
  const cfg = cfgOrThrow()
  const token = await accessToken()
  try {
    await fetch(`${cfg.url}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: names.map(objectPath) })
    })
  } catch { throw new AccountError('offline', errText('offline')) }
}

// ── Signing in and out ────────────────────────────────────
let initialised = false
async function socialLogin () {
  // Test builds only (VITE_TEST_HOOKS=1): a fake Google, so sign-in can be tested in a browser
  if (import.meta.env.VITE_TEST_HOOKS && typeof window !== 'undefined' && window.__gymTestGoogle) return window.__gymTestGoogle
  const { SocialLogin } = await import('@capgo/capacitor-social-login')
  if (!initialised) {
    await SocialLogin.initialize({ google: { webClientId: googleClientId.value, mode: 'online' } })
    initialised = true
  }
  return SocialLogin
}

async function sha256Hex (text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function randomNonce () {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// Hooks for the sync and the crew: run after signing in, and before signing out
const hooks = { signedIn: [], signingOut: [] }
export function onSignedIn (fn) { hooks.signedIn.push(fn) }
export function onSigningOut (fn) { hooks.signingOut.push(fn) }

/** Google's account picker, then a Supabase session. Throws an AccountError with a readable message. */
export async function signInWithGoogle () {
  if (!accountsAvailable.value) throw new AccountError('not_set_up', errText('not_set_up'))
  account.busy = true
  account.error = null
  try {
    const SocialLogin = await socialLogin()
    // Supabase checks the token's nonce against the SHA-256 of the one we send it
    const raw = randomNonce()
    let idToken = null
    for (let attempt = 0; attempt < 2 && !idToken; attempt++) {
      let res
      try {
        res = await SocialLogin.login({ provider: 'google', options: { nonce: await sha256Hex(raw) } }) // no scopes: email and profile come by default
      } catch (e) {
        const m = String(e?.message || e)
        if (/cancel/i.test(m)) throw new AccountError('cancelled', errText('cancelled'))
        throw new AccountError('google', t("Google sign-in didn't work: {e}", { e: m }))
      }
      idToken = res?.result?.idToken || null
      try {
        const r = await authFetch('token?grant_type=id_token', { provider: 'google', id_token: idToken, nonce: raw })
        account.session = fromAuthResponse(r)
      } catch (e) {
        // A token Google had cached with an older nonce: sign out of Google in the app once and try again
        if (attempt === 0 && /nonce/i.test(e.message)) { idToken = null; try { await SocialLogin.logout({ provider: 'google' }) } catch { /* fine */ } continue }
        throw e
      }
    }
    await writeFile(account.session)
    for (const fn of hooks.signedIn) { try { await fn() } catch (e) { console.warn('after sign-in', e) } }
    return account.session
  } catch (e) {
    account.error = e.message
    throw e
  } finally { account.busy = false }
}

async function forgetSession () {
  account.session = null
  await writeFile(null)
}

/** Stop saving to the account on this phone. Your data stays on the phone. */
export async function signOut () {
  for (const fn of hooks.signingOut) { try { await fn() } catch (e) { console.warn('before sign-out', e) } }
  const token = account.session?.accessToken
  await forgetSession()
  try { if (token) await authFetch('logout', {}, token) } catch { /* signed out here either way */ }
  try { if (isNative) (await socialLogin()).logout({ provider: 'google' }) } catch { /* fine */ }
}

/** The names of every photo file in your folder */
export async function listObjects () {
  const cfg = cfgOrThrow()
  const token = await accessToken()
  const names = []
  for (let offset = 0; ; offset += 1000) {
    let res
    try {
      res = await fetch(`${cfg.url}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST',
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: account.session.userId, limit: 1000, offset })
      })
    } catch { throw new AccountError('offline', errText('offline')) }
    if (!res.ok) throw new AccountError(String(res.status), t('Account error: {e}', { e: res.status }))
    let page = []
    try { page = JSON.parse((await res.text()) || '[]') } catch { page = [] }
    names.push(...(Array.isArray(page) ? page : []).map(x => x.name).filter(Boolean))
    if (page.length < 1000) return names
  }
}

/** Delete the account and everything saved in it (photos first). The phone keeps its own copy. */
export async function deleteAccount () {
  for (let i = 0; i < 20; i++) { // 1000 files a round
    const names = await listObjects()
    if (!names.length) break
    await deleteObjects(names.slice(0, 1000))
  }
  await accountRpc('account_delete')
  await signOut()
}
