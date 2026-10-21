<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="back"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ t('Settings') }}</h1>

    <h2 class="section-h">{{ t('You') }}</h2>
    <div class="group">
      <div class="group-row">
        <label class="grow" for="s-name">{{ t('Name') }}</label>
        <input id="s-name" v-model="p.name" class="inline-input" type="text" :placeholder="t('Add your name')" autocomplete="given-name" @blur="persist">
      </div>
      <div class="group-row col">
        <span class="row lang-h"><Icon name="language" :size="20" />{{ t('Language') }}</span>
        <Segmented :model-value="i18n.lang" :options="LANGS" :label="t('Language')" @update:model-value="setLanguage" />
      </div>
      <div class="group-row col">
        <span>{{ t('Units') }}</span>
        <Segmented v-model="p.unit" :options="[{ label: t('Kilograms'), value: 'kg' }, { label: t('Pounds'), value: 'lb' }]" :label="t('Units')" @update:model-value="onUnit" />
      </div>
      <div class="group-row col">
        <span>{{ t('Theme') }}</span>
        <Segmented v-model="p.theme" :options="themeItems" :label="t('Theme')" @update:model-value="persist" />
      </div>
      <div class="group-row col">
        <span>{{ t('Text size') }}</span>
        <Segmented v-model="s.textSize" :options="[{ label: t('Normal'), value: 'normal' }, { label: t('Larger'), value: 'large' }]" :label="t('Text size')" @update:model-value="persist" />
      </div>
    </div>

    <h2 class="section-h">{{ t('Training') }}</h2>
    <div class="group">
      <div class="group-row col">
        <span>{{ t('Routine track') }}</span>
        <Segmented v-model="p.level" :options="[{ label: t('Standard'), value: 'standard' }, { label: t('Beginner'), value: 'beginner' }]" :label="t('Routine track')" @update:model-value="persist" />
        <span class="t-tiny t-muted">{{ levelHelp }}</span>
      </div>
      <div class="group-row col">
        <div>
          <div>{{ t('Weekly sets per muscle') }}</div>
          <div class="t-tiny t-muted">{{ t('Target range on the Progress screen') }}</div>
        </div>
        <div class="row range">
          <Stepper v-model="s.volumeTarget[0]" :step="1" :min="2" :max="s.volumeTarget[1] - 1" size="md" class="mini xs" :label="t('Lowest')" @update:model-value="persist" />
          <span class="t-muted">–</span>
          <Stepper v-model="s.volumeTarget[1]" :step="1" :min="s.volumeTarget[0] + 1" :max="40" size="md" class="mini xs" :label="t('Highest')" @update:model-value="persist" />
        </div>
      </div>
    </div>

    <h2 class="section-h">{{ t('Your gym') }}</h2>
    <div class="group">
      <div v-for="(label, tag) in EQUIPMENT" :key="tag" class="group-row">
        <span class="grow">{{ t(label) }}</span>
        <Toggle :model-value="s.equipment[tag] !== false" @update:model-value="(v) => setEquip(tag, v)" />
      </div>
    </div>
    <p class="t-tiny t-muted foot">{{ t('Exercise lists and swaps only show what your gym has. Routines still show everything.') }}</p>

    <h2 class="section-h">{{ t('Reminders') }}</h2>
    <div class="card card-pad">
      <div class="label">{{ t('Remind me on') }}</div>
      <div class="days" role="group" :aria-label="t('Reminder days')">
        <button
          v-for="d in weekDays" :key="d.n" class="day" :class="{ on: s.reminders.days.includes(d.n) }"
          :aria-pressed="s.reminders.days.includes(d.n)" :aria-label="d.long" @click="toggleDay(d.n)"
        >{{ d.short }}</button>
      </div>
      <div class="row time-row">
        <label class="grow" for="rem-time">{{ t('At') }}</label>
        <input id="rem-time" v-model="s.reminders.time" class="field time" type="time" @change="persist">
      </div>
      <p class="t-tiny t-muted rem-note">{{ reminderNote }}</p>
    </div>

    <h2 class="section-h">{{ t('Smallest weight jumps at your gym, in {unit}', { unit: p.unit }) }}</h2>
    <div class="group">
      <div v-for="row in incRows" :key="row.key" class="group-row">
        <div class="grow">
          <div>{{ row.label }}</div>
          <div class="t-tiny t-muted">{{ row.help }}</div>
        </div>
        <Stepper
          v-model="p.increments[row.key]" :step="row.step" :min="row.step" :max="row.max"
          :decimals="row.key !== 'pin'" size="md" class="mini"
          @update:model-value="persist"
        />
      </div>
      <div class="group-row">
        <div class="grow">
          <div>{{ t('Barbell weight') }}</div>
          <div class="t-tiny t-muted">{{ t('Used by the plate and warm-up tools') }}</div>
        </div>
        <Stepper v-model="p.bar" :step="5" :min="0" :max="50" size="md" class="mini" @update:model-value="persist" />
      </div>
    </div>

    <h2 class="section-h">{{ t('Rest timer') }}</h2>
    <div class="group">
      <div class="group-row">
        <span class="grow">{{ t('Vibrate when rest is over') }}</span>
        <Toggle v-model="s.restVibrate" @update:model-value="persist" />
      </div>
      <div class="group-row">
        <span class="grow">{{ t('Buzz with 10 seconds left') }}</span>
        <Toggle v-model="s.restWarn" @update:model-value="persist" />
      </div>
      <div class="group-row">
        <div class="grow">
          <div>{{ t('Play a sound') }}</div>
          <button v-if="s.restSound" class="link t-tiny" @click="previewRestSound">{{ t('Play a sample') }}</button>
          <div v-else class="t-tiny t-muted">{{ t('Beeps when rest is over, and with 10 seconds left') }}</div>
        </div>
        <Toggle v-model="s.restSound" @update:model-value="(v) => { persist(); if (v) previewRestSound() }" />
      </div>
      <div class="group-row">
        <div class="grow">
          <div>{{ t('Notify when the app is closed') }}</div>
          <div class="t-tiny t-muted">{{ t('So you hear it with the phone in your pocket') }}</div>
        </div>
        <Toggle v-model="s.restNotify" @update:model-value="persist" />
      </div>
    </div>

    <h2 id="backup" class="section-h">{{ t('Backups') }}</h2>
    <div class="card card-pad">
      <div class="row ab-head">
        <Icon name="shield" :class="autoOk ? 't-ok' : 't-muted'" />
        <div class="grow">
          <div class="t-h3">{{ t('Automatic backups') }}</div>
          <div class="t-tiny" :class="state.data.autoBackup.lastError ? 't-err' : 't-muted'">{{ autoLine }}</div>
        </div>
      </div>
      <Segmented
        v-model="s.autoBackup" class="ab-seg" :label="t('Automatic backups')"
        :options="[{ label: t('Off'), value: 'off' }, { label: t('Weekly'), value: 'weekly' }, { label: t('Every workout'), value: 'workout' }]"
        @update:model-value="persist"
      />
      <p class="t-tiny t-muted ab-note">{{ t('Saved to Documents/GymCrew on this phone (the last 6 are kept). They survive uninstalling the app, but not losing the phone, so export one off the phone now and then too.') }}</p>
      <div class="row btns">
        <button class="btn btn-soft grow" :disabled="backingUp" @click="backupNow"><Icon name="shield" />{{ t('Back up now') }}</button>
        <button class="btn btn-soft grow" @click="openRestore"><Icon name="history" />{{ t('Restore') }}</button>
      </div>
    </div>

    <div class="card card-pad mt-card">
      <div class="t-h3">{{ t('Off this phone') }}</div>
      <p class="t-small t-muted">{{ t('Send a backup to Drive, email or a chat. Use Import on a new phone.') }}</p>
      <p class="t-small t-muted last">{{ t('Last export: {when}', { when: state.data.lastBackupAt ? relativeDay(state.data.lastBackupAt) : t('never') }) }}</p>
      <div class="row btns">
        <button class="btn btn-primary grow" :disabled="exporting" @click="doExport"><Icon name="exportIcon" />{{ t('Export') }}</button>
        <button class="btn btn-soft grow" @click="fileInput.click()"><Icon name="importIcon" />{{ t('Import') }}</button>
      </div>
      <button class="btn btn-ghost btn-block csv" :disabled="!finishedSessions.length" @click="doCSV"><Icon name="csv" />{{ t('Export as a spreadsheet (CSV)') }}</button>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile">
    </div>

    <h2 id="crew" class="section-h">{{ t('Crew') }}</h2>
    <div class="group">
      <RouterLink to="/crew" class="group-row">
        <Icon name="crew" />
        <span class="grow">{{ inCrew ? t('Crew {code}', { code: state.data.crew.code }) : t('Not in a crew') }}</span>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
      <button class="group-row" @click="openCrewServer">
        <div class="grow">
          <div>{{ t('Crew server') }}</div>
          <div class="t-tiny t-muted">{{ crewServerLine }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>
    </div>

    <h2 class="section-h">{{ t('Routine') }}</h2>
    <div class="group">
      <button class="group-row" :disabled="state.routineStatus.loading" @click="checkRoutine">
        <div class="grow">
          <div>{{ routine ? tx(routine, 'title') : t('No routine loaded') }}</div>
          <div class="t-tiny" :class="state.routineStatus.error ? 't-err' : 't-muted'">
            {{ t('Updated {when}', { when: state.data.cache.fetchedAt ? relativeDay(state.data.cache.fetchedAt) : t('never') }) }}<template v-if="state.routineStatus.error">{{ ' · ' + t('last check failed: {e}', { e: state.routineStatus.error }) }}</template>
          </div>
        </div>
        <span class="t-small t-muted">{{ state.routineStatus.loading ? t('Checking') : t('Check now') }}</span>
      </button>
      <button class="group-row" @click="openSource">
        <span class="grow">{{ t('Routine source') }}</span>
        <span class="t-small t-muted">{{ state.data.settings.routinesUrl ? t('Custom') : t('Default') }}</span>
        <Icon name="chevronRight" class="chev" />
      </button>
    </div>

    <h2 class="section-h">{{ t('About') }}</h2>
    <div class="group">
      <div class="group-row">
        <span class="grow">{{ t('Version') }}</span>
        <span class="t-muted t-num">{{ APP_VERSION }}</span>
      </div>
      <button v-if="updateAvailable" class="group-row" @click="openUrl(updateAvailable.downloadUrl)">
        <Icon name="download" />
        <span class="grow">{{ t('Download version {v}', { v: updateAvailable.version }) }}</span>
        <Icon name="chevronRight" class="chev" />
      </button>
      <button class="group-row" @click="copyDebug">
        <Icon name="copy" />
        <div class="grow">
          <div>{{ t('Copy details for a bug report') }}</div>
          <div class="t-tiny t-muted">{{ t('Paste them into the group chat') }}</div>
        </div>
      </button>
    </div>

    <!-- Import confirm -->
    <Sheet v-model="importOpen" :title="t('Replace this phone\'s data?')">
      <p class="t-body">
        {{ t('Everything on this phone will be replaced with the backup ({n} workouts). Export first if you might want the current data.', { n: pendingCount }) }}
      </p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="importOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-danger btn-lg" @click="confirmImport">{{ t('Replace') }}</button>
      </template>
    </Sheet>

    <!-- Restore from an automatic backup -->
    <Sheet v-model="restoreOpen" :title="t('Automatic backups')">
      <p v-if="restoreLoading" class="t-small t-muted">{{ t('Loading…') }}</p>
      <template v-else>
        <p v-if="!autoList.length" class="t-small t-muted">{{ t('No automatic backups this app can open yet. After reinstalling, use Import and pick a file from Documents/GymCrew.') }}</p>
        <div v-else class="group">
          <div v-for="b in autoList" :key="b.path" class="group-row">
            <div class="grow">
              <div>{{ backupLabel(b) }}</div>
              <div class="t-tiny t-muted">{{ b.where === 'documents' ? 'Documents/GymCrew' : t('App storage') }}</div>
            </div>
            <button class="icon-btn" :aria-label="t('Share')" @click="shareBackupEntry(b)"><Icon name="share" :size="20" /></button>
            <button class="btn btn-sm btn-soft" @click="pickAuto(b)">{{ t('Restore') }}</button>
          </div>
        </div>
      </template>
    </Sheet>

    <!-- Routine source -->
    <Sheet v-model="sourceOpen" :title="t('Routine source')">
      <p class="t-small t-muted">{{ t('Where the app downloads the monthly routine. Leave it on the default unless someone gave you a different link.') }}</p>
      <label class="label src-label" for="src">{{ t('Link') }}</label>
      <input id="src" v-model="urlDraft" class="field" type="url" placeholder="https://raw.githubusercontent.com/…/gym-routines/main/" autocapitalize="off" autocorrect="off" spellcheck="false">
      <p class="t-tiny t-muted src-now">{{ t('Default: {url}', { url: DEFAULT_ROUTINES_URL }) }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="resetUrl">{{ t('Use default') }}</button>
        <button class="btn btn-primary btn-lg" @click="saveUrl">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <!-- Crew server -->
    <Sheet v-model="crewServerOpen" :title="t('Crew server')">
      <p class="t-small t-muted">{{ t('Normally this comes from the routines repo (latest.json), so you can leave it empty. Fill it in only to try a different Supabase project.') }}</p>
      <label class="label src-label" for="cs-url">{{ t('Project URL') }}</label>
      <input id="cs-url" v-model="crewUrl" class="field" type="url" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocorrect="off" spellcheck="false">
      <label class="label src-label" for="cs-key">{{ t('Public (anon or publishable) key') }}</label>
      <input id="cs-key" v-model="crewKey" class="field" type="text" placeholder="sb_publishable_… / eyJ…" autocapitalize="off" autocorrect="off" spellcheck="false">
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="saveCrewServer(true)">{{ t('Use default') }}</button>
        <button class="btn btn-primary btn-lg" @click="saveCrewServer(false)">{{ t('Save') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Stepper from '../ui/Stepper.vue'
import Segmented from '../ui/Segmented.vue'
import Toggle from '../ui/Toggle.vue'
import { toast } from '../ui/toast.js'
import {
  state, persist, routine, refreshRoutines, routinesUrl, updateAvailable, exportJSON, markBackedUp, importJSON,
  finishedSessions, hasBeginnerTrack, manifest
} from '../store.js'
import { APP_VERSION, DEFAULT_ROUTINES_URL } from '../config.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR, convertLoad, EQUIPMENT } from '../lib/training.js'
import { previewRestSound } from '../lib/restTimer.js'
import { isNative, shareBackupFile, openUrl, copyText } from '../lib/native.js'
import { relativeDay, fmtDate } from '../lib/format.js'
import { parseBackup } from '../lib/storage.js'
import { runAutoBackup, listAutoBackups, readBackup, shareBackupEntry, backupDate, exportCSV } from '../lib/backup.js'
import { inCrew, crewConfig } from '../lib/crew.js'
import { errorLog } from '../lib/errors.js'
import { t, tx, i18n, LANGS, locale } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const p = computed(() => state.data.profile)
const s = computed(() => state.data.settings)
const themeItems = computed(() => [{ label: t('Light'), value: 'light' }, { label: t('Dark'), value: 'dark' }, { label: t('Auto'), value: 'system' }])

function back () {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}
onMounted(async () => {
  if (!route.hash) return
  await nextTick()
  setTimeout(() => document.querySelector(route.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350)
})

function setLanguage (l) {
  state.data.settings.lang = l
  persist()
}

const levelHelp = computed(() => {
  if (!hasBeginnerTrack.value) return t("This month's routine has no beginner version, so both tracks get the same plan.")
  return p.value.level === 'beginner'
    ? t('You get the beginner version where the routine has one: simpler exercises and fewer sets.')
    : t('The full routine. Switch to Beginner for simpler exercises and fewer sets.')
})

const incRows = computed(() => {
  const u = p.value.unit
  return [
    { key: 'upper', label: t('Upper-body barbell'), help: t('Bench, overhead press, curls'), step: u === 'kg' ? 0.5 : 1, max: 20 },
    { key: 'lower', label: t('Lower-body barbell'), help: t('Squat, deadlift, hip thrust'), step: u === 'kg' ? 0.5 : 1, max: 40 },
    { key: 'dumbbell', label: t('Dumbbells'), help: t('Gap between dumbbell sizes'), step: u === 'kg' ? 0.5 : 1, max: 20 },
    { key: 'pin', label: t('Machine pins'), help: t('Positions per jump on a stack'), step: 1, max: 5 }
  ]
})

function setEquip (tag, on) {
  if (on) delete state.data.settings.equipment[tag]
  else state.data.settings.equipment[tag] = false
  persist()
}

const weekDays = computed(() => [1, 2, 3, 4, 5, 6, 7].map(n => {
  const d = new Date(2024, 0, n) // 1 Jan 2024 was a Monday
  return { n, short: d.toLocaleDateString(locale(), { weekday: 'narrow' }).toUpperCase(), long: d.toLocaleDateString(locale(), { weekday: 'long' }) }
}))
function toggleDay (n) {
  const r = state.data.settings.reminders
  r.days = r.days.includes(n) ? r.days.filter(x => x !== n) : [...r.days, n].sort()
  persist()
}
const reminderNote = computed(() => {
  const r = state.data.settings.reminders
  if (!r.days.length) return t("Pick the days you train and we'll remind you which day is next.")
  if (!isNative) return t('Reminders only work in the installed app.')
  return t("You'll get a reminder at {time} with your next day.", { time: r.time })
})

function onUnit (u) {
  const prof = state.data.profile
  prof.increments = { ...DEFAULT_INCREMENTS[u] }
  prof.bar = DEFAULT_BAR[u]
  if (prof.bodyweight) prof.bodyweight = Math.round(convertLoad(prof.bodyweight, u === 'kg' ? 'lb' : 'kg', u))
  persist()
}

// ── Automatic backups ──
const autoOk = computed(() => s.value.autoBackup !== 'off' && !!state.data.autoBackup.lastAt && !state.data.autoBackup.lastError)
const autoLine = computed(() => {
  const a = state.data.autoBackup
  if (a.lastError) return t('Last automatic backup failed: {e}', { e: a.lastError })
  if (s.value.autoBackup === 'off') return t('Off')
  if (!a.lastAt) return finishedSessions.value.length ? t('None yet. Tap Back up now, or it runs by itself next time you open the app.') : t('Starts after your first workout.')
  const where = a.where === 'documents' ? 'Documents/GymCrew' : t('app storage only')
  return t('Last one {when}, in {where}', { when: relativeDay(a.lastAt), where })
})
const backingUp = ref(false)
async function backupNow () {
  backingUp.value = true
  try {
    const r = await runAutoBackup()
    toast(r.where === 'documents' ? t('Backup saved to Documents/GymCrew') : t('Backup saved in app storage'))
  } catch (e) {
    toast(t('Backup failed: {e}', { e: e.message || e }))
  } finally { backingUp.value = false }
}
const restoreOpen = ref(false)
const restoreLoading = ref(false)
const autoList = ref([])
async function openRestore () {
  restoreOpen.value = true
  restoreLoading.value = true
  autoList.value = await listAutoBackups()
  restoreLoading.value = false
}
function backupLabel (b) {
  const d = backupDate(b.name)
  return d ? `${fmtDate(d.toISOString())}, ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}` : b.name
}
async function pickAuto (b) {
  try {
    pendingText.value = await readBackup(b)
    pending.value = parseBackup(pendingText.value)
    restoreOpen.value = false
    importOpen.value = true
  } catch (e) { toast(e.message || String(e)) }
}

// ── Export / import ──
const exporting = ref(false)
async function doExport () {
  exporting.value = true
  try {
    const name = `gym-crew-backup-${new Date().toISOString().slice(0, 10)}.json`
    const r = await shareBackupFile(name, exportJSON())
    if (r !== 'cancelled') { markBackedUp(); toast(t('Backup exported')) }
  } catch (e) {
    toast(t('Export failed: {e}', { e: e.message || e }))
  } finally { exporting.value = false }
}
async function doCSV () {
  try {
    const r = await exportCSV()
    if (r === 'downloaded') toast(t('CSV downloaded'))
  } catch (e) { toast(t('Export failed: {e}', { e: e.message || e })) }
}

const fileInput = ref(null)
const importOpen = ref(false)
const pendingText = ref('')
const pending = ref(null)
const pendingCount = computed(() => (pending.value?.sessions || []).filter(x => x.finishedAt).length)
async function onFile (ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  try {
    pendingText.value = await file.text()
    pending.value = parseBackup(pendingText.value)
    importOpen.value = true
  } catch (e) {
    toast(e.message)
  }
}
async function confirmImport () {
  importOpen.value = false
  try {
    await importJSON(pendingText.value)
    toast(t('Imported {n} workouts', { n: finishedSessions.value.length }))
    refreshRoutines()
  } catch (e) { toast(e.message) }
}

// ── Crew server ──
const crewServerOpen = ref(false)
const crewUrl = ref('')
const crewKey = ref('')
const crewServerLine = computed(() => {
  if (state.data.crew.url) return t('Custom: {url}', { url: state.data.crew.url.replace(/^https?:\/\//, '') })
  if (manifest.value?.crew?.url) return t('From the routines repo')
  return t('Not set up yet')
})
function openCrewServer () {
  crewUrl.value = state.data.crew.url || ''
  crewKey.value = state.data.crew.anonKey || ''
  crewServerOpen.value = true
}
function saveCrewServer (reset) {
  state.data.crew.url = reset ? null : (crewUrl.value.trim() || null)
  state.data.crew.anonKey = reset ? null : (crewKey.value.trim() || null)
  persist()
  crewServerOpen.value = false
  toast(crewConfig.value ? t('Crew server saved') : t('Crew server cleared'))
}

// ── Routine ──
async function checkRoutine () {
  await refreshRoutines()
  toast(state.routineStatus.error ? t("Couldn't check: {e}", { e: state.routineStatus.error }) : t('Routine is up to date'))
}
const sourceOpen = ref(false)
const urlDraft = ref('')
function openSource () { urlDraft.value = state.data.settings.routinesUrl || ''; sourceOpen.value = true }
function saveUrl () {
  state.data.settings.routinesUrl = urlDraft.value.trim() || null
  persist(); sourceOpen.value = false; checkRoutine()
}
function resetUrl () {
  state.data.settings.routinesUrl = null
  persist(); sourceOpen.value = false; checkRoutine()
}

// ── Debug ──
async function copyDebug () {
  const info = {
    app: APP_VERSION,
    platform: Capacitor.getPlatform(),
    userAgent: navigator.userAgent,
    lang: i18n.lang,
    routine: routine.value?.month || null,
    routinesUrl: routinesUrl.value,
    lastFetch: state.data.cache.fetchedAt,
    lastError: state.routineStatus.error,
    sessions: state.data.sessions.length,
    dataSchema: state.data.schemaVersion,
    autoBackup: state.data.autoBackup,
    crew: { joined: inCrew.value, configured: !!crewConfig.value, queued: state.data.crew.queue.length },
    saveError: state.saveError,
    errors: errorLog().slice(0, 10)
  }
  const ok = await copyText(JSON.stringify(info, null, 2))
  toast(ok ? t('Copied. Paste it into the group chat.') : t("Couldn't copy on this device"))
}
</script>

<style scoped>
.group-row.col { flex-direction: column; align-items: stretch; gap: 10px; }
.inline-input {
  width: 55%; text-align: right; background: transparent; border: 0; outline: none;
  font-size: 17px; color: var(--ink-2); padding: 8px 0;
}
.inline-input:focus { color: var(--ink); }
.mini { width: 168px; flex: 0 0 auto; }
.mini :deep(.st-btn) { width: 40px; height: 40px; border-radius: 10px; }
.mini :deep(.st-display), .mini :deep(.st-input) { font-size: 24px; height: 36px; line-height: 36px; }
.last { margin-top: 6px; }
.foot { margin: 8px 4px 0; }
.days { display: flex; justify-content: space-between; gap: 6px; }
.day { width: 42px; height: 42px; border-radius: 50%; background: var(--paper); color: var(--ink-2); font-weight: 700; }
.day.on { background: var(--ink); color: var(--paper); }
.time-row { margin-top: 14px; }
.time { width: 160px; text-align: center; }
.rem-note { margin-top: 10px; }
.link { color: var(--ink-2); text-decoration: underline; text-underline-offset: 3px; padding: 2px 0; }
.btns { margin-top: 14px; gap: 10px; }
.src-label { margin-top: 16px; }
.src-now { margin-top: 8px; word-break: break-all; }
.lang-h { gap: 8px; }
.range { gap: 10px; justify-content: space-between; }
.mini.xs { width: 140px; }
.mini.xs :deep(.st-btn) { width: 34px; height: 36px; }
.ab-head { gap: 12px; align-items: flex-start; }
.ab-seg { margin-top: 14px; }
.ab-note { margin-top: 10px; }
.mt-card { margin-top: 10px; }
.mt-card p { margin-top: 4px; }
.csv { margin-top: 8px; }
</style>
