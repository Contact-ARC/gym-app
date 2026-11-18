import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateBadges, badgeChanges, badgeWall, badgeTally, packBadges, unpackBadges, announceFeat, BADGES } from '../src/lib/badges.js'

const lifts = { squat: 'sq', bench: 'bp', deadlift: 'dl' }
let n = 0
const at = (iso, sets, extra = {}) => ({ id: 's' + (++n), startedAt: iso, finishedAt: new Date(new Date(iso).getTime() + 60 * 60000).toISOString(), sets, items: [], ...extra })
const set = (exerciseId, load, reps, extra = {}) => ({ exerciseId, load, reps, unit: 'kg', ...extra })

test('badges: levels with the dates they were reached', () => {
  const sessions = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(2026, 0, 5 + i * 3, 18)
    sessions.push(at(d.toISOString(), [set('bp', 50 + i * 5, 5), set('sq', 80, 5), set('dl', 100, 5)]))
  }
  const st = evaluateBadges({ sessions, unit: 'kg', lifts, bodyweights: [{ date: '2026-01-01', kg: 80 }] })
  assert.equal(st.first.level, 1)
  assert.equal(st.workouts.level, 1) // 10 workouts
  assert.equal(st.workouts.value, 12)
  assert.equal(st.workouts.next, 50)
  assert.equal(st.workouts.dates[0], sessions[9].startedAt.slice(0, 10))
  // Bench 105 kg: 1 plate (60) and 2 plates (100)
  assert.equal(st.bench.level, 2)
  assert.equal(st.bench.value, 105)
  assert.equal(st.bench.next, 140)
  // 105 / 80 = 1.31× bodyweight: 0.75, 1 and 1.25
  assert.equal(st.benchBw.level, 3)
  // Total 105 + 80 + 100 = 285: not 300 yet
  assert.equal(st.total.level, 0)
  assert.equal(st.total.value, 285)
})

test('badges: feats repeat, secrets and time of day', () => {
  const sessions = [
    at(new Date(2026, 0, 1, 6, 30).toISOString(), [set('bp', 60, 5)]), // New Year, early bird
    at(new Date(2026, 0, 3, 22, 0).toISOString(), [set('bp', 60, 5)]), // Saturday night
    at(new Date(2026, 0, 4, 10, 0).toISOString(), [set('bp', 60, 5)]), // Sunday: weekend done
    at(new Date(2026, 0, 30, 2, 0).toISOString(), [set('bp', 60, 5)]) // 26 days later at 2 am: comeback, witching hour
  ]
  const st = evaluateBadges({ sessions, unit: 'kg', lifts })
  assert.equal(st.newYear.count, 1)
  assert.equal(st.earlyBird.count, 1)
  assert.equal(st.nightOwl.count, 1)
  assert.equal(st.weekend.count, 1)
  assert.equal(st.comeback.count, 1)
  assert.equal(st.witching.count, 1)
  assert.equal(st.christmas.count, 0)
  // No bodyweight: multiples can't be worked out
  assert.equal(st.benchBw.value, null)
})

test('badges: streaks, perfect weeks, record days, full house', () => {
  const sessions = []
  // 5 weeks of 3 workouts (Mon, Wed, Fri)
  for (let w = 0; w < 5; w++) for (const d of [0, 2, 4]) {
    const day = new Date(2026, 1, 2 + w * 7 + d, 18)
    sessions.push(at(day.toISOString(), [set('bp', 60 + w * 10 + d, 5)], { items: [{ sets: 1 }] }))
  }
  const st = evaluateBadges({ sessions, unit: 'kg', lifts, weekTarget: 3 })
  assert.equal(st.streak.value, 5)
  assert.equal(st.streak.level, 1) // 4 weeks
  assert.equal(st.perfectWeek.count, 5)
  assert.equal(st.fullHouse.count, 15)
  // Weekly goal of 4 from the start: no streak at 3 a week
  assert.equal(evaluateBadges({ sessions, unit: 'kg', lifts, streakMin: 4 }).streak.value, 0)
})

test('badges: changes, wall, packing for the crew', () => {
  const a = at(new Date(2026, 2, 2, 18).toISOString(), [set('bp', 60, 5)])
  const b = at(new Date(2026, 2, 4, 6).toISOString(), [set('bp', 100, 5)])
  const before = evaluateBadges({ sessions: [a], unit: 'kg', lifts })
  const after = evaluateBadges({ sessions: [a, b], unit: 'kg', lifts })
  const ch = badgeChanges(before, after)
  assert.deepEqual(ch.find(c => c.id === 'bench'), { id: 'bench', level: 2, count: 2, kind: 'level' })
  assert.deepEqual(ch.find(c => c.id === 'earlyBird'), { id: 'earlyBird', level: 1, count: 1, kind: 'new' })
  // Climbing only once you've climbed; secrets only once earned
  const groups = badgeWall(after).map(g => g.group)
  assert.ok(!groups.includes('climbing'))
  assert.ok(groups.includes('secret'))
  const t = badgeTally(after)
  assert.ok(t.earned >= 3 && t.of < BADGES.length)
  // Packed for the crew and back
  const packed = packBadges(after)
  assert.equal(packed.newYear, undefined)
  assert.deepEqual(packed.bench.slice(0, 3), [2, 2, 100])
  const un = unpackBadges(packed, 'kg')
  assert.equal(un.bench.level, 2)
  assert.equal(un.bench.next, 140)
  assert.equal(un.workouts.level, 0)
  assert.ok(announceFeat(1) && announceFeat(10) && !announceFeat(3))
})

test('badges: trained together and weeks in a row of it', () => {
  const s = (d, together) => ({ id: 't' + d.getTime(), startedAt: d.toISOString(), finishedAt: new Date(d.getTime() + 3600000).toISOString(), sets: [], items: [], together })
  const sessions = [s(new Date(2026, 2, 2, 18), 'a'), s(new Date(2026, 2, 4, 18), 'b'), s(new Date(2026, 2, 10, 18), 'c'), s(new Date(2026, 2, 17, 18), null), s(new Date(2026, 2, 31, 18), 'd')]
  const st = evaluateBadges({ sessions, unit: 'kg' })
  assert.equal(st.together.count, 4)
  assert.equal(st.togetherStreak.value, 2) // two weeks in a row, then a gap
  assert.equal(st.togetherStreak.level, 1)
})

test('badges (0.14): steps, a 10K week, sleep, other workouts, calories, weigh-ins', () => {
  const day = (i) => `2026-03-${String(i).padStart(2, '0')}`
  // 2–8 March 2026 is Monday to Sunday
  const steps = [2, 3, 4, 5, 6, 7, 8].map(i => ({ date: day(i), count: i === 4 ? 16000 : 9000 }))
  const sleep = [
    ...[1, 2, 3].map(i => ({ date: day(i), minutes: 480 })),
    { date: day(4), minutes: 300 }, // a short night breaks the run
    ...[5, 6, 7, 8, 9, 10, 11].map(i => ({ date: day(i), minutes: 430 }))
  ]
  const others = Array.from({ length: 6 }, (_, i) => ({ date: day(i + 1), minutes: 30, type: 'run' }))
  const sessions = [at('2026-03-02T18:00:00', [set('bp', 60, 8)], { kcal: 3000 }), at('2026-03-05T18:00:00', [set('bp', 60, 8)], { kcal: 2500 })]
  const bodyweights = Array.from({ length: 10 }, (_, i) => ({ date: day(i + 1), kg: 90 - i * 0.1 }))
  const st = evaluateBadges({ sessions, unit: 'kg', lifts, steps, sleep, others, bodyweights, healthUsed: true })
  assert.equal(st.steps.level, 2) // 16,000 in a day: 10k and 15k
  assert.equal(st.steps.dates[0], day(4))
  assert.equal(st.stepsTotal.value, 16000 + 6 * 9000)
  assert.equal(st.stepWeek.count, 1) // 16,000 + 6 × 9,000 = 70,000 exactly
  assert.equal(st.wellRested.count, 1)
  assert.equal(st.wellRested.first, day(11))
  assert.equal(st.outside.level, 1)
  assert.equal(st.outside.first, day(5))
  assert.equal(st.kcal.level, 1)
  assert.equal(st.kcal.first, '2026-03-05')
  assert.equal(st.weighIns.level, 1)
  assert.equal(st.weighIns.first, day(10))
  // Shown once Health Connect is used, hidden before
  assert.ok(badgeWall(st).some(g => g.group === 'activity'))
  const none = evaluateBadges({ sessions: [at('2026-03-02T18:00:00', [set('bp', 60, 8)])], unit: 'kg', lifts })
  assert.ok(!badgeWall(none).some(g => g.group === 'activity'))
  // A crewmate's packed activity badges show on their wall
  assert.ok(badgeWall(unpackBadges(packBadges(st), 'kg')).some(g => g.group === 'activity'))
})

test('badges (0.14): a 10K week counts once, on the day it crosses 70,000', () => {
  const steps = [2, 3, 4, 5, 6, 7, 8].map(i => ({ date: `2026-03-0${i}`, count: 11000 })) // 77,000
  const st = evaluateBadges({ sessions: [], unit: 'kg', lifts, steps })
  assert.equal(st.stepWeek.count, 1)
  assert.equal(st.stepWeek.first, '2026-03-08')
  const short = evaluateBadges({ sessions: [], unit: 'kg', lifts, steps: steps.map(s => ({ ...s, count: 9000 })) })
  assert.equal(short.stepWeek.count, 0)
})
