// Training together (0.11): whose turn it is and how to share one bar. Pure (no store), tested in
// test/together.test.js.
//
// A shared workout has a plan (the host's day: items with their sets) and a log of what everyone sent:
//   { rev, member, clientId, kind: 'set' | 'unset' | 'spot' | 'note', payload }
// A 'set' carries { item (plan index), setId, exerciseId, load, unit, reps, seconds, type }; sending the same
// setId again (an edit) replaces it, and 'unset' { setId } takes it back. A 'note' says what someone is about to
// lift on an item ({ item, load, unit, ms }), so the bar can be planned before anyone has lifted.
import { platesPerSide, plateWarmups, convertLoad, isWorkSet, fillsPlannedSet } from './training.js'

/** The sets that count now: the latest version of each setId, without the ones taken back. */
export function currentSets (log) {
  const bySet = new Map()
  for (const e of log || []) {
    const id = e.payload?.setId
    if (!id) continue
    if (e.kind === 'set') bySet.set(id, { member: e.member, rev: e.rev, ...e.payload })
    else if (e.kind === 'unset') bySet.delete(id)
  }
  return [...bySet.values()]
}

/** Planned sets done per member and plan item: { [member]: { [item]: n } } (warm-ups and drop sets don't count) */
export function doneByMember (log) {
  const out = {}
  for (const s of currentSets(log)) {
    if (!fillsPlannedSet(s) || s.item == null) continue
    const m = (out[s.member] ||= {})
    m[s.item] = (m[s.item] || 0) + 1
  }
  return out
}

const plannedOf = (plan, item) => Math.max(1, Number(plan?.items?.[item]?.sets) || 1)

/**
 * Whose turn it is after `from` did a set (or passed) on `item`: round the group on the same exercise,
 * then on to the next one, starting with the first person in the list. Someone who has done all their
 * sets of an exercise is skipped. Returns { item, turn } (turn null when everyone is done).
 */
export function nextTurn ({ members, plan, log, from, item }) {
  const done = doneByMember(log)
  const n = plan?.items?.length || 0
  const left = (m, i) => (done[m]?.[i] || 0) < plannedOf(plan, i)
  if (!members?.length || !n) return { item: item ?? 0, turn: null }
  const start = Math.max(0, members.indexOf(from))
  // The rest of the group on this exercise, in order after whoever just went (them last)
  for (let k = 1; k <= members.length; k++) {
    const m = members[(start + k) % members.length]
    if (left(m, item)) return { item, turn: m }
  }
  // Everyone's done here: the next exercise anyone still has sets on
  for (let i = item + 1; i < n; i++) {
    const m = members.find(x => left(x, i))
    if (m) return { item: i, turn: m }
  }
  // Or one earlier on that someone skipped
  for (let i = 0; i < item; i++) {
    const m = members.find(x => left(x, i))
    if (m) return { item: i, turn: m }
  }
  return { item, turn: null }
}

/**
 * What each person is lifting on an item, newest first: a logged set beats a note. In `unit`.
 * @returns {{ [member]: { load, reps, from: 'set' | 'note', ms } }}
 */
export function loadsOn (log, item, unit = 'kg') {
  const out = {}
  const sets = currentSets(log).filter(s => s.item === item && isWorkSet(s) && s.load > 0)
  for (const s of sets) {
    const prev = out[s.member]
    if (!prev || prev.from !== 'set' || s.rev > prev.rev) out[s.member] = { load: convertLoad(s.load, s.unit || unit, unit), reps: s.reps, from: 'set', rev: s.rev }
  }
  for (const e of log || []) {
    if (e.kind !== 'note' || e.payload?.item !== item) continue
    const prev = out[e.member]
    if (prev?.from === 'set') continue
    if (!prev || e.rev > prev.rev) out[e.member] = { load: e.payload.load > 0 ? convertLoad(e.payload.load, e.payload.unit || unit, unit) : null, from: 'note', rev: e.rev, ms: e.payload.ms || null }
  }
  // Machine settings travel in notes even once sets are logged
  for (const e of log || []) if (e.kind === 'note' && e.payload?.item === item && e.payload.ms && out[e.member]) out[e.member].ms = e.payload.ms
  return out
}

const sum = (a) => a.reduce((n, x) => n + x, 0)
const r2 = (x) => Math.round(x * 100) / 100
/** Plates in a but not in b (per side), as a list */
function minus (a, b) {
  const left = [...b]
  const out = []
  for (const p of a) {
    const i = left.findIndex(x => Math.abs(x - p) < 1e-9)
    if (i >= 0) left.splice(i, 1)
    else out.push(p)
  }
  return out
}

/**
 * One bar for 2 to 4 people. The lightest load is built first; each heavier one adds plates on top, so
 * every stack holds the lighter ones and a change of lifter is only adding or taking off the difference.
 * The warm-up ramp is the lightest person's, which everyone shares.
 * @param {Array} lifters [{ id, load }] (in the same unit as the bar and plates; missing loads are left out)
 * @returns {null | { order: [{ id, load, perSide, add }], warmups: [...], final }}
 *   order: lightest first; add: plates a side to add on top of the lifter before. warmups/final: plateWarmups'.
 */
export function sharedBar (lifters, bar, plates, { stepRef = 30 } = {}) {
  const list = (lifters || []).filter(l => l.load > bar).sort((a, b) => a.load - b.load)
  if (list.length < 2 || !(plates || []).length) return null
  // The lightest person's warm-up decides their plates, so the ramp leads straight into the first working set
  const ramp = plateWarmups(list[0].load, bar, plates, 'full', { stepRef, hasBar: bar > 0 })
  const base = ramp?.final ? { perSide: ramp.final.perSide, achieved: ramp.final.load } : platesPerSide(list[0].load, bar, plates)
  if (base.error) return null
  const order = [{ id: list[0].id, load: base.achieved, perSide: base.perSide, add: base.perSide }]
  let stack = base.perSide
  let at = base.achieved
  for (const l of list.slice(1)) {
    const extra = l.load > at + 1e-9 ? platesPerSide(bar + (l.load - at), bar, plates).perSide : []
    stack = [...stack, ...extra]
    at = r2(bar + 2 * sum(stack))
    order.push({ id: l.id, load: at, perSide: stack, add: extra })
  }
  return { order, warmups: ramp?.sets || [], final: ramp?.final || null }
}

/** What to change when the bar goes from one lifter to the next: { add: [...], remove: [...] } a side */
export function barChange (shared, fromId, toId) {
  const a = shared?.order.find(o => o.id === fromId)
  const b = shared?.order.find(o => o.id === toId)
  if (!a || !b) return null
  return { add: minus(b.perSide, a.perSide), remove: minus(a.perSide, b.perSide) }
}
