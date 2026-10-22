# Gym Crew (gym-app)

Private Android app for the crew. Vue 3 with a small custom UI kit (no component library), wrapped as an APK with Capacitor 8.
The monthly routine and exercise library come from the **public** `gym-routines` repo,
so a new month never needs a new APK. Workout history lives only on each phone.

## Features

- **Train**: next-up day with a big start button, Monday-to-Sunday week strip, this month's days (each day wears a plate colour: A red, B blue, C yellow, D green)
- **Workout logging**: one exercise at a time, large − / + steppers (tap the number to type, hold to repeat), log button under your thumb, swipe left/right between exercises, undo after every set, tap a set to edit or delete it, optional "reps left in the tank", built-in timer for holds, swap exercise, add/remove sets, notes, free sessions; saved after every set and the screen stays awake
- **In the workout (v0.3)**: plate breakdown under barbell weights, warm-up checklist on the first lift, "set 2 last time" line, drop sets / to failure / max reps, separate left and right reps for one-sided exercises, machine settings (seat, pads) shown on the exercise, "feeling rough" lighter-day button, effort and energy check-in at the end, edit a workout after finishing it
- **v0.3.1**: supersets shown as one unit (one chip, A/B tabs, rounds grid, auto-switch, rest after each round); photo thumbnail and info button open a how-to sheet mid-workout
- **Plans (v0.3)**: week-by-week reps-in-reserve targets, deload weeks drop a set automatically, date overrides (e.g. extra set on the first lift), exercises filtered to what your gym has, training-day reminders
- **Exercises tab (v0.3)**: browse and filter all exercises, photos of the movement, front/back muscle map
- **Polish (v0.3)**: themed app icon on Android 13+, long-press the app icon for "Start workout" and "Progress", larger-text option, first-workout tips, optional rest sound and 10-second warning
- **Rest timer**: built into the workout screen, superset-aware, ±time, vibrates, notifies when the app is in the background, floating pill on other screens
- **Progression**: double progression per exercise (hit the top of the range on every set → add your smallest jump; stalled twice → back off ~10%); deload week support
- **Progress**: estimated max and heaviest-set chart (with a table), records, sets per muscle, 12-week consistency grid, history
- **Tools**: effort / one-rep-max calculator with "what should I lift next", plate calculator with competition plate colours, warm-up ramp
- **Settings**: name, kg/lb, light/dark/auto theme, your gym's weight jumps, rest alerts, backup export/import, routine source, bug-report details
- First-run welcome (name + units), Android back button closes sheets first, works offline (fonts bundled)
- **v0.4, the crew**: English and Spanish (follows the phone, or pick it in Settings; exercises and routines carry their own Spanish text), beginner track (routine items can have a `beginner` version), monthly challenge from the routine file, crew board (weekly ranking, streaks, feed with records and high fives) on Supabase
- **v0.4, data safety**: automatic weekly backups to `Documents/GymCrew` (last 6 kept; survive uninstalling), restore from them in Settings, CSV export of every set and of body entries
- **v0.4, motivation**: week streaks (2+ workouts a week), month report (shown once when a new month starts, and in Progress → Reports), share images for a workout or a month, rep records and longest holds, bodyweight + measurements + private progress photos, hard sets per muscle against a 10–20 target (changeable), calendar in History
- **v0.5, your routines**: adjust any of the month's days (add, swap, remove or reorder exercises; change sets, reps, rest, notes, supersets). Changes are stored as a short edit list on top of the repo's day, so next month's version of the day gets them too; if the repo turns the day into a different workout you're asked whether to save the old one as yours, keep what still fits, or drop the changes. "Keep these changes?" after a workout where you swapped, added or changed sets (just today, always, or save as mine)
- **v0.5, My routines**: your own days and saved copies (save any day or the whole month as yours). Use a routine alongside the month's days or instead of them, for this month, a set number of weeks, or every month; when its time is up it goes back to My routines. Restoring the repo's routine never deletes anything. Your own exercises (name, how you log it, muscles, optional photo) for anything not in the library
- **v0.5.1**: the next set's weight adapts to the last one (reps left in the tank against the plan's target, and reps against the routine's range); rest countdown that pops up only when you leave the app mid-rest (Android's chronometer ticks it, it's posted natively on pause, comes back if swiped away while time is left, and asks to be a Live Update on Android 16) and a "Get ready: <next set>" pop-up when it ends (called off if you're still in the app, which chimes instead); louder, longer rest chime with a Soft/Loud choice
- **v0.5, body and goals**: height and optional sex, body fat entered or estimated from waist/neck/hips (US Navy formula), lean mass, FFMI and BMI. Goals for lifts (estimated max or actually lifted), reps, holds, bodyweight multiples, powerlifting total, DOTS, bodyweight, body fat, waist, lean mass and workouts per week (which also sets your streak from then on), with suggested targets, pace for weight goals, and up to two pinned on Train. Powerlifting card in Progress (squat, bench, deadlift, total, DOTS, bodyweight multiples)

## First-time setup (one person does this once)

### 1. Point the app at your routines repo
Edit `src/config.js` and replace `Contact-ARC` with the GitHub account name:
```js
'https://raw.githubusercontent.com/Contact-ARC/gym-routines/main/'
```
Do the same for `downloadUrl` in `gym-routines/latest.json`.

> Optional: rename the app before the first release — `appName`/`appId` in `capacitor.config.json`,
> plus `android/app/build.gradle` (`namespace`, `applicationId`) and `android/app/src/main/res/values/strings.xml`.
> **Never change `appId` after people install it** — Android treats it as a different app and their data stays behind.

### 2. Create the signing key (keep it forever)
Every update must be signed with the same key or Android refuses to install it over the old one.
Needs Java (`sudo pacman -S jdk21-openjdk` on CachyOS/Arch):
```bash
keytool -genkeypair -v -keystore gym-crew-release.jks -alias gymcrew \
  -keyalg RSA -keysize 2048 -validity 10000
```
Use the **same password** for the keystore and the key (modern PKCS12 keystores expect that).
Back up `gym-crew-release.jks` and the password somewhere safe outside the repo (password manager, Drive).
Lose it and everyone has to uninstall (losing data unless they exported a backup) to get updates.

### 3. Add the GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of `base64 -w0 gym-crew-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | your password |
| `ANDROID_KEY_ALIAS` | `gymcrew` |
| `ANDROID_KEY_PASSWORD` | your password (same) |

Or with the GitHub CLI:
```bash
base64 -w0 gym-crew-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body gymcrew
gh secret set ANDROID_KEY_PASSWORD
```

### 4. Push both repos
```bash
cd gym-app      && git init && git add . && git commit -m "Gym Crew 0.1.0" && gh repo create gym-app --private --source . --push
cd ../gym-routines && git init && git add . && git commit -m "October routine" && gh repo create gym-routines --public --source . --push
```

### 5. Release
```bash
git tag v0.1.0 && git push --tags
```
Actions → **Build & release APK** builds, signs and attaches `gym-crew-0.1.0.apk` to a GitHub Release
(~5–8 minutes). You can also run it manually from the Actions tab (it then uploads the APK as a build artifact instead of a release).

## Crew board (optional, one person does this once)
The crew board runs on a free Supabase project. Until it's set up the Crew tab just explains that; everything else works.

1. Create a free project at [supabase.com](https://supabase.com) (any EU region).
2. Dashboard → **SQL Editor** → New query → paste all of [`supabase/crew.sql`](supabase/crew.sql) → **Run**.
   It's safe to run again later; it only adds what's missing.
3. Dashboard → **Project Settings → API Keys**: copy the **publishable** key (`sb_publishable_…`).
   Project URL is on the project's home page (`https://<id>.supabase.co`).
4. Add this to `gym-routines/latest.json` and push:
   ```json
   "crew": { "url": "https://<id>.supabase.co", "anonKey": "sb_publishable_…" }
   ```
   Every phone picks it up the next time it checks the routine. No new APK needed.

Notes:
- The public key is meant to be public. The tables have row level security on with no policies, and the
  anon role has no table rights, so the app can only call the `crew_*` functions. Each phone has a random
  secret; the database stores only its hash, and every write checks it. The crew code is the invite.
- If the app shows an auth error with the publishable key, use the legacy `anon` key instead
  (same page, "Legacy API keys" tab). Both work with the same SQL.
- Free Supabase projects pause after about a week with no activity. If that happens, press Restore in the
  dashboard. The app queues posts while it can't reach the board and sends them later.
- Shared: display name, workouts (day, length, sets, volume, records) and weekly totals. Never shared:
  notes, body weight, measurements, photos. Anyone can turn off posting to the feed, or leave the crew
  (which deletes their posts).

## Installing on a phone
1. On the phone, open GitHub in Chrome, signed in to the account, → `gym-app` → Releases → download the APK.
2. Open it. Android asks to allow installs from Chrome ("Install unknown apps") — allow it once.
3. Updates: same steps; it installs over the top and keeps your data.

## Shipping an update
```bash
npm version patch          # 0.1.0 → 0.1.1, commits + tags
git push --follow-tags     # CI builds the release
```
Then bump `app.version` in `gym-routines/latest.json` so everyone sees the "Update available" banner.
The tag must match `package.json`'s version (CI checks).

## Local development
```bash
npm install
npm test                  # progression, records, streaks, reports + Spanish coverage
npm run dev               # browser at http://localhost:5173 (use phone size in devtools)
```
To test against a local copy of the routines, serve that folder with CORS and point the app at it:
```bash
npx serve ../gym-routines --cors -l 5174
echo "VITE_ROUTINES_URL=http://localhost:5174/" > .env.local
```
On a phone over USB (Android Studio installed): `npm run android:sync && npx cap run android`.

## Project layout
```
src/
  config.js            routines URL + versions        ← edit Contact-ARC
  store.js             app state, sessions, routine download
  lib/training.js      pure maths: e1RM, progression, plates, warm-ups, PRs (unit-tested)
  lib/storage.js       atomic JSON file storage + migrations
  lib/restTimer.js     rest timer + background notification
  lib/native.js        Capacitor wrappers with browser fallbacks
  ui/                  design system: Sheet, Stepper, Segmented, Toggle, Toast, PlateBadge, icons
  styles/base.css      colour tokens (light + dark), type, buttons, lists
  lib/stats.js         streaks, month report, calendar, muscle volume, challenges (unit-tested)
  lib/crew.js          crew board client (plain fetch to Supabase RPC) + offline queue
  lib/backup.js        automatic backups + CSV export
  lib/shareCard.js     canvas-drawn share images
  lib/photos.js        progress photos (resized, app storage only)
  i18n/                t() translation helper + es.js (check coverage: npm run i18n)
  views/               Home, Day, Exercise, Workout, Summary, Progress, History, Report, Body, Crew, Tools, Settings, Welcome
supabase/crew.sql      crew board database setup (run once in Supabase)
android/               Capacitor Android project (signing reads env vars from CI)
assets/                icon sources (regenerate: npx @capacitor/assets generate --android)
.github/workflows/     release.yml
```

## Data & backups
- Stored in the app's private storage as `gym-data.json` (written atomically after every set).
- **Automatic backups** (v0.4): weekly by default (or after every workout) to `Documents/GymCrew`, newest 6 kept.
  They survive uninstalling the app. After a reinstall Android may not let the app list the old files,
  so use **Import** and pick one from that folder. If `Documents` isn't writable the app falls back to its own storage.
- That still lives on the phone, so **Settings → Export** a copy off it now and then (the app reminds you after
  14 days, or 35 while automatic backups are working).
- **CSV export**: one row per set (`gym-crew-sets-*.csv`) plus body entries, for Sheets/Excel. Column names stay English.
- Progress photos are stored only in app storage and are **not** in backups.
- **Import** replaces all data on the phone with the backup — handy when switching phones.
- Machine/cable weights are logged as **pin positions** so different stacks don't corrupt your kg charts.
- Dumbbell weights are logged **per dumbbell**.
