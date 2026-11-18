// Saving your data to your account (0.12), so it's on every phone you sign in on.
//
// The phone stays the main copy: the app works offline exactly as before, and the account is kept in
// step in the background. The data file is split into records (each finished workout, body entry,
// photo, goal, routine, own exercise, routine change, machine setting, exercise note, challenge, past
// routine, plus settings, profile and a few small things) and each record is saved on its own:
//
//   * After every save on the phone, records whose content changed are marked with the time they changed.
//   * A sync sends those (sync_push) and fetches what other phones changed since last time (sync_pull).
//   * When the same record changed on two phones, the later change wins. Deletions travel too.
//   * The first sync on a phone (or after importing a backup) is a merge: nothing is deleted, and where
//     the phone and the account both have something, the account's copy wins.
//   * A sync never deletes lots at once: if the phone suddenly lacks most of its records (a wiped or
//     damaged file), the account's copy is fetched again instead of being deleted.
//
// Progress photos go to a private storage folder of your own (account.js). What stays on the phone
// only: the workout in progress, the routine cache, automatic-backup state, reminders, the routine
// address, crew keys and the shared workout.
import { reactive, watch } from 'vue'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { App as CapApp } from '@capacitor/app'
import { state, persist, plain, onPersist, onDataReplaced, onSessionFinished } from '../store.js'
import {
  account, signedIn, accountRpc, onSignedIn, onSigningOut, loadAccount, uploadObject, downloadObject, deleteObjects,
  deleteAccount as deleteAccountNow, AccountError
} from './account.js'
import { inCrew, adoptMembership, newCrewKey } from './crew.js'
import { deletePhotoFiles } from './photos.js'
import { toRecords, applyRecord, hashOf, SYNCED_FIELDS } from './syncRecords.js'
import { t } from '../i18n/index.js'

const META_FILE = 'gym-sync.json'
const PUSH_BATCH = 200
const FULL_EVERY = 7 * 86400000

export const syncState = reactive({ running: false, lastAt: null, error: null, pending: 0, notice: null })

// ── Bookkeeping, in its own file ──────────────────────────
// { userId, rev: last change fetched (null = never synced: the next sync merges), hashes: { key: hash as
//   last saved or fetched }, dirty: { key: when it changed here }, photosUp: { id: true }, lastFull }
let meta = fresh(null)
function fresh (userId) { return { userId, rev: null, hashes: {}, dirty: {}, photosUp: {}, lastFull: 0 } }

async function loadMeta () {
  try {
    const res = await Filesystem.readFile({ path: META_FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
    const m = JSON.parse(typeof res.data === 'string' ? res.data : await res.data.text())
    if (m && typeof m === 'object' && m.hashes) meta = { ...fresh(null), ...m }
  } catch { meta = fresh(null) }
}
let metaSaving = Promise.resolve()
function saveMeta () {
  const json = JSON.stringify(meta)
  metaSaving = metaSaving.then(() => Filesystem.writeFile({ path: META_FILE, directory: Directory.Data, data: json, encoding: Encoding.UTF8 })).catch(() => {})
  return metaSaving
}

/** Start over with a merge on the next sync (a backup was imported, or the phone signed in again) */
export function resetSync (userId = meta.userId) {
  meta = fresh(userId)
  syncState.pending = 0
  return saveMeta()
}

// A plain copy of just the parts that are saved (not the routine cache and the rest)
function snapshot () {
  const d = state.data
  const pick = {}
  for (const f of SYNCED_FIELDS) pick[f] = d[f]
  return plain(pick)
}

// ── Noticing changes on the phone ─────────────────────────
// Compares every record with what was last saved to the account. A change keeps the time it was first noticed.
function scan () {
  const recs = toRecords(snapshot())
  const now = Date.now()
  const first = meta.rev == null
  for (const [key, r] of recs) {
    const h = hashOf(r.d)
    if (h === meta.hashes[key]) delete meta.dirty[key]
    // Before the first sync, what's on the phone counts as older than anything in the account
    else if (meta.dirty[key] == null) meta.dirty[key] = first ? 1 : now
  }
  if (!first) {
    for (const key of Object.keys(meta.hashes)) if (!recs.has(key) && meta.dirty[key] == null) meta.dirty[key] = now
  }
  syncState.pending = Object.keys(meta.dirty).length
  return recs
}

let scanTimer = null
let pushTimer = null
function onSaved () {
  if (!signedIn.value) return
  clearTimeout(scanTimer)
  scanTimer = setTimeout(() => { scan(); saveMeta() }, 1500)
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => syncNow(), 6000)
}

// ── The sync itself ───────────────────────────────────────
let running = null
/** Send what changed here and fetch what changed elsewhere. Safe to call any time; calls while one runs share it. */
export function syncNow ({ full = false } = {}) {
  if (!signedIn.value) return Promise.resolve()
  if (!running) {
    running = run(full).finally(() => { running = null })
  }
  return running
}

async function run (full) {
  syncState.running = true
  try {
    const userId = account.session?.userId
    if (meta.userId !== userId) meta = fresh(userId)
    if (state.dataStatus === 'new' && meta.rev != null && !Object.keys(meta.hashes).length) meta.rev = null
    scan()
    const merge = meta.rev == null
    if (full || merge || Date.now() - (meta.lastFull || 0) > FULL_EVERY) await pull(0)
    else await pull(meta.rev)
    const skipped = await push()
    if (skipped) await pull(0) // another phone had a later change: fetch it
    await photos()
    await saveMeta()
    syncState.lastAt = Date.now()
    syncState.error = null
  } catch (e) {
    syncState.error = e instanceof AccountError ? e.message : String(e?.message || e)
    if (e?.code === 'not_signed_in') syncState.error = t('Sign in again to keep saving to your account.')
  } finally {
    syncState.running = false
    syncState.pending = Object.keys(meta.dirty).length
  }
}

async function pull (since) {
  let rev = since
  let changed = false
  const removedPhotos = []
  const here = toRecords(snapshot()) // what's on the phone now, kept up to date as records arrive
  for (let guard = 0; guard < 200; guard++) {
    const res = await accountRpc('sync_pull', { p_since: rev, p_limit: 400 })
    for (const r of res.records || []) {
      const key = `${r.k}:${r.i}`
      const changedHere = meta.dirty[key]
      // Changed here after the account's copy was saved: ours goes up instead
      if (changedHere != null && changedHere > r.a) continue
      const d = r.x ? null : r.d
      const h = d == null ? null : hashOf(d)
      const before = here.get(key)?.d
      if (h !== (before === undefined ? null : hashOf(before))) {
        if (r.k === 'photo' && d == null && before) removedPhotos.push(before)
        applyRecord(state.data, r.k, r.i, d)
        if (d == null) here.delete(key)
        else here.set(key, { k: r.k, i: r.i, d })
        changed = true
      }
      if (d == null) delete meta.hashes[key]
      else meta.hashes[key] = h
      delete meta.dirty[key]
      if (r.k === 'photo' && d) meta.photosUp[r.i] = true // it's in the account already
    }
    rev = Math.max(rev || 0, res.rev || 0)
    if (!res.more) break
  }
  if (since === 0) meta.lastFull = Date.now()
  meta.rev = Math.max(meta.rev || 0, rev || 0)
  for (const p of removedPhotos) deletePhotoFiles(p)
  if (changed) {
    // Saved without marking these as changes of ours (scan compares with the hashes just stored)
    await persist()
  }
}

async function push () {
  const recs = scan()
  const keys = Object.keys(meta.dirty)
  if (!keys.length) return false
  // Safety: the phone suddenly missing many records is a wiped or damaged file, not you deleting them
  const deletes = keys.filter(k => !recs.has(k))
  const known = Object.keys(meta.hashes).length
  if (deletes.length > Math.max(10, known * 0.25)) {
    for (const k of deletes) delete meta.dirty[k]
    meta.rev = null // merge: fetches the account's copy back
    syncState.notice = t('Most of your data was missing on this phone, so it was fetched again from your account instead of being deleted there.')
    await pull(0)
    return false
  }
  let skipped = false
  for (let i = 0; i < keys.length; i += PUSH_BATCH) {
    const batch = keys.slice(i, i + PUSH_BATCH).map(key => {
      const r = recs.get(key)
      const [k, ...rest] = key.split(':')
      const at = meta.dirty[key]
      return r ? { k, i: r.i, d: r.d, a: at, h: hashOf(r.d) } : { k, i: rest.join(':'), a: at, x: true }
    })
    const res = await accountRpc('sync_push', { p_records: batch.map(({ h, ...b }) => b) })
    const skip = new Set((res.skipped || []).map(s => `${s.k}:${s.i}`))
    for (const b of batch) {
      const key = `${b.k}:${b.i}`
      if (skip.has(key)) { skipped = true; delete meta.dirty[key]; delete meta.hashes[key]; continue }
      if (meta.dirty[key] !== b.a) continue // changed again while sending: goes next time
      delete meta.dirty[key]
      if (b.x) { delete meta.hashes[key]; if (b.k === 'photo') photoGone.push(b.i) } else meta.hashes[key] = b.h
    }
  }
  return skipped
}

// ── Photos ────────────────────────────────────────────────
const photoGone = []
const fileName = (path) => String(path || '').split('/').pop()

async function readBase64 (path) {
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.Data })
    if (typeof res.data === 'string') return res.data
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] || null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(res.data)
    })
  } catch { return null }
}
async function exists (path) {
  try { await Filesystem.stat({ path, directory: Directory.Data }); return true } catch { return false }
}

async function photos () {
  // Deleted here: delete the files in the account too
  if (photoGone.length) {
    const ids = photoGone.splice(0)
    await deleteObjects(ids.flatMap(id => [`${id}.jpg`, `${id}-t.jpg`]))
    for (const id of ids) delete meta.photosUp[id]
  }
  for (const p of state.data.body.photos || []) {
    const names = [[p.file, `${p.id}.jpg`], [p.thumb, `${p.id}-t.jpg`]].filter(([path]) => path)
    if (!meta.photosUp[p.id]) {
      // Up: the photo and its thumbnail
      let ok = true
      for (const [path, name] of names) {
        const b64 = await readBase64(path)
        if (b64) await uploadObject(name, b64)
        else ok = false
      }
      if (ok) meta.photosUp[p.id] = true
    } else {
      // Down: a photo taken on another phone
      for (const [path, name] of names) {
        if (await exists(path)) continue
        const b64 = await downloadObject(name)
        if (b64) await Filesystem.writeFile({ path, data: b64, directory: Directory.Data, recursive: true })
      }
    }
  }
}

// ── Crew membership follows the account ───────────────────
async function linkCrew () {
  if (!signedIn.value) return
  try {
    if (inCrew.value) {
      await accountRpc('crew_link', { p_member: state.data.crew.memberId, p_key: state.data.crew.key })
    } else {
      const key = newCrewKey()
      const r = await accountRpc('crew_restore', { p_key: key })
      if (r?.member_id) await adoptMembership({ code: r.crew, name: r.name, memberId: r.member_id, key })
    }
  } catch (e) {
    if (e.code === 'other_account') syncState.notice = e.message
    else console.warn('crew link', e)
  }
}

// ── Account actions for the screens ───────────────────────
export async function afterSignIn () {
  if (meta.userId !== account.session?.userId) await resetSync(account.session?.userId)
  await syncNow({ full: true })
  await linkCrew()
}

/** Account → Delete account: the account and everything in it. This phone keeps its copy. */
export async function deleteAccountAndData () {
  await syncNow().catch(() => {})
  await deleteAccountNow()
  await resetSync(null)
}

export function accountStatus () {
  return accountRpc('account_status')
}

let started = false
export async function initSync () {
  if (started) return
  started = true
  await Promise.all([loadAccount(), loadMeta()])
  onSignedIn(afterSignIn)
  onSigningOut(async () => { await syncNow().catch(() => {}); await resetSync(null) })
  onPersist(onSaved)
  onDataReplaced(() => { resetSync(); if (signedIn.value) setTimeout(() => syncNow(), 1000) })
  onSessionFinished(() => setTimeout(() => syncNow(), 1500))
  // Joined a crew while signed in: tie it to the account
  watch(() => state.data.crew.memberId, (id, old) => { if (id && id !== old) linkCrew() })
  CapApp.addListener('resume', () => syncNow()).catch(() => {})
  if (typeof window !== 'undefined') window.addEventListener('online', () => syncNow())
  setInterval(() => { if (typeof document === 'undefined' || !document.hidden) syncNow() }, 10 * 60000)
  if (signedIn.value) setTimeout(() => syncNow(), 2500)
}
