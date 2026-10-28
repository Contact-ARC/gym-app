// Pure training math — no Capacitor. Covered by test/training.test.js.
// Text goes through t() so the suggestions follow the app language (English is the key).
import { t } from '../i18n/index.js'
import { climbsIn, climbRecords, CLIMB_SET_WEIGHT } from './climbing.js'

export const KG_PER_LB = 0.45359237

export const DEFAULT_INCREMENTS = {
  kg: { upper: 2.5, lower: 5, dumbbell: 2, pin: 1 },
  lb: { upper: 5, lower: 10, dumbbell: 5, pin: 1 }
}

export const DEFAULT_PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5]
}

export const DEFAULT_BAR = { kg: 20, lb: 45 }

const round2 = (x) => Math.round(x * 100) / 100

/** Convert between kg and lb. 'pin' and other units pass through untouched. */
export function convertLoad (value, from, to) {
  if (value == null || from === to) return value
  if (from === 'kg' && to === 'lb') return value / KG_PER_LB
  if (from === 'lb' && to === 'kg') return value * KG_PER_LB
  return value
}

/** Round to the nearest multiple of `inc` (or down, if mode === 'down'). */
export function roundToIncrement (value, inc, mode = 'nearest') {
  if (value == null || !isFinite(value)) return null
  if (!inc || inc <= 0) return round2(value)
  const steps = value / inc
  const n = mode === 'down' ? Math.floor(steps + 1e-9) : Math.round(steps)
  return round2(n * inc)
}

/**
 * Estimated one-rep max.
 * Reps-in-reserve are added to the rep count (10 reps @ 2 RIR ≈ a 12-rep max effort).
 * Uses the average of Epley and Brzycki up to 10 effective reps, Epley alone above that.
 * Accuracy drops off past ~12 reps — treat high-rep estimates as rough.
 */
export function estimate1RM (load, reps, rir = 0) {
  if (!load || !reps || load <= 0 || reps <= 0) return 0
  const eff = reps + (rir || 0)
  if (eff === 1) return round2(load)
  const epley = load * (1 + eff / 30)
  const est = eff > 10 ? epley : (epley + load * 36 / (37 - eff)) / 2
  return Math.round(est * 10) / 10 // estimates don't deserve more precision than 0.1
}

/** Inverse of estimate1RM: load you should manage for `reps` with `rir` in reserve. */
export function loadForReps (oneRM, reps, rir = 0) {
  if (!oneRM || !reps) return 0
  const eff = reps + (rir || 0)
  if (eff === 1) return round2(oneRM)
  // Exactly undoes estimate1RM, which multiplies the load by the average of the two formulas' factors
  const epley = 1 + eff / 30
  if (eff > 10) return round2(oneRM / epley)
  const brzycki = 36 / (37 - eff)
  return round2(oneRM / ((epley + brzycki) / 2))
}

/** Smallest load jump for an exercise given the user's profile. */
export function incrementFor (exercise, profile) {
  const unit = profile?.unit || 'kg'
  const inc = profile?.increments || DEFAULT_INCREMENTS[unit]
  if (exercise?.loadUnit === 'pin') return inc.pin || 1
  return inc[exercise?.incrementGroup || 'upper'] || DEFAULT_INCREMENTS[unit].upper
}

/** The unit a set for this exercise is logged in. */
export function unitFor (exercise, profile) {
  if (exercise?.loadUnit === 'pin') return 'pin'
  return profile?.unit || 'kg'
}

function mostCommonLoad (sets) {
  const counts = new Map()
  for (const s of sets) {
    if (s.load == null) continue
    counts.set(s.load, (counts.get(s.load) || 0) + 1)
  }
  let best = null
  let bestCount = 0
  for (const [load, c] of counts) {
    if (c > bestCount || (c === bestCount && load > best)) { best = load; bestCount = c }
  }
  return best
}

function avg (arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

/**
 * Double-progression suggestion for the next session.
 *
 * @param {object}   args.item       routine item ({ sets, repRange:[lo,hi] } or { sets, durationSec:[lo,hi] })
 * @param {object}   args.exercise   exercise definition
 * @param {object[]} args.history    previous sessions for this exercise, newest first: [{ date, sets:[{load,unit,reps,seconds,rir}] }]
 * @param {object}   args.profile    { unit, increments }
 * @param {boolean}  args.deload     deload week → lighter suggestion (~90%)
 * @param {number}   args.loadFactor explicit multiplier (e.g. 0.9) for deload weeks or a "rough day"
 * @param {string}   args.reason     short label for why it's lighter ("Deload week", "Lighter day")
 * @returns {{ load:number|null, reps:number|null, seconds:number|null, unit:string, text:string, kind:string }}
 */
export function suggestNext ({ item, exercise, history = [], profile, deload = false, loadFactor = null, reason = '' }) {
  const factor = loadFactor ?? (deload ? 0.9 : 1)
  const why = reason || (deload ? t('Deload week') : t('Lighter day'))
  // Warm-ups and drop sets don't say anything about your working weight
  history = history.map(h => ({ ...h, sets: h.sets.filter(isWorkSet).filter(x => x.type !== 'drop') })).filter(h => h.sets.length)
  const unit = unitFor(exercise, profile)
  const inc = incrementFor(exercise, profile)
  const logType = exercise?.logType || 'weight'
  // Barbell lifts: suggest totals you can load with your plates (Tools → Plates)
  const onBar = logType === 'weight' && unit !== 'pin' && isBarbellLift(exercise)
  const bar = onBar ? (profile?.bar ?? DEFAULT_BAR[unit] ?? 0) : null
  const plates = onBar ? platesFor(profile) : null
  /** A lighter weight than `ref` around `value`: loadable on a barbell (or `ref` if nothing lighter is). */
  const lighter = (value, ref) => {
    if (!onBar || value == null) return value
    let v = snapToPlates(value, bar, plates)
    if (v == null || v >= ref - 1e-9) v = snapToPlates(Math.min(value, ref - 0.01), bar, plates, 'down')
    return v == null || v >= ref - 1e-9 ? ref : v
  }

  // ── Timed holds/carries ───────────────────────────────
  if (item?.durationSec) {
    const [lo, hi] = item.durationSec
    const last = history[0]
    const secs = last ? last.sets.map(s => s.seconds).filter(Boolean) : []
    const lastLoad = last ? mostCommonLoad(last.sets) : null
    if (!secs.length) {
      return { load: lastLoad, reps: null, seconds: lo, unit, kind: 'start', text: t('Start at {lo}s and build toward {hi}s.', { lo, hi }) }
    }
    const minSecs = Math.min(...secs)
    if (minSecs >= hi) {
      const nextLoad = logType === 'time' && lastLoad != null ? roundToIncrement(lastLoad + inc, inc) : lastLoad
      return {
        load: nextLoad, reps: null, seconds: lo, unit, kind: 'up',
        text: lastLoad != null
          ? t('Held {hi}s on every set — add load and restart at {lo}s.', { lo, hi })
          : t('Held {hi}s on every set — make it harder (load or harder variation) and restart at {lo}s.', { lo, hi })
      }
    }
    const target = Math.min(hi, minSecs + 5)
    return { load: lastLoad, reps: null, seconds: target, unit, kind: 'same', text: t('Last shortest set: {a}s. Aim for {b}s.', { a: minSecs, b: target }) }
  }

  const [lo, hi] = item?.repRange || [8, 12]
  const sessions = history
    .map(h => ({ ...h, sets: h.sets.filter(s => s.reps != null) }))
    .filter(h => h.sets.length)

  if (!sessions.length) {
    const text = logType === 'bodyweight'
      ? t('No history yet — do {lo}–{hi} reps leaving 1–2 in the tank. Add weight once {hi} is easy.', { lo, hi })
      : t('No history yet — pick a weight you could lift ~{n} times, then do {lo}–{hi} reps.', { lo, hi, n: hi + 2 })
    return { load: logType === 'bodyweight' ? 0 : null, reps: lo, seconds: null, unit, kind: 'start', text }
  }

  const last = sessions[0]
  // Keep the load you actually used; only re-round if you've switched kg <-> lb since
  const norm = (load, from) => {
    if (load == null) return null
    const f = from || unit
    return f === unit ? load : roundToIncrement(convertLoad(load, f, unit), inc)
  }
  const lastLoad = norm(mostCommonLoad(last.sets), last.sets.find(s => s.unit)?.unit)
  const atLoad = last.sets.filter(s => s.load == null || Math.abs(norm(s.load, s.unit) - lastLoad) < 0.01)
  const reps = atLoad.map(s => s.reps)
  const rirs = atLoad.map(s => s.rir).filter(r => r != null)
  const targetSets = item?.sets || reps.length
  const lastStr = `${lastLoad ? fmtLoad(lastLoad, unit) : t('BW')} × ${reps.join(', ')}`

  let result
  const allTop = reps.length >= targetSets && reps.every(r => r >= hi)
  if (allTop) {
    const easy = rirs.length && avg(rirs) >= 3
    let load = round2((lastLoad || 0) + (easy ? inc * 2 : inc))
    if (onBar && lastLoad) load = snapToPlates(load, bar, plates, 'up') ?? load
    const jump = round2(load - (lastLoad || 0))
    result = {
      load, reps: lo, kind: 'up',
      text: t(easy ? 'Last: {last}. Hit {hi} on every set with reps to spare → add {jump}, aim for {lo}+.' : 'Last: {last}. Hit {hi} on every set → add {jump}, aim for {lo}+.', { last: lastStr, hi, lo, jump: fmtLoad(jump, unit) })
    }
  } else {
    // Stalled below the range for two sessions at the same load → back off ~10%
    const prev = sessions[1]
    const lastBelow = avg(reps) < lo
    let prevBelow = false
    if (prev && lastBelow) {
      const prevLoad = norm(mostCommonLoad(prev.sets), prev.sets.find(s => s.unit)?.unit)
      const prevAt = prev.sets.filter(s => s.load == null || Math.abs(norm(s.load, s.unit) - prevLoad) < 0.01)
      prevBelow = prevLoad != null && Math.abs(prevLoad - lastLoad) < 0.01 && avg(prevAt.map(s => s.reps)) < lo
    }
    if (lastBelow && prevBelow && lastLoad) {
      result = {
        load: lighter(roundToIncrement(lastLoad * 0.9, inc, 'down'), lastLoad), reps: lo, kind: 'down',
        text: t('Last: {last}. Below {lo} reps two sessions running → drop ~10% and build back up.', { last: lastStr, lo })
      }
    } else {
      const target = Math.min(hi, Math.max(lo, Math.min(...reps) + 1))
      result = {
        load: lastLoad, reps: target, kind: 'same',
        text: t('Last: {last}. Same weight — aim for {n}+ on each set.', { last: lastStr, n: target })
      }
    }
  }

  if (factor < 1 && result.load) {
    result.load = lighter(roundToIncrement(result.load * factor, inc, 'down'), result.load)
    result.text = t('{why}: {load}, about {pct}% of normal. Stop each set with 3 or more reps left. Last time: {last}.', { why, load: fmtLoad(result.load, unit), pct: Math.round(factor * 100), last: lastStr })
    result.kind = 'deload'
  }
  return { seconds: null, unit, ...result }
}

/**
 * Weight for the next set of the same exercise, from the set you just finished.
 * Uses how many reps you had left (rir) against the plan's target, and the routine's rep range:
 * estimate today's max from that set, then pick the weight that leaves the target reps in reserve.
 * Without a "reps left" answer it only reacts to reps outside the range.
 * Small steps on purpose: up to +5% or −10% per set, and nothing under one weight jump.
 * Pass `bar` and `plates` for barbell lifts to only suggest weights you can load.
 * @returns {{ load:number, reps:number, kind:'up'|'down', why:'easy'|'hard'|'over'|'under' }|null}  null = keep the weight
 */
export function nextSetAdjust ({ load, reps, rir = null, repRange, targetRir = 2, inc, unit, logType = 'weight', bar = null, plates = null }) {
  if (!repRange || !reps || load == null || logType !== 'weight') return null
  const [lo, hi] = repRange
  const tr = targetRir ?? 2
  const targetReps = Math.min(hi, Math.max(lo, reps))
  if (rir == null && reps >= lo && reps <= hi) return null // in range, no effort info: nothing to go on
  const why = rir != null ? null : (reps < lo ? 'under' : 'over')
  // Machine pins aren't weights, so step one pin at a time
  if (unit === 'pin') {
    const up = reps > hi || (rir != null && rir >= tr + 2)
    const down = reps < lo || (rir != null && rir === 0 && reps <= lo)
    if (up === down) return null
    const next = Math.max(1, load + (up ? 1 : -1))
    return next === load ? null : { load: next, reps: targetReps, kind: up ? 'up' : 'down', why: why || (up ? 'easy' : 'hard') }
  }
  if (!(load > 0) || !inc) return null
  const effRir = rir != null ? rir : (reps < lo ? 0 : tr)
  const max = estimate1RM(load, reps, effRir)
  let next = loadForReps(max, targetReps, tr)
  const lo2 = load * 0.9
  next = Math.min(load * 1.05, Math.max(lo2, next))
  if (bar != null && plates) {
    // Barbell: only weights you can load, still within the same limits (often that means keeping the weight)
    if (next > load) {
      next = snapToPlates(next, bar, plates, 'down')
      if (next == null || next <= load + 1e-9) return null
    } else {
      let v = snapToPlates(next, bar, plates)
      if (v != null && v >= load - 1e-9) v = snapToPlates(next, bar, plates, 'down')
      if (v == null || v >= load - 1e-9 || v < lo2 - 1e-9) return null
      next = v
    }
  } else {
    next = roundToIncrement(next, inc, next < load ? 'nearest' : 'down')
    if (Math.abs(next - load) < inc - 1e-9) return null
  }
  const kind = next > load ? 'up' : 'down'
  return { load: next, reps: targetReps, kind, why: why || (kind === 'up' ? 'easy' : 'hard') }
}

export function fmtLoad (load, unit) {
  if (load == null) return '—'
  if (unit === 'pin') return t('pin {n}', { n: load })
  return `${round2(load)} ${unit}`
}

const PLATE_SCALE = 1000

/**
 * Every per-side weight up to `goal` + one plate that your plates can make, with the fewest plates.
 * Works in whole units of the plates' common divisor (1.25 kg for the standard kg set) so sums are exact.
 * null when the table would be huge (odd plate sets), or there are no plates.
 */
function plateTable (perSide, plates) {
  const ps = [...new Set((plates || []).filter(p => p > 0).map(p => Math.round(p * PLATE_SCALE)))].sort((a, b) => b - a)
  if (!ps.length) return null
  const gcd = (a, b) => (b ? gcd(b, a % b) : a)
  const g = ps.reduce(gcd)
  const units = ps.map(p => p / g)
  const goal = Math.max(0, Math.round(perSide * PLATE_SCALE)) / g
  // The lightest load at or above the goal is never more than one plate past it
  const limit = Math.ceil(goal) + units[0]
  if (limit > 200000) return null
  const count = new Int32Array(limit + 1).fill(-1) // fewest plates for each per-side weight, -1 = can't
  const last = new Int32Array(limit + 1) // the plate added last on that best way
  count[0] = 0
  for (let w = 1; w <= limit; w++) {
    for (const u of units) { // heaviest first: on a tie in plate count, keep the heavier plates
      if (u > w || count[w - u] < 0) continue
      if (count[w] < 0 || count[w - u] + 1 < count[w]) { count[w] = count[w - u] + 1; last[w] = u }
    }
  }
  let below = Math.floor(goal + 1e-9)
  while (below > 0 && count[below] < 0) below--
  let above = Math.ceil(goal - 1e-9)
  while (above <= limit && count[above] < 0) above++
  const toKg = (w) => round2((w * g) / PLATE_SCALE)
  const platesOf = (w) => {
    const out = []
    for (; w > 0; w -= last[w]) out.push(toKg(last[w]))
    return out.sort((a, b) => b - a)
  }
  return { goal, below, above: above > limit ? null : above, toKg, platesOf }
}

/** The plates you have (Tools → Plates), or the standard set for your unit. */
export function platesFor (profile) {
  const p = profile?.plates
  return Array.isArray(p) && p.length ? p : (DEFAULT_PLATES[profile?.unit || 'kg'] || [])
}

/**
 * The loadable barbell totals either side of `target`: { below: ≤ target, above: ≥ target }, null where there's none.
 * Assumes as many pairs of each plate as you need.
 */
export function loadableAround (target, bar, plates) {
  if (target == null || bar == null) return { below: null, above: null }
  if (target < bar - 1e-9) return { below: null, above: round2(bar) }
  const tb = plateTable((target - bar) / 2, plates)
  if (!tb) return { below: round2(bar), above: Math.abs(target - bar) < 1e-9 ? round2(bar) : null }
  return {
    below: round2(bar + 2 * tb.toKg(tb.below)),
    above: tb.above == null ? null : round2(bar + 2 * tb.toKg(tb.above))
  }
}

/** Can this total be loaded on the bar? */
export function isLoadable (load, bar, plates) {
  const { below } = loadableAround(load, bar, plates)
  return below != null && Math.abs(below - load) < 0.005
}

/**
 * Round a barbell weight to a total you can load. mode: 'nearest' (a tie goes lighter), 'down' or 'up'.
 * Returns null when there's nothing that way (lighter than the bar, say).
 */
export function snapToPlates (value, bar, plates, mode = 'nearest') {
  if (value == null) return null
  const { below, above } = loadableAround(value, bar, plates)
  if (mode === 'down') return below
  if (mode === 'up') return above
  if (below == null) return above
  if (above == null) return below
  return (above - value) < (value - below) - 1e-9 ? above : below
}

/**
 * Plates per side of the bar for the loadable total closest to `target` (above or below).
 * Assumes as many pairs of each plate as you need. Of the ways to load that total, uses the fewest
 * plates, preferring the heavier ones. On a tie between a lighter and a heavier total, picks the lighter.
 * @returns {{ perSide:number[], achieved:number, remainder:number, lighter:number|null, heavier:number|null, error?:string }}
 *   remainder = target − achieved (negative when the closest is heavier);
 *   lighter / heavier: the nearest loadable total on the other side of the target, when it isn't exact.
 */
export function platesPerSide (target, bar, plates) {
  const none = { perSide: [], lighter: null, heavier: null }
  if (target == null || bar == null) return { ...none, achieved: bar || 0, remainder: 0 }
  if (target < bar - 1e-9) return { ...none, achieved: bar, remainder: round2(target - bar), error: t('Target is lighter than the bar.') }
  if (Math.abs(target - bar) < 1e-9 || !(plates || []).some(p => p > 0)) {
    return { ...none, achieved: round2(bar), remainder: round2(target - bar) }
  }
  const tb = plateTable((target - bar) / 2, plates)
  if (!tb) return greedyPlates(target, bar, plates)
  const exact = Math.abs(tb.below - tb.goal) < 1e-9
  let pick = tb.below
  let other = null
  if (!exact && tb.above != null) {
    pick = (tb.above - tb.goal) < (tb.goal - tb.below) - 1e-9 ? tb.above : tb.below
    other = pick === tb.above ? tb.below : tb.above
  }
  const perSide = tb.platesOf(pick)
  const achieved = round2(bar + 2 * tb.toKg(pick))
  const remainder = round2(target - achieved)
  const otherTotal = other == null ? null : round2(bar + 2 * tb.toKg(other))
  return {
    perSide, achieved, remainder,
    lighter: remainder < 0 ? otherTotal : null,
    heavier: remainder > 0 ? otherTotal : null
  }
}

/** Fallback for odd plate sets that would need a huge table: heaviest plates first, never over. */
function greedyPlates (target, bar, plates) {
  let rem = round2((target - bar) / 2)
  const perSide = []
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (rem + 1e-9 >= p) { perSide.push(p); rem = round2(rem - p) }
  }
  const achieved = round2(bar + 2 * perSide.reduce((a, b) => a + b, 0))
  return { perSide, achieved, remainder: round2(target - achieved), lighter: null, heavier: null }
}

// Warm-up ramps: [share of the working weight, reps]
const RAMPS = {
  full: [[0.4, 8], [0.6, 5], [0.8, 3]], // heavy first lift for a muscle
  light: [[0.5, 6], [0.75, 4]], // first lift for a muscle, 7–12 reps
  feeler: [[0.55, 6]] // muscle already warm from bodyweight work: one set to feel the weight
}

/**
 * Warm-up ramp toward a working weight. bar = 0 for dumbbells/machines.
 * With `plates` (barbell lifts), each warm-up is a weight you can load with them.
 * kind: 'full' (empty bar + 40/60/80%), 'light' (50/75%) or 'feeler' (one set at ~55%).
 * Dumbbells and machines never go under one weight step (`inc`), the lightest you can pick.
 */
export function warmupSets (working, inc, bar = 0, plates = null, kind = 'full') {
  if (!working || working <= 0) return []
  const out = []
  if (kind === 'full' && bar > 0 && working > bar) out.push({ load: bar, reps: 10, label: t('Empty bar') })
  for (const [pct, reps] of RAMPS[kind] || RAMPS.full) {
    const load = bar > 0 && plates ? snapToPlates(working * pct, bar, plates) : roundToIncrement(working * pct, inc)
    if (load == null || load <= bar || load >= working) continue
    // Dumbbells/machines: at least the lightest step, and at least one step under the working weight
    if (bar === 0 && inc && (load < inc - 1e-9 || working - load < inc - 1e-9)) continue
    if (out.some(s => s.load === load)) continue
    // With limited plates the weight can land a way off the step, so label what it really is
    const label = kind === 'feeler' ? '' : `${Math.round((bar > 0 && plates ? load / working : pct) * 100)}%` // the card already says "Feeler set"
    out.push({ load, reps, label })
  }
  // A light barbell lift: nothing between the bar and the working weight, so the bar is the warm-up
  if (!out.length && kind !== 'full' && bar > 0 && working > bar) {
    out.push({ load: bar, reps: kind === 'feeler' ? 6 : 10, label: t('Empty bar') })
  }
  return out
}

/** How big a warm-up an exercise's working sets call for, ignoring what you've done before it. */
export function warmupSize (exercise, item) {
  const [lo, hi] = item?.repRange || [8, 12]
  if (isBarbellLift(exercise) || hi <= 6) return 'full'
  return lo >= 13 ? null : 'light'
}

/**
 * Which warm-up an exercise gets in this workout: 'full' | 'light' | 'feeler' | null.
 *  - Its main muscles already worked with weight earlier (main or helping muscles of an earlier
 *    exercise): none, they're warm.
 *  - Warmed only by bodyweight work (pull-ups before rows): one feeler set, the first time under load.
 *  - First time for a main muscle: a full ramp for heavy work (barbell lifts or 6 reps or fewer),
 *    a light one for 7–12 reps.
 *  - Isolation (one main muscle, not a barbell lift), core work or 13+ reps: none; the first reps are the warm-up.
 * `before`: [{ exercise, weighted }] for exercises you've logged sets of earlier in this workout.
 */
export function warmupKind ({ exercise, item, before = [] }) {
  if (!exercise || exercise.logType !== 'weight' || !item?.repRange) return null
  const primary = exercise.primary || []
  const loaded = new Set()
  const warmed = new Set()
  for (const b of before) {
    for (const m of [...(b.exercise?.primary || []), ...(b.exercise?.secondary || [])]) {
      warmed.add(m)
      if (b.weighted) loaded.add(m)
    }
  }
  if (primary.length && primary.every(m => loaded.has(m))) return null
  // Isolation (one main muscle) and core work (Pallof press, cable crunch) start light anyway
  const isolation = (primary.length <= 1 || primary.every(m => m === 'abs' || m === 'obliques')) && !isBarbellLift(exercise)
  if (item.repRange[0] >= 13 || isolation) return null
  if (primary.length && primary.every(m => warmed.has(m))) return 'feeler'
  return warmupSize(exercise, item)
}

// ── Set types ───────────────────────────────────────────
// type: undefined/'normal' | 'warmup' | 'drop' | 'failure' | 'amrap'
export const SET_TYPES = {
  drop: { short: 'D', label: 'Drop set' },
  failure: { short: 'F', label: 'To failure' },
  amrap: { short: 'A', label: 'As many as possible' },
  warmup: { short: 'W', label: 'Warm-up' }
}
/** Counts toward records, charts and progression (everything except warm-ups). */
export const isWorkSet = (s) => s && s.type !== 'warmup'
/** Fills one of the planned sets (warm-ups and drop sets are extras). */
export const fillsPlannedSet = (s) => s && s.type !== 'warmup' && s.type !== 'drop'

// ── Session analytics ───────────────────────────────────

export function setVolume (s, toUnit) {
  if (!isWorkSet(s) || !s.reps || s.load == null || s.unit === 'pin') return 0
  return convertLoad(s.load, s.unit, toUnit) * s.reps
}

export function sessionVolume (session, toUnit) {
  return round2((session.sets || []).reduce((t, s) => t + setVolume(s, toUnit), 0))
}

/** Best e1RM among sets (in `toUnit`; pin sets stay in pins). */
export function bestE1RM (sets, toUnit) {
  let best = 0
  for (const s of sets) {
    if (!isWorkSet(s) || !s.reps || s.load == null || s.load <= 0) continue
    const load = s.unit === 'pin' ? s.load : convertLoad(s.load, s.unit, toUnit)
    best = Math.max(best, estimate1RM(load, s.reps, s.rir || 0))
  }
  return round2(best)
}

export function heaviest (sets, toUnit) {
  let best = 0
  for (const s of sets) {
    if (!isWorkSet(s) || s.load == null || !s.reps) continue
    best = Math.max(best, s.unit === 'pin' ? s.load : convertLoad(s.load, s.unit, toUnit))
  }
  return round2(best)
}

/** Load of a set in `toUnit` (pins stay pins, bodyweight counts as 0). */
function loadIn (s, toUnit) {
  if (s.load == null) return 0
  return s.unit === 'pin' ? s.load : round2(convertLoad(s.load, s.unit, toUnit))
}

/**
 * Rep records: the most reps you've done at each weight, keeping only sets
 * nothing else beats (no other set has as much weight AND as many reps). Heaviest first.
 * @param {{load,unit,reps,type,date?}[]} sets
 */
export function repRecords (sets, toUnit) {
  const pts = []
  for (const s of sets) {
    if (!isWorkSet(s) || !s.reps) continue
    pts.push({ load: loadIn(s, toUnit), reps: s.reps, date: s.date || null })
  }
  pts.sort((a, b) => b.load - a.load || b.reps - a.reps || String(a.date).localeCompare(String(b.date)))
  const out = []
  let best = 0
  for (const p of pts) {
    if (p.reps > best) { out.push(p); best = p.reps }
  }
  return out
}

/** Longest timed set (holds, carries) at or above each load. */
export function bestSeconds (sets) {
  let best = 0
  for (const s of sets) if (isWorkSet(s) && s.seconds) best = Math.max(best, s.seconds)
  return best
}

/**
 * PRs set in `session` compared with all `previous` sessions.
 * Types: e1rm (estimated max), load (heaviest set), reps (more reps at a weight than ever at that weight or heavier),
 * time (longest hold).
 * @returns {{ exerciseId:string, type:'e1rm'|'load'|'reps'|'time', value:number, prev:number, load?:number }[]}
 */
export function detectPRs (session, previous, toUnit) {
  const prs = []
  const ids = [...new Set((session.sets || []).map(s => s.exerciseId))]
  for (const id of ids) {
    const mine = session.sets.filter(s => s.exerciseId === id && isWorkSet(s))
    const before = previous.flatMap(p => (p.sets || []).filter(s => s.exerciseId === id && isWorkSet(s)))
    if (!before.length || !mine.length) continue // first time isn't a PR, it's a baseline
    // Climbs: hardest send and hardest flash, per grade system
    if (mine.some(s => s.climb)) {
      prs.push(...climbRecords(climbsIn(mine), climbsIn(before), id))
      continue
    }
    // Machine pins aren't real weights, so an "estimated max" in pins means nothing
    const pin = mine.some(s => s.unit === 'pin')
    const e = pin ? 0 : bestE1RM(mine, toUnit); const eb = pin ? 0 : bestE1RM(before, toUnit)
    if (e > eb && eb > 0) prs.push({ exerciseId: id, type: 'e1rm', value: e, prev: eb })
    const h = heaviest(mine, toUnit); const hb = heaviest(before, toUnit)
    if (h > hb && hb > 0) prs.push({ exerciseId: id, type: 'load', value: h, prev: hb })
    // Rep record: heaviest set that beat the best reps ever done at that weight or more
    let rep = null
    for (const s of mine) {
      if (!s.reps) continue
      const l = loadIn(s, toUnit)
      const prevBest = Math.max(0, ...before.filter(b => b.reps && loadIn(b, toUnit) >= l - 0.01).map(b => b.reps))
      if (prevBest > 0 && s.reps > prevBest && (!rep || l > rep.load || (l === rep.load && s.reps > rep.value))) {
        rep = { exerciseId: id, type: 'reps', value: s.reps, prev: prevBest, load: l }
      }
    }
    if (rep) prs.push(rep)
    const t1 = bestSeconds(mine); const t0 = bestSeconds(before)
    if (t1 > t0 && t0 > 0) prs.push({ exerciseId: id, type: 'time', value: t1, prev: t0 })
  }
  return prs
}

/** Hard sets per muscle. Primary muscles count 1, secondary 0.5. A logged climb counts a quarter of that. */
export function setsPerMuscle (sessions, exercisesById) {
  const out = {}
  for (const sess of sessions) {
    for (const s of sess.sets || []) {
      if (!isWorkSet(s) || (!s.reps && !s.seconds && !s.climb)) continue
      const ex = exercisesById[s.exerciseId]
      if (!ex) continue
      const w = s.climb ? CLIMB_SET_WEIGHT : 1
      for (const m of ex.primary || []) out[m] = (out[m] || 0) + w
      for (const m of ex.secondary || []) out[m] = (out[m] || 0) + 0.5 * w
    }
  }
  return out
}

// ── Equipment ───────────────────────────────────────────
export const EQUIPMENT = {
  barbell: 'Barbells and plates',
  rack: 'Squat rack or half rack',
  bench: 'Benches',
  dumbbells: 'Dumbbells or kettlebells',
  ezbar: 'EZ bar',
  cable: 'Cable stack or functional trainer',
  smith: 'Smith machine',
  legpress: 'Leg press',
  legcurl: 'Leg curl machine',
  legext: 'Leg extension machine',
  hacksquat: 'Hack squat machine',
  hipmachine: 'Hip abduction and adduction machines',
  calfmachine: 'Seated calf raise machine',
  pressmachine: 'Chest and shoulder press machines',
  pecdeck: 'Pec deck (chest fly and rear delt machine)',
  assisted: 'Assisted pull-up machine',
  preacher: 'Preacher curl bench',
  backext: 'Back extension bench',
  pullup: 'Pull-up bar',
  dips: 'Dip bars',
  box: 'Plyo box or step',
  medball: 'Medicine ball or slam ball',
  ball: 'Exercise ball',
  battlerope: 'Battle rope',
  rower: 'Rowing machine',
  hangboard: 'Hangboard'
}
// First match wins for each piece of equipment, so the specific machines come first
const EQUIP_RULES = [
  [/hip (ab|ad)duction machine/, 'hipmachine'], [/leg extension/, 'legext'], [/pec deck/, 'pecdeck'],
  [/(chest|shoulder) press machine/, 'pressmachine'], [/hack squat/, 'hacksquat'], [/seated calf/, 'calfmachine'],
  [/assisted pull-up/, 'assisted'], [/back extension/, 'backext'], [/preacher/, 'preacher'], [/dip bars/, 'dips'],
  [/hangboard/, 'hangboard'], [/battle rope/, 'battlerope'], [/medicine ball(?! or)|slam ball/, 'medball'], [/exercise ball/, 'ball'], [/rowing machine/, 'rower'],
  [/smith/, 'smith'], [/leg press/, 'legpress'], [/leg curl/, 'legcurl'],
  [/ez bar/i, 'ezbar'], [/barbell|bar pad/, 'barbell'], [/rack/, 'rack'], [/bench/, 'bench'],
  [/dumbbell|kettlebell/, 'dumbbells'], [/cable|pulldown|row station|functional trainer/, 'cable'],
  [/pull-up bar/, 'pullup'], [/plyo box|step/, 'box']
]
/** Canonical equipment an exercise needs, from its free-text equipment list. */
export function equipmentTags (exercise) {
  const tags = new Set()
  for (const raw of exercise?.equipment || []) {
    const e = raw.toLowerCase()
    for (const [re, tag] of EQUIP_RULES) if (re.test(e)) { tags.add(tag); break }
  }
  return [...tags]
}
/** true when every piece of equipment the exercise needs is available (missing = assume available). */
export function canDoAtGym (exercise, available) {
  if (!available) return true
  return equipmentTags(exercise).every(t => available[t] !== false)
}

/** Equipment the exercise needs that is switched off in Settings, Your gym (labels, untranslated). */
export function missingEquipment (exercise, available) {
  if (!available) return []
  return equipmentTags(exercise).filter(t => available[t] === false).map(t => EQUIPMENT[t])
}

/**
 * How well exercise b can stand in for a.
 *  - Muscles: a weighted overlap where a main muscle counts 1 and a secondary one 0.4 (shared ÷ combined,
 *    so muscles only one of them trains pull it down).
 *  - Movement: the same pattern (vertical pull, hinge, chest fly…) adds 0.25. A lat pulldown and a row
 *    work much the same muscles, but only the pulldown moves like a pull-up.
 *  - Same log type (weighted, bodyweight, timed) adds 0.05.
 * level: 'close' needs both the muscles and, when both have one, the same pattern; otherwise at most
 * 'partial'. null when they share no main muscle.
 */
export function exerciseMatch (a, b) {
  const w = (e) => {
    const m = {}
    for (const x of e?.secondary || []) m[x] = 0.4
    for (const x of e?.primary || []) m[x] = 1
    return m
  }
  const wa = w(a); const wb = w(b)
  if (!(a?.primary || []).some(x => (b?.primary || []).includes(x))) return null
  let shared = 0; let all = 0
  for (const m of new Set([...Object.keys(wa), ...Object.keys(wb)])) {
    shared += Math.min(wa[m] || 0, wb[m] || 0)
    all += Math.max(wa[m] || 0, wb[m] || 0)
  }
  const overlap = all ? shared / all : 0
  const known = !!(a.pattern && b.pattern)
  const samePattern = known && a.pattern === b.pattern
  const level = overlap >= 0.55 && (samePattern || !known) ? 'close' : overlap >= 0.4 || samePattern ? 'partial' : 'loose'
  return {
    score: overlap + (samePattern ? 0.25 : 0) + (a.logType && a.logType === b.logType ? 0.05 : 0),
    level
  }
}

/**
 * Exercises your gym can do instead of one it can't: the exercise's own (hand-picked) alternatives
 * first, then the best muscle matches, each group closest first. How often you've done one only breaks ties.
 *   usage: { [exerciseId]: workouts it was in }
 */
export function gymAlternatives (exercise, byId, available, usage = {}, max = 6) {
  if (!exercise) return []
  const ok = (e) => e && e.id !== exercise.id && !e.hidden && canDoAtGym(e, available)
  const score = (e) => exerciseMatch(exercise, e)?.score ?? -1
  // Hand-picked ones first, closest match first (the library's order breaks ties)
  const out = [...new Set(exercise.alternatives || [])].filter(id => ok(byId[id]))
    .map((id, i) => ({ id, i, s: score(byId[id]) }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map(x => x.id)
  if (out.length < max) {
    const ranked = Object.values(byId)
      .filter(e => ok(e) && !out.includes(e.id))
      .map(e => ({ e, m: exerciseMatch(exercise, e) }))
      .filter(x => x.m)
      .sort((x, y) => y.m.score - x.m.score || (usage[y.e.id] || 0) - (usage[x.e.id] || 0) || x.e.name.localeCompare(y.e.name))
    for (const x of ranked) { if (out.length >= max) break; out.push(x.e.id) }
  }
  return out.slice(0, max)
}

/**
 * The list every swap screen shows. Measured against what the routine had (original) when you've
 * already swapped, so going back is one tap and the ranking doesn't drift with each swap.
 *   → [{ id, original?, picked?, level }]  (picked = hand-picked in the library; level from exerciseMatch)
 */
export function swapOptions ({ current, original = null, byId, available, usage = {}, max = 8 }) {
  const base = byId[original] || byId[current]
  if (!base) return []
  const out = []
  if (original && original !== current && canDoAtGym(base, available) && !base.hidden) out.push({ id: original, original: true, level: null })
  const picked = new Set(base.alternatives || [])
  for (const id of gymAlternatives(base, byId, available, usage, max + 2)) {
    if (id === current || out.some(o => o.id === id)) continue
    if (out.length >= max) break
    out.push({ id, picked: picked.has(id), level: exerciseMatch(base, byId[id])?.level || null })
  }
  return out
}

/** Is this loaded on a straight barbell, so a plate breakdown makes sense? */
export function isBarbellLift (exercise) {
  if (!exercise || exercise.loadUnit === 'pin') return false
  const eq = (exercise.equipment || []).join(' ').toLowerCase()
  return /\bbarbell\b/.test(eq) && !/smith|ez bar/i.test(eq)
}

// ── Dates ───────────────────────────────────────────────

export function dateKey (d = new Date()) {
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 1-based week number since the routine's effectiveFrom date. */
export function routineWeek (effectiveFrom, today = new Date()) {
  if (!effectiveFrom) return 1
  const [y, m, d] = effectiveFrom.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.floor((t - start) / 86400000)
  return Math.max(1, Math.floor(days / 7) + 1)
}

/**
 * What applies today: target reps-in-reserve, deload, extra/fewer sets.
 * Routine fields (all optional):
 *   rir: 2                          default target for the whole month
 *   deloadWeek: 4                   legacy shorthand for a deload week
 *   weekPlan: [{ week, rir, focus, deload, setDelta, loadFactor, applyTo }]
 *   datePlan: [{ from, to, rir, focus, deload, setDelta, loadFactor, applyTo }]   (overrides weekPlan)
 * applyTo: 'all' (default) or 'first' (only the first exercise of each day).
 * A deload defaults to one set fewer per exercise and ~90% load.
 */
export function resolvePlan (routine, today = new Date()) {
  const plan = { week: 1, rir: null, focus: '', deload: false, setDelta: 0, loadFactor: 1, applyTo: 'all', source: null }
  if (!routine) return plan
  plan.week = routineWeek(routine.effectiveFrom, today)
  if (routine.rir != null) plan.rir = routine.rir
  const apply = (e, source) => {
    if (!e) return
    if (e.rir != null) plan.rir = e.rir
    if (e.focus) { plan.focus = e.focus; plan.es = e.es?.focus ? { focus: e.es.focus } : undefined }
    if (e.deload) {
      plan.deload = true
      plan.setDelta = e.setDelta ?? -1
      plan.loadFactor = e.loadFactor ?? 0.9
    } else {
      if (e.setDelta != null) plan.setDelta = e.setDelta
      if (e.loadFactor != null) plan.loadFactor = e.loadFactor
    }
    if (e.applyTo) plan.applyTo = e.applyTo
    plan.source = source
  }
  if (routine.deloadWeek && routine.deloadWeek === plan.week) apply({ deload: true }, 'week')
  apply((routine.weekPlan || []).find(w => w.week === plan.week), 'week')
  const key = dateKey(today)
  apply((routine.datePlan || []).find(d => d.from <= key && key <= (d.to || d.from)), 'date')
  return plan
}

/** Planned sets for one routine item after today's plan is applied. */
export function plannedSetsFor (item, index, plan) {
  const base = item?.sets || 1
  if (!plan?.setDelta) return base
  if (plan.applyTo === 'first' && index !== 0) return base
  return Math.max(1, base + plan.setDelta)
}

/**
 * Routine tracks: an item can carry a `beginner` block that overrides it for people on the beginner track:
 *   { exerciseId, sets, repRange, durationSec, restSec, note }
 */
export function applyTrack (item, level) {
  if (!item || level !== 'beginner' || !item.beginner) return item
  const { beginner, ...rest } = item
  const out = { ...rest, ...beginner }
  // Swapping a rep exercise for a timed one (or back) replaces the range type
  if (beginner.durationSec) delete out.repRange
  if (beginner.repRange) delete out.durationSec
  if (beginner.es || rest.es) out.es = { ...(rest.es || {}), ...(beginner.es || {}) }
  out.track = 'beginner'
  return out
}

/** Pick the routine entry in effect today from latest.json's routines list. */
export function pickActiveRoutine (entries, today = dateKey()) {
  const live = (entries || []).filter(e => e.effectiveFrom <= today)
  live.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
  return live[0] || null
}

/** Simple semver compare: returns 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions (a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0; const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}
