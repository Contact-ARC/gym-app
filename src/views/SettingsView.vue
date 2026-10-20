<template>
  <div class="page">
    <h1 class="t-title head">Settings</h1>

    <h2 class="section-h">You</h2>
    <div class="group">
      <div class="group-row">
        <label class="grow" for="s-name">Name</label>
        <input id="s-name" v-model="p.name" class="inline-input" type="text" placeholder="Add your name" autocomplete="given-name" @blur="persist">
      </div>
      <div class="group-row col">
        <span>Units</span>
        <Segmented v-model="p.unit" :options="[{ label: 'Kilograms', value: 'kg' }, { label: 'Pounds', value: 'lb' }]" label="Units" @update:model-value="onUnit" />
      </div>
      <div class="group-row col">
        <span>Theme</span>
        <Segmented v-model="p.theme" :options="themeItems" label="Theme" @update:model-value="persist" />
      </div>
      <div class="group-row col">
        <span>Text size</span>
        <Segmented v-model="s.textSize" :options="[{ label: 'Normal', value: 'normal' }, { label: 'Larger', value: 'large' }]" label="Text size" @update:model-value="persist" />
      </div>
    </div>

    <h2 class="section-h">Your gym</h2>
    <div class="group">
      <div v-for="(label, tag) in EQUIPMENT" :key="tag" class="group-row">
        <span class="grow">{{ label }}</span>
        <Toggle :model-value="s.equipment[tag] !== false" @update:model-value="(v) => setEquip(tag, v)" />
      </div>
    </div>
    <p class="t-tiny t-muted foot">Exercise lists and swaps only show what your gym has. Routines still show everything.</p>

    <h2 class="section-h">Reminders</h2>
    <div class="card card-pad">
      <div class="label">Remind me on</div>
      <div class="days" role="group" aria-label="Reminder days">
        <button
          v-for="d in weekDays" :key="d.n" class="day" :class="{ on: s.reminders.days.includes(d.n) }"
          :aria-pressed="s.reminders.days.includes(d.n)" :aria-label="d.long" @click="toggleDay(d.n)"
        >{{ d.short }}</button>
      </div>
      <div class="row time-row">
        <label class="grow" for="rem-time">At</label>
        <input id="rem-time" v-model="s.reminders.time" class="field time" type="time" @change="persist">
      </div>
      <p class="t-tiny t-muted rem-note">{{ reminderNote }}</p>
    </div>

    <h2 class="section-h">Smallest weight jumps at your gym, in {{ p.unit }}</h2>
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
          <div>Barbell weight</div>
          <div class="t-tiny t-muted">Used by the plate and warm-up tools</div>
        </div>
        <Stepper v-model="p.bar" :step="p.unit === 'kg' ? 5 : 5" :min="0" :max="50" size="md" class="mini" @update:model-value="persist" />
      </div>
    </div>

    <h2 class="section-h">Rest timer</h2>
    <div class="group">
      <div class="group-row">
        <span class="grow">Vibrate when rest is over</span>
        <Toggle v-model="s.restVibrate" @update:model-value="persist" />
      </div>
      <div class="group-row">
        <span class="grow">Buzz with 10 seconds left</span>
        <Toggle v-model="s.restWarn" @update:model-value="persist" />
      </div>
      <div class="group-row">
        <div class="grow">
          <div>Play a sound</div>
          <button v-if="s.restSound" class="link t-tiny" @click="previewRestSound">Play a sample</button>
          <div v-else class="t-tiny t-muted">Beeps when rest is over, and with 10 seconds left</div>
        </div>
        <Toggle v-model="s.restSound" @update:model-value="(v) => { persist(); if (v) previewRestSound() }" />
      </div>
      <div class="group-row">
        <div class="grow">
          <div>Notify when the app is closed</div>
          <div class="t-tiny t-muted">So you hear it with the phone in your pocket</div>
        </div>
        <Toggle v-model="s.restNotify" @update:model-value="persist" />
      </div>
    </div>

    <h2 class="section-h">Backup</h2>
    <div class="card card-pad">
      <p class="t-small">
        Your workouts are saved only on this phone. Export a backup now and then, to Drive or to yourself.
      </p>
      <p class="t-small t-muted last">Last backup: {{ state.data.lastBackupAt ? relativeDay(state.data.lastBackupAt) : 'never' }}</p>
      <div class="row btns">
        <button class="btn btn-primary grow" :disabled="exporting" @click="doExport"><Icon name="exportIcon" />Export</button>
        <button class="btn btn-soft grow" @click="fileInput.click()"><Icon name="importIcon" />Import</button>
      </div>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile">
    </div>

    <h2 class="section-h">Routine</h2>
    <div class="group">
      <button class="group-row" :disabled="state.routineStatus.loading" @click="checkRoutine">
        <div class="grow">
          <div>{{ routine ? routine.title : 'No routine loaded' }}</div>
          <div class="t-tiny" :class="state.routineStatus.error ? 't-err' : 't-muted'">
            {{ state.routineStatus.error || `Updated ${state.data.cache.fetchedAt ? relativeDay(state.data.cache.fetchedAt) : 'never'}` }}
          </div>
        </div>
        <span class="t-small t-muted">{{ state.routineStatus.loading ? 'Checking' : 'Check now' }}</span>
      </button>
      <button class="group-row" @click="openSource">
        <span class="grow">Routine source</span>
        <span class="t-small t-muted">{{ state.data.settings.routinesUrl ? 'Custom' : 'Default' }}</span>
        <Icon name="chevronRight" class="chev" />
      </button>
    </div>

    <h2 class="section-h">About</h2>
    <div class="group">
      <div class="group-row">
        <span class="grow">Version</span>
        <span class="t-muted t-num">{{ APP_VERSION }}</span>
      </div>
      <button v-if="updateAvailable" class="group-row" @click="openUrl(updateAvailable.downloadUrl)">
        <Icon name="download" />
        <span class="grow">Download version {{ updateAvailable.version }}</span>
        <Icon name="chevronRight" class="chev" />
      </button>
      <button class="group-row" @click="copyDebug">
        <Icon name="copy" />
        <div class="grow">
          <div>Copy details for a bug report</div>
          <div class="t-tiny t-muted">Paste them into the group chat</div>
        </div>
      </button>
    </div>

    <!-- Import confirm -->
    <Sheet v-model="importOpen" title="Replace this phone's data?">
      <p class="t-body">
        Everything on this phone will be replaced with the backup ({{ pending?.sessions?.length || 0 }} workouts).
        Export first if you might want the current data.
      </p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="importOpen = false">Cancel</button>
        <button class="btn btn-danger btn-lg" @click="confirmImport">Replace</button>
      </template>
    </Sheet>

    <!-- Routine source -->
    <Sheet v-model="sourceOpen" title="Routine source">
      <p class="t-small t-muted">Where the app downloads the monthly routine. Leave it on the default unless someone gave you a different link.</p>
      <label class="label src-label" for="src">Link</label>
      <input id="src" v-model="urlDraft" class="field" type="url" placeholder="https://raw.githubusercontent.com/…/gym-routines/main/" autocapitalize="off" autocorrect="off" spellcheck="false">
      <p class="t-tiny t-muted src-now">Default: {{ DEFAULT_ROUTINES_URL }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="resetUrl">Use default</button>
        <button class="btn btn-primary btn-lg" @click="saveUrl">Save</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Stepper from '../ui/Stepper.vue'
import Segmented from '../ui/Segmented.vue'
import Toggle from '../ui/Toggle.vue'
import { toast } from '../ui/toast.js'
import {
  state, persist, routine, refreshRoutines, routinesUrl, updateAvailable, exportJSON, markBackedUp, importJSON, finishedSessions
} from '../store.js'
import { APP_VERSION, DEFAULT_ROUTINES_URL } from '../config.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR, convertLoad, EQUIPMENT } from '../lib/training.js'
import { previewRestSound } from '../lib/restTimer.js'
import { isNative } from '../lib/native.js'
import { relativeDay } from '../lib/format.js'
import { shareBackupFile, openUrl, copyText } from '../lib/native.js'
import { parseBackup } from '../lib/storage.js'

const p = computed(() => state.data.profile)
const s = computed(() => state.data.settings)
const themeItems = [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }, { label: 'Auto', value: 'system' }]

const incRows = computed(() => {
  const u = p.value.unit
  return [
    { key: 'upper', label: 'Upper-body barbell', help: 'Bench, overhead press, curls', step: u === 'kg' ? 0.5 : 1, max: 20 },
    { key: 'lower', label: 'Lower-body barbell', help: 'Squat, deadlift, hip thrust', step: u === 'kg' ? 0.5 : 1, max: 40 },
    { key: 'dumbbell', label: 'Dumbbells', help: 'Gap between dumbbell sizes', step: u === 'kg' ? 0.5 : 1, max: 20 },
    { key: 'pin', label: 'Machine pins', help: 'Positions per jump on a stack', step: 1, max: 5 }
  ]
})

function setEquip (tag, on) {
  if (on) delete state.data.settings.equipment[tag]
  else state.data.settings.equipment[tag] = false
  persist()
}

const weekDays = [1, 2, 3, 4, 5, 6, 7].map(n => {
  const d = new Date(2024, 0, n) // 1 Jan 2024 was a Monday
  return { n, short: d.toLocaleDateString(undefined, { weekday: 'narrow' }), long: d.toLocaleDateString(undefined, { weekday: 'long' }) }
})
function toggleDay (n) {
  const r = state.data.settings.reminders
  r.days = r.days.includes(n) ? r.days.filter(x => x !== n) : [...r.days, n].sort()
  persist()
}
const reminderNote = computed(() => {
  const r = state.data.settings.reminders
  if (!r.days.length) return 'Pick the days you train and we\'ll remind you which day is next.'
  if (!isNative) return 'Reminders only work in the installed app.'
  return `You'll get a reminder at ${r.time} with your next day.`
})

function onUnit (u) {
  const prof = state.data.profile
  prof.increments = { ...DEFAULT_INCREMENTS[u] }
  prof.bar = DEFAULT_BAR[u]
  if (prof.bodyweight) prof.bodyweight = Math.round(convertLoad(prof.bodyweight, u === 'kg' ? 'lb' : 'kg', u))
  persist()
}

// Backup
const exporting = ref(false)
async function doExport () {
  exporting.value = true
  try {
    const name = `gym-crew-backup-${new Date().toISOString().slice(0, 10)}.json`
    const r = await shareBackupFile(name, exportJSON())
    if (r !== 'cancelled') { markBackedUp(); toast('Backup exported') }
  } catch (e) {
    toast(`Export failed: ${e.message || e}`)
  } finally { exporting.value = false }
}

const fileInput = ref(null)
const importOpen = ref(false)
const pendingText = ref('')
const pending = ref(null)
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
    toast(`Imported ${finishedSessions.value.length} workouts`)
    refreshRoutines()
  } catch (e) { toast(e.message) }
}

// Routine
async function checkRoutine () {
  await refreshRoutines()
  toast(state.routineStatus.error ? "Couldn't reach the routine" : 'Routine is up to date')
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

// Debug
async function copyDebug () {
  const info = {
    app: APP_VERSION,
    platform: Capacitor.getPlatform(),
    userAgent: navigator.userAgent,
    routine: routine.value?.month || null,
    routinesUrl: routinesUrl.value,
    lastFetch: state.data.cache.fetchedAt,
    lastError: state.routineStatus.error,
    sessions: state.data.sessions.length,
    dataSchema: state.data.schemaVersion
  }
  const ok = await copyText(JSON.stringify(info, null, 2))
  toast(ok ? 'Copied. Paste it into the group chat.' : "Couldn't copy on this device")
}
</script>

<style scoped>
.head { margin-top: 8px; }
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
</style>
