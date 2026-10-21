<template>
  <div v-if="plan" class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
      <span class="grow" />
      <button class="icon-btn" :aria-label="t('Routine options')" @click="menuOpen = true"><Icon name="more" /></button>
    </div>
    <h1 class="t-title">{{ plan.name || t('Untitled') }}</h1>
    <p v-if="fromLine" class="t-small t-muted sub">{{ fromLine }}</p>

    <!-- In use? -->
    <div class="card card-pad status" :class="{ on: active }">
      <div class="row">
        <span class="mine-ic"><Icon :name="active ? 'doneCircle' : 'mine'" :size="22" /></span>
        <div class="grow">
          <div class="t-h3">{{ planStatus(plan) }}</div>
          <div class="t-small t-muted">{{ active ? (plan.use.mode === 'replace' ? t("Instead of this month's routine") : t("Alongside this month's routine")) : t("Waiting here until you use it. It isn't on Train.") }}</div>
        </div>
      </div>
      <div class="row acts">
        <template v-if="active">
          <button class="btn btn-soft grow" @click="openUse">{{ t('Change') }}</button>
          <button class="btn btn-soft grow" @click="stop">{{ t('Stop using') }}</button>
        </template>
        <button v-else class="btn btn-primary btn-block" :disabled="!plan.days.length" @click="openUse"><Icon name="play" />{{ t('Use this routine') }}</button>
      </div>
    </div>

    <h2 class="section-h">{{ t('Days') }}</h2>
    <div class="group">
      <RouterLink v-for="(d, i) in plan.days" :key="d.id" :to="`/day/${keyOf(d)}`" class="group-row">
        <PlateBadge :index="plateIndex(d, i)" :label="d.label || '•'" />
        <div class="grow">
          <div class="t-h3 truncate">{{ dayTitle(tx(d, 'name'), d.label) }}</div>
          <div class="t-small t-muted">{{ tn(d.items.length, '{n} exercise', '{n} exercises') }}<template v-if="estimateMinutes(d.items)">{{ t(', about {n} min', { n: estimateMinutes(d.items) }) }}</template></div>
        </div>
        <Icon name="chevronRight" class="chev" />
      </RouterLink>
      <button class="group-row" @click="addDay">
        <Icon name="plus" />
        <span class="grow">{{ t('Add a day') }}</span>
      </button>
    </div>

    <!-- How and how long -->
    <Sheet v-model="useOpen" :title="t('Use this routine')">
      <div class="label">{{ t('How') }}</div>
      <Segmented v-model="opts.mode" :options="modeOptions" :label="t('How')" />
      <p class="t-tiny t-muted help">{{ opts.mode === 'replace' ? t("Train shows only your days. Restore the routine any time; nothing is deleted.") : t("Your days show after this month's days.") }}</p>

      <div class="label mt">{{ t('For how long') }}</div>
      <Segmented v-model="opts.until" :options="untilOptions" :label="t('For how long')" />
      <template v-if="opts.until === 'date'">
        <div class="row weeks">
          <button v-for="w in [4, 8, 12]" :key="w" class="wchip" :class="{ on: !customEnd && opts.weeks === w }" @click="customEnd = false; opts.weeks = w">{{ tn(w, '{n} week', '{n} weeks') }}</button>
          <button class="wchip" :class="{ on: customEnd }" @click="customEnd = true">{{ t('Pick a date') }}</button>
        </div>
        <input v-if="customEnd" v-model="opts.endsOn" type="date" class="field mt-s" :min="state.today" :aria-label="t('Last day')">
      </template>
      <p class="t-tiny t-muted help">{{ untilHelp }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="useOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="opts.until === 'date' && customEnd && !opts.endsOn" @click="applyUse">{{ t('Use it') }}</button>
      </template>
    </Sheet>

    <!-- Options -->
    <Sheet v-model="menuOpen" :title="plan.name || t('Untitled')">
      <div class="group">
        <button class="group-row" @click="menuOpen = false; openRename()"><Icon name="edit" /><span class="grow">{{ t('Rename') }}</span></button>
        <button class="group-row" @click="duplicate"><Icon name="copy" /><span class="grow">{{ t('Duplicate') }}</span></button>
        <button class="group-row t-err" @click="menuOpen = false; delOpen = true"><Icon name="trash" /><span class="grow">{{ t('Delete this routine') }}</span></button>
      </div>
    </Sheet>

    <Sheet v-model="renameOpen" :title="t('Rename')">
      <input v-model="rename" class="field" type="text" maxlength="40" :aria-label="t('Name')">
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="renameOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!rename.trim()" @click="doRename">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <Sheet v-model="delOpen" :title="t('Delete {name}?', { name: plan.name || t('Untitled') })">
      <p class="t-body">{{ t("Its days are removed from My routines (and from Train if it's in use). Workouts you did with it stay in your history.") }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="delOpen = false">{{ t('Keep it') }}</button>
        <button class="btn btn-danger btn-lg" @click="del">{{ t('Delete') }}</button>
      </template>
    </Sheet>
  </div>

  <div v-else class="page">
    <div class="topbar"><button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button></div>
    <p class="t-h2">{{ t('This routine no longer exists') }}</p>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Segmented from '../ui/Segmented.vue'
import PlateBadge from '../ui/PlateBadge.vue'
import { toast } from '../ui/toast.js'
import {
  state, persist, planById, isPlanActive, usePlan, stopPlan, deletePlan, duplicatePlan, addPlanDay, dayIndexOf, freeDayLetter
} from '../store.js'
import { planKey, estimateMinutes, addDaysKey } from '../lib/routines.js'
import { dayTitle, planStatus, monthName, shortDay } from '../lib/format.js'
import { t, tn, tx } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const plan = computed(() => planById(route.params.id))
const active = computed(() => isPlanActive(plan.value))
const keyOf = (d) => planKey(plan.value.id, d.id)
const plateIndex = (d, i) => { const k = dayIndexOf(keyOf(d)); return k >= 0 ? k : i + 4 }

const fromLine = computed(() => {
  const f = plan.value?.from
  if (!f?.month) return ''
  if (f.kind === 'month') return t('Copy of the {month} routine', { month: monthName(f.month, { month: 'long', year: 'numeric' }) })
  if (f.kind === 'day') return t('Saved from day {id}, {month}', { id: f.dayId, month: monthName(f.month, { month: 'long', year: 'numeric' }) })
  return ''
})

// ── Use it ──
const useOpen = ref(false)
const customEnd = ref(false)
const opts = reactive({ mode: 'add', until: 'month', weeks: 4, endsOn: '' })
const modeOptions = computed(() => [{ label: t('Alongside the routine'), value: 'add' }, { label: t('Instead of the routine'), value: 'replace' }])
const untilOptions = computed(() => [{ label: t('This month'), value: 'month' }, { label: t('For a while'), value: 'date' }, { label: t('Every month'), value: 'forever' }])
const untilHelp = computed(() => {
  if (opts.until === 'month') return t('At the start of next month it goes back to My routines.')
  if (opts.until === 'forever') return t('Stays on Train every month until you stop it.')
  const end = customEnd.value ? opts.endsOn : addDaysKey(state.today, opts.weeks * 7 - 1)
  return end ? t('Until {date}, then it goes back to My routines. You get a heads-up a few days before.', { date: shortDay(end) }) : ''
})
function openUse () {
  const u = plan.value.use || plan.value.lastUse || {}
  const lastWeeks = plan.value.lastUse?.weeks
  Object.assign(opts, { mode: u.mode || 'add', until: u.until || 'month', weeks: lastWeeks || 4, endsOn: plan.value.use?.endsOn || '' })
  customEnd.value = u.until === 'date' && !lastWeeks
  useOpen.value = true
}
function applyUse () {
  usePlan(plan.value.id, { mode: opts.mode, until: opts.until, weeks: customEnd.value ? null : opts.weeks, endsOn: customEnd.value ? opts.endsOn : null })
  useOpen.value = false
  toast(opts.mode === 'replace' ? t("Your days are on Train instead of this month's routine") : t("Added to this month's days"), { actionLabel: t('Show'), action: () => router.push('/') })
}
function stop () {
  stopPlan(plan.value.id)
  toast(t('Back in My routines, off Train'))
}

// ── Days ──
function addDay () {
  const d = addPlanDay(plan.value.id, { label: freeDayLetter(plan.value), name: '', items: [] })
  if (d) router.push(`/edit/${keyOf(d)}`)
}

// ── Options ──
const menuOpen = ref(false)
const renameOpen = ref(false)
const rename = ref('')
function openRename () { rename.value = plan.value.name; renameOpen.value = true }
function doRename () {
  plan.value.name = rename.value.trim()
  persist()
  renameOpen.value = false
}
function duplicate () {
  menuOpen.value = false
  const p = duplicatePlan(plan.value.id, t('{name} (copy)', { name: plan.value.name }))
  if (p) { toast(t('Copy saved')); router.replace(`/plan/${p.id}`) }
}
const delOpen = ref(false)
function del () {
  const name = plan.value.name
  deletePlan(plan.value.id)
  delOpen.value = false
  router.back()
  toast(t('{name} deleted', { name }))
}
</script>

<style scoped>
.sub { margin-top: 6px; }
.status { margin-top: 16px; }
.status .row { gap: 12px; }
.mine-ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--card-2); color: var(--ink-2); flex: 0 0 auto; }
.status.on .mine-ic { background: var(--info-soft); color: var(--info); }
.acts { margin-top: 14px; gap: 10px; }
.mt { margin-top: 18px; }
.mt-s { margin-top: 10px; }
.help { margin: 8px 2px 0; }
.weeks { flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.wchip { min-height: 40px; padding: 0 14px; border-radius: 20px; background: var(--card-2); font-weight: 600; font-size: 15px; color: var(--ink-2); }
.wchip.on { background: var(--ink); color: var(--paper); }
</style>
