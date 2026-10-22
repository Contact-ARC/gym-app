import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  recordsBySession, totals, periodStats, liftNumbers, liftLines, badgeIds, badgeTitle, sortBadges, badgeKind
} from '../src/lib/crewStats.js'

const lifts = { squat: 'sq', bench: 'bp', deadlift: 'dl' }
let n = 0
function sess (date, sets) {
  const id = 's' + (++n)
  return { id, startedAt: `${date}T18:00:00`, finishedAt: `${date}T19:00:00`, sets: sets.map(([exerciseId, load, reps, type]) => ({ exerciseId, load, reps, unit: 'kg', type })) }
}

test('records: once per exercise per workout, the first time is the baseline', () => {
  const s1 = sess('2026-10-01', [['bp', 80, 5], ['sq', 100, 5]])
  const s2 = sess('2026-10-03', [['bp', 82.5, 5], ['bp', 85, 3], ['sq', 100, 5]]) // bench up, squat same
  const s3 = sess('2026-10-05', [['bp', 70, 5], ['dl', 140, 5]]) // lighter bench, first deadlift
  const r = recordsBySession([s1, s2, s3], 'kg')
  assert.deepEqual([r[s1.id], r[s2.id], r[s3.id]], [0, 1, 0])
})

test('warm-ups count for nothing; unfinished workouts are left out', () => {
  const s1 = sess('2026-10-01', [['bp', 80, 5]])
  const s2 = sess('2026-10-02', [['bp', 100, 5, 'warmup'], ['bp', 80, 5]])
  const open = { ...sess('2026-10-03', [['bp', 120, 5]]), finishedAt: null }
  assert.deepEqual(recordsBySession([s1, s2, open], 'kg'), { [s1.id]: 0, [s2.id]: 0 })
  assert.equal(totals([s1, s2], 'kg').sets, 2)
})

test('period stats: this week, last week, month, last month, all time', () => {
  const today = new Date('2026-10-22T12:00:00') // a Thursday
  const list = [
    sess('2026-09-28', [['bp', 60, 10]]), // Monday of last week → last week, and September
    sess('2026-10-05', [['bp', 60, 10]]),
    sess('2026-10-20', [['bp', 65, 10], ['bp', 65, 8]]), // this week
    sess('2026-10-22', [['sq', 100, 5]])
  ]
  const p = periodStats(list, 'kg', today)
  assert.equal(p.week.key, '2026-10-19')
  assert.deepEqual([p.week.workouts, p.week.sets, p.week.volume, p.week.records], [2, 3, 1670, 1])
  assert.equal(p.lastWeek.workouts, 0)
  assert.equal(p.month.key, '2026-10'); assert.equal(p.month.workouts, 3)
  assert.equal(p.lastMonth.key, '2026-09'); assert.equal(p.lastMonth.workouts, 1)
  assert.equal(p.all.workouts, 4); assert.equal(p.all.since, '2026-09-28')
})

test('lift numbers: estimated and actual, totals only with all three', () => {
  const today = new Date('2026-10-22T12:00:00')
  const list = [sess('2026-10-20', [['sq', 140, 5], ['bp', 100, 1], ['dl', 180, 3]])]
  const pl = liftNumbers(list, lifts, 'kg', today)
  assert.equal(pl.actual.bench, 100)
  assert.equal(pl.actual.total, 420)
  assert.ok(pl.e1rm.squat > 155 && pl.e1rm.squat < 165)
  const partial = liftNumbers([sess('2026-10-20', [['sq', 140, 5]])], lifts, 'kg', today)
  assert.equal(partial.actual.total, null)
})

test('lift lines: best estimated max per week', () => {
  const today = new Date('2026-10-22T12:00:00')
  const list = [sess('2026-10-13', [['bp', 80, 5]]), sess('2026-10-15', [['bp', 85, 5]]), sess('2026-10-20', [['bp', 87.5, 5]])]
  const lines = liftLines(list, lifts, 'kg', today)
  assert.deepEqual(lines.bench.map(p => p[0]), ['2026-10-12', '2026-10-19'])
  assert.ok(lines.bench[1][1] > lines.bench[0][1])
  assert.equal(lines.squat, undefined)
})

test('badges: workouts, streaks, records, plates and totals', () => {
  const list = [sess('2026-10-20', [['sq', 140, 1], ['bp', 100, 1], ['dl', 180, 1]])]
  const ids = badgeIds({ sessions: list, unit: 'kg', lifts, bestStreak: 10, records: 12 })
  for (const id of ['w1', 's4', 's10', 'r10', 'bench-1p', 'bench-2p', 'squat-3p', 'deadlift-4p', 't300', 't400']) assert.ok(ids.includes(id), id)
  for (const id of ['w10', 's26', 'r50', 'bench-3p', 'squat-4p', 't500']) assert.ok(!ids.includes(id), id)
  // pounds: 225 lb bench = 2 plates
  const lb = [{ id: 'x', startedAt: '2026-10-20T18:00:00', finishedAt: '2026-10-20T19:00:00', sets: [{ exerciseId: 'bp', load: 225, reps: 1, unit: 'lb' }] }]
  assert.ok(badgeIds({ sessions: lb, unit: 'lb', lifts }).includes('bench-2p'))
})

test('badge titles in both languages, and their order', () => {
  assert.equal(badgeTitle('bench-2p', 'en', 'kg'), 'Bench: 2 plates (100 kg)')
  assert.equal(badgeTitle('squat-1p', 'es', 'lb'), 'Sentadilla: 1 disco (135 lb)')
  assert.equal(badgeTitle('w1'), 'First workout')
  assert.equal(badgeTitle('s10', 'es'), 'Racha de 10 semanas')
  assert.equal(badgeTitle('t500'), '500 kg total')
  assert.equal(badgeKind('deadlift-3p'), 'plates')
  assert.deepEqual(sortBadges(['t300', 'bench-1p', 'w10', 's4', 'w1', 'r10']), ['w1', 'w10', 's4', 'r10', 'bench-1p', 't300'])
})
