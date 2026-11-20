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
- **v0.6, the crew grows up**: notifications through Firebase (workouts, records, training now, comments, reactions, nudges, challenges and badges, Sunday recap; each switchable, each its own Android channel), comments and four reactions on posts, leaderboards for this week / this month / all time (workouts, sets, volume, records, best streak) and a lifts board (squat, bench, deadlift, total, opt-in DOTS), member profiles with badges and a head-to-head chart, every set of a workout with "save it to My routines", share your own routines, team and head-to-head crew challenges settled automatically, "training now", nudges, and a crew owner who can remove people
- **v0.5.1**: the next set's weight adapts to the last one (reps left in the tank against the plan's target, and reps against the routine's range); rest countdown that pops up only when you leave the app mid-rest (Android's chronometer ticks it, it's posted natively on pause, comes back if swiped away while time is left, and asks to be a Live Update on Android 16) and a "Get ready: <next set>" pop-up when it ends, fired on time by a foreground service that runs only while you're out of the app mid-rest (RestTimerService; phones like OnePlus freeze background apps otherwise), with an exact alarm as backup (RestAlarmReceiver); skipped if you're in the app, which chimes instead; louder, longer rest chime with a Soft/Loud choice
- **v0.5, body and goals**: height and optional sex, body fat entered or estimated from waist/neck/hips (US Navy formula), lean mass, FFMI and BMI. Goals for lifts (estimated max or actually lifted), reps, holds, bodyweight multiples, powerlifting total, DOTS, bodyweight, body fat, waist, lean mass and workouts per week (which also sets your streak from then on), with suggested targets, pace for weight goals, and up to two pinned on Train. Powerlifting card in Progress (squat, bench, deadlift, total, DOTS, bodyweight multiples)
- **v0.9.2, gyms**: one list of the places you train (Settings → Gyms; climbing gyms are in it too). The gym you're at has its equipment, bar, plates, weight jumps, machine steps and machine settings in the usual profile/settings fields, and each other gym keeps a copy in `gym.lift`, swapped in by `switchGym`. Workouts record `gymId`; ones from before have none and count as `settings.climbing.legacyGymId` (changeable per gym). Machines (`gymBound`: weight stacks, cables, plate-loaded machines) have history, suggestions and records per gym; free weights count everywhere. A machine used only at another gym starts from that gym's weight and offers its settings to use or adjust
- **v0.10, badges**: 33 badges in six groups (`lib/badges.js`, worked out from your history so the dates are real). Level badges go Bronze → Diamond (workouts, streak, records, tonnage, variety, plates on each lift, total, bodyweight multiples, pull-ups, cardio distance, climbs); feats repeat with ×N (record day, perfect week, full house, comeback, early bird, night owl, weekend, heavy day, deload, challenge, goal, 5K, flash) and four are secret. A zigzag seal (`ui/BadgeSeal.vue`): dotted outline until earned, then filled with a tier-coloured edge and ribbon. Badge wall with progress and "almost there" (`/badges`, `/badges/<member>`), a detail sheet with the levels, dates and who in the crew has it, 3 pinned on your profile and the board. Shared as `stats.badgeState`; new badges and levels go to the feed, repeat feats only at ×5, ×10, ×25…
- **v0.11, training together**: 2 to 4 crew members do the host's day at once (`lib/together.js`, `crew_together_*` in `crew.sql`). Start from a workout's ⋯, invite people or give them the 4-digit code; join from the invite, the Crew screen or the code. Everyone logs into their own workout; sets are mirrored through an outbox (each message has an id, so a resend after a dropped connection is harmless), a Supabase Realtime broadcast says "something changed" (`lib/realtime.js`, no data on it) and the phones also check every few seconds. Turns go round the group on each exercise, then on to the next; anyone can do something else and come back. On a shared bar the lightest person's warm-up is everyone's and each heavier stack holds the lighter one, so a change of lifter is only adding or taking off plates (`lib/togetherPlan.js`); on machines you see the others' seat and weight. "You're up" and "Spot me" also come as notifications (channel `crew_together`). Badges: Trained together ×N and Partner streak
- **v0.15.2**: the workout header has two buttons for the exercise: an arrow for your progress, the i (and the photo and name) for how to do it. Supersets: Add/Remove a set changes just that exercise; Add/Remove a round (in ⋯ and under the round grid) changes every exercise in the superset
- **v0.16.1**: Home's "Start with your crew" is a round icon in the Next up card's corner instead of a third button next to Start; day pages have a "Start with your crew" button above the first exercise. Both start the day and open Train together
- **v0.16, Train together revamp**: the workout shows one slim line (faces with a ring on whoever's up, and "You're up · add 2×5 kg", "Ana's up" or, without turns, the others' latest set); the duplicate turn line above Log set is gone. The sheet is regrouped: who's in (each with their latest set and progress) with Invite next to crewmates, Take turns on/off for everyone (`state.turns` in the shared state, no database change; off means no turn and no shared-bar planning), Move everyone to… folded away, the code with Share, Spot me and Skip my turn as the actions, Leave/End small at the bottom. Home's Next up card has a Train together button (starts the day and opens the sheet) and Home shows "Ana is training together · Join". Includes 0.15.6 (remove an exercise from this workout, with undo)
- **v0.15.6**: ⋯ on an exercise has "Remove from this workout" (or "Skip the remaining sets" once some are logged), with Undo in the toast. It's a per-session `skipped` flag on the item, so logged sets keep their positions: removed exercises leave the strip, the set count and superset rounds, survive a reload, and the routine keeps them. Not offered while training together (it would stall the turns)
- **v0.15.5**: cardio machines with a difficulty setting get a Level (or Damper) stepper next to the minutes, from `resistance: { kind, min, max }` in the exercise data (stationary bike level 1–40, rower and SkiErg damper 1–10). The last level is remembered, saved on the set as `level`, and shown with it everywhere ("15 min · level 6"), including changes against last time in the summary
- **v0.15.4**: workout header is now photo · name › · ↗ · ⋯. The photo opens the exercise's photos full screen (PhotoViewer, without leaving the workout), the name opens How to do it, the arrow your progress; the separate i is gone (⋯ still has a quick How to do it)
- **v0.15.3**: the ⋯ menu's set controls are one compact line each: Sets n [−][+], and in a superset Rounds n [−][+]; the sheet stays open so you can tap several times
- **v0.15.1**: exercises open on How to do it again (0.14 had switched them to Progress once you had history; Progress links still open progress); Your machine settings shows for every exercise again, not just machines; the warm-up card has its footnote back (what a feeler set is, warm-ups don't count for records). Checked every UI string and default since 0.8.1 for anything else that went missing
- **v0.15, activity badges**: a new Activity badge group from Health Connect (`lib/badges.js`, tested): daily steps, total steps, 10K week (70,000 Monday–Sunday), workouts other apps recorded, active calories in workouts, well rested (7 nights of 7 h+), plus weigh-ins under Habits. Health Connect now keeps a per-phone history for them (`health.stepLog`, `sleepLog`, `otherLog`; the first read goes back the 30 days Health Connect allows, then a week). Badges earned in the background show a toast (`backgroundBadges()` in `lib/myBadges.js`). The streak is always 2 workouts a week; a weekly goal no longer raises it and has its own run on Goals and an "x of y" line on Home. Home also shows today's steps and last night's sleep; the monthly report gets an "Outside the gym" section (`monthHealth()`). Bar choices are 20/15/10/5/0 kg (45/35/25/15/0 lb) in Tools and Settings (`barChoices()`), 0 for an EZ bar or handle you don't count
- **v0.14, tidy-up**: Settings regrouped into Account, You, Training, Gyms, Connections, Your data and About; reminders, rest-timer alerts, equipment and bar/weight jumps open as sheets from one-line summaries (equipment has All on / All off). Home shows Free session / Climbing right under Next up, the "Routine" tag only when your own days are mixed in, and no backup nag while account sync is working. Crew's Train together row has a Join button; the crew-server link opens straight in Settings. Exercises open on Progress once you have history; machine settings only show when they apply. Numbers use the language's decimal comma (40,8 kg) everywhere
- **v0.13.1, more from Health Connect**: also reads workouts other apps or a watch recorded (History, "Other activity"; ones overlapping a Gym Crew workout are left out as the same session seen twice), active calories during each workout (summary, next to heart rate), sleep per night (the longer recording when two apps tracked the same night), resting heart rate and VO2 max (Body → From Health Connect). Phones connected on 0.13.0 get an "Allow more" prompt for the new permissions
- **v0.13, Health Connect**: Settings → Health → Connect (`lib/health.js`, native side `android/app/src/main/java/com/gymcrew/app/HealthBridgePlugin.kt`). Writes each finished workout as an exercise session (strength, treadmill run, walking, stationary bike, rowing machine, climbing or HIIT, from what most of its sets were; treadmill distance as a distance record), weight and body fat from the Body log, and height. Every record has a client record id (`gc-session-<id>`…) and an increasing version, so edits update and deletions delete instead of making copies (`lib/healthRecords.js`, unit-tested; a sudden loss of most records deletes nothing). Reads average and max heart rate during each workout (any watch that syncs to Health Connect: Garmin, Samsung, Pixel…), weigh-ins and body fat from other apps into the Body log (labelled with their app; deleting one keeps it out), and daily steps (Body). Three switches: send workouts, send body, read from other apps. Health Connect is per phone (`state.data.health` isn't saved to the account). Its permission screen links to `HealthPrivacyActivity` → https://arc-suite.com/gym-crew/privacy/. Needs Android 8+ (minSdk 26); on Android 13 and older the Health Connect app comes from the Play Store
- **v0.12, accounts**: optional Google sign-in (Settings → Account; `lib/account.js`, Android's own account picker through `@capgo/capacitor-social-login`, then Supabase Auth's `id_token` grant, plain fetch). Signed in, your data is saved to your account and follows you to any phone (`lib/sync.js`): the data file is split into records (`lib/syncRecords.js`: each finished workout, body entry, photo, goal, routine, own exercise, routine change, machine setting, note, challenge, past routine, plus settings, profile and small things), changed records are sent after each save and other phones' changes fetched (`sync_push` / `sync_pull` in `supabase/account.sql`), the later change wins, deletions travel, and a sudden mass deletion is treated as a wiped phone and fetched back instead. The first sync on a phone (or after an import) merges without deleting. Progress photos go to a private storage bucket, one folder per user. The crew membership follows the account too: a new phone signed in to the account rejoins as the same member (`crew_link` / `crew_restore`, more than one key per member). Delete account removes everything saved in it; each phone keeps its own copy
- **v0.11.1, minute-long timed sets**: an exercise with `"timeUnit": "min"` (bikes, SkiErg) is set and logged in minutes, like cardio, with minute-based suggestions; times of 2 min or more show as minutes everywhere (`fmtSecs`). A routine replaced within the same month (new title) is announced again and the day rotation restarts (`lastSeenRoutineKey`).

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
- Free Supabase projects pause after about a week with no activity; the daily **Keep Supabase awake** workflow
  prevents that. If it ever happens, press Restore in the dashboard. The app queues posts while it can't reach
  the board and sends them later.
- Shared: display name, workouts (day, length, every set's weight and reps unless "Show every set" is off,
  records), totals for the week, month and all time, best lifts and badges, and routines you choose to share.
  Never shared: notes, body weight, measurements, photos (DOTS only if you turn it on). Anyone can turn off posting to the feed, or leave the crew
  (which deletes their posts).

## Crew notifications (optional, one person does this once)
Notifications go through Firebase Cloud Messaging (free). Without this setup the app still works; the
notification settings in Crew just say they aren't set up.

**Firebase (console.firebase.google.com)**
1. Add project → name it (e.g. Gym Crew) → Google Analytics off → Create.
2. Project overview → Add app → **Android** → package name `com.gymcrew.app` → Register app →
   **Download google-services.json** → skip the remaining steps.
3. ⚙ Project settings → **Service accounts** → **Generate new private key** → saves a `…-firebase-adminsdk-….json`.
   This one is a secret: keep it out of the repo.
4. ⚙ Project settings → **Cloud Messaging**: "Firebase Cloud Messaging API (V1)" should say Enabled.

**GitHub (so the APK is built with Firebase)**
```powershell
Get-Content .\google-services.json -Raw | gh secret set GOOGLE_SERVICES_JSON
```
(The CI writes it to `android/app/google-services.json`; that path is git-ignored.)

**Supabase**
1. SQL Editor → run the latest [`supabase/crew.sql`](supabase/crew.sql) again (safe to re-run).
2. Edge Functions → Deploy a new function → **Via editor** → name `crew-push` → paste
   [`supabase/functions/crew-push/index.ts`](supabase/functions/crew-push/index.ts) → Deploy.
3. Open `crew-push` → its settings → turn **off** "Verify JWT with legacy secret" / "Enforce JWT verification" → Save.
   (The database calls it without a key; the function only sends what the database says really happened, once.)
4. Edge Functions → **Secrets** → add `FCM_SERVICE_ACCOUNT` = the whole contents of the service-account JSON from Firebase step 3.
5. SQL Editor → tell the database where the function is (use your project's address):
   ```sql
   insert into public.crew_settings (key, value)
   values ('push_url', 'https://<project-ref>.supabase.co/functions/v1/crew-push')
   on conflict (key) do update set value = excluded.value;
   ```
6. Integrations → **Cron** should list `crew-settle` (nightly: closes crew challenges) and `crew-recap` (Sunday evening).
   If Cron isn't enabled, enable it there and run `crew.sql` once more.

Then release the app. In Crew → ⋯ → Notifications, each person turns them on and picks which kinds they want
(workouts, records, training now, comments, reactions, nudges, challenges and badges, weekly recap).
Each kind is also its own Android notification channel.

If notifications don't arrive:
- In the app: Crew → ⋯ → Notifications → **Send me a test** (0.10+). It sends one through the whole chain and says which link broke.
- In Supabase: SQL Editor → run [`supabase/check-notifications.sql`](supabase/check-notifications.sql) (read-only), and Edge Functions → crew-push → **Logs** shows Firebase's answer for every send.

## Accounts (optional, one person does this once)
Sign in with Google and saving to an account (0.12+). Needs the crew board set up first (same Supabase project).
Until it's set up, Settings → Account says so and everything else works.

**Google Cloud (console.cloud.google.com)**: use the project Firebase created (same Google account).
1. **APIs & Services → OAuth consent screen** (Google Auth Platform): app name Gym Crew, your email as support
   and developer contact, audience **External**. Scopes: leave the defaults (email, profile, openid).
   Then **Audience → Publish app** ("In production") so anyone can sign in. With only these scopes Google
   doesn't need to review it. (In "Testing" only the accounts listed as test users can sign in.)
2. **Credentials → Create credentials → OAuth client ID → Web application**, name "Gym Crew web". No URLs needed.
   Copy its **Client ID** (`…apps.googleusercontent.com`) and **Client secret**.
3. **Create credentials → OAuth client ID → Android**: package name `com.gymcrew.app`, SHA-1 = the release
   signing certificate's. The release build prints it on the run's summary page ("Signing certificate SHA-1"),
   or run `keytool -list -v -keystore gym-crew-release.jks` (JDK's keytool) and take "SHA1".
   Nothing from this client goes anywhere else: Google checks the APK's signature against it.

**Supabase**
1. SQL Editor → run the latest [`supabase/crew.sql`](supabase/crew.sql), then [`supabase/account.sql`](supabase/account.sql). Both are safe to re-run.
2. **Authentication → Sign In / Providers → Google** → enable. Client ID = the **Web** client ID
   (also put it under "Client IDs" / "Authorized Client IDs" if that field is there), Client secret = the Web client's secret → Save.
   "Skip nonce checks" stays off.
3. Storage should now list a private bucket `progress-photos` (account.sql makes it).

**Routines repo**: add the Web client ID to the crew block in `gym-routines/latest.json` and push:
```json
"crew": { "url": "https://<id>.supabase.co", "anonKey": "sb_publishable_…", "googleClientId": "<web client id>.apps.googleusercontent.com" }
```

Notes:
- If sign-in says "Developer console is not set up correctly" ([28444]), the APK's SHA-1 or the package name doesn't
  match the Android client, or the Web client ID is wrong. Google Cloud changes can take a few hours to apply.
- What's saved: everything in the app except the workout in progress, the routine cache, automatic-backup state,
  reminders, the routine address and crew keys. Whoever owns the Supabase project can read it in the dashboard.
- Free Supabase projects pause after a quiet week. The **Keep Supabase awake** workflow (`.github/workflows/keep-alive.yml`)
  reads one number from the database every day so that doesn't happen. If it ever does pause, nothing is lost:
  each phone keeps its own copy and catches up after Restore.

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
  lib/photos.js        progress photos (resized, app storage; saved to your account when signed in)
  lib/account.js       Google sign-in, Supabase session, photo storage calls (0.12)
  lib/sync.js          saving to your account: changes up, other phones' changes down (0.12)
  lib/syncRecords.js   how the data splits into records (unit-tested)
  lib/health.js        Health Connect: what's written, heart rate, weigh-ins, steps (0.13)
  lib/healthRecords.js what goes to Health Connect, and weigh-ins coming back (unit-tested)
  i18n/                t() translation helper + es.js (check coverage: npm run i18n)
  views/               Home, Day, Exercise, Workout, Summary, Progress, History, Report, Body, Crew, Tools, Settings, Welcome
supabase/crew.sql      crew board database setup (run once in Supabase)
supabase/account.sql   accounts: saved data, private photo bucket (run after crew.sql)
android/               Capacitor Android project (signing reads env vars from CI); HealthBridgePlugin.kt is the
                       app's own Health Connect bridge (Kotlin), HealthPrivacyActivity opens the privacy policy
assets/                icon sources (regenerate: npx @capacitor/assets generate --android)
.github/workflows/     release.yml, keep-alive.yml (daily ping so free Supabase doesn't pause)
```

## Data & backups
- Stored in the app's private storage as `gym-data.json` (written atomically after every set).
- **Automatic backups** (v0.4): weekly by default (or after every workout) to `Documents/GymCrew`, newest 6 kept.
  They survive uninstalling the app. After a reinstall Android may not let the app list the old files,
  so use **Import** and pick one from that folder. If `Documents` isn't writable the app falls back to its own storage.
- That still lives on the phone, so **Settings → Export** a copy off it now and then (the app reminds you after
  14 days, or 35 while automatic backups are working).
- **CSV export**: one row per set (`gym-crew-sets-*.csv`) plus body entries, for Sheets/Excel. Column names stay English.
- Progress photos are stored in app storage and are **not** in backups. Signed in (0.12+), they're also saved to
  your account's private photo folder.
- **Signed in** (0.12+), everything is also saved to your account and comes back on any phone you sign in on.
  Import while signed in merges the backup with your account (nothing in the account is deleted).
- **Import** replaces all data on the phone with the backup — handy when switching phones.
- Machine/cable weights are logged as **pin positions** so different stacks don't corrupt your kg charts.
- Dumbbell weights are logged **per dumbbell**.
