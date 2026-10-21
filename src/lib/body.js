// Body composition maths. Pure functions, tested in test/body.test.js.
// Lengths are converted to cm and weights to kg before any formula.
import { convertLoad } from './training.js'

export const CM_PER_IN = 2.54
const r1 = (x) => Math.round(x * 10) / 10

export function toCm (v, unit) { return v == null ? null : unit === 'in' ? v * CM_PER_IN : v }
export function fromCm (cm, unit) { return cm == null ? null : unit === 'in' ? cm / CM_PER_IN : cm }

/**
 * US Navy body-fat estimate from tape measurements (cm).
 * Men: waist at the navel and neck. Women: waist at the narrowest point, hips at the widest, and neck.
 * Typically within about 3–4 percentage points of a lab test; good for trends.
 */
export function navyBodyFat ({ sex, heightCm, waistCm, neckCm, hipsCm }) {
  if (!sex || !heightCm || !waistCm || !neckCm) return null
  let bf
  if (sex === 'male') {
    if (waistCm <= neckCm) return null
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450
  } else {
    if (!hipsCm || waistCm + hipsCm <= neckCm) return null
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipsCm - neckCm) + 0.22100 * Math.log10(heightCm)) - 450
  }
  if (!isFinite(bf) || bf < 2 || bf > 70) return null
  return r1(bf)
}

export function bmi (kg, cm) {
  if (!kg || !cm) return null
  const m = cm / 100
  return r1(kg / (m * m))
}

export function leanMass (weight, bodyFat) {
  if (!weight || bodyFat == null) return null
  return r1(weight * (1 - bodyFat / 100))
}

/** Fat-free mass index, and the height-adjusted version usually quoted (normalised to 1.8 m). */
export function ffmi (kg, bodyFat, cm) {
  if (!kg || bodyFat == null || !cm) return null
  const m = cm / 100
  const lean = kg * (1 - bodyFat / 100)
  const v = lean / (m * m)
  return { ffmi: r1(v), normalized: r1(v + 6.1 * (1.8 - m)) }
}

// DOTS (powerlifting score comparing lifters of different bodyweights). Bodyweight in kg,
// limited to 40–210 kg for men and 40–150 kg for women, as OpenPowerlifting does.
const DOTS = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
}
export function dots (totalKg, bodyweightKg, sex) {
  const c = DOTS[sex]
  if (!c || !totalKg || !bodyweightKg) return null
  const bw = Math.min(sex === 'male' ? 210 : 150, Math.max(40, bodyweightKg))
  const denom = c[0] + c[1] * bw + c[2] * bw ** 2 + c[3] * bw ** 3 + c[4] * bw ** 4
  return Math.round((totalKg * 500 / denom) * 100) / 100
}

// ── Entries ──
// entry: { id, date, weight, unit, waist, chest, arm, thigh, hips, neck, mUnit, bodyFat }

const asc = (entries) => [...(entries || [])].sort((a, b) => a.date.localeCompare(b.date))
const DAY = 86400000
const dayNum = (key) => Date.parse(key + 'T12:00:00Z') / DAY

/** Weight in `unit`, averaged over the 7 days up to the newest weigh-in (smooths daily swings). */
export function avgWeight (entries, unit, days = 7) {
  const w = asc(entries).filter(e => e.weight != null)
  if (!w.length) return null
  const end = dayNum(w[w.length - 1].date)
  const recent = w.filter(e => end - dayNum(e.date) < days)
  return r1(recent.reduce((t, e) => t + convertLoad(e.weight, e.unit, unit), 0) / recent.length)
}

/**
 * Weekly rate of change over the last `days` days (least squares), in `unit` per week.
 * Needs at least 3 weigh-ins spread over 10+ days, otherwise null.
 */
export function weightRate (entries, unit, { days = 28, today = null } = {}) {
  const w = asc(entries).filter(e => e.weight != null)
  if (!w.length) return null
  const end = today ? dayNum(today) : dayNum(w[w.length - 1].date)
  const pts = w.filter(e => end - dayNum(e.date) < days).map(e => [dayNum(e.date), convertLoad(e.weight, e.unit, unit)])
  if (pts.length < 3 || pts[pts.length - 1][0] - pts[0][0] < 10) return null
  const n = pts.length
  const mx = pts.reduce((t, p) => t + p[0], 0) / n
  const my = pts.reduce((t, p) => t + p[1], 0) / n
  let num = 0; let den = 0
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2 }
  if (!den) return null
  const perWeek = (num / den) * 7
  return { perWeek: Math.round(perWeek * 100) / 100, pctPerWeek: my ? Math.round((perWeek / my) * 1000) / 10 : 0 }
}

/** The newest value of a measurement at or before `date`, in cm. */
function lastMeasure (sortedEntries, key, date) {
  for (let i = sortedEntries.length - 1; i >= 0; i--) {
    const e = sortedEntries[i]
    if (e.date <= date && e[key] != null) return toCm(e[key], e.mUnit || 'cm')
  }
  return null
}

/**
 * Body fat for an entry: the number you entered, or the Navy estimate from that day's waist
 * (with your latest neck and hip measurements). { value, source: 'entered'|'estimated' } or null.
 */
export function bodyFatOf (entry, entries, profile) {
  if (!entry) return null
  if (entry.bodyFat != null) return { value: entry.bodyFat, source: 'entered' }
  if (entry.waist == null) return null
  const sorted = asc(entries)
  const v = navyBodyFat({
    sex: profile?.sex,
    heightCm: profile?.heightCm,
    waistCm: toCm(entry.waist, entry.mUnit || 'cm'),
    neckCm: lastMeasure(sorted, 'neck', entry.date),
    hipsCm: lastMeasure(sorted, 'hips', entry.date)
  })
  return v == null ? null : { value: v, source: 'estimated' }
}

/** Body-fat readings over time (entered or estimated), oldest first. */
export function bodyFatSeries (entries, profile) {
  return asc(entries).map(e => ({ date: e.date, bf: bodyFatOf(e, entries, profile) })).filter(x => x.bf)
}

/** Newest body fat reading. */
export function latestBodyFat (entries, profile) {
  const s = bodyFatSeries(entries, profile)
  return s.length ? { ...s[s.length - 1].bf, date: s[s.length - 1].date } : null
}

/** Latest value of a measurement, converted to `mUnit`. */
export function latestMeasure (entries, key, mUnit) {
  const s = asc(entries).filter(e => e[key] != null)
  if (!s.length) return null
  const e = s[s.length - 1]
  return r1(fromCm(toCm(e[key], e.mUnit || 'cm'), mUnit))
}
