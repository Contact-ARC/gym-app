// Lists English strings used with t()/tn() that are missing from a dictionary.
//   node scripts/i18n-check.mjs          → missing Spanish keys
//   node scripts/i18n-check.mjs --unused → keys in es.js nobody uses
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import es from '../src/i18n/es.js'

const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(vue|js)$/.test(f) && !p.includes('i18n')) files.push(p) } }
walk('src')

const STR = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`
const keys = new Set()
const add = (m) => { const s = (m[1] ?? m[2]); if (s != null) keys.add(s.replace(/\\'/g, "'").replace(/\\"/g, '"')) }
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  // t('…') and tr('…')
  for (const m of src.matchAll(new RegExp(String.raw`\bt(?:r)?\(\s*(?:${STR})`, 'g'))) add(m)
  // tn(n, '…', '…')
  for (const m of src.matchAll(new RegExp(String.raw`\btn\([^,]+,\s*(?:${STR})\s*,\s*(?:${STR})`, 'g'))) {
    add([null, m[1], m[2]]); add([null, m[3], m[4]])
  }
}
// Strings passed to t() indirectly (labels in data tables)
const EXTRA = [
  'Chest', 'Front delts', 'Side delts', 'Rear delts', 'Triceps', 'Biceps', 'Forearms', 'Lats', 'Upper back', 'Traps', 'Lower back',
  'Abs', 'Obliques', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves',
  'Barbells and plates', 'Squat rack or half rack', 'Benches', 'Dumbbells or kettlebells', 'EZ bar', 'Cable stack or functional trainer',
  'Smith machine', 'Leg press', 'Leg curl machine', 'Pull-up bar', 'Plyo box or step',
  'set|W', 'set|D', 'measure|Waist', 'measure|Chest', 'measure|Arm', 'measure|Thigh', 'measure|Hips', 'pose|Front', 'pose|Side', 'pose|Back',
  'Train', 'Exercises', 'Progress', 'Crew', 'nav|Tools',
  'Seat', 'Back pad', 'Leg pad', 'Pulley height', 'Handle', 'Bench angle', 'Grip', 'Foot position',
  'Shoulders', 'Arms', 'Legs', 'Core', 'body|Back', 'body|Front',
  'warm-up', 'drop', 'to failure', 'max reps',
  'Your data file was damaged, so the app loaded your automatic backup from {when}.', "Your data file couldn't be read. A copy was kept; import a backup from Settings if you have one.",
  'Last: {last}. Hit {hi} on every set with reps to spare → add {jump}, aim for {lo}+.', 'Last: {last}. Hit {hi} on every set → add {jump}, aim for {lo}+.',
  "There's no crew with that code. Check it with whoever sent it.", 'That code is already in use. Try again.', 'That crew is full (50 people).',
  // 0.5: goal types, help lines and lift names shown through a variable
  'Lift a weight', 'More reps', 'Hold longer', 'Lift a multiple of your bodyweight', 'Powerlifting total', 'DOTS score', 'Bodyweight', 'Body fat',
  'Waist', 'Lean mass', 'Workouts per week', 'Strength', 'Body', 'Habit', 'Squat', 'Bench press', 'Deadlift', 'measure|Neck', 'filter|Yours',
  'Bench 100 kg, squat 140 kg for 5…', '10 pull-ups, 30 push-ups…', 'A 2-minute plank, a longer carry…', 'Squat twice your bodyweight…',
  'Squat + bench + deadlift', 'Compares lifters of different bodyweights', 'Gain or lose, with a 7-day average', 'Entered or estimated from measurements',
  'From your measurements', 'Weight without fat: build muscle', 'Also sets what keeps your streak going',
  'Crew codes are 6 letters or numbers.', 'Pick a name between 1 and 30 characters.', "This phone isn't in that crew any more.", 'That was too much data to send.'
]
for (const k of EXTRA) keys.add(k)
// Template placeholders like `${…}` aren't keys
for (const k of [...keys]) if (k.includes('${') || k === '' || k.endsWith('|')) keys.delete(k)

if (process.argv.includes('--unused')) {
  for (const k of Object.keys(es)) if (!keys.has(k)) console.log(JSON.stringify(k))
} else if (process.argv.includes('--all')) {
  for (const k of [...keys].sort()) console.log(JSON.stringify(k))
} else {
  const missing = [...keys].filter(k => !(k in es)).sort()
  for (const k of missing) console.log(JSON.stringify(k))
  console.error(`${keys.size} keys, ${missing.length} missing in es.js`)
  if (missing.length && process.argv.includes('--strict')) process.exit(1)
}
