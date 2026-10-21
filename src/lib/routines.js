// Routines you can change:
//   • adjustments: your changes on top of a day from the routines repo, saved as a short list of
//     edits ("add cable fly after bench", "squat: 4 sets") so next month's version of the day gets them too;
//   • plans ("My routines"): days you own. They can sit next to this month's days, replace them,
//     or wait in the library until you use them again.
// Pure functions (no Vue, no Capacitor), tested in test/routines.test.js.
import { applyTrack, fillsPlannedSet } from './training.js'

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ── Keys (used in routes, so no characters that need escaping) ──
export const routineKey = (dayId) => `r-${dayId}`
export const planKey = (planId, dayId) => `p-${planId}-${dayId}`
export function parseKey (key) {
  const k = String(key || '')
  if (k.startsWith('r-')) return { source: 'routine', dayId: k.slice(2) }
  if (k.startsWith('p-')) {
    const [, planId, dayId] = k.split('-')
    return { source: 'mine', planId, dayId }
  }
  return null
}

// ── Items ──
const ITEM_FIELDS = ['exerciseId', 'sets', 'repRange', 'durationSec', 'restSec', 'notes', 'es', 'group', 'warmup']

/** A routine item reduced to what a plan stores (no refs, track markers or beginner blocks). */
export function cleanItem (it, keepId = false) {
  const out = {}
  for (const f of ITEM_FIELDS) if (it[f] != null) out[f] = JSON.parse(JSON.stringify(it[f]))
  out.id = keepId && it.id ? it.id : uid()
  return out
}

/** Stable reference for each repo item: e:<exerciseId>#<n> (n = which occurrence of that exercise). */
export function withRefs (items) {
  const seen = {}
  return (items || []).map(it => {
    const n = (seen[it.exerciseId] = (seen[it.exerciseId] ?? -1) + 1)
    return { ...it, ref: `e:${it.exerciseId}#${n}` }
  })
}
const baseIdOf = (ref) => (ref?.startsWith('e:') ? ref.slice(2, ref.lastIndexOf('#')) : null)
const isAddedRef = (ref) => ref?.startsWith('a:')

/** Patch an item: null removes a field; a rep range replaces a time range and the other way round. */
export function patchItem (item, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v == null) delete item[k]
    else item[k] = Array.isArray(v) ? [...v] : v
  }
  if (patch?.repRange) delete item.durationSec
  if (patch?.durationSec) delete item.repRange
  if (patch && 'notes' in patch) delete item.es // the translation was of the old note
  return item
}

// ── Adjustments (edit lists on top of a repo day) ──
//   { op: 'set', ref, patch }        change sets, rep/time range, rest, notes, superset group
//   { op: 'swap', ref, exerciseId }  another exercise in that slot
//   { op: 'remove', ref }
//   { op: 'add', ref: 'a:<id>', after: ref|null|'end', item }   null = first
//   { op: 'move', ref, after: ref|null }

/**
 * Apply edits to a day's items (each with a ref).
 * @returns {{ items: object[], skipped: object[] }} skipped: edits whose exercise isn't in the day any more
 */
export function applyEdits (items, ops = []) {
  const list = (items || []).map(it => ({ ...it }))
  const skipped = []
  const at = (ref) => list.findIndex(x => x.ref === ref)
  for (const op of ops || []) {
    if (op.op === 'add') {
      const item = { ...JSON.parse(JSON.stringify(op.item)), ref: op.ref, added: true }
      if (op.after === null) list.unshift(item)
      else {
        const i = op.after && op.after !== 'end' ? at(op.after) : -1
        if (i >= 0) list.splice(i + 1, 0, item)
        else list.push(item) // the exercise it followed is gone: keep it, at the end
      }
      continue
    }
    const i = at(op.ref)
    if (i < 0) { skipped.push(op); continue }
    if (op.op === 'remove') list.splice(i, 1)
    else if (op.op === 'swap') {
      const was = list[i]
      list[i] = { ...was, exerciseId: op.exerciseId }
      delete list[i].es // notes were about the old exercise
      if (was.exerciseId !== op.exerciseId) list[i].swappedFrom = baseIdOf(op.ref) || was.exerciseId
    } else if (op.op === 'set') patchItem(list[i], op.patch)
    else if (op.op === 'move') {
      const [it] = list.splice(i, 1)
      if (op.after == null) list.unshift(it)
      else {
        const j = at(op.after)
        if (j < 0) { list.splice(i, 0, it); skipped.push(op) } else list.splice(j + 1, 0, it)
      }
    }
  }
  return { items: list, skipped }
}

const clone = (x) => JSON.parse(JSON.stringify(x))

/** Change sets, reps, rest, notes or superset of an item. Returns the new edit list. */
export function opSet (ops, ref, patch) {
  const out = clone(ops || [])
  if (isAddedRef(ref)) {
    const add = out.find(o => o.op === 'add' && o.ref === ref)
    if (add) patchItem(add.item, patch)
    return out
  }
  const ex = out.find(o => o.op === 'set' && o.ref === ref)
  if (ex) ex.patch = { ...ex.patch, ...patch }
  else out.push({ op: 'set', ref, patch: { ...patch } })
  return out
}

/** Use another exercise in a slot. Going back to the repo's own exercise removes the edit. */
export function opSwap (ops, ref, exerciseId) {
  let out = clone(ops || [])
  if (isAddedRef(ref)) {
    const add = out.find(o => o.op === 'add' && o.ref === ref)
    if (add) { add.item.exerciseId = exerciseId; delete add.item.es }
    return out
  }
  out = out.filter(o => !(o.op === 'swap' && o.ref === ref))
  if (baseIdOf(ref) !== exerciseId) out.push({ op: 'swap', ref, exerciseId })
  return out
}

export function opRemove (ops, ref) {
  let out = clone(ops || [])
  if (isAddedRef(ref)) return out.filter(o => o.ref !== ref && !(o.op === 'move' && o.ref === ref))
  out = out.filter(o => !(o.ref === ref && (o.op === 'set' || o.op === 'swap' || o.op === 'move')))
  out.push({ op: 'remove', ref })
  return out
}

/** Add an exercise after `after` (a ref, null for first, or 'end'). Returns { ops, ref }. */
export function opAdd (ops, item, after = 'end') {
  const ref = 'a:' + uid()
  const clean = cleanItem(item)
  delete clean.id
  return { ops: [...clone(ops || []), { op: 'add', ref, after, item: clean }], ref }
}

export function opMove (ops, ref, after) {
  const out = clone(ops || []).filter(o => !(o.op === 'move' && o.ref === ref))
  out.push({ op: 'move', ref, after: after ?? null })
  return out
}

/** Exercises in common between two versions of a day (0 = nothing alike, 1 = same exercises). */
export function similarity (aItems, bItems) {
  const A = new Set((aItems || []).map(i => i.exerciseId))
  const B = new Set((bItems || []).map(i => i.exerciseId))
  if (!A.size && !B.size) return 1
  let both = 0
  for (const x of A) if (B.has(x)) both++
  return both / (A.size + B.size - both)
}

/** The repo day as it was when you changed it (so it can be saved as yours after the repo moves on). */
export function snapshotDay (day) {
  return clone({ id: day.id, name: day.name, es: day.es, notes: day.notes, estMinutes: day.estMinutes, items: day.items })
}

/**
 * A new month's routine arrived: do your changes to this day still fit?
 *   same: nothing to do · gone: the day isn't in the routine any more · changed: it's a different workout now
 *   rebase: same workout; `skipped` are the changes that no longer apply
 */
export function reconcileEdit (edit, newDay, month) {
  if (!edit || edit.baseMonth === month) return { kind: 'same' }
  if (!newDay) return { kind: 'gone' }
  const sim = similarity(edit.base?.items, newDay.items)
  if (sim < 0.5) return { kind: 'changed', sim }
  const { skipped } = applyEdits(withRefs(newDay.items), edit.ops)
  return { kind: 'rebase', skipped }
}

/** The old version of a changed day, with your edits, ready to save as one of yours. */
export function editedOldDay (edit, level = 'standard') {
  const base = withRefs(edit.base?.items || []).map(it => applyTrack(it, level))
  return { ...edit.base, items: applyEdits(base, edit.ops).items }
}

// ── Plans ("My routines") ──
//   plan: { id, name, notes, createdAt, from, days: [{ id, label, name, notes, items: [{ id, exerciseId, … }] }], use, lastUse }
//   use:  { mode: 'add'|'replace', until: 'month'|'date'|'forever', month, startedOn, endsOn }

export function planActive (plan, today) {
  const u = plan?.use
  if (!u) return false
  if (u.startedOn && today < u.startedOn) return false
  if (u.until === 'month') return today.slice(0, 7) === u.month
  if (u.until === 'date') return !u.endsOn || today <= u.endsOn
  return true
}

/** Its time is up: goes back to the library. */
export function planExpired (plan, today) {
  const u = plan?.use
  if (!u) return false
  if (u.until === 'month') return today.slice(0, 7) > u.month
  if (u.until === 'date') return !!u.endsOn && today > u.endsOn
  return false
}

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export function daysBetween (from, to) {
  const [a, b] = [from, to].map(s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) })
  return Math.round((b - a) / 86400000)
}

export function addDaysKey (key, n) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** A `use` block from the choices on screen. weeks only for 'date' without an explicit endsOn. */
export function makeUse ({ mode = 'add', until = 'month', weeks = 4, endsOn = null }, today) {
  const use = { mode, until, startedOn: today }
  if (until === 'month') use.month = today.slice(0, 7)
  if (until === 'date') use.endsOn = endsOn || addDaysKey(today, weeks * 7 - 1)
  return use
}

/** Rough length of a day: work + rest for every set, rounded to 5 minutes. */
export function estimateMinutes (items) {
  let secs = 0
  const list = items || []
  list.forEach((it, i) => {
    const sets = it.sets || 1
    const work = it.durationSec ? (it.durationSec[0] + it.durationSec[1]) / 2 : 40
    // Inside a superset you rest once per round, after the last exercise of the group
    const nextSame = it.group && list[i + 1]?.group === it.group
    const rest = nextSame ? 15 : (it.restSec ?? 90)
    secs += sets * (work + rest)
  })
  return secs ? Math.max(5, Math.round(secs / 300) * 5) : 0
}

/**
 * The days that show under "This month's days": the repo's days with your changes,
 * then the plans you're using. A plan in 'replace' mode hides the repo's days.
 */
export function buildDays ({ routine, level = 'standard', edits = {}, plans = [], today }) {
  const out = []
  const active = (plans || []).filter(p => planActive(p, today))
  const replacing = active.some(p => p.use.mode === 'replace')
  if (routine?.days && !replacing) {
    for (const d of routine.days) {
      const e = edits?.[d.id]
      const usable = !!e && !e.pending && e.baseMonth === routine.month && (e.ops?.length || 0) > 0
      const base = withRefs(d.items).map(it => applyTrack(it, level))
      const items = usable ? applyEdits(base, e.ops).items : base
      out.push({
        key: routineKey(d.id), id: d.id, name: d.name, es: d.es, notes: d.notes,
        estMinutes: usable ? estimateMinutes(items) : d.estMinutes,
        items, source: 'routine', edited: usable, changes: usable ? e.ops.length : 0, pendingChange: !!e?.pending
      })
    }
  }
  const ordered = [...active.filter(p => p.use.mode === 'replace'), ...active.filter(p => p.use.mode !== 'replace')]
  for (const p of ordered) for (const d of p.days || []) out.push(planDayView(p, d))
  return out
}

/** A plan's day shaped like a routine day. */
export function planDayView (plan, d) {
  const items = (d.items || []).map(it => ({ ...it, ref: 'm:' + it.id }))
  return {
    key: planKey(plan.id, d.id), id: d.label || '•', name: d.name, es: d.es, notes: d.notes,
    estMinutes: estimateMinutes(items), items, source: 'mine', planId: plan.id, planDayId: d.id, planName: plan.name
  }
}

/** A new plan from a day (this month's, with your changes, or an old version). */
export function planFromDays (name, days, from = null) {
  return {
    id: uid(),
    name,
    notes: '',
    createdAt: new Date().toISOString(),
    from,
    days: days.map(d => ({
      id: uid(),
      label: String(d.label ?? d.id ?? '').slice(0, 2) || '•',
      name: d.name || '',
      ...(d.es?.name ? { es: { name: d.es.name } } : {}),
      notes: d.notes || '',
      items: (d.items || []).map(it => cleanItem(it))
    })),
    use: null,
    lastUse: null
  }
}

// ── Changes made during a workout ("Keep these changes?") ──

/** Logged planned sets per item index. */
function loggedPerItem (session) {
  const n = {}
  for (const s of session.sets || []) if (s.itemIndex != null && fillsPlannedSet(s)) n[s.itemIndex] = (n[s.itemIndex] || 0) + 1
  return n
}

/**
 * What changed in a workout compared with the day it started from:
 *   swap { ref, from, to } · sets { ref, from, to } · add { item, after: { ref }|{ index } }
 * Extra exercises only count if you did at least one set of them.
 */
export function sessionChanges (session) {
  if (!session?.items) return []
  const logged = loggedPerItem(session)
  const out = []
  let prev = null
  session.items.forEach((it, i) => {
    if (it.added) {
      if (!logged[i]) return
      const item = cleanItem({ ...it, sets: Math.max(it.sets || 1, logged[i]) })
      delete item.id
      out.push({ kind: 'add', index: i, exerciseId: it.exerciseId, item, after: prev })
      prev = { index: i }
      return
    }
    if (it.originalExerciseId && it.exerciseId !== it.originalExerciseId) {
      out.push({ kind: 'swap', index: i, ref: it.ref, from: it.originalExerciseId, to: it.exerciseId })
    }
    const base = it.routineSets ?? it.sets
    const delta = (it.extraSets || 0) - (it.removedSets || 0) + (it.easyRemoved ? 1 : 0)
    if (delta && base) out.push({ kind: 'sets', index: i, ref: it.ref, exerciseId: it.exerciseId, from: base, to: Math.max(1, base + delta) })
    prev = { index: i, ref: it.ref }
  })
  return out.filter(c => c.kind !== 'swap' && c.kind !== 'sets' ? true : !!c.ref)
}

/** Turn workout changes into edits on a repo day. */
export function changesToOps (ops, changes) {
  let out = clone(ops || [])
  const newRefs = {} // session index → ref given to an added exercise
  for (const c of changes) {
    if (c.kind === 'swap') out = opSwap(out, c.ref, c.to)
    else if (c.kind === 'sets') out = opSet(out, c.ref, { sets: c.to })
    else if (c.kind === 'add') {
      const after = c.after ? (c.after.ref || newRefs[c.after.index] || 'end') : null
      const r = opAdd(out, c.item, after)
      out = r.ops
      newRefs[c.index] = r.ref
    }
  }
  return out
}

/** Apply workout changes to one of your own days (in place). */
export function applyChangesToPlanDay (day, changes) {
  const byRef = (ref) => day.items.find(it => 'm:' + it.id === ref)
  const newIds = {}
  for (const c of changes) {
    if (c.kind === 'swap') { const it = byRef(c.ref); if (it) { it.exerciseId = c.to; delete it.es } }
    else if (c.kind === 'sets') { const it = byRef(c.ref); if (it) it.sets = c.to }
    else if (c.kind === 'add') {
      const item = cleanItem(c.item)
      let pos = day.items.length
      if (c.after === null) pos = 0
      else if (c.after?.ref) { const i = day.items.findIndex(it => 'm:' + it.id === c.after.ref); if (i >= 0) pos = i + 1 }
      else if (c.after && newIds[c.after.index]) { const i = day.items.findIndex(it => it.id === newIds[c.after.index]); if (i >= 0) pos = i + 1 }
      day.items.splice(pos, 0, item)
      newIds[c.index] = item.id
    }
  }
  return day
}

/** A day for My routines from a free workout: what you actually did. */
export function dayFromSession (session, name) {
  const logged = loggedPerItem(session)
  const items = session.items
    .map((it, i) => ({ it, n: logged[i] || 0 }))
    .filter(x => x.n > 0)
    .map(({ it, n }) => cleanItem({ ...it, sets: Math.max(n, 1) }))
  return { label: (name || '').trim().charAt(0).toUpperCase() || '•', name, notes: '', items }
}
