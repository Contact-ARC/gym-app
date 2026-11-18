// Health Connect (0.13): what the app writes there, worked out from the data. Pure, so it's unit-tested
// (test/health.test.js); lib/health.js does the writing and reading.
//
// Every record has a stable id (the workout's or body entry's own id), so writing it again updates it in
// Health Connect, and one that disappears here (deleted) is deleted there too.

const LB_TO_KG = 0.45359237
const toKg = (v, unit) => (unit === 'lb' ? v * LB_TO_KG : v)
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d

/** What kind of workout it was, for Health Connect: the kind most of its sets were */
export function sessionKind (session, exercisesById = {}) {
  const tally = {}
  const add = (k) => { tally[k] = (tally[k] || 0) + 1 }
  const speeds = []
  for (const s of session.sets || []) {
    if (s.type === 'warmup') continue
    if (s.climb) { add('climbing'); continue }
    const id = s.exerciseId || ''
    const ex = exercisesById[id]
    if (/treadmill|walk/.test(id) || ex?.logType === 'cardio') {
      add('treadmill')
      if (s.cardio?.speed) speeds.push(s.cardio.speed)
    } else if (/bike/.test(id)) add('bike')
    else if (/row(ing)?-machine|rower/.test(id)) add('rower')
    else if (/ski-?erg|battle-rope|burpee|slam|swing|thruster|mountain-climber|box-jump/.test(id)) add('hiit')
    else add('strength')
  }
  const kinds = Object.entries(tally).sort((a, b) => b[1] - a[1])
  if (!kinds.length) return 'strength'
  let [kind] = kinds[0]
  // A conditioning circuit with some lifting in it is still a circuit; any real lifting makes it strength
  if (kind === 'hiit' && tally.strength >= tally.hiit / 2) kind = 'strength'
  // Treadmill: running at 7 km/h or more on average, otherwise walking
  if (kind === 'treadmill') {
    const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0
    kind = avg >= 7 ? 'treadmill' : 'walking'
  }
  return kind
}

/** Treadmill and other cardio distance in the workout, in km */
export function sessionDistanceKm (session) {
  let km = 0
  for (const s of session.sets || []) if (s.type !== 'warmup' && s.cardio?.distance > 0) km += s.cardio.distance
  return round(km, 3)
}

function sessionRecord (s, exercisesById, fallbackTitle) {
  const start = new Date(s.startedAt)
  let end = new Date(s.finishedAt)
  if (!(end > start)) end = new Date(start.getTime() + 60000) // Health Connect needs end after start
  const rec = {
    kind: 'session',
    id: s.id,
    start: start.toISOString(),
    end: end.toISOString(),
    exerciseType: sessionKind(s, exercisesById),
    title: (s.dayName || fallbackTitle || 'Gym Crew').slice(0, 200)
  }
  const km = sessionDistanceKm(s)
  if (km > 0) rec.distanceKm = km
  return rec
}

/** A body entry's date as a moment: midday on that day, local time (entries have a date, not a time) */
const middayISO = (date) => new Date(`${date}T12:00:00`).toISOString()

/**
 * Everything the app would have in Health Connect right now: Map of "kind:id" → record.
 * opts: { workouts: bool, body: bool, exercisesById, title }
 */
export function healthRecords (data, { workouts = true, body = true, exercisesById = {}, title = '' } = {}) {
  const out = new Map()
  if (workouts) {
    for (const s of data.sessions || []) {
      if (!s.finishedAt || !s.startedAt) continue
      out.set(`session:${s.id}`, sessionRecord(s, exercisesById, title))
    }
  }
  if (body) {
    for (const e of data.body?.entries || []) {
      if (!e.id || !e.date || e.source === 'hc') continue // weigh-ins that came from Health Connect stay there
      if (e.weight > 0) out.set(`weight:${e.id}`, { kind: 'weight', id: e.id, time: middayISO(e.date), kg: round(toKg(e.weight, e.unit || data.profile?.unit), 2) })
      if (e.bodyFat > 0 && e.bodyFat < 100) out.set(`fat:${e.id}`, { kind: 'fat', id: e.id, time: middayISO(e.date), percent: round(e.bodyFat, 1) })
    }
    const cm = data.profile?.heightCm
    if (cm > 50 && cm < 260) out.set('height:main', { kind: 'height', id: 'main', meters: round(cm / 100, 3) })
  }
  return out
}

// Same content, same text: compares what was last written with what there is now
export function recordHash (r) {
  const { time, ...rest } = r
  // Height's time is when it's written, so it isn't part of what changed
  const v = r.kind === 'height' ? rest : r
  return JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]))
}

/**
 * What to send: { write: [record], remove: [{ kind, id }] }, given what was written before ({ key: hash }).
 * A sudden loss of most records (a wiped or damaged file) deletes nothing.
 */
export function healthChanges (wanted, written = {}) {
  const write = []
  for (const [key, r] of wanted) if (written[key] !== recordHash(r)) write.push(r)
  let remove = Object.keys(written).filter(k => !wanted.has(k)).map(k => {
    const i = k.indexOf(':')
    return { key: k, kind: k.slice(0, i), id: k.slice(i + 1) }
  })
  const known = Object.keys(written).length
  const blocked = remove.length > Math.max(10, known * 0.25)
  if (blocked) remove = []
  return { write, remove, blocked }
}

/** The name to show for the app a weigh-in came from */
export function sourceName (pkg) {
  const names = {
    'com.sec.android.app.shealth': 'Samsung Health',
    'com.google.android.apps.fitness': 'Google Fit',
    'com.garmin.android.apps.connectmobile': 'Garmin Connect',
    'com.fitbit.FitbitMobile': 'Fitbit',
    'com.withings.wiscale2': 'Withings',
    'com.huawei.health': 'Huawei Health',
    'com.xiaomi.wearable': 'Mi Fitness',
    'com.mi.health': 'Mi Fitness',
    'com.renpho.health': 'Renpho',
    'com.qingniu.renpho': 'Renpho',
    'com.eufylife.smarthome': 'eufy',
    'com.myfitnesspal.android': 'MyFitnessPal',
    'com.strava': 'Strava',
    'com.polar.polarflow': 'Polar Flow',
    'com.oura.android': 'Oura',
    'com.zepp.app': 'Zepp',
    'com.huami.watch.hmwatchmanager': 'Zepp'
  }
  if (!pkg) return ''
  return names[pkg] || pkg.split('.').filter(p => !['com', 'android', 'app', 'apps'].includes(p)).slice(-1)[0] || pkg
}

/**
 * Weigh-ins from Health Connect as body entries. weights/fats: [{ id, time, kg | percent, source }].
 * Skips ones already imported or deleted by you (known). Body fat on the same day joins that day's weigh-in.
 * Returns { entries: new body entries { id: 'hc-…', date, weight, unit, bodyFat, source: 'hc', app },
 *           seen: every Health Connect id used, to remember (a body fat folded into a weigh-in has none of its own) }
 */
export function importedEntries ({ weights = [], fats = [] }, { unit = 'kg', known = new Set(), localDate }) {
  const day = localDate || ((iso) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const out = []
  const seen = []
  const byDay = new Map()
  for (const w of [...weights].sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
    const id = 'hc-' + w.id
    if (known.has(id) || !(w.kg > 0)) continue
    seen.push(id)
    const e = { id, date: day(w.time), weight: unit === 'lb' ? round(w.kg / LB_TO_KG, 1) : round(w.kg, 1), unit, bodyFat: null, source: 'hc', app: w.source || '' }
    out.push(e)
    byDay.set(e.date + '|' + e.app, e)
  }
  for (const f of fats) {
    const id = 'hc-' + f.id
    if (known.has(id) || !(f.percent > 0)) continue
    seen.push(id)
    const d = day(f.time)
    const same = byDay.get(d + '|' + (f.source || ''))
    if (same) { if (same.bodyFat == null) same.bodyFat = round(f.percent, 1); continue }
    out.push({ id, date: d, weight: null, unit, bodyFat: round(f.percent, 1), source: 'hc', app: f.source || '' })
  }
  return { entries: out, seen }
}
