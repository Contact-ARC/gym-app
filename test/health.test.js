import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionKind, sessionDistanceKm, healthRecords, healthChanges, recordHash, importedEntries, sourceName } from '../src/lib/healthRecords.js'

const ex = { treadmill: { logType: 'cardio' }, 'incline-treadmill-walk': { logType: 'cardio' } }
const set = (exerciseId, extra = {}) => ({ exerciseId, load: 60, reps: 8, ...extra })

test('health: a workout is typed by what most of its sets were', () => {
  assert.equal(sessionKind({ sets: [set('bench'), set('bench'), set('treadmill', { cardio: { speed: 5 } })] }, ex), 'strength')
  assert.equal(sessionKind({ sets: [set('treadmill', { cardio: { speed: 9.5 } })] }, ex), 'treadmill')
  assert.equal(sessionKind({ sets: [set('incline-treadmill-walk', { cardio: { speed: 5 } })] }, ex), 'walking')
  assert.equal(sessionKind({ sets: [set('stationary-bike'), set('air-bike')] }, ex), 'bike')
  assert.equal(sessionKind({ sets: [set('rowing-machine')] }, ex), 'rower')
  assert.equal(sessionKind({ sets: [{ climb: { grade: '6a' } }, { climb: { grade: '6b' } }] }, ex), 'climbing')
  // A circuit is HIIT; a circuit with real lifting in it is strength
  assert.equal(sessionKind({ sets: [set('kettlebell-swing'), set('battle-rope-waves'), set('med-ball-slam')] }, ex), 'hiit')
  assert.equal(sessionKind({ sets: [set('kettlebell-swing'), set('battle-rope-waves'), set('push-up'), set('db-row')] }, ex), 'strength')
  // Warm-ups don't count; nothing at all is strength
  assert.equal(sessionKind({ sets: [set('treadmill', { type: 'warmup', cardio: { speed: 6 } }), set('squat')] }, ex), 'strength')
  assert.equal(sessionKind({ sets: [] }, ex), 'strength')
  assert.equal(sessionDistanceKm({ sets: [set('treadmill', { cardio: { distance: 1.2 } }), set('treadmill', { type: 'warmup', cardio: { distance: 0.5 } }), set('treadmill', { cardio: { distance: 0.8 } })] }), 2)
})

const data = () => ({
  profile: { unit: 'lb', heightCm: 180 },
  sessions: [
    { id: 's1', startedAt: '2026-11-17T17:00:00.000Z', finishedAt: '2026-11-17T18:05:00.000Z', dayName: 'A — Squat & Bench', sets: [set('squat')] },
    { id: 's2', startedAt: '2026-11-18T17:00:00.000Z', finishedAt: '2026-11-18T17:00:00.000Z', sets: [set('treadmill', { cardio: { speed: 10, distance: 3 } })] },
    { id: 'now', startedAt: '2026-11-18T19:00:00.000Z', finishedAt: null, sets: [] }
  ],
  body: {
    entries: [
      { id: 'b1', date: '2026-11-10', weight: 200, unit: 'lb', bodyFat: 22.4 },
      { id: 'b2', date: '2026-11-12', weight: null, waist: 90 },
      { id: 'hc-x', date: '2026-11-13', weight: 90, unit: 'kg', source: 'hc', app: 'com.sec.android.app.shealth' }
    ]
  }
})

test('health: the records the app writes', () => {
  const r = healthRecords(data(), { exercisesById: ex, title: 'Workout' })
  assert.deepEqual([...r.keys()].sort(), ['fat:b1', 'height:main', 'session:s1', 'session:s2', 'weight:b1'])
  assert.deepEqual(r.get('session:s1'), { kind: 'session', id: 's1', start: '2026-11-17T17:00:00.000Z', end: '2026-11-17T18:05:00.000Z', exerciseType: 'strength', title: 'A — Squat & Bench' })
  // A zero-length workout gets a minute; distance travels with it; no day name → the fallback title
  assert.deepEqual(r.get('session:s2'), { kind: 'session', id: 's2', start: '2026-11-18T17:00:00.000Z', end: '2026-11-18T17:01:00.000Z', exerciseType: 'treadmill', title: 'Workout', distanceKm: 3 })
  assert.equal(r.get('weight:b1').kg, 90.72) // 200 lb
  assert.equal(r.get('fat:b1').percent, 22.4)
  assert.equal(r.get('height:main').meters, 1.8)
  // Switches
  assert.deepEqual([...healthRecords(data(), { workouts: false }).keys()].sort(), ['fat:b1', 'height:main', 'weight:b1'])
  assert.deepEqual([...healthRecords(data(), { body: false }).keys()].sort(), ['session:s1', 'session:s2'])
})

test('health: only changes are sent, deletions follow, a wipe deletes nothing', () => {
  const wanted = healthRecords(data(), { exercisesById: ex })
  const written = Object.fromEntries([...wanted].map(([k, r]) => [k, recordHash(r)]))
  assert.deepEqual(healthChanges(wanted, written), { write: [], remove: [], blocked: false })
  // Height's time doesn't count as a change
  assert.equal(recordHash({ kind: 'height', id: 'main', meters: 1.8, time: 'a' }), recordHash({ kind: 'height', id: 'main', meters: 1.8, time: 'b' }))
  // An edited workout and a deleted weigh-in
  const d = data()
  d.sessions[0].finishedAt = '2026-11-17T18:10:00.000Z'
  d.body.entries[0].bodyFat = null
  const c = healthChanges(healthRecords(d, { exercisesById: ex }), written)
  assert.deepEqual(c.write.map(r => r.id), ['s1'])
  assert.deepEqual(c.remove, [{ key: 'fat:b1', kind: 'fat', id: 'b1' }])
  // Nearly everything gone at once: nothing is deleted
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`session:x${i}`, 'h']))
  const wipe = healthChanges(new Map(), many)
  assert.equal(wipe.blocked, true)
  assert.deepEqual(wipe.remove, [])
})

test('health: weigh-ins from other apps become body entries once', () => {
  const day = (iso) => iso.slice(0, 10)
  const res = {
    weights: [{ id: 'w1', time: '2026-11-14T07:10:00Z', kg: 81.25, source: 'com.renpho.health' }, { id: 'w2', time: '2026-11-15T07:00:00Z', kg: 81, source: 'com.renpho.health' }],
    fats: [{ id: 'f1', time: '2026-11-14T07:10:05Z', percent: 18.44, source: 'com.renpho.health' }, { id: 'f9', time: '2026-11-16T07:00:00Z', percent: 18, source: 'com.renpho.health' }]
  }
  const { entries, seen } = importedEntries(res, { unit: 'kg', known: new Set(['hc-w2']), localDate: day })
  assert.deepEqual(entries, [
    { id: 'hc-w1', date: '2026-11-14', weight: 81.3, unit: 'kg', bodyFat: 18.4, source: 'hc', app: 'com.renpho.health' },
    { id: 'hc-f9', date: '2026-11-16', weight: null, unit: 'kg', bodyFat: 18, source: 'hc', app: 'com.renpho.health' }
  ])
  assert.deepEqual(seen.sort(), ['hc-f1', 'hc-f9', 'hc-w1'])
  // In pounds
  assert.equal(importedEntries({ weights: [res.weights[0]] }, { unit: 'lb', localDate: day }).entries[0].weight, 179.1)
  assert.equal(sourceName('com.sec.android.app.shealth'), 'Samsung Health')
  assert.equal(sourceName('com.garmin.android.apps.connectmobile'), 'Garmin Connect')
  assert.equal(sourceName('org.example.scale'), 'scale')
})

test('health: other workouts leave out a watch recording the same gym session', async () => {
  const { otherWorkouts, sleepNights, dailyLatest } = await import('../src/lib/healthRecords.js')
  const day = (iso) => iso.slice(0, 10)
  const sessions = [{ id: 's1', startedAt: '2026-11-17T17:00:00Z', finishedAt: '2026-11-17T18:00:00Z' }]
  const list = otherWorkouts([
    { id: 'g1', start: '2026-11-17T17:02:00Z', end: '2026-11-17T17:58:00Z', type: 'strength', source: 'com.garmin.android.apps.connectmobile' },
    { id: 'r1', start: '2026-11-16T07:00:00Z', end: '2026-11-16T07:32:00Z', type: 'running', title: 'Morning run', source: 'com.garmin.android.apps.connectmobile' },
    { id: 'w1', start: '2026-11-17T18:00:00Z', end: '2026-11-17T18:40:00Z', type: 'walking' } // after the gym, not during
  ], sessions, { day })
  assert.deepEqual(list.map(w => [w.id, w.minutes, w.date]), [['w1', 40, '2026-11-17'], ['r1', 32, '2026-11-16']])

  // Two apps recording the same night: the longer one, not the sum
  const nights = sleepNights([
    { start: '2026-11-16T23:10:00Z', end: '2026-11-17T06:40:00Z', source: 'watch' },
    { start: '2026-11-16T23:30:00Z', end: '2026-11-17T06:30:00Z', source: 'phone' },
    { start: '2026-11-17T23:00:00Z', end: '2026-11-18T03:00:00Z', source: 'watch' },
    { start: '2026-11-18T03:20:00Z', end: '2026-11-18T07:00:00Z', source: 'watch' } // woke up in the night: both parts count
  ], { day })
  assert.deepEqual(nights, [{ date: '2026-11-17', minutes: 450 }, { date: '2026-11-18', minutes: 460 }])

  assert.deepEqual(dailyLatest([{ time: '2026-11-17T08:00:00Z', bpm: 58 }, { time: '2026-11-17T20:00:00Z', bpm: 56 }, { time: '2026-11-16T08:00:00Z', bpm: 60 }], 'bpm', { day }),
    [{ date: '2026-11-16', value: 60 }, { date: '2026-11-17', value: 56 }])
})

test('monthHealth (0.14): a month of steps, sleep and other workouts', async () => {
  const { monthHealth } = await import('../src/lib/healthRecords.js')
  const h = {
    stepLog: { '2026-10-31': 20000, '2026-11-01': 8000, '2026-11-02': 12000, '2026-11-03': 0 },
    sleepLog: { '2026-11-01': 420, '2026-11-02': 450 },
    otherLog: { a: { date: '2026-11-02', minutes: 30 }, b: { date: '2026-11-05', minutes: 45 }, c: { date: '2026-10-20', minutes: 60 } }
  }
  assert.deepEqual(monthHealth(h, '2026-11'), {
    steps: { avg: 10000, best: 12000, days: 2 },
    sleep: { avg: 435, nights: 2 },
    others: { count: 2, minutes: 75 }
  })
  assert.equal(monthHealth(h, '2026-09'), null)
  assert.equal(monthHealth(null, '2026-11'), null)
  assert.equal(monthHealth({ sleepLog: { '2026-11-01': 400 } }, '2026-11').steps, null)
})
