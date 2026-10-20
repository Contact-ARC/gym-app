// Local persistence: one JSON file in the app's private data directory.
// Writes go to a temp file first and are then renamed over the real file,
// so a crash mid-write can't corrupt your history.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { DATA_SCHEMA_VERSION } from '../config.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR } from './training.js'

const FILE = 'gym-data.json'
const TMP = 'gym-data.tmp.json'

export function emptyData () {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    profile: {
      name: '',
      unit: 'kg',
      bodyweight: null,
      increments: { ...DEFAULT_INCREMENTS.kg },
      bar: DEFAULT_BAR.kg,
      theme: 'dark'
    },
    settings: {
      routinesUrl: null, // null = use DEFAULT_ROUTINES_URL from config.js
      restVibrate: true,
      restNotify: true
    },
    sessions: [], // [{ id, startedAt, finishedAt, routineMonth, dayId, dayName, items:[], sets:[], notes }]
    activeSessionId: null,
    nextDayIndex: 0,
    exerciseNotes: {}, // { [exerciseId]: string }
    cache: { manifest: null, routine: null, exercises: null, fetchedAt: null },
    routineArchive: {}, // { [month]: routine }
    lastSeenRoutineMonth: null,
    lastBackupAt: null
  }
}

/** Upgrade older data files. Add a case per schema bump. */
export function migrate (data) {
  const base = emptyData()
  const out = {
    ...base,
    ...data,
    profile: { ...base.profile, ...(data.profile || {}) },
    settings: { ...base.settings, ...(data.settings || {}) },
    cache: { ...base.cache, ...(data.cache || {}) }
  }
  // if (out.schemaVersion < 2) { ...transform...; out.schemaVersion = 2 }
  out.schemaVersion = DATA_SCHEMA_VERSION
  return out
}

export async function loadData () {
  try {
    const res = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
    return migrate(JSON.parse(res.data))
  } catch (e) {
    // First run, or main file missing — try the temp file in case a rename was interrupted
    try {
      const res = await Filesystem.readFile({ path: TMP, directory: Directory.Data, encoding: Encoding.UTF8 })
      return migrate(JSON.parse(res.data))
    } catch {
      return emptyData()
    }
  }
}

let queue = Promise.resolve()

/** Serialised, atomic save. Safe to call after every logged set. */
export function saveData (data) {
  const json = JSON.stringify(data)
  queue = queue.then(async () => {
    await Filesystem.writeFile({ path: TMP, directory: Directory.Data, data: json, encoding: Encoding.UTF8 })
    try {
      await Filesystem.deleteFile({ path: FILE, directory: Directory.Data })
    } catch { /* didn't exist yet */ }
    await Filesystem.rename({ from: TMP, to: FILE, directory: Directory.Data, toDirectory: Directory.Data })
  }).catch(err => {
    console.error('Save failed', err)
  })
  return queue
}

/** Validate an imported backup. Throws with a readable message. */
export function parseBackup (text) {
  let obj
  try { obj = JSON.parse(text) } catch { throw new Error('That file is not valid JSON.') }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sessions)) {
    throw new Error("That file doesn't look like a Gym Crew backup.")
  }
  if ((obj.schemaVersion || 0) > DATA_SCHEMA_VERSION) {
    throw new Error('This backup was made by a newer app version. Update the app first.')
  }
  return migrate(obj)
}
