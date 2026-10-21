// Local persistence: one JSON file in the app's private data directory.
// Writes go to a temp file first and are then renamed over the real file,
// so a crash mid-write can't corrupt your history.
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { DATA_SCHEMA_VERSION } from '../config.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR } from './training.js'
import { t } from '../i18n/index.js'

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
      theme: 'system',
      level: 'standard', // standard | beginner (routine track)
      heightCm: null,
      sex: null // null | male | female: only for the body-fat estimate and DOTS
    },
    settings: {
      routinesUrl: null, // null = use DEFAULT_ROUTINES_URL from config.js
      restVibrate: true,
      restNotify: true,
      restSound: false,
      restWarn: true, // buzz with 10 seconds left
      textSize: 'normal', // normal | large
      reminders: { days: [], time: '18:00' }, // days: 1=Mon … 7=Sun
      equipment: {}, // { [tag]: false } for equipment your gym doesn't have
      lang: null, // null = follow the phone (en | es)
      autoBackup: 'weekly', // off | weekly | workout
      volumeTarget: [10, 20], // hard sets per muscle per week
      lifts: { squat: 'barbell-back-squat', bench: 'barbell-bench-press', deadlift: 'barbell-deadlift' }, // powerlifting total
      plBasis: 'e1rm' // e1rm | actual
    },
    sessions: [], // [{ id, startedAt, finishedAt, routineMonth, dayId, dayName, items:[], sets:[], notes }]
    activeSessionId: null,
    nextDayIndex: 0, // before 0.5; nextDayKey since
    nextDayKey: null, // key of the next day in the rotation (r-A, p-<plan>-<day>)
    exerciseNotes: {}, // { [exerciseId]: string }
    cache: { manifest: null, routine: null, exercises: null, fetchedAt: null },
    routineArchive: {}, // { [month]: routine }
    lastSeenRoutineMonth: null,
    lastBackupAt: null,
    welcomed: false,
    machineSettings: {}, // { [exerciseId]: [{ label, value }] }
    tips: {}, // first-time hints already shown
    // v0.4
    autoBackup: { lastAt: null, lastFile: null, lastError: null, where: null },
    body: { entries: [], photos: [] }, // entries: [{ id, date, weight, unit, waist, chest, arm, thigh, hips, neck, mUnit, bodyFat }]; photos: [{ id, date, file, pose }]
    challenges: {}, // { [routineMonth]: { manual: number, doneAt } }
    reportsSeen: {}, // { [month]: true } month reports already shown
    restState: null, // { endsAt, total, label } while a rest timer runs
    updateSeen: null, // app version whose "ready to download" popup was already shown
    crew: { code: null, name: '', memberId: null, key: null, shareFeed: true, queue: [], lastSync: null, url: null, anonKey: null },
    // v0.5
    customExercises: [], // your own exercises: { id: 'my-…', name, primary, secondary, logType, loadUnit, incrementGroup, perSide, images, hidden }
    routineEdits: {}, // { [dayId]: { baseMonth, base: <repo day when you changed it>, ops: [], pending, updatedAt } }
    plans: [], // My routines: [{ id, name, days: [{ id, label, name, items }], use, lastUse }]
    planNotices: [], // plan ids whose time ran out, to mention once
    editNotices: [], // [{ dayId, month, skipped }] changes that no longer applied after a new month
    goals: [] // [{ id, type, target, unit, exerciseId, reps, basis, start, createdAt, by, pinned, doneAt }]
  }
}

/** Upgrade older data files. Add a case per schema bump. */
export function migrate (data) {
  const base = emptyData()
  const out = {
    ...base,
    ...data,
    profile: { ...base.profile, ...(data.profile || {}) },
    settings: { ...base.settings, ...(data.settings || {}), reminders: { ...base.settings.reminders, ...(data.settings?.reminders || {}) }, equipment: { ...(data.settings?.equipment || {}) } },
    cache: { ...base.cache, ...(data.cache || {}) },
    machineSettings: { ...(data.machineSettings || {}) },
    tips: { ...(data.tips || {}) },
    autoBackup: { ...base.autoBackup, ...(data.autoBackup || {}) },
    body: { entries: [...(data.body?.entries || [])], photos: [...(data.body?.photos || [])] },
    challenges: { ...(data.challenges || {}) },
    reportsSeen: { ...(data.reportsSeen || {}) },
    crew: { ...base.crew, ...(data.crew || {}), queue: [...(data.crew?.queue || [])] },
    customExercises: [...(data.customExercises || [])],
    routineEdits: { ...(data.routineEdits || {}) },
    plans: [...(data.plans || [])],
    planNotices: [...(data.planNotices || [])],
    editNotices: [...(data.editNotices || [])],
    goals: [...(data.goals || [])]
  }
  out.settings.lifts = { ...base.settings.lifts, ...(data.settings?.lifts || {}) }
  if (!Array.isArray(out.settings.volumeTarget) || out.settings.volumeTarget.length !== 2) out.settings.volumeTarget = base.settings.volumeTarget
  if ((data.schemaVersion || 1) < 2) {
    // 0.5: the rotation remembers a day by key instead of its position in the list
    const d = data.cache?.routine?.days?.[data.nextDayIndex || 0]
    out.nextDayKey = d ? `r-${d.id}` : null
  }
  out.schemaVersion = DATA_SCHEMA_VERSION
  return out
}

async function exists (path) {
  try { await Filesystem.stat({ path, directory: Directory.Data }); return true } catch { return false }
}

async function readJSON (path) {
  const res = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 })
  const text = typeof res.data === 'string' ? res.data : await res.data.text()
  const obj = JSON.parse(text)
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sessions)) throw new Error('not a data file')
  return obj
}

/**
 * Load the data file.
 * @returns {{ data, status: 'ok'|'new'|'unreadable' }}
 *   new: first run (no file at all). unreadable: a file exists but can't be read; it's kept as
 *   gym-data.broken-<time>.json so nothing is overwritten, and the store tries an automatic backup.
 */
export async function loadData () {
  const hasMain = await exists(FILE)
  const hasTmp = await exists(TMP)
  if (!hasMain && !hasTmp) return { data: emptyData(), status: 'new' }
  // The main file first; the temp file holds the newest data if the app was closed mid-save
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const path of [FILE, TMP]) {
      try { return { data: migrate(await readJSON(path)), status: 'ok' } } catch { /* try the next */ }
    }
    await new Promise(r => setTimeout(r, 400)) // storage can be slow right after the phone wakes
  }
  try {
    await Filesystem.copy({ from: hasMain ? FILE : TMP, to: `gym-data.broken-${Date.now()}.json`, directory: Directory.Data, toDirectory: Directory.Data })
  } catch { /* nothing more we can do */ }
  return { data: emptyData(), status: 'unreadable' }
}

let errorHandler = null
/** Called with an Error when a save fails twice in a row, and with null once saving works again. */
export function onSaveError (fn) { errorHandler = fn }

let queue = Promise.resolve()

/** Serialised, atomic save. Safe to call after every logged set. */
export function saveData (data) {
  const json = JSON.stringify(data)
  const write = async () => {
    await Filesystem.writeFile({ path: TMP, directory: Directory.Data, data: json, encoding: Encoding.UTF8 })
    try {
      await Filesystem.deleteFile({ path: FILE, directory: Directory.Data })
    } catch { /* didn't exist yet */ }
    await Filesystem.rename({ from: TMP, to: FILE, directory: Directory.Data, toDirectory: Directory.Data })
  }
  queue = queue.then(async () => {
    try {
      await write()
    } catch (first) {
      console.warn('Save failed, retrying', first)
      await new Promise(r => setTimeout(r, 500))
      await write() // a second failure is reported below
    }
    errorHandler?.(null)
  }).catch(err => {
    console.error('Save failed', err)
    errorHandler?.(err)
  })
  return queue
}

/** Validate an imported backup. Throws with a readable message. */
export function parseBackup (text) {
  let obj
  try { obj = JSON.parse(text) } catch { throw new Error(t('That file is not valid JSON.')) }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sessions)) {
    throw new Error(t("That file doesn't look like a Gym Crew backup."))
  }
  if ((obj.schemaVersion || 0) > DATA_SCHEMA_VERSION) {
    throw new Error(t('This backup was made by a newer app version. Update the app first.'))
  }
  return migrate(obj)
}
