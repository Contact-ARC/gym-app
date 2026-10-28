// Data safety: automatic backups and CSV export.
//
// Automatic backups go to the phone's public Documents/GymCrew folder, so they survive
// uninstalling the app. If Android won't allow that, they fall back to the app's own
// storage (protects against a corrupted file, not against losing the phone).
// The newest KEEP backups are kept.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { App as CapApp } from '@capacitor/app'
import { state, persist, exportJSON, exercisesById, onSessionFinished } from '../store.js'
import { isNative, shareFiles, downloadFile } from './native.js'
import { dateKey } from './training.js'
import { t, tx } from '../i18n/index.js'

export const BACKUP_DIR = 'GymCrew'
const KEEP = 6
const WEEK_MS = 7 * 86400000
const NAME_RE = /^gym-crew-backup-.*\.json$/

const pad = (n) => String(n).padStart(2, '0')
function stamp (d = new Date()) {
  return `${dateKey(d)}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

async function canUsePublicDocuments () {
  if (!isNative) return true
  try {
    let p = await Filesystem.checkPermissions()
    if (p.publicStorage !== 'granted') p = await Filesystem.requestPermissions()
    return p.publicStorage === 'granted'
  } catch { return true } // Android 11+ doesn't need the permission for files the app creates
}

async function listIn (directory, path) {
  try {
    const res = await Filesystem.readdir({ path, directory })
    return res.files.map(f => (typeof f === 'string' ? f : f.name)).filter(n => NAME_RE.test(n)).sort()
  } catch { return [] }
}

async function prune (directory, path) {
  const files = await listIn(directory, path)
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
    try { await Filesystem.deleteFile({ path: `${path}/${f}`, directory }) } catch { /* ignore */ }
  }
}

let running = null

/** Write a backup now. Returns { where, file } or throws. */
export function runAutoBackup () {
  if (running) return running
  running = (async () => {
    const json = exportJSON()
    const file = `gym-crew-backup-${stamp()}.json`
    let where = 'documents'
    try {
      if (!(await canUsePublicDocuments())) throw new Error('no permission')
      await Filesystem.writeFile({ path: `${BACKUP_DIR}/${file}`, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true })
      await prune(Directory.Documents, BACKUP_DIR)
    } catch (e) {
      console.warn('Documents backup failed, using app storage', e)
      where = 'app'
      await Filesystem.writeFile({ path: `backups/${file}`, data: json, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
      await prune(Directory.Data, 'backups')
    }
    state.data.autoBackup = { lastAt: new Date().toISOString(), lastFile: file, lastError: null, where }
    await persist()
    return { where, file }
  })()
  running.catch((e) => {
    state.data.autoBackup.lastError = String(e?.message || e)
    persist()
  }).finally(() => { running = null })
  return running
}

function hasWorkouts () {
  return state.data.sessions.some(s => s.finishedAt)
}

export function backupDue () {
  const mode = state.data.settings.autoBackup
  if (mode === 'off' || !hasWorkouts()) return false
  const last = state.data.autoBackup.lastAt
  return !last || Date.now() - new Date(last).getTime() >= WEEK_MS
}

async function maybeBackup () {
  if (backupDue()) { try { await runAutoBackup() } catch { /* recorded in lastError */ } }
}

export function initAutoBackup () {
  setTimeout(maybeBackup, 4000) // let the app settle first
  CapApp.addListener('resume', maybeBackup).catch(() => {})
  onSessionFinished(({ edited }) => {
    if (edited) return
    if (state.data.settings.autoBackup === 'workout') runAutoBackup().catch(() => {})
    else maybeBackup()
  })
}

/** Automatic backups on this phone, newest first: [{ name, directory, path, label }]. */
export async function listAutoBackups () {
  const docs = (await listIn(Directory.Documents, BACKUP_DIR)).map(name => ({ name, directory: Directory.Documents, path: `${BACKUP_DIR}/${name}`, where: 'documents' }))
  const app = (await listIn(Directory.Data, 'backups')).map(name => ({ name, directory: Directory.Data, path: `backups/${name}`, where: 'app' }))
  return [...docs, ...app].sort((a, b) => b.name.localeCompare(a.name))
}

export async function readBackup (entry) {
  const res = await Filesystem.readFile({ path: entry.path, directory: entry.directory, encoding: Encoding.UTF8 })
  return typeof res.data === 'string' ? res.data : await res.data.text()
}

export async function shareBackupEntry (entry) {
  if (!isNative) {
    downloadFile(entry.name, new Blob([await readBackup(entry)], { type: 'application/json' }))
    return 'downloaded'
  }
  const { uri } = await Filesystem.getUri({ path: entry.path, directory: entry.directory })
  return shareFiles([uri], t('Gym Crew backup'))
}

/** Parse "gym-crew-backup-2026-10-20_1830.json" → Date */
export function backupDate (name) {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/)
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null
}

// ── CSV export ───────────────────────────────────────────

function csvCell (v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csvRow = (cells) => cells.map(csvCell).join(',')

/** One row per logged set. Columns stay in English so spreadsheets and scripts can rely on them. */
export function setsCSV (sessions, exById = exercisesById.value) {
  const head = ['date', 'time', 'workout', 'day', 'exercise_id', 'exercise', 'set', 'set_type', 'load', 'unit', 'reps', 'reps_left', 'reps_right', 'seconds', 'rir', 'effort', 'energy', 'grade', 'grade_system', 'result', 'tries', 'wall', 'style', 'note']
  const rows = [csvRow(head)]
  const done = sessions.filter(s => s.finishedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  for (const s of done) {
    const d = new Date(s.startedAt)
    const counter = {}
    for (const x of s.sets) {
      counter[x.exerciseId] = (counter[x.exerciseId] || 0) + 1
      rows.push(csvRow([
        dateKey(d), `${pad(d.getHours())}:${pad(d.getMinutes())}`, s.dayName, s.dayId, x.exerciseId,
        tx(exById[x.exerciseId], 'name') || x.exerciseId, counter[x.exerciseId], x.type || 'normal',
        x.load, x.unit, x.reps, x.repsL, x.repsR, x.climb ? x.climb.seconds || '' : x.seconds, x.rir, s.rating?.effort, s.rating?.energy,
        // Climbs: the grade and how it went (the columns stay empty for lifting sets)
        x.climb?.grade, x.climb?.system, x.climb?.result, x.climb?.attempts, x.climb?.wall, x.climb?.style, x.climb?.note
      ]))
    }
  }
  return rows.join('\n') + '\n'
}

export function bodyCSV (entries) {
  const head = ['date', 'weight', 'unit', 'waist', 'chest', 'arm', 'thigh', 'hips', 'measure_unit']
  const rows = [csvRow(head)]
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push(csvRow([e.date, e.weight, e.unit, e.waist, e.chest, e.arm, e.thigh, e.hips, e.mUnit]))
  }
  return rows.join('\n') + '\n'
}

/** Write the CSVs and open the share sheet (or download them in a browser). */
export async function exportCSV () {
  const day = dateKey()
  const files = [{ name: `gym-crew-sets-${day}.csv`, data: setsCSV(state.data.sessions) }]
  if (state.data.body.entries.length) files.push({ name: `gym-crew-body-${day}.csv`, data: bodyCSV(state.data.body.entries) })
  if (!isNative) {
    for (const f of files) downloadFile(f.name, new Blob(['﻿' + f.data], { type: 'text/csv' }))
    return 'downloaded'
  }
  const uris = []
  for (const f of files) {
    // BOM so Excel opens accents (á, ñ) correctly
    const res = await Filesystem.writeFile({ path: f.name, data: '﻿' + f.data, directory: Directory.Cache, encoding: Encoding.UTF8 })
    uris.push(res.uri)
  }
  return shareFiles(uris, t('Workout data (CSV)'))
}
