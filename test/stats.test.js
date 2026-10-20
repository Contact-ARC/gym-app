import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPRs, repRecords, applyTrack } from '../src/lib/training.js'
import {
  weekStreak, weekStart, muscleVolume, calendarMonth, monthReport, challengeProgress, shiftMonth, monthsWithWorkouts, sessionMinutes
} from '../src/lib/stats.js'

const at = (iso, sets = [], extra = {}) => ({
  id: iso, startedAt: new Date(iso).toISOString(), finishedAt: new Date(new Date(iso).getTime() + 3600e3).toISOString(), sets, ...extra
})
const set = (exerciseId, load, reps, extra = {}) => ({ exerciseId, load, unit: 'kg', reps, ...extra })

test('rep record: more reps at a weight beats the old best at that weight or heavier', () => {
  const prev = [at('2026-10-01T18:00', [set('bench', 60, 8), set('bench', 65, 5)])]
  const now = at('2026-10-08T18:00', [set('bench', 60, 10)])
  const prs = detectPRs(now, prev, 'kg')
  const rep = prs.find(p => p.type === 'reps')
  assert.ok(rep)
  assert.equal(rep.value, 10); assert.equal(rep.prev, 8); assert.equal(rep.load, 60)
})

test('rep record: a new heaviest weight is a load PR, not a rep PR', () => {
  const prev = [at('2026-10-01T18:00', [set('bench', 60, 8)])]
  const prs = detectPRs(at('2026-10-08T18:00', [set('bench', 62.5, 6)]), prev, 'kg')
  assert.ok(prs.some(p => p.type === 'load'))
  assert.ok(!prs.some(p => p.type === 'reps'))
})

test('rep record: bodyweight exercises count reps', () => {
  const prev = [at('2026-10-01T18:00', [set('pullup', 0, 6)])]
  const prs = detectPRs(at('2026-10-08T18:00', [set('pullup', 0, 7)]), prev, 'kg')
  assert.deepEqual(prs.map(p => p.type), ['reps'])
})

test('warm-ups never count as PRs', () => {
  const prev = [at('2026-10-01T18:00', [set('bench', 60, 8)])]
  const prs = detectPRs(at('2026-10-08T18:00', [set('bench', 70, 12, { type: 'warmup' })]), prev, 'kg')
  assert.equal(prs.length, 0)
})

test('repRecords keeps only sets nothing else beats', () => {
  const recs = repRecords([set('x', 60, 8), set('x', 60, 10), set('x', 65, 6), set('x', 55, 9), set('x', 50, 12)], 'kg')
  assert.deepEqual(recs.map(r => [r.load, r.reps]), [[65, 6], [60, 10], [50, 12]])
})

test('beginner track overrides an item', () => {
  const it = { exerciseId: 'barbell-squat', sets: 4, repRange: [6, 8], beginner: { exerciseId: 'goblet-squat', sets: 3, repRange: [10, 12] } }
  const b = applyTrack(it, 'beginner')
  assert.equal(b.exerciseId, 'goblet-squat'); assert.equal(b.sets, 3); assert.equal(b.track, 'beginner')
  assert.equal(applyTrack(it, 'standard'), it)
  assert.equal(applyTrack({ exerciseId: 'a', sets: 3 }, 'beginner').sets, 3)
})

test('weekStart is Monday', () => {
  assert.equal(weekStart(new Date(2026, 9, 22)).getDay(), 1) // Thu 22 Oct
  assert.equal(weekStart(new Date(2026, 9, 25)).getDate(), 19) // Sun 25 → Mon 19
})

test('week streak: counts back from last week while this week is in progress', () => {
  const s = [
    at('2026-10-05T18:00'), at('2026-10-07T18:00'), // week of 5 Oct: 2
    at('2026-10-12T18:00'), at('2026-10-14T18:00'), // week of 12 Oct: 2
    at('2026-10-19T18:00') // this week: 1 so far
  ]
  const st = weekStreak(s, new Date(2026, 9, 21))
  assert.equal(st.weeks, 2); assert.equal(st.thisWeek, 1); assert.equal(st.safe, false)
  s.push(at('2026-10-21T08:00'))
  assert.equal(weekStreak(s, new Date(2026, 9, 21)).weeks, 3)
})

test('week streak: a missed week resets it, best remembers', () => {
  const s = [at('2026-09-07T18:00'), at('2026-09-08T18:00'), at('2026-09-14T18:00'), at('2026-09-15T18:00'), at('2026-09-16T18:00'),
    at('2026-10-12T18:00'), at('2026-10-13T18:00')]
  const st = weekStreak(s, new Date(2026, 9, 20))
  assert.equal(st.weeks, 1); assert.equal(st.best, 2)
})

test('muscle volume: primary 1, secondary 0.5, against the target range', () => {
  const ex = { bench: { primary: ['chest'], secondary: ['triceps'] } }
  const sets = Array.from({ length: 12 }, () => set('bench', 60, 8))
  const v = muscleVolume([at('2026-10-20T18:00', sets)], ex, { today: new Date(2026, 9, 22) })
  assert.deepEqual(v.find(m => m.muscle === 'chest'), { muscle: 'chest', sets: 12, status: 'ok' })
  assert.deepEqual(v.find(m => m.muscle === 'triceps'), { muscle: 'triceps', sets: 6, status: 'low' })
  const avg = muscleVolume([at('2026-10-20T18:00', sets)], ex, { today: new Date(2026, 9, 22), weeks: 4 })
  assert.equal(avg.find(m => m.muscle === 'chest').sets, 3)
})

test('calendar: Monday-first weeks that cover the month', () => {
  const cal = calendarMonth('2026-11', [at('2026-11-03T18:00')])
  assert.equal(cal[0][0].key, '2026-10-26')
  assert.equal(cal[0][6].key, '2026-11-01')
  const tue = cal.flat().find(c => c.key === '2026-11-03')
  assert.equal(tue.sessions.length, 1)
  assert.ok(cal.flat().filter(c => c.inMonth).length === 30)
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
})

test('month report: totals, PRs and biggest gains', () => {
  const s = [
    at('2026-10-28T18:00', [set('bench', 60, 8)]),
    at('2026-11-03T18:00', [set('bench', 60, 9), set('bench', 60, 8, { type: 'warmup' })]),
    at('2026-11-10T18:00', [set('bench', 62.5, 8), set('row', 50, 10)])
  ]
  const r = monthReport(s, '2026-11', { exercisesById: { bench: { primary: ['chest'] }, row: { primary: ['lats'] } } })
  assert.equal(r.sessions, 2); assert.equal(r.sets, 3); assert.equal(r.prevSessions, 1)
  assert.equal(r.volume, 60 * 9 + 62.5 * 8 + 500)
  assert.ok(r.prs.some(p => p.type === 'reps' && p.exerciseId === 'bench'))
  assert.ok(r.prs.some(p => p.type === 'load' && p.exerciseId === 'bench'))
  assert.equal(r.lifts[0].exerciseId, 'bench')
  assert.equal(r.muscles[0].muscle, 'chest')
  assert.deepEqual(monthsWithWorkouts(s), ['2026-11', '2026-10'])
})

test('challenge progress by type', () => {
  const s = [at('2026-11-03T18:00', [set('pushup', 0, 20), set('pushup', 0, 15), set('bench', 60, 8)]), at('2026-11-05T18:00', [set('pushup', 0, 25)])]
  assert.deepEqual(challengeProgress({ type: 'workouts', target: 12 }, s, '2026-11'), { value: 2, target: 12, pct: 2 / 12, done: false })
  assert.equal(challengeProgress({ type: 'reps', target: 50, exerciseIds: ['pushup'] }, s, '2026-11').done, true)
  assert.equal(challengeProgress({ type: 'sets', target: 10 }, s, '2026-11').value, 4)
  assert.equal(challengeProgress({ type: 'manual', target: 20 }, s, '2026-11', { manual: 5 }).value, 5)
  assert.equal(challengeProgress({ type: 'volume', target: 1000, unit: 'kg' }, s, '2026-11', { unit: 'lb' }).target, 2205)
  assert.equal(challengeProgress({ type: 'workouts', target: 12 }, s, '2026-12').value, 0)
})

test('workout length: under a minute stays below 1, long sessions are capped', () => {
  const s = (secs) => ({ startedAt: '2026-11-03T18:00:00Z', finishedAt: new Date(Date.parse('2026-11-03T18:00:00Z') + secs * 1000).toISOString() })
  assert.ok(sessionMinutes(s(20)) < 1)
  assert.equal(sessionMinutes(s(95)), 2)
  assert.equal(sessionMinutes(s(6 * 3600)), 240)
})
