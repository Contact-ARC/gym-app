<template>
  <div class="page">
    <h1 class="t-title head">{{ t('Tools') }}</h1>
    <Segmented v-model="tab" :options="tabs" :label="t('Tool')" class="tabs" />

    <!-- Effort: estimated max and what to lift next -->
    <section v-if="tab === 'effort'" class="tool">
      <p class="t-small t-muted lead">{{ t('Enter a set you just did.') }}</p>
      <div class="card card-pad stack-lg">
        <Stepper v-model="w" :label="t('Weight')" :unit="unit" :step="incs.upper" :decimals="true" size="md" />
        <Stepper v-model="r" :label="t('Reps')" :step="1" :min="1" :max="30" size="md" />
        <div>
          <div class="label">{{ t('Reps you had left') }}</div>
          <Segmented v-model="rir" :options="rirOptions" :label="t('Reps you had left')" />
        </div>
      </div>

      <div v-if="oneRM" class="result">
        <div class="t-small t-muted">{{ t('Estimated one-rep max') }}</div>
        <div class="t-num result-v">{{ fmtLoad(oneRM, unit) }}</div>
        <div v-if="r + (rir || 0) > 12" class="t-tiny t-warn">{{ t('Sets above 12 reps give a rougher estimate.') }}</div>
      </div>

      <template v-if="oneRM">
        <h2 class="section-h">{{ t('What should I lift next?') }}</h2>
        <div class="card card-pad stack-lg">
          <Stepper v-model="targetReps" :label="t('Reps you want to do')" :step="1" :min="1" :max="30" size="md" />
          <div>
            <div class="label">{{ t('Reps to leave in the tank') }}</div>
            <Segmented v-model="targetRir" :options="rirOptions" :label="t('Reps to leave in the tank')" />
          </div>
          <div>
            <div class="label">{{ t('Lift type (sets the rounding)') }}</div>
            <Segmented v-model="group" :options="groupItems" :label="t('Lift type (sets the rounding)')" />
          </div>
          <div class="answer">
            <span class="t-small t-muted">{{ t('Try') }}</span>
            <span class="t-num answer-v">{{ fmtLoad(nextLoad, unit) }}</span>
            <span class="t-small t-muted">{{ t('for {n} reps', { n: targetReps }) }}</span>
          </div>
        </div>

        <h2 class="section-h">{{ t('Reps at each weight') }}</h2>
        <div class="card table-card">
          <table class="tbl t-num">
            <thead><tr><th>{{ t('Reps') }}</th><th>{{ t('To failure') }}</th><th>{{ t('2 left') }}</th></tr></thead>
            <tbody>
              <tr v-for="n in [1, 2, 3, 4, 5, 6, 8, 10, 12, 15]" :key="n" :class="{ hl: n === r }">
                <td>{{ n }}</td>
                <td>{{ fmtLoad(roundToIncrement(loadForReps(oneRM, n, 0), inc, 'down'), unit) }}</td>
                <td>{{ fmtLoad(roundToIncrement(loadForReps(oneRM, n, 2), inc, 'down'), unit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="t-tiny t-muted foot">{{ t('Based on the average of the Epley and Brzycki formulas. Your own numbers may run a little higher or lower, especially on machines.') }}</p>
      </template>
    </section>

    <!-- Plates -->
    <section v-else-if="tab === 'plates'" class="tool">
      <div class="card card-pad stack-lg">
        <Stepper v-model="plateTarget" :label="t('Total weight')" :unit="unit" :step="unit === 'kg' ? 2.5 : 5" :min="0" :decimals="true" size="md" />
        <div>
          <div class="label">{{ t('Bar') }}</div>
          <Segmented v-model="bar" :options="barOptions" :label="t('Bar weight')" />
        </div>
      </div>

      <div v-if="plateTarget" class="card card-pad plates-card">
        <p v-if="plates.error" class="t-err t-small">{{ plates.error }}</p>
        <template v-else>
          <div class="bar-viz" aria-hidden="true">
            <div class="sleeve" />
            <div class="collar" />
            <div
              v-for="(p, i) in plates.perSide" :key="i" class="wplate"
              :style="plateCss(p)"
            ><span>{{ p }}</span></div>
            <div class="sleeve-end" />
          </div>
          <div class="t-small t-muted">{{ t('On each side') }}</div>
          <div class="t-h2 t-num per-side">{{ plates.perSide.length ? plates.perSide.join(' + ') : t('Nothing, just the bar') }}</div>
          <div v-if="Math.abs(plates.remainder) > 0.001" class="note note-warn t-small">
            {{ t('The closest you can load is {a}, which is {b} short.', { a: fmtLoad(plates.achieved, unit), b: `${plates.remainder} ${unit}` }) }}
          </div>
        </template>
      </div>

      <h2 class="section-h">{{ t('Plates your gym has') }}</h2>
      <div class="plate-picks">
        <button
          v-for="p in allPlates" :key="p" class="pick t-num" :class="{ on: platesOn.includes(p) }"
          :aria-pressed="platesOn.includes(p)" @click="togglePlate(p)"
        >{{ p }}</button>
      </div>
    </section>

    <!-- Warm-up -->
    <section v-else class="tool">
      <div class="card card-pad stack-lg">
        <Stepper v-model="working" :label="t('Working weight')" :unit="unit" :step="incs.upper" :min="0" :decimals="true" size="md" />
        <div>
          <div class="label">{{ t('Using') }}</div>
          <Segmented v-model="warmBar" :options="[{ label: t('Barbell'), value: true }, { label: t('Dumbbells or machine'), value: false }]" :label="t('Equipment')" />
        </div>
      </div>
      <div v-if="warmups.length" class="group warm">
        <div v-for="(s, i) in warmups" :key="i" class="group-row">
          <span class="num t-num">{{ i + 1 }}</span>
          <span class="grow t-num wv">{{ fmtLoad(s.load, unit) }} × {{ s.reps }}</span>
          <span class="t-small t-muted">{{ s.label }}</span>
        </div>
        <div class="group-row work">
          <span class="num t-num"><Icon name="checkBold" :size="16" /></span>
          <span class="grow t-num wv">{{ fmtLoad(working, unit) }}</span>
          <span class="t-small">{{ t('working sets') }}</span>
        </div>
      </div>
      <p v-else-if="working" class="t-small t-muted foot">{{ t("That's light enough to go straight to your working sets.") }}</p>
      <p class="t-tiny t-muted foot">{{ t('Rest about a minute between warm-up sets. You usually only need them for the first exercise of each muscle group.') }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Icon from '../ui/Icon.vue'
import Stepper from '../ui/Stepper.vue'
import Segmented from '../ui/Segmented.vue'
import { weightPlateColors } from '../ui/plates.js'
import { state } from '../store.js'
import { t } from '../i18n/index.js'
import {
  estimate1RM, loadForReps, roundToIncrement, fmtLoad, platesPerSide, warmupSets, DEFAULT_PLATES, DEFAULT_BAR
} from '../lib/training.js'

const tabs = computed(() => [{ label: t('Effort'), value: 'effort' }, { label: t('Plates'), value: 'plates' }, { label: t('Warm-up'), value: 'warmup' }])
const tab = ref(sessionStorageGet('tools-tab') || 'effort')
watch(tab, (v) => sessionStorageSet('tools-tab', v))
function sessionStorageGet (k) { try { return sessionStorage.getItem(k) } catch { return null } }
function sessionStorageSet (k, v) { try { sessionStorage.setItem(k, v) } catch { /* ignore */ } }

const unit = computed(() => state.data.profile.unit)
const incs = computed(() => state.data.profile.increments)
const rirOptions = [0, 1, 2, 3, 4].map(n => ({ label: n === 0 ? '0' : n === 4 ? '4+' : String(n), value: n }))

// Effort
const w = ref(null)
const r = ref(8)
const rir = ref(2)
const oneRM = computed(() => estimate1RM(w.value, r.value, rir.value))
const targetReps = ref(8)
const targetRir = ref(2)
const group = ref('upper')
const groupItems = computed(() => [{ label: t('Upper'), value: 'upper' }, { label: t('Lower'), value: 'lower' }, { label: t('Dumbbell'), value: 'dumbbell' }])
const inc = computed(() => incs.value[group.value] || 2.5)
const nextLoad = computed(() => roundToIncrement(loadForReps(oneRM.value, targetReps.value || 1, targetRir.value), inc.value, 'down'))

// Plates
const plateTarget = ref(null)
const bar = ref(state.data.profile.bar ?? DEFAULT_BAR[unit.value])
const barOptions = computed(() => (unit.value === 'kg'
  ? [{ label: '20 kg', value: 20 }, { label: '15 kg', value: 15 }, { label: '10 kg', value: 10 }]
  : [{ label: '45 lb', value: 45 }, { label: '35 lb', value: 35 }, { label: '25 lb', value: 25 }]))
const allPlates = computed(() => DEFAULT_PLATES[unit.value])
const platesOn = ref([...DEFAULT_PLATES[unit.value]])
watch(unit, (u) => { platesOn.value = [...DEFAULT_PLATES[u]]; bar.value = DEFAULT_BAR[u] })
function togglePlate (p) {
  platesOn.value = platesOn.value.includes(p) ? platesOn.value.filter(x => x !== p) : [...platesOn.value, p]
}
const plates = computed(() => platesPerSide(plateTarget.value, bar.value || 0, platesOn.value))
const maxPlate = computed(() => Math.max(...allPlates.value))
function plateCss (p) {
  const [bg, fg] = weightPlateColors(p, unit.value)
  const h = 44 + Math.sqrt(p / maxPlate.value) * 76
  return { height: `${h}px`, width: p >= maxPlate.value * 0.4 ? '22px' : '16px', background: bg, color: fg }
}

// Warm-up
const working = ref(null)
const warmBar = ref(true)
const warmups = computed(() =>
  warmupSets(working.value, incs.value[warmBar.value ? 'upper' : 'dumbbell'], warmBar.value ? (state.data.profile.bar || 0) : 0)
)
</script>

<style scoped>
.head { margin-top: 8px; }
.tabs { margin-top: 16px; }
.tool { margin-top: 18px; }
.lead { margin: 0 4px 10px; }
.stack-lg > * + * { margin-top: 20px; }

.result { text-align: center; margin: 24px 0 4px; }
.result-v { font-size: 64px; font-weight: 700; line-height: 1; margin-top: 4px; }

.answer { display: flex; align-items: baseline; justify-content: center; gap: 10px; padding-top: 4px; flex-wrap: wrap; }
.answer-v { font-size: 40px; font-weight: 700; }

.table-card { padding: 4px 16px; }
.tbl { width: 100%; border-collapse: collapse; font-size: 19px; }
.tbl th { text-align: left; font-family: var(--font); font-size: 13px; font-weight: 600; color: var(--ink-2); padding: 10px 4px 6px; }
.tbl td { padding: 9px 4px; border-top: 1px solid var(--line); }
.tbl tr.hl td { font-weight: 700; }
.foot { margin: 12px 4px 0; }

/* Barbell drawing: sleeve, collar, then plates in IWF colours */
.plates-card { margin-top: 12px; }
.bar-viz { display: flex; align-items: center; height: 130px; margin-bottom: 12px; }
.sleeve { width: 54px; height: 12px; border-radius: 3px 0 0 3px; background: #A6AEB8; }
.collar { width: 10px; height: 34px; border-radius: 3px; background: #7F8894; margin-right: 3px; }
.wplate {
  margin-right: 3px; border-radius: 5px; display: grid; place-items: center;
  box-shadow: inset 0 0 0 1.5px rgba(0,0,0,0.12), 0 0 0 1px var(--plate-ring);
  font-family: var(--font-num); font-weight: 700; font-size: 12px;
  writing-mode: vertical-rl; transform: rotate(180deg);
}
.sleeve-end { flex: 1 1 auto; max-width: 40px; height: 12px; border-radius: 0 3px 3px 0; background: #A6AEB8; }
.per-side { margin-top: 2px; }
.plates-card .note { margin-top: 12px; }

.plate-picks { display: flex; flex-wrap: wrap; gap: 8px; }
.pick {
  min-width: 56px; height: 44px; padding: 0 12px; border-radius: 22px;
  font-size: 19px; font-weight: 600; background: var(--card); color: var(--ink-3);
  border: 1.5px dashed var(--line);
}
.pick.on { color: var(--ink); border: 1.5px solid var(--ink); }

.warm { margin-top: 14px; }
.num {
  width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto;
  background: var(--card-2); font-size: 16px; font-weight: 700; color: var(--ink-2);
}
.wv { font-size: 22px; font-weight: 600; }
.work .num { background: var(--ink); color: var(--paper); }
</style>
