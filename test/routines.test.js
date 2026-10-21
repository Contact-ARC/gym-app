import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  withRefs, applyEdits, opSet, opSwap, opRemove, opAdd, opMove, similarity, reconcileEdit, buildDays, planActive, planExpired,
  makeUse, sessionChanges, changesToOps, applyChangesToPlanDay, planFromDays, parseKey, routineKey, planKey, dayFromSession,
  editedOldDay, estimateMinutes, snapshotDay
} from '../src/lib/routines.js'

const dayA = {
  id: 'A',
  name: 'Day A — Legs',
  items: [
    { exerciseId: 'squat', sets: 4, repRange: [6, 8], restSec: 150, beginner: { exerciseId: 'goblet', sets: 3 } },
    { exerciseId: 'rdl', sets: 3, repRange: [8, 10], restSec: 120 },
    { exerciseId: 'curl', sets: 3, repRange: [10, 12], restSec: 60, group: 'S1' },
    { exerciseId: 'calf', sets: 3, repRange: [10, 15], restSec: 60, group: 'S1' }
  ]
}
const ids = (items) => items.map(i => i.exerciseId)

test('refs are stable per exercise and occurrence', () => {
  const r = withRefs([{ exerciseId: 'a' }, { exerciseId: 'b' }, { exerciseId: 'a' }])
  assert.deepEqual(r.map(x => x.ref), ['e:a#0', 'e:b#0', 'e:a#1'])
})

test('edits: add after, change sets, swap, remove, move', () => {
  let ops = []
  ops = opSet(ops, 'e:squat#0', { sets: 5 })
  const add = opAdd(ops, { exerciseId: 'legext', sets: 3, repRange: [12, 15], restSec: 60 }, 'e:rdl#0')
  ops = add.ops
  ops = opSwap(ops, 'e:curl#0', 'nordic')
  ops = opRemove(ops, 'e:calf#0')
  const { items, skipped } = applyEdits(withRefs(dayA.items), ops)
  assert.deepEqual(ids(items), ['squat', 'rdl', 'legext', 'nordic'])
  assert.equal(items[0].sets, 5)
  assert.equal(items[2].added, true)
  assert.equal(items[3].swappedFrom, 'curl')
  assert.equal(skipped.length, 0)
  // Move the added exercise to the top
  ops = opMove(ops, add.ref, null)
  assert.deepEqual(ids(applyEdits(withRefs(dayA.items), ops).items), ['legext', 'squat', 'rdl', 'nordic'])
})

test('edits: setting the same field twice keeps one edit; swapping back removes it', () => {
  let ops = opSet([], 'e:squat#0', { sets: 5 })
  ops = opSet(ops, 'e:squat#0', { restSec: 180 })
  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].patch, { sets: 5, restSec: 180 })
  ops = opSwap(ops, 'e:rdl#0', 'goodmorning')
  ops = opSwap(ops, 'e:rdl#0', 'rdl')
  assert.ok(!ops.some(o => o.op === 'swap'))
})

test('edits on an added exercise change the added item itself', () => {
  const r = opAdd([], { exerciseId: 'legext', sets: 3, repRange: [12, 15] })
  let ops = opSet(r.ops, r.ref, { sets: 4, repRange: [10, 12] })
  ops = opSwap(ops, r.ref, 'sissy')
  assert.equal(ops.length, 1)
  assert.equal(ops[0].item.sets, 4)
  assert.equal(ops[0].item.exerciseId, 'sissy')
  assert.deepEqual(opRemove(ops, r.ref), [])
})

test('removing an item drops its other edits', () => {
  let ops = opSet([], 'e:rdl#0', { sets: 2 })
  ops = opSwap(ops, 'e:rdl#0', 'goodmorning')
  ops = opRemove(ops, 'e:rdl#0')
  assert.deepEqual(ops, [{ op: 'remove', ref: 'e:rdl#0' }])
})

test('a time range replaces a rep range', () => {
  const ops = opSet([], 'e:calf#0', { durationSec: [30, 45] })
  const it = applyEdits(withRefs(dayA.items), ops).items[3]
  assert.deepEqual(it.durationSec, [30, 45]); assert.equal(it.repRange, undefined)
})

test('edits that no longer fit are reported, adds whose anchor is gone go last', () => {
  const ops = [...opSet([], 'e:bench#0', { sets: 5 }), ...opAdd([], { exerciseId: 'x', sets: 3 }, 'e:bench#0').ops]
  const { items, skipped } = applyEdits(withRefs(dayA.items), ops)
  assert.equal(skipped.length, 1)
  assert.equal(items[items.length - 1].exerciseId, 'x')
})

test('similarity and reconcile: same workout rebases, a different one asks', () => {
  const edit = { baseMonth: '2026-11', base: snapshotDay(dayA), ops: opSet([], 'e:rdl#0', { sets: 4 }) }
  const decLegs = { id: 'A', items: [{ exerciseId: 'squat' }, { exerciseId: 'rdl' }, { exerciseId: 'curl' }, { exerciseId: 'lunge' }] }
  const decChest = { id: 'A', items: [{ exerciseId: 'bench' }, { exerciseId: 'fly' }, { exerciseId: 'pushdown' }] }
  assert.ok(similarity(dayA.items, decLegs.items) >= 0.5)
  assert.equal(similarity(dayA.items, decChest.items), 0)
  assert.deepEqual(reconcileEdit(edit, dayA, '2026-11'), { kind: 'same' })
  assert.equal(reconcileEdit(edit, decLegs, '2026-12').kind, 'rebase')
  assert.equal(reconcileEdit(edit, decLegs, '2026-12').skipped.length, 0)
  assert.equal(reconcileEdit(edit, decChest, '2026-12').kind, 'changed')
  assert.equal(reconcileEdit(edit, null, '2026-12').kind, 'gone')
  const old = editedOldDay(edit)
  assert.equal(old.items[1].sets, 4)
})

test('plans: this month, for a while, always', () => {
  const p = (use) => ({ id: 'p1', use })
  const month = makeUse({ until: 'month' }, '2026-11-20')
  assert.equal(planActive(p(month), '2026-11-30'), true)
  assert.equal(planActive(p(month), '2026-12-01'), false)
  assert.equal(planExpired(p(month), '2026-12-01'), true)
  const weeks = makeUse({ until: 'date', weeks: 8 }, '2026-11-20')
  assert.equal(weeks.endsOn, '2027-01-14')
  assert.equal(planActive(p(weeks), '2027-01-14'), true)
  assert.equal(planExpired(p(weeks), '2027-01-15'), true)
  const always = makeUse({ until: 'forever', mode: 'replace' }, '2026-11-20')
  assert.equal(planActive(p(always), '2030-01-01'), true)
  assert.equal(planExpired(p(always), '2030-01-01'), false)
  assert.equal(planActive(p(null), '2026-11-20'), false)
})

test('this month\'s days: repo days with edits, beginner track, then your days; replace hides the repo', () => {
  const routine = { month: '2026-11', days: [dayA, { id: 'B', name: 'B', items: [{ exerciseId: 'bench', sets: 3 }] }] }
  const edits = { A: { baseMonth: '2026-11', base: snapshotDay(dayA), ops: opSet([], 'e:squat#0', { sets: 2 }) } }
  const mine = planFromDays('Arms', [{ label: 'E', name: 'Arms', items: [{ exerciseId: 'curl', sets: 3 }] }])
  mine.use = makeUse({ until: 'forever' }, '2026-11-01')
  let days = buildDays({ routine, level: 'beginner', edits, plans: [mine], today: '2026-11-10' })
  assert.deepEqual(days.map(d => d.key), ['r-A', 'r-B', planKey(mine.id, mine.days[0].id)])
  assert.equal(days[0].items[0].exerciseId, 'goblet') // beginner track still applies
  assert.equal(days[0].items[0].sets, 2) // your change wins
  assert.equal(days[0].edited, true)
  assert.equal(days[2].source, 'mine'); assert.equal(days[2].id, 'E')
  mine.use.mode = 'replace'
  days = buildDays({ routine, edits, plans: [mine], today: '2026-11-10' })
  assert.deepEqual(days.map(d => d.source), ['mine'])
  // Edits from last month wait until they've been checked against this month's day
  days = buildDays({ routine, edits: { A: { ...edits.A, baseMonth: '2026-10' } }, today: '2026-11-10' })
  assert.equal(days[0].edited, false)
})

test('keys round-trip', () => {
  assert.deepEqual(parseKey(routineKey('A')), { source: 'routine', dayId: 'A' })
  assert.deepEqual(parseKey(planKey('abc123', 'd9')), { source: 'mine', planId: 'abc123', dayId: 'd9' })
})

// A workout started from Day A (with refs) where you swapped, added a set and added an exercise
function workout () {
  const items = withRefs(dayA.items).map(it => ({ ...it, routineSets: it.sets, originalExerciseId: it.exerciseId }))
  delete items[0].beginner
  items[1].exerciseId = 'goodmorning'
  items[0].extraSets = 1
  items.push({ exerciseId: 'legext', originalExerciseId: 'legext', sets: 3, repRange: [12, 15], restSec: 60, added: true })
  items.push({ exerciseId: 'skipped', originalExerciseId: 'skipped', sets: 3, repRange: [8, 12], added: true })
  return {
    items,
    sets: [{ itemIndex: 4, exerciseId: 'legext', reps: 12 }, { itemIndex: 4, exerciseId: 'legext', reps: 12 }, { itemIndex: 0, exerciseId: 'squat', reps: 5 }]
  }
}

test('workout changes: swaps, set counts and exercises you actually did', () => {
  const ch = sessionChanges(workout())
  assert.deepEqual(ch.map(c => c.kind), ['sets', 'swap', 'add'])
  assert.deepEqual([ch[0].from, ch[0].to], [4, 5])
  assert.equal(ch[2].after.ref, 'e:calf#0')
  // A lighter day's dropped set isn't a change you meant to keep
  const w = workout(); w.items[0].extraSets = 0; w.items[0].removedSets = 1; w.items[0].easyRemoved = true
  assert.ok(!sessionChanges(w).some(c => c.kind === 'sets'))
})

test('keeping workout changes for a repo day turns them into edits', () => {
  const ops = changesToOps([], sessionChanges(workout()))
  const { items } = applyEdits(withRefs(dayA.items), ops)
  assert.deepEqual(ids(items), ['squat', 'goodmorning', 'curl', 'calf', 'legext'])
  assert.equal(items[0].sets, 5)
})

test('keeping workout changes for one of your days edits it', () => {
  const plan = planFromDays('Mine', [{ label: 'A', name: 'Legs', items: dayA.items }])
  const day = plan.days[0]
  const w = workout()
  w.items.forEach((it, i) => { if (!it.added) it.ref = 'm:' + day.items[i].id })
  applyChangesToPlanDay(day, sessionChanges(w))
  assert.deepEqual(ids(day.items), ['squat', 'goodmorning', 'curl', 'calf', 'legext'])
  assert.equal(day.items[0].sets, 5)
  assert.ok(day.items.every(it => it.id))
})

test('a free workout becomes a day with what you did', () => {
  const d = dayFromSession(workout(), 'Leg extras')
  assert.deepEqual(ids(d.items), ['squat', 'legext'])
  assert.equal(d.items[1].sets, 2) // the sets you did
  assert.equal(d.label, 'L')
})

test('plans copy items without track markers and with ids', () => {
  const plan = planFromDays('Copy', [{ id: 'A', name: 'Legs', items: buildDays({ routine: { month: 'm', days: [dayA] }, level: 'beginner', today: '2026-11-01' })[0].items }])
  const it = plan.days[0].items[0]
  assert.equal(it.exerciseId, 'goblet')
  assert.ok(it.id && !it.ref && !it.track && !it.beginner)
  assert.equal(plan.days[0].label, 'A')
})

test('estimated minutes', () => {
  assert.equal(estimateMinutes([]), 0)
  assert.ok(estimateMinutes(dayA.items) >= 30 && estimateMinutes(dayA.items) <= 60)
})
