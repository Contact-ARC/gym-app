<template>
  <div v-if="crewAvailable" class="card card-pad acct">
    <!-- Signed out -->
    <template v-if="!signedIn">
      <div class="row head">
        <Icon name="cloudOff" class="t-muted" />
        <div class="grow">
          <div class="t-h3">{{ t('Your account') }}</div>
          <div class="t-tiny t-muted">{{ t('Not signed in: everything stays on this phone') }}</div>
        </div>
      </div>
      <p class="t-small t-muted">{{ t('Sign in to save your workouts, body log, photos and settings to your account, and have them on any phone you sign in on. The app works the same without it.') }}</p>
      <button class="btn btn-primary btn-block" :disabled="account.busy || !accountsAvailable" @click="signIn">
        <Icon name="google" />{{ account.busy ? t('Signing in…') : t('Continue with Google') }}
      </button>
      <p v-if="!accountsAvailable" class="t-tiny t-muted note">{{ t("Accounts aren't set up yet (README, Accounts).") }}</p>
      <p v-else-if="account.error" class="t-tiny t-err note">{{ account.error }}</p>
      <p v-else class="t-tiny t-muted note">{{ t('Saved on the crew server (Supabase). Whoever runs it can see what is saved.') }}</p>
    </template>

    <!-- Signed in -->
    <template v-else>
      <div class="row head">
        <img v-if="pic" :src="pic" class="av" alt="" referrerpolicy="no-referrer" @error="pic = ''">
        <span v-else class="av av-i">{{ initial }}</span>
        <div class="grow min0">
          <div class="t-h3 truncate">{{ s.name || s.email || t('Your account') }}</div>
          <div class="t-tiny t-muted truncate">{{ s.email }}</div>
        </div>
      </div>
      <div class="row status">
        <Icon :name="syncState.error ? 'cloudOff' : syncState.running ? 'cloudSync' : 'cloudCheck'" :size="20" :class="syncState.error ? 't-err' : 't-ok'" />
        <span class="grow t-small" :class="syncState.error ? 't-err' : 't-muted'">{{ statusLine }}</span>
      </div>
      <p v-if="syncState.notice" class="t-tiny t-muted note">{{ syncState.notice }}</p>
      <div class="row btns">
        <button class="btn btn-soft grow" :disabled="syncState.running" @click="sync"><Icon name="cloudSync" />{{ t('Sync now') }}</button>
        <button class="btn btn-soft grow" @click="outOpen = true"><Icon name="logout" />{{ t('Sign out') }}</button>
      </div>
      <button class="btn btn-ghost btn-block del" @click="openDelete"><Icon name="trash" />{{ t('Delete account…') }}</button>
    </template>

    <Sheet v-model="outOpen" :title="t('Sign out?')">
      <p class="t-body">{{ t("Your data stays on this phone. It just stops being saved to your account until you sign in again. Anything not saved yet is sent first.") }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="outOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="working" @click="doSignOut">{{ t('Sign out') }}</button>
      </template>
    </Sheet>

    <Sheet v-model="delOpen" :title="t('Delete your account?')">
      <p class="t-body">{{ t('This deletes your account and everything saved in it ({what}). Each phone keeps its own copy, including this one. It can\'t be undone.', { what: counts ? tn(counts.workouts, '{n} workout', '{n} workouts') + ', ' + tn(counts.photos, '{n} photo', '{n} photos') : '…' }) }}</p>
      <p class="t-small t-muted">{{ t('Your crew membership stays on this phone.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="delOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-danger btn-lg" :disabled="working" @click="doDelete">{{ working ? t('Deleting…') : t('Delete') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
// Settings → Your account (0.12): sign in with Google, see that your data is saved, sign out, delete.
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import Sheet from './Sheet.vue'
import { toast } from './toast.js'
import { account, signedIn, accountsAvailable, signInWithGoogle, signOut } from '../lib/account.js'
import { syncState, syncNow, deleteAccountAndData, accountStatus } from '../lib/sync.js'
import { crewAvailable } from '../lib/crew.js'
import { t, tn } from '../i18n/index.js'

const s = computed(() => account.session || {})
const pic = ref('')
watch(() => s.value.picture, (v) => { pic.value = v || '' }, { immediate: true })
const initial = computed(() => (s.value.name || s.value.email || '?').trim().charAt(0).toUpperCase())

// "Saved 3 min ago", ticking
const now = ref(Date.now())
let tick = null
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 30000) })
onBeforeUnmount(() => clearInterval(tick))
const statusLine = computed(() => {
  if (syncState.running) return t('Saving to your account…')
  if (syncState.error) return syncState.error
  if (!syncState.lastAt) return syncState.pending ? tn(syncState.pending, '{n} change waiting to be saved', '{n} changes waiting to be saved') : t('Not synced yet')
  const mins = Math.floor((now.value - syncState.lastAt) / 60000)
  const when = mins < 1 ? t('just now') : mins < 60 ? t('{n} min ago', { n: mins }) : t('{n} h ago', { n: Math.floor(mins / 60) })
  return syncState.pending
    ? tn(syncState.pending, 'Saved {when} · {n} change waiting', 'Saved {when} · {n} changes waiting', { when })
    : t('Everything saved · {when}', { when })
})

async function signIn () {
  try {
    await signInWithGoogle()
    toast(t('Signed in. Your data is being saved to your account.'))
  } catch (e) {
    if (e.code !== 'cancelled') toast(e.message)
  }
}
async function sync () {
  await syncNow({ full: true })
  if (!syncState.error) toast(t('Everything saved'))
}

const outOpen = ref(false)
const delOpen = ref(false)
const working = ref(false)
const counts = ref(null)
async function doSignOut () {
  working.value = true
  try { await signOut(); outOpen.value = false; toast(t('Signed out')) } catch (e) { toast(e.message) } finally { working.value = false }
}
async function openDelete () {
  counts.value = null
  delOpen.value = true
  try { counts.value = await accountStatus() } catch { /* the numbers are just shown as … */ }
}
async function doDelete () {
  working.value = true
  try {
    await deleteAccountAndData()
    delOpen.value = false
    toast(t('Account deleted. This phone kept its data.'))
  } catch (e) { toast(e.message) } finally { working.value = false }
}
</script>

<style scoped>
.acct { display: grid; gap: 10px; margin-top: 8px; }
.head { gap: 12px; align-items: center; }
.min0 { min-width: 0; }
.av { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
.av-i { display: grid; place-items: center; background: var(--card-2); font-weight: 700; }
.status { gap: 8px; align-items: center; }
.btns { gap: 8px; }
.note { margin: 0; }
.del { color: var(--err); }
</style>
