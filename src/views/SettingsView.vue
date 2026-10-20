<template>
  <div class="page">
    <div class="page-title mb-2">Settings</div>

    <div class="section-label">You</div>
    <v-text-field v-model="p.name" label="Name" class="mb-3" @blur="persist" />
    <div class="d-flex ga-2 mb-3">
      <v-select v-model="p.unit" :items="['kg', 'lb']" label="Units" @update:model-value="onUnit" />
      <v-select v-model="p.theme" :items="themeItems" label="Theme" @update:model-value="persist" />
    </div>

    <div class="section-label">Smallest weight jumps</div>
    <p class="text-caption muted mb-2">Used to round suggestions to weights you can actually load at your gym.</p>
    <div class="d-flex ga-2 mb-2">
      <v-text-field v-model.number="p.increments.upper" type="number" inputmode="decimal" :label="`Upper barbell (${p.unit})`" @blur="persist" />
      <v-text-field v-model.number="p.increments.lower" type="number" inputmode="decimal" :label="`Lower barbell (${p.unit})`" @blur="persist" />
    </div>
    <div class="d-flex ga-2 mb-2">
      <v-text-field v-model.number="p.increments.dumbbell" type="number" inputmode="decimal" :label="`Dumbbell (${p.unit})`" @blur="persist" />
      <v-text-field v-model.number="p.increments.pin" type="number" inputmode="decimal" label="Machine pins" @blur="persist" />
    </div>
    <v-text-field v-model.number="p.bar" type="number" inputmode="decimal" :label="`Barbell weight (${p.unit})`" @blur="persist" />

    <div class="section-label">Rest timer</div>
    <v-switch v-model="s.restVibrate" label="Vibrate when rest is over" color="primary" hide-details density="compact" @update:model-value="persist" />
    <v-switch v-model="s.restNotify" label="Notify when the app is in the background" color="primary" hide-details density="compact" @update:model-value="persist" />

    <div class="section-label">Backup</div>
    <p class="text-body-2 mb-2">
      Your history lives only on this phone. Export a backup now and then — save it to Drive or send it to yourself.
      <span class="muted d-block mt-1">Last backup: {{ state.data.lastBackupAt ? relativeDay(state.data.lastBackupAt) : 'never' }}</span>
    </p>
    <div class="d-flex ga-2">
      <v-btn color="primary" variant="flat" class="flex-1" prepend-icon="mdi-export" :loading="exporting" @click="doExport">Export</v-btn>
      <v-btn variant="tonal" class="flex-1" prepend-icon="mdi-import" @click="fileInput.click()">Import</v-btn>
    </div>
    <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile" />
    <div v-if="backupMsg" class="text-caption mt-2" :class="backupError ? 'text-error' : 'text-success'">{{ backupMsg }}</div>

    <div class="section-label">Routine</div>
    <div class="text-body-2">
      <div>{{ routine ? `${routine.title || routine.month}` : 'No routine loaded' }}</div>
      <div class="muted text-caption">
        Updated {{ state.data.cache.fetchedAt ? relativeDay(state.data.cache.fetchedAt) : 'never' }}
        <span v-if="state.routineStatus.error" class="text-error"> · {{ state.routineStatus.error }}</span>
      </div>
    </div>
    <v-btn variant="tonal" class="mt-2" prepend-icon="mdi-refresh" :loading="state.routineStatus.loading" @click="refreshRoutines">Check for new routine</v-btn>

    <v-expansion-panels class="mt-3" variant="accordion">
      <v-expansion-panel title="Advanced: routine source">
        <v-expansion-panel-text>
          <v-text-field v-model="urlDraft" label="Routines URL" placeholder="https://raw.githubusercontent.com/…/gym-routines/main/" />
          <div class="d-flex ga-2 mt-2">
            <v-btn variant="flat" color="primary" size="small" @click="saveUrl">Save & reload</v-btn>
            <v-btn variant="text" size="small" @click="resetUrl">Use default</v-btn>
          </div>
          <div class="text-caption muted mt-2">Current: {{ routinesUrl }}</div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div class="section-label">About</div>
    <div class="text-body-2">Gym Crew {{ APP_VERSION }}</div>
    <div v-if="updateAvailable" class="mt-2">
      <v-btn color="info" variant="tonal" size="small" @click="openUrl(updateAvailable.downloadUrl)">Download {{ updateAvailable.version }}</v-btn>
    </div>
    <v-btn variant="text" size="small" class="px-0 mt-2" prepend-icon="mdi-content-copy" @click="copyDebug">Copy debug info</v-btn>
    <div v-if="debugMsg" class="text-caption muted">{{ debugMsg }}</div>

    <!-- Import confirm -->
    <v-dialog v-model="importDialog" max-width="420">
      <v-card title="Replace data from backup?">
        <v-card-text>
          This replaces everything on this phone with the backup ({{ pending?.sessions?.length || 0 }} workouts).
          Export a backup first if you might want the current data.
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="importDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="confirmImport">Replace</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import {
  state, persist, routine, refreshRoutines, routinesUrl, updateAvailable, exportJSON, markBackedUp, importJSON, finishedSessions
} from '../store.js'
import { APP_VERSION, DEFAULT_ROUTINES_URL } from '../config.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR, convertLoad } from '../lib/training.js'
import { relativeDay } from '../lib/format.js'
import { shareBackupFile, openUrl, copyText } from '../lib/native.js'
import { parseBackup } from '../lib/storage.js'

const p = computed(() => state.data.profile)
const s = computed(() => state.data.settings)
const themeItems = [{ title: 'Dark', value: 'dark' }, { title: 'Light', value: 'light' }, { title: 'Follow phone', value: 'system' }]

function onUnit (u) {
  const prof = state.data.profile
  prof.increments = { ...DEFAULT_INCREMENTS[u] }
  prof.bar = DEFAULT_BAR[u]
  if (prof.bodyweight) prof.bodyweight = Math.round(convertLoad(prof.bodyweight, u === 'kg' ? 'lb' : 'kg', u))
  persist()
}

// Backup
const exporting = ref(false)
const backupMsg = ref('')
const backupError = ref(false)
async function doExport () {
  exporting.value = true; backupMsg.value = ''; backupError.value = false
  try {
    const name = `gym-crew-backup-${new Date().toISOString().slice(0, 10)}.json`
    const r = await shareBackupFile(name, exportJSON())
    if (r !== 'cancelled') { markBackedUp(); backupMsg.value = 'Backup exported.' }
  } catch (e) {
    backupError.value = true; backupMsg.value = 'Export failed: ' + (e.message || e)
  } finally { exporting.value = false }
}

const fileInput = ref(null)
const importDialog = ref(false)
const pendingText = ref('')
const pending = ref(null)
async function onFile (ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  backupMsg.value = ''; backupError.value = false
  try {
    pendingText.value = await file.text()
    pending.value = parseBackup(pendingText.value)
    importDialog.value = true
  } catch (e) {
    backupError.value = true; backupMsg.value = e.message
  }
}
async function confirmImport () {
  importDialog.value = false
  try {
    await importJSON(pendingText.value)
    backupMsg.value = `Imported ${finishedSessions.value.length} workouts.`
    refreshRoutines()
  } catch (e) { backupError.value = true; backupMsg.value = e.message }
}

// Routine URL
const urlDraft = ref(state.data.settings.routinesUrl || '')
function saveUrl () {
  state.data.settings.routinesUrl = urlDraft.value.trim() || null
  persist(); refreshRoutines()
}
function resetUrl () {
  urlDraft.value = ''
  state.data.settings.routinesUrl = null
  persist(); refreshRoutines()
}

// Debug
const debugMsg = ref('')
async function copyDebug () {
  const info = {
    app: APP_VERSION,
    platform: Capacitor.getPlatform(),
    userAgent: navigator.userAgent,
    routine: routine.value?.month || null,
    routinesUrl: routinesUrl.value,
    defaultUrl: DEFAULT_ROUTINES_URL,
    lastFetch: state.data.cache.fetchedAt,
    lastError: state.routineStatus.error,
    sessions: state.data.sessions.length,
    dataSchema: state.data.schemaVersion
  }
  const ok = await copyText(JSON.stringify(info, null, 2))
  debugMsg.value = ok ? 'Copied — paste it into the group chat when reporting a bug.' : JSON.stringify(info)
}
</script>

<style scoped>
.flex-1 { flex: 1 1 0; }
</style>
