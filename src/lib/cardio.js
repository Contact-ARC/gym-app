// Cardio machines (treadmill, incline walks): a set is one bout with its time, speed, incline and, for
// weighted walks, the weight you carry. Pure (no store), tested in test/cardio.test.js.
//
// A cardio set: { seconds, load (added weight, or null), unit, cardio: { speed, incline, distance } }
//   speed in km/h and distance in km, always (shown in mph and miles if you use lb); incline in %.
import { t } from '../i18n/index.js'

export const KM_PER_MI = 1.609344
export const isCardio = (exercise) => exercise?.logType === 'cardio'
export const CARDIO_SET_WEIGHT = 0.5 // a 30-minute walk isn't a hard set for your legs, but it isn't nothing

/** Where a treadmill exercise starts the first time: { speed (km/h), incline (%), minutes } */
const STARTS = {
  treadmill: { speed: 8, incline: 1, minutes: 20 },
  'incline-treadmill-walk': { speed: 5, incline: 10, minutes: 20 },
  'weighted-incline-walk': { speed: 4.5, incline: 8, minutes: 20 }
}
export function cardioStart (exercise) {
  return STARTS[exercise?.id] || { speed: 6, incline: 0, minutes: 20 }
}

const r1 = (x) => Math.round(x * 10) / 10
const r2 = (x) => Math.round(x * 100) / 100
/** Speeds and distances in what you use: km/h and km, or mph and miles (lb users). */
export const speedUnit = (unit) => (unit === 'lb' ? 'mph' : 'km/h')
export const distUnit = (unit) => (unit === 'lb' ? 'mi' : 'km')
export const toShownSpeed = (kmh, unit) => (kmh == null ? null : unit === 'lb' ? r1(kmh / KM_PER_MI) : r1(kmh))
export const fromShownSpeed = (v, unit) => (v == null ? null : unit === 'lb' ? r2(v * KM_PER_MI) : r1(v))
export const toShownDist = (km, unit) => (km == null ? null : unit === 'lb' ? r2(km / KM_PER_MI) : r2(km))

/** km covered at `speed` km/h for `seconds`. */
export function distanceKm (seconds, speed) {
  if (!(seconds > 0) || !(speed > 0)) return 0
  return r2((speed * seconds) / 3600)
}

/** The cardio part of a set from what you entered. */
export function cardioOf ({ seconds, speed, incline }) {
  return { speed: speed > 0 ? r2(speed) : null, incline: incline > 0 ? r1(incline) : 0, distance: distanceKm(seconds, speed) }
}

/** 30 min, 1 h 05, 12:30 (when it isn't whole minutes) */
export function fmtDuration (seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  if (s % 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const m = s / 60
  if (m < 60) return t('{n} min', { n: m })
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}
export const fmtDistance = (km, unit) => `${toShownDist(km, unit)} ${distUnit(unit)}`
export const fmtSpeed = (kmh, unit) => `${toShownSpeed(kmh, unit)} ${speedUnit(unit)}`

/** "30 min · 6 km/h · 12% · 3 km" (+ "· 10 kg" for a weighted walk) */
export function cardioText (s, unit = 'kg') {
  const c = s?.cardio || {}
  const parts = [fmtDuration(s?.seconds)]
  if (c.speed) parts.push(fmtSpeed(c.speed, unit))
  if (c.incline) parts.push(`${c.incline}%`)
  if (c.distance) parts.push(fmtDistance(c.distance, unit))
  if (s?.load > 0) parts.push(`${s.load} ${s.unit && s.unit !== 'pin' ? s.unit : unit}`)
  return parts.join(' · ')
}

/** Totals over sets: { seconds, km } */
export function cardioTotals (sets) {
  let seconds = 0; let km = 0
  for (const s of sets || []) if (s.cardio) { seconds += s.seconds || 0; km += s.cardio.distance || 0 }
  return { seconds, km: r2(km) }
}

/**
 * Records in one workout against everything before it: the longest distance and the longest time in one go.
 * The first time isn't a record.
 */
export function cardioRecords (mine, before, exerciseId) {
  const prs = []
  const most = (list, f) => Math.max(0, ...list.filter(s => s.cardio).map(f))
  const d = most(mine, s => s.cardio.distance || 0); const db = most(before, s => s.cardio.distance || 0)
  if (d > db && db > 0) prs.push({ exerciseId, type: 'distance', value: d, prev: db })
  const tm = most(mine, s => s.seconds || 0); const tb = most(before, s => s.seconds || 0)
  if (tm > tb && tb > 0) prs.push({ exerciseId, type: 'duration', value: tm, prev: tb })
  return prs
}
