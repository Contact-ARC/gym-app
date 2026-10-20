// Pure training math — no Vue, no Capacitor. Covered by test/training.test.js.

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
  const epley = oneRM / (1 + eff / 30)
  if (eff > 10) return round2(epley)
  const brzycki = oneRM * (37 - eff) / 36
  return round2((epley + brzycki) / 2)
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
 * @param {boolean}  args.deload     deload week → lighter suggestion
 * @returns {{ load:number|null, reps:number|null, seconds:number|null, unit:string, text:string, kind:string }}
 */
export function suggestNext ({ item, exercise, history = [], profile, deload = false }) {
  const unit = unitFor(exercise, profile)
  const inc = incrementFor(exercise, profile)
  const logType = exercise?.logType || 'weight'

  // ── Timed holds/carries ───────────────────────────────
  if (item?.durationSec) {
    const [lo, hi] = item.durationSec
    const last = history[0]
    const secs = last ? last.sets.map(s => s.seconds).filter(Boolean) : []
    const lastLoad = last ? mostCommonLoad(last.sets) : null
    if (!secs.length) {
      return { load: lastLoad, reps: null, seconds: lo, unit, kind: 'start', text: `Start at ${lo}s and build toward ${hi}s.` }
    }
    const minSecs = Math.min(...secs)
    if (minSecs >= hi) {
      const nextLoad = logType === 'time' && lastLoad != null ? roundToIncrement(lastLoad + inc, inc) : lastLoad
      return {
        load: nextLoad, reps: null, seconds: lo, unit, kind: 'up',
        text: lastLoad != null
          ? `Held ${hi}s on every set — add load and restart at ${lo}s.`
          : `Held ${hi}s on every set — make it harder (load or harder variation) and restart at ${lo}s.`
      }
    }
    const target = Math.min(hi, minSecs + 5)
    return { load: lastLoad, reps: null, seconds: target, unit, kind: 'same', text: `Last shortest set: ${minSecs}s. Aim for ${target}s.` }
  }

  const [lo, hi] = item?.repRange || [8, 12]
  const sessions = history
    .map(h => ({ ...h, sets: h.sets.filter(s => s.reps != null) }))
    .filter(h => h.sets.length)

  if (!sessions.length) {
    const text = logType === 'bodyweight'
      ? `No history yet — do ${lo}–${hi} reps leaving 1–2 in the tank. Add weight once ${hi} is easy.`
      : `No history yet — pick a weight you could lift ~${hi + 2} times, then do ${lo}–${hi} reps.`
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
  const lastStr = `${fmtLoad(lastLoad, unit)} × ${reps.join(', ')}`

  let result
  const allTop = reps.length >= targetSets && reps.every(r => r >= hi)
  if (allTop) {
    const easy = rirs.length && avg(rirs) >= 3
    const jump = easy ? inc * 2 : inc
    result = {
      load: Math.round(((lastLoad || 0) + jump) * 100) / 100, reps: lo, kind: 'up',
      text: `Last: ${lastStr}. Hit ${hi} on every set${easy ? ' with reps to spare' : ''} → add ${fmtLoad(jump, unit)}, aim for ${lo}+.`
    }
  } else {
    // Stalled below the range for two sessions at the same load → back off ~10%
    const prev = sessions[1]
    const lastBelow = avg(reps) < lo
    let prevBelow = false
    if (prev && lastBelow) {
      const prevLoad = norm(mostCommonLoad(prev.sets), prev.sets[0]?.unit)
      prevBelow = prevLoad != null && Math.abs(prevLoad - lastLoad) < 0.01 && avg(prev.sets.map(s => s.reps)) < lo
    }
    if (lastBelow && prevBelow && lastLoad) {
      result = {
        load: roundToIncrement(lastLoad * 0.9, inc, 'down'), reps: lo, kind: 'down',
        text: `Last: ${lastStr}. Below ${lo} reps two sessions running → drop ~10% and build back up.`
      }
    } else {
      const target = Math.min(hi, Math.max(lo, Math.min(...reps) + 1))
      result = {
        load: lastLoad, reps: target, kind: 'same',
        text: `Last: ${lastStr}. Same weight — aim for ${target}+ on each set.`
      }
    }
  }

  if (deload && result.load) {
    result.load = roundToIncrement(result.load * 0.9, inc, 'down')
    result.text = `Deload week: lighter (~90%), stop 3+ reps short of failure. ` + result.text
    result.kind = 'deload'
  }
  return { seconds: null, unit, ...result }
}

export function fmtLoad (load, unit) {
  if (load == null) return '—'
  if (unit === 'pin') return `pin ${load}`
  return `${round2(load)} ${unit}`
}

/**
 * Plates needed per side of the bar. Greedy, assumes unlimited pairs of each plate.
 * @returns {{ perSide:number[], achieved:number, remainder:number, error?:string }}
 */
export function platesPerSide (target, bar, plates) {
  if (target == null || bar == null) return { perSide: [], achieved: bar || 0, remainder: 0 }
  if (target < bar) return { perSide: [], achieved: bar, remainder: round2(target - bar), error: 'Target is lighter than the bar.' }
  let rem = round2((target - bar) / 2)
  const perSide = []
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (rem + 1e-9 >= p) { perSide.push(p); rem = round2(rem - p) }
  }
  const achieved = round2(bar + 2 * perSide.reduce((a, b) => a + b, 0))
  return { perSide, achieved, remainder: round2(target - achieved) }
}

/** Warm-up ramp toward a working weight. bar = 0 for dumbbells/machines. */
export function warmupSets (working, inc, bar = 0) {
  if (!working || working <= 0) return []
  const out = []
  if (bar > 0 && working > bar) out.push({ load: bar, reps: 10, label: 'Empty bar' })
  for (const [pct, reps] of [[0.4, 8], [0.6, 5], [0.8, 3]]) {
    const load = roundToIncrement(working * pct, inc)
    if (load <= bar || load >= working) continue
    if (out.some(s => s.load === load)) continue
    out.push({ load, reps, label: `${Math.round(pct * 100)}%` })
  }
  return out
}

// ── Session analytics ───────────────────────────────────

export function setVolume (s, toUnit) {
  if (!s.reps || s.load == null || s.unit === 'pin') return 0
  return convertLoad(s.load, s.unit, toUnit) * s.reps
}

export function sessionVolume (session, toUnit) {
  return round2((session.sets || []).reduce((t, s) => t + setVolume(s, toUnit), 0))
}

/** Best e1RM among sets (in `toUnit`; pin sets stay in pins). */
export function bestE1RM (sets, toUnit) {
  let best = 0
  for (const s of sets) {
    if (!s.reps || s.load == null || s.load <= 0) continue
    const load = s.unit === 'pin' ? s.load : convertLoad(s.load, s.unit, toUnit)
    best = Math.max(best, estimate1RM(load, s.reps, s.rir || 0))
  }
  return round2(best)
}

export function heaviest (sets, toUnit) {
  let best = 0
  for (const s of sets) {
    if (s.load == null || !s.reps) continue
    best = Math.max(best, s.unit === 'pin' ? s.load : convertLoad(s.load, s.unit, toUnit))
  }
  return round2(best)
}

/**
 * PRs set in `session` compared with all `previous` sessions.
 * @returns {{ exerciseId:string, type:'e1rm'|'load', value:number, prev:number }[]}
 */
export function detectPRs (session, previous, toUnit) {
  const prs = []
  const ids = [...new Set((session.sets || []).map(s => s.exerciseId))]
  for (const id of ids) {
    const mine = session.sets.filter(s => s.exerciseId === id)
    const before = previous.flatMap(p => (p.sets || []).filter(s => s.exerciseId === id))
    if (!before.length) continue // first time isn't a PR, it's a baseline
    const e = bestE1RM(mine, toUnit); const eb = bestE1RM(before, toUnit)
    if (e > eb && eb > 0) prs.push({ exerciseId: id, type: 'e1rm', value: e, prev: eb })
    const h = heaviest(mine, toUnit); const hb = heaviest(before, toUnit)
    if (h > hb && hb > 0) prs.push({ exerciseId: id, type: 'load', value: h, prev: hb })
  }
  return prs
}

/** Hard sets per muscle. Primary muscles count 1, secondary 0.5. */
export function setsPerMuscle (sessions, exercisesById) {
  const out = {}
  for (const sess of sessions) {
    for (const s of sess.sets || []) {
      if (!s.reps && !s.seconds) continue
      const ex = exercisesById[s.exerciseId]
      if (!ex) continue
      for (const m of ex.primary || []) out[m] = (out[m] || 0) + 1
      for (const m of ex.secondary || []) out[m] = (out[m] || 0) + 0.5
    }
  }
  return out
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
