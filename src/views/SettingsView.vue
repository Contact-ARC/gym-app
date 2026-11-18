<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="back"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ t('Settings') }}</h1>

    <h2 id="account" class="section-h">{{ t('Account') }}</h2>
    <AccountCard />

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
      <button class="group-row" @click="remindersOpen = true">
        <Icon name="bell" />
        <div class="grow">
          <div>{{ t('Reminders') }}</div>
          <div class="t-tiny t-muted">{{ remindersLine }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>
      <button class="group-row" @click="restOpen = true">
        <Icon name="timer" />
        <div class="grow">
          <div>{{ t('Rest timer alerts') }}</div>
          <div class="t-tiny t-muted">{{ restLine }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>
    </div>

    <h2 id="gyms" class="section-h">{{ t('Gyms') }}</h2>
    <div class="group">
      <div v-for="g in gymList" :key="g.id" class="group-row gym-row">
        <button class="grow gym-main" @click="openGym(g.id)">
          <Icon name="place" class="t-muted" />
          <span class="grow">
            <span class="t-h3 truncate gym-n">{{ gymName(g) }}</span>
            <span v-if="usesColours(g)" class="dots">
              <span v-for="c in gymColours(g)" :key="c" class="dot" :style="{ background: swatch(c) || 'var(--card-2)' }" :title="c" />
            </span>
          </span>
        </button>
        <span v-if="g.id === hereId" class="pill pill-ok here">{{ t('Here now') }}</span>
        <button v-else class="btn btn-soft btn-sm" @click="goTo(g)">{{ t('Switch') }}</button>
      </div>
      <button class="group-row gym-row add" @click="openGym(null)"><Icon name="plus" />{{ t('Add a gym') }}</button>
    </div>
    <div class="group mt-card">
      <button class="group-row" @click="equipOpen = true">
        <Icon name="dumbbell" />
        <div class="grow">
          <div>{{ gymList.length > 1 ? t('Equipment at {gym}', { gym: hereName }) : t('Equipment') }}</div>
          <div class="t-tiny t-muted">{{ equipLine }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>
      <button class="group-row" @click="weightsOpen = true">
        <Icon name="plate" />
        <div class="grow">
          <div>{{ t('Bar and weight jumps') }}</div>
          <div class="t-tiny t-muted">{{ weightsLine }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>
    </div>
    <p class="t-tiny t-muted foot">{{ gymList.length > 1 ? t('Equipment, bar, plates and machine settings are for the gym you\'re at. Machines keep their own history at each gym, since they differ; free weights count everywhere.') : t('Train somewhere else too? Add it, and each gym keeps its own equipment, plates and machine settings.') }}</p>
    <GymSheet v-model="gymOpen" :gym-id="gymEditId" />

    <h2 id="connections" class="section-h">{{ t('Connections') }}</h2>
    <HealthCard v-if="healthSupported" />
    <div class="group" :class="{ 'mt-card': healthSupported }">
      <RouterLink to="/crew" class="group-row">
        <Icon name="crew" />
        <span class="grow">{{ inCrew ? t('Crew {code}', { code: state.data.crew.code }) : t('Not in a crew') }}</span>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
    </div>

    <h2 id="backup" class="section-h">{{ t('Your data') }}</h2>
    <p v-if="signedIn" class="note note-ok t-small row data-note"><Icon name="cloudCheck" :size="20" /><span>{{ t('Signed in: everything is also saved to your account. Backups are an extra copy you control.') }}</span></p>
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
      <button class="group-row" :disabled="state.routineStatus.loading" @click="checkRoutine">
        <Icon name="month" />
        <div class="grow">
          <div>{{ t('Routine updates') }}</div>
          <div class="t-tiny" :class="state.routineStatus.error ? 't-err' : 't-muted'">
            {{ routine ? tx(routine, 'title') : t('No routine loaded') }} · {{ t('Updated {when}', { when: state.data.cache.fetchedAt ? relativeDay(state.data.cache.fetchedAt) : t('never') }) }}<template v-if="state.routineStatus.error">{{ ' · ' + t('last check failed: {e}', { e: state.routineStatus.error }) }}</template>
          </div>
        </div>
        <span class="t-small t-muted">{{ state.routineStatus.loading ? t('Checking') : t('Check now') }}</span>
      </button>
      <button class="group-row" @click="openSource">
        <span class="grow">{{ t('Routine source') }}</span>
        <span class="t-small t-muted">{{ state.data.settings.routinesUrl ? t('Custom') : t('Default') }}</span>
        <Icon name="chevronRight" class="chev" />
      </button>
      <button class="group-row" @click="openCrewServer">
        <div class="grow">
          <div>{{ t('Crew server') }}</div>
          <div class="t-tiny t-muted">{{ crewServerLine }}</div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </button>
    </div>

    <!-- Sheets for the longer settings -->
    <Sheet v-model="remindersOpen" :title="t('Reminders')">
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
      <template #actions>
        <button class="btn btn-primary btn-lg" @click="remindersOpen = false">{{ t('Done') }}</button>
      </template>
    </Sheet>

    <Sheet v-model="restOpen" :title="t('Rest timer alerts')">
      <div class="group sheet-group">
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
      <div v-if="s.restSound" class="group-row col">
        <span>{{ t('Sound') }}</span>
        <Segmented v-model="s.restSoundLevel" :options="[{ label: t('sound|Soft'), value: 'soft' }, { label: t('sound|Loud'), value: 'loud' }]" :label="t('Sound')" @update:model-value="() => { persist(); previewRestSound() }" />
        <span class="t-tiny t-muted">{{ t("It follows your media volume. During a call, Android mutes it, so leave vibration on.") }}</span>
      </div>
      <div class="group-row">
        <div class="grow">
          <div>{{ t('Countdown and "get ready" notifications') }}</div>
          <div class="t-tiny t-muted">{{ t('Only when you leave the app mid-rest: the time left pops up and stays until the rest is over, then an alert tells you which set is next') }}</div>
        </div>
        <Toggle v-model="s.restNotify" @update:model-value="onRestNotify" />
      </div>
      <div v-if="s.restNotify && notif" class="group-row notif-row">
        <Icon :name="notif.ok ? 'doneCircle' : 'alert'" :class="notif.ok ? 't-ok' : 't-warn'" />
        <div class="grow t-small">
          <template v-if="notif.ok">{{ notif.exact === false ? t('Notifications are on, but Android may deliver the alert a little late (exact alarms are off).') : t('Notifications are on.') }}</template>
          <template v-else>{{ notifyText(notif) }}</template>
        </div>
        <button v-if="!notif.ok" class="btn btn-sm btn-primary" @click="openNotificationSettings()">{{ t('Turn on') }}</button>
        <button v-else class="btn btn-sm btn-soft" @click="testNotify">{{ t('Test') }}</button>
      </div>
      <!-- Android 16: the countdown can show as a Live Update (status-bar chip; Live Alerts on OnePlus) -->
      <div v-if="s.restNotify && notif && notif.ok && notif.liveUpdates !== null" class="group-row notif-row">
        <Icon :name="notif.liveUpdates ? 'doneCircle' : 'info'" :class="notif.liveUpdates ? 't-ok' : 't-muted'" />
        <div class="grow t-small">
          {{ notif.liveUpdates ? t('Live Updates are on: the countdown can show in the status bar.') : t('Live Updates are off for Gym Crew. Turn them on to see the countdown in the status bar.') }}
          <div class="t-tiny t-muted">{{ t('On OnePlus, also turn on "Show Live Updates on Live Alerts" in Gym Crew\'s notification settings.') }}</div>
        </div>
        <button class="btn btn-sm" :class="notif.liveUpdates ? 'btn-soft' : 'btn-primary'" @click="openNotificationSettings(notif.liveUpdates ? '' : 'liveUpdates')">{{ notif.liveUpdates ? t('Settings') : t('Turn on') }}</button>
      </div>
      </div>
      <template #actions>
        <button class="btn btn-primary btn-lg" @click="restOpen = false">{{ t('Done') }}</button>
      </template>
    </Sheet>

    <Sheet v-model="equipOpen" :title="gymList.length > 1 ? t('Equipment at {gym}', { gym: hereName }) : t('Equipment')">
      <p class="t-small t-muted">{{ t('Exercise lists and swaps only show what your gym has. Routines still show everything.') }}</p>
      <div class="row eq-all">
        <button class="btn btn-sm btn-soft" @click="setAllEquip(true)">{{ t('All on') }}</button>
        <button class="btn btn-sm btn-soft" @click="setAllEquip(false)">{{ t('All off') }}</button>
      </div>
      <div class="group sheet-group">
      <div v-for="(label, tag) in EQUIPMENT" :key="tag" class="group-row">
        <span class="grow">{{ t(label) }}</span>
        <Toggle :model-value="s.equipment[tag] !== false" @update:model-value="(v) => setEquip(tag, v)" />
      </div>
      </div>
      <template #actions>
        <button class="btn btn-primary btn-lg" @click="equipOpen = false">{{ t('Done') }}</button>
      </template>
    </Sheet>

    <Sheet v-model="weightsOpen" :title="t('Bar and weight jumps')">
      <p class="t-small t-muted">{{ gymList.length > 1 ? t('At {gym}. The smallest jumps in {unit} decide the weights the app suggests.', { gym: hereName, unit: p.unit }) : t('The smallest jumps in {unit} decide the weights the app suggests.', { unit: p.unit }) }}</p>
      <div class="group sheet-group">
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
          <div class="t-tiny t-muted">{{ t('Used by the plate and warm-up tools, and for barbell weight suggestions') }}</div>
        </div>
        <Stepper v-model="p.bar" :step="5" :min="0" :max="50" size="md" class="mini" @update:model-value="persist" />
      </div>
      <div class="group-row">
        <div class="grow">
          <div>{{ t('Log machines by pin number') }}</div>
          <div class="t-tiny t-muted">{{ p.machineUnit === 'pin' ? t('Turn this off to log the weight on the stack instead. Pins differ from machine to machine.') : t('Machines are logged by the weight on the stack, in {unit}. Set each machine\'s plate in its Machine settings.', { unit: p.unit }) }}</div>
        </div>
        <Toggle :model-value="p.machineUnit === 'pin'" @update:model-value="(v) => { p.machineUnit = v ? 'pin' : 'weight'; persist() }" />
      </div>
      </div>
      <template #actions>
        <button class="btn btn-primary btn-lg" @click="weightsOpen = false">{{ t('Done') }}</button>
      </template>
    </Sheet>

    <!-- Import confirm -->
    <Sheet v-model="importOpen" :title="t('Replace this phone\'s data?')">
      <p class="t-body">
        {{ t('Everything on this phone will be replaced with the backup ({n} workouts). Export first if you might want the current data.', { n: pendingCount }) }}
      </p>
      <p v-if="signedIn" class="t-small t-muted">{{ t("You're signed in, so what's saved in your account is added back afterwards: nothing in your account is deleted.") }}</p>
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
      <p class="t-small t-muted">{{ t('Normally this comes with the routine updates, so you can leave it empty. Fill it in only to try a different Supabase project.') }}</p>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
  finishedSessions, hasBeginnerTrack, manifest, switchGym, resetGymUnits
} from '../store.js'
import { APP_VERSION, DEFAULT_ROUTINES_URL } from '../config.js'
import { DEFAULT_INCREMENTS, DEFAULT_BAR, convertLoad, EQUIPMENT } from '../lib/training.js'
import { activeGyms, currentGymId, gymName, gymColours, swatch } from '../lib/climbing.js'
import GymSheet from '../ui/GymSheet.vue'
import AccountCard from '../ui/AccountCard.vue'
import HealthCard from '../ui/HealthCard.vue'
import { healthSupported } from '../lib/health.js'
import { signedIn } from '../lib/account.js'
import { previewRestSound } from '../lib/restTimer.js'
import {
  isNative, shareBackupFile, openUrl, copyText, disarmRestCountdown, ensureNotifyPermission, notificationStatus, openNotificationSettings,
  armRestCountdown
} from '../lib/native.js'
import { notifyText } from '../lib/notifyText.js'
import { relativeDay, fmtDate, fmtNum } from '../lib/format.js'
import { parseBackup } from '../lib/storage.js'
import { runAutoBackup, listAutoBackups, readBackup, shareBackupEntry, backupDate, exportCSV } from '../lib/backup.js'
import { inCrew, crewConfig } from '../lib/crew.js'
import { errorLog } from '../lib/errors.js'
import { t, tx, i18n, LANGS, locale } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const p = computed(() => state.data.profile)
const s = computed(() => state.data.settings)
async function onRestNotify (on) {
  persist()
  if (on) await ensureNotifyPermission()
  else disarmRestCountdown()
  refreshNotif()
}

// Notification status: checked on opening Settings and when coming back from Android's settings
const notif = ref(null)
async function refreshNotif () { notif.value = await notificationStatus() }
refreshNotif()
const onVisible = () => { if (!document.hidden) refreshNotif() }
document.addEventListener('visibilitychange', onVisible)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
/** A 15-second rest as it works in a workout: leave the app to see the countdown, then the alert. */
async function testNotify () {
  await ensureNotifyPermission()
  const at = Date.now() + 15000
  await armRestCountdown(at, t('Test: next set'))
  toast(t('Test started: leave the app now. The countdown pops up, then the alert in 15 seconds.'))
  refreshNotif()
}
const themeItems = computed(() => [{ label: t('Light'), value: 'light' }, { label: t('Dark'), value: 'dark' }, { label: t('Auto'), value: 'system' }])

function back () {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}
onMounted(async () => {
  if (!route.hash) return
  // Straight to a sheet (the crew screen's "Crew server settings")
  if (route.hash === '#crew-server') { openCrewServer(); return }
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
    p.value.machineUnit === 'pin'
      ? { key: 'pin', label: t('Machine pins'), help: t('Positions per jump on a stack'), step: 1, max: 5 }
      : { key: 'machine', label: t('Machines'), help: t('One plate on a weight stack (change it per machine)'), step: u === 'kg' ? 0.5 : 1, max: u === 'kg' ? 25 : 50 }
  ]
})

// ── Gyms ──
const gymList = computed(() => activeGyms(state.data.settings))
const hereId = computed(() => currentGymId(state.data.settings))
const hereName = computed(() => gymName(gymList.value.find(g => g.id === hereId.value)))
const usesColours = (g) => g.boulder === 'colour' || g.route === 'colour'
const gymOpen = ref(false)
const gymEditId = ref(null)
function openGym (id) {
  gymEditId.value = id
  gymOpen.value = true
}
function goTo (g) {
  switchGym(g.id)
  toast(t('At {gym}: its equipment, plates and machine settings are in use', { gym: gymName(g) }))
}

function setEquip (tag, on) {
  if (on) delete state.data.settings.equipment[tag]
  else state.data.settings.equipment[tag] = false
  persist()
}
function setAllEquip (on) {
  for (const tag of Object.keys(EQUIPMENT)) {
    if (on) delete state.data.settings.equipment[tag]
    else state.data.settings.equipment[tag] = false
  }
  persist()
}

// ── The one-line summaries on the rows that open a sheet ──
const remindersOpen = ref(false)
const restOpen = ref(false)
const equipOpen = ref(false)
const weightsOpen = ref(false)
const remindersLine = computed(() => {
  const r = state.data.settings.reminders
  if (!r.days.length) return t('Off')
  const days = weekDays.value.filter(d => r.days.includes(d.n)).map(d => d.long.slice(0, 3))
  return `${days.join(', ')} · ${r.time}`
})
const restLine = computed(() => {
  const x = state.data.settings
  const on = [x.restVibrate && t('Vibrate'), x.restSound && t('Sound'), x.restNotify && t('Notifications')].filter(Boolean)
  return on.length ? on.join(' · ') : t('Off')
})
const equipLine = computed(() => {
  const tags = Object.keys(EQUIPMENT)
  const on = tags.filter(tag => state.data.settings.equipment[tag] !== false).length
  return on === tags.length ? t('All {n}', { n: tags.length }) : t('{n} of {total}', { n: on, total: tags.length })
})
const weightsLine = computed(() => {
  const pr = p.value
  const inc = pr.increments || {}
  return t('Bar {bar} {unit} · jumps {a} / {b} {unit}', { bar: fmtNum(pr.bar, 1), unit: pr.unit, a: fmtNum(inc.upper, 1), b: fmtNum(inc.lower, 1) })
})

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
  prof.plates = null // plate sizes are per unit
  prof.machineSteps = {} // so are stack plates
  resetGymUnits() // and the same at your other gyms
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
  if (manifest.value?.crew?.url) return t('From the routine updates')
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
    notifications: await notificationStatus(),
    errors: errorLog().slice(0, 10)
  }
  const ok = await copyText(JSON.stringify(info, null, 2))
  toast(ok ? t('Copied. Paste it into the group chat.') : t("Couldn't copy on this device"))
}
</script>

<style scoped>
.group-row.col { flex-direction: column; align-items: stretch; gap: 10px; }
.notif-row { gap: 10px; }
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
.sheet-group { margin-top: 12px; }
.eq-all { gap: 8px; margin-top: 4px; }
.data-note { gap: 8px; align-items: flex-start; margin: 0 0 10px; }
.mt-card p { margin-top: 4px; }
.csv { margin-top: 8px; }
.gym-row { text-align: left; gap: 10px; }
.gym-main { display: flex; align-items: center; gap: 12px; min-width: 0; text-align: left; min-height: 48px; }
.gym-n { display: block; }
.here { flex: 0 0 auto; }
.gym-row.add { color: var(--ink-2); font-weight: 600; gap: 10px; }
.gym-row .last { font-weight: 500; }
.gym-row .dots { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.gym-main .grow { min-width: 0; }
.gym-row .dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.18); }
</style>
