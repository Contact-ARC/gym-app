# Gym Crew (gym-app)

Private Android app for the crew. Vue 3 + Vuetify 3, wrapped as an APK with Capacitor 8.
The monthly routine and exercise library come from the **public** `gym-routines` repo,
so a new month never needs a new APK. Workout history lives only on each phone.

## Features

- **Train** — this month's A/B/C days, "next up" rotation, exercise instructions, set-up, cues, common mistakes, video search
- **Workout logging** — sets prefilled from your last session, reps-in-reserve (RIR) tap, edit/undo, swap exercise (alternatives), add sets, notes, free sessions (e.g. PT days), crash-safe (saved after every set), screen kept awake
- **Rest timer** — starts on every logged set, superset-aware, ±time, vibrates; notification when the app is in the background
- **Progression** — double progression per exercise: hit the top of the rep range on all sets → add your smallest jump; stalled below range twice → back off ~10%; deload week support
- **Progress** — est. 1RM + heaviest-set chart per exercise (with table view), PRs, sets per muscle (last 7 days), 12-week consistency heatmap, history
- **Tools** — effort / 1RM calculator with "what should I lift next" and rep table, plate calculator, warm-up ramp
- **Settings** — kg/lb, machine pins, your gym's smallest weight jumps, theme, JSON backup export/import (share sheet → Drive/WhatsApp), update banner, copy debug info

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
npm test                  # progression / 1RM / plates logic
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
  views/               Home, Day, Exercise, Workout, Summary, Progress, History, Tools, Settings
android/               Capacitor Android project (signing reads env vars from CI)
assets/                icon sources (regenerate: npx @capacitor/assets generate --android)
.github/workflows/     release.yml
```

## Data & backups
- Stored in the app's private storage as `gym-data.json` (written atomically after every set).
- Android's own Google backup includes it if the phone has backup enabled, but don't rely on that alone —
  use **Settings → Export** every couple of weeks (the app nags after 14 days).
- **Import** replaces all data on the phone with the backup — handy when switching phones.
- Machine/cable weights are logged as **pin positions** so different stacks don't corrupt your kg charts.
- Dumbbell weights are logged **per dumbbell**.
