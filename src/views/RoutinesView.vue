<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ t('My routines') }}</h1>
    <p class="t-small t-muted sub">{{ t("Your own days and saved copies. Use them alongside this month's days, instead of them, or keep them for later. The routines repo never changes them.") }}</p>

    <div v-if="routineReplaced" class="note note-info row replaced">
      <Icon name="mine" />
      <span class="grow t-small">{{ t("You're using your own days instead of this month's routine.") }}</span>
      <button class="btn btn-sm btn-soft" @click="restore"><Icon name="restore" :size="18" />{{ t('Restore') }}</button>
    </div>

    <template v-if="inUse.length">
      <h2 class="section-h">{{ t('In use') }}</h2>
      <div class="group">
        <PlanRow v-for="p in inUse" :key="p.id" :plan="p" />
      </div>
    </template>

    <template v-if="waiting.length">
      <h2 class="section-h">{{ inUse.length ? t('Not in use') : t('Your routines') }}</h2>
      <div class="group">
        <PlanRow v-for="p in waiting" :key="p.id" :plan="p" />
      </div>
    </template>

    <div v-if="!state.data.plans.length" class="card card-pad empty">
      <p class="t-h3">{{ t('Nothing here yet') }}</p>
      <p class="t-small t-muted">{{ t('Create a day of your own, or save one of this month\'s days with "Save as mine" on its screen.') }}</p>
    </div>

    <h2 class="section-h">{{ t('Add') }}</h2>
    <div class="group">
      <button class="group-row" @click="openNew">
        <Icon name="plus" />
        <div class="grow">
          <div class="t-h3">{{ t('Create a routine') }}</div>
          <div class="t-tiny t-muted">{{ t('Start with one day and add more if you like') }}</div>
        </div>
      </button>
      <button v-if="routine" class="group-row" @click="openCopy">
        <Icon name="copy" />
        <div class="grow">
          <div class="t-h3">{{ t('Save a copy of this month\'s routine') }}</div>
          <div class="t-tiny t-muted">{{ t('All its days, with your changes, to come back to after the month') }}</div>
        </div>
      </button>
    </div>

    <Sheet v-model="newOpen" :title="copying ? t('Save a copy') : t('Create a routine')">
      <label class="label" for="r-name">{{ t('Name') }}</label>
      <input id="r-name" v-model="newName" class="field" type="text" maxlength="40" :placeholder="t('For example: Summer arms block')">
      <template v-if="!copying">
        <label class="label mt" for="r-day">{{ t('First day') }}</label>
        <input id="r-day" v-model="dayName" class="field" type="text" maxlength="40" :placeholder="t('For example: Arms and shoulders')">
      </template>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="newOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!newName.trim()" @click="create">{{ copying ? t('Save') : t('Create') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import PlanRow from '../ui/PlanRow.vue'
import { toast } from '../ui/toast.js'
import { state, routine, routineReplaced, restoreRoutine, isPlanActive, newPlan, copyMonthToMine, freeDayLetter } from '../store.js'
import { planKey } from '../lib/routines.js'
import { monthName } from '../lib/format.js'
import { t, tx } from '../i18n/index.js'

const router = useRouter()
const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))
const inUse = computed(() => state.data.plans.filter(p => isPlanActive(p)).sort(byNewest))
const waiting = computed(() => state.data.plans.filter(p => !isPlanActive(p)).sort(byNewest))

function restore () {
  restoreRoutine()
  toast(t("Back to this month's routine. Your days are still in My routines."))
}

const newOpen = ref(false)
const copying = ref(false)
const newName = ref('')
const dayName = ref('')
function openNew () {
  copying.value = false
  newName.value = ''
  dayName.value = ''
  newOpen.value = true
}
function openCopy () {
  copying.value = true
  newName.value = tx(routine.value, 'title') || monthName(routine.value.month)
  newOpen.value = true
}
async function create () {
  newOpen.value = false
  if (copying.value) {
    const p = copyMonthToMine(newName.value.trim())
    if (p) { toast(t('Saved to My routines')); router.push(`/plan/${p.id}`) }
    return
  }
  const name = newName.value.trim()
  const p = newPlan(name, { label: freeDayLetter(), name: dayName.value.trim() || name, items: [] })
  // Plan first, so Done in the editor comes back to it
  await router.push(`/plan/${p.id}`)
  router.push(`/edit/${planKey(p.id, p.days[0].id)}`)
}
</script>

<style scoped>
.sub { margin-top: 6px; }
.replaced { margin-top: 16px; gap: 10px; }
.empty { margin-top: 20px; }
.empty .t-small { margin-top: 6px; }
.mt { margin-top: 16px; }
</style>
