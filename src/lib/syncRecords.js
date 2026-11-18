// Accounts (0.12): how the data file splits into records for saving to your account, and back.
// No app imports here, so the tests can run it directly (see lib/sync.js for the sync itself).

// ── What gets saved, as records ───────────────────────────
// Lists of things with an id
const LISTS = {
  session: { get: d => d.sessions, keep: s => !!s.finishedAt }, // the workout in progress stays on the phone
  body: { get: d => d.body.entries, sort: true },
  photo: { get: d => d.body.photos, sort: true },
  goal: { get: d => d.goals },
  plan: { get: d => d.plans },
  exercise: { get: d => d.customExercises }
}
// Maps of things by key
const MAPS = { edit: 'routineEdits', machine: 'machineSettings', note: 'exerciseNotes', challenge: 'challenges', routine: 'routineArchive' }
// Settings that belong to this phone
const LOCAL_SETTINGS = ['routinesUrl', 'reminders', 'autoBackup']
// Small things that follow you
const MISC = ['badgesSeen', 'badgeSeen', 'badgeShowcase', 'reportsSeen', 'planNotices', 'editNotices', 'oneTimeSwaps',
  'nextDayKey', 'nextDayIndex', 'lastSeenRoutineMonth', 'lastSeenRoutineKey', 'tips', 'welcomed', 'createdAt']

/** The top-level fields records come from */
export const SYNCED_FIELDS = ['sessions', 'body', 'goals', 'plans', 'customExercises', ...Object.values(MAPS), 'settings', 'profile', ...MISC]

/** Every record in the data: Map of "kind:id" → { k, i, d } */
export function toRecords (data) {
  const out = new Map()
  const add = (k, i, d) => { if (i != null && d !== undefined) out.set(`${k}:${i}`, { k, i: String(i), d }) }
  for (const [k, l] of Object.entries(LISTS)) {
    for (const x of l.get(data) || []) if (x?.id && (!l.keep || l.keep(x))) add(k, x.id, x)
  }
  for (const [k, field] of Object.entries(MAPS)) {
    for (const [i, v] of Object.entries(data[field] || {})) add(k, i, v)
  }
  const settings = { ...data.settings }
  for (const f of LOCAL_SETTINGS) delete settings[f]
  add('settings', 'main', settings)
  add('profile', 'main', data.profile)
  const misc = {}
  for (const f of MISC) if (data[f] !== undefined) misc[f] = data[f]
  add('misc', 'main', misc)
  return out
}

/** Put a record from the account into the data (d null = deleted) */
export function applyRecord (data, k, i, d) {
  if (LISTS[k]) {
    const list = LISTS[k].get(data)
    const at = list.findIndex(x => x.id === i)
    if (d == null) { if (at >= 0) list.splice(at, 1) } else if (at >= 0) list[at] = d
    else list.push(d)
    if (LISTS[k].sort) list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  } else if (MAPS[k]) {
    const m = data[MAPS[k]] || (data[MAPS[k]] = {})
    if (d == null) delete m[i]
    else m[i] = d
  } else if (k === 'settings' && d) {
    const keep = Object.fromEntries(LOCAL_SETTINGS.map(f => [f, data.settings[f]]))
    data.settings = { ...data.settings, ...d, ...keep }
  } else if (k === 'profile' && d) {
    data.profile = { ...data.profile, ...d }
  } else if (k === 'misc' && d) {
    for (const f of MISC) if (d[f] !== undefined) data[f] = d[f]
  }
}

// The same content always gives the same text, whatever order the keys come back in from the database
function canonical (v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
  }
  return v === undefined ? 'null' : JSON.stringify(v)
}
export function hashOf (v) {
  const s = canonical(v)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36)
}
