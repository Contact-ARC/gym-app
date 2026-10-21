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
      level: 'standard' // standard | beginner (routine track)
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
      volumeTarget: [10, 20] // hard sets per muscle per week
    },
    sessions: [], // [{ id, startedAt, finishedAt, routineMonth, dayId, dayName, items:[], sets:[], notes }]
    activeSessionId: null,
    nextDayIndex: 0,
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
    body: { entries: [], photos: [] }, // entries: [{ id, date, weight, unit, waist, chest, arm, thigh, hips, mUnit }]; photos: [{ id, date, file, pose }]
    challenges: {}, // { [routineMonth]: { manual: number, doneAt } }
    reportsSeen: {}, // { [month]: true } month reports already shown
    restState: null, // { endsAt, total, label } while a rest timer runs
    crew: { code: null, name: '', memberId: null, key: null, shareFeed: true, queue: [], lastSync: null, url: null, anonKey: null }
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
    crew: { ...base.crew, ...(data.crew || {}), queue: [...(data.crew?.queue || [])] }
  }
  if (!Array.isArray(out.settings.volumeTarget) || out.settings.volumeTarget.length !== 2) out.settings.volumeTarget = base.settings.volumeTarget
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
  try { obj = JSON.parse(text) } catch { throw new Error(t('That file is not valid JSON.')) }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sessions)) {
    throw new Error(t("That file doesn't look like a Gym Crew backup."))
  }
  if ((obj.schemaVersion || 0) > DATA_SCHEMA_VERSION) {
    throw new Error(t('This backup was made by a newer app version. Update the app first.'))
  }
  return migrate(obj)
}
