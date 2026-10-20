<template>
  <div class="page">
    <div class="page-title mb-3">Tools</div>
    <v-tabs v-model="tab" color="primary" grow class="mb-4">
      <v-tab value="effort">Effort</v-tab>
      <v-tab value="plates">Plates</v-tab>
      <v-tab value="warmup">Warm-up</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- Effort / 1RM / next weight -->
      <v-window-item value="effort" class="pt-2">
        <p class="text-body-2 muted mb-3">
          Enter a set you just did. You'll get your estimated max and what you should handle at other rep counts.
        </p>
        <div class="d-flex ga-2">
          <v-text-field v-model.number="w" type="number" inputmode="decimal" :label="`Weight (${unit})`" class="num-input" />
          <v-text-field v-model.number="r" type="number" inputmode="numeric" label="Reps" class="num-input" />
        </div>
        <div class="text-caption muted mt-3 mb-1">Reps you had left in the tank</div>
        <v-btn-toggle v-model="rir" mandatory divided variant="outlined" density="comfortable" class="w-100 rir-toggle">
          <v-btn v-for="i in rirItems" :key="i.value" :value="i.value" class="flex-1">{{ i.short }}</v-btn>
        </v-btn-toggle>

        <v-card variant="tonal" color="primary" class="my-4 pa-4 text-center" v-if="oneRM">
          <div class="text-caption">Estimated 1-rep max</div>
          <div class="text-h4 font-weight-bold tabular">{{ fmtLoad(oneRM, unit) }}</div>
          <div v-if="r + (rir || 0) > 12" class="text-caption mt-1">High-rep sets give rougher estimates.</div>
        </v-card>

        <template v-if="oneRM">
          <div class="section-label">What should I lift next?</div>
          <div class="d-flex ga-2">
            <v-text-field v-model.number="targetReps" type="number" inputmode="numeric" label="Target reps" class="num-input" style="flex: 0 0 38%" />
            <v-select v-model="group" :items="groupItems" label="Lift type" />
          </div>
          <div class="text-caption muted mt-3 mb-1">Reps to leave in the tank</div>
          <v-btn-toggle v-model="targetRir" mandatory divided variant="outlined" density="comfortable" class="w-100 rir-toggle">
            <v-btn v-for="i in rirItems" :key="i.value" :value="i.value" class="flex-1">{{ i.short }}</v-btn>
          </v-btn-toggle>
          <v-card variant="tonal" class="mt-3 pa-3">
            <div class="text-body-1">
              Try <b class="tabular">{{ fmtLoad(nextLoad, unit) }}</b> for {{ targetReps }} reps
              <span class="muted">({{ targetRir }} in reserve)</span>
            </div>
            <div class="text-caption muted mt-1">Rounded to your {{ fmtLoad(inc, unit) }} jumps for this lift type.</div>
          </v-card>

          <div class="section-label">Rep table</div>
          <v-table density="compact" class="tabular">
            <thead><tr><th>Reps</th><th>To failure</th><th>2 in reserve</th></tr></thead>
            <tbody>
              <tr v-for="n in 12" :key="n">
                <td>{{ n }}</td>
                <td>{{ fmtLoad(roundToIncrement(loadForReps(oneRM, n, 0), inc, 'down'), unit) }}</td>
                <td>{{ fmtLoad(roundToIncrement(loadForReps(oneRM, n, 2), inc, 'down'), unit) }}</td>
              </tr>
            </tbody>
          </v-table>
          <p class="text-caption muted mt-2">
            Uses the average of the Epley and Brzycki formulas. These are population averages — your own numbers may run a little higher or lower, especially on machines.
          </p>
        </template>
      </v-window-item>

      <!-- Plates -->
      <v-window-item value="plates" class="pt-2">
        <div class="d-flex ga-2">
          <v-text-field v-model.number="plateTarget" type="number" inputmode="decimal" :label="`Target (${unit})`" class="num-input" />
          <v-text-field v-model.number="bar" type="number" inputmode="decimal" :label="`Bar (${unit})`" class="num-input" />
        </div>
        <div class="section-label">Plates available</div>
        <v-chip-group v-model="platesOn" multiple column selected-class="text-primary">
          <v-chip v-for="p in allPlates" :key="p" :value="p" filter variant="outlined">{{ p }}</v-chip>
        </v-chip-group>

        <template v-if="plateTarget">
          <div class="section-label">Load each side</div>
          <div v-if="plates.error" class="text-error text-body-2">{{ plates.error }}</div>
          <template v-else>
            <div class="bar-viz my-3">
              <div class="sleeve" />
              <div
                v-for="(p, i) in plates.perSide" :key="i" class="plate"
                :style="{ height: 40 + (p / maxPlate) * 60 + 'px' }"
              ><span>{{ p }}</span></div>
            </div>
            <div class="text-body-1 tabular">
              {{ plates.perSide.length ? plates.perSide.join(' + ') : 'Nothing — just the bar' }} <span class="muted">per side</span>
            </div>
            <div v-if="Math.abs(plates.remainder) > 0.001" class="text-body-2 text-warning mt-1">
              Closest you can load is {{ fmtLoad(plates.achieved, unit) }} ({{ plates.remainder > 0 ? plates.remainder + ' ' + unit + ' short' : '' }}).
            </div>
          </template>
        </template>
      </v-window-item>

      <!-- Warm-up -->
      <v-window-item value="warmup" class="pt-2">
        <div class="d-flex ga-2">
          <v-text-field v-model.number="working" type="number" inputmode="decimal" :label="`Working weight (${unit})`" class="num-input" />
          <v-select v-model="warmBar" :items="[{ title: 'Barbell', value: true }, { title: 'Dumbbell / machine', value: false }]" label="Using" />
        </div>
        <v-table v-if="warmups.length" density="compact" class="tabular mt-3">
          <thead><tr><th>Set</th><th>Weight</th><th>Reps</th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in warmups" :key="i"><td>{{ s.label }}</td><td>{{ fmtLoad(s.load, unit) }}</td><td>{{ s.reps }}</td></tr>
            <tr class="font-weight-bold"><td>Work</td><td>{{ fmtLoad(working, unit) }}</td><td>—</td></tr>
          </tbody>
        </v-table>
        <p v-else-if="working" class="text-body-2 muted mt-3">Light enough that you can go straight to your working sets.</p>
        <p class="text-caption muted mt-3">Rest about a minute between warm-up sets. Usually needed only for the first exercise that hits a muscle group.</p>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { state } from '../store.js'
import {
  estimate1RM, loadForReps, roundToIncrement, fmtLoad, platesPerSide, warmupSets, DEFAULT_PLATES, DEFAULT_BAR
} from '../lib/training.js'

const tab = ref('effort')
const unit = computed(() => state.data.profile.unit)
const rirItems = [0, 1, 2, 3, 4].map(n => ({ short: n === 0 ? '0 · fail' : n === 4 ? '4+' : String(n), value: n }))

// Effort
const w = ref(null)
const r = ref(null)
const rir = ref(0)
const oneRM = computed(() => estimate1RM(w.value, r.value, rir.value))
const targetReps = ref(8)
const targetRir = ref(2)
const group = ref('upper')
const groupItems = [
  { title: 'Upper barbell', value: 'upper' },
  { title: 'Lower barbell', value: 'lower' },
  { title: 'Dumbbell', value: 'dumbbell' }
]
const inc = computed(() => state.data.profile.increments[group.value] || 2.5)
const nextLoad = computed(() => roundToIncrement(loadForReps(oneRM.value, targetReps.value || 1, targetRir.value), inc.value, 'down'))

// Plates
const plateTarget = ref(null)
const bar = ref(state.data.profile.bar ?? DEFAULT_BAR[unit.value])
const allPlates = computed(() => DEFAULT_PLATES[unit.value])
const platesOn = ref([...DEFAULT_PLATES[unit.value]])
watch(unit, (u) => { platesOn.value = [...DEFAULT_PLATES[u]]; bar.value = DEFAULT_BAR[u] })
const plates = computed(() => platesPerSide(plateTarget.value, bar.value || 0, platesOn.value))
const maxPlate = computed(() => Math.max(...allPlates.value))

// Warm-up
const working = ref(null)
const warmBar = ref(true)
const warmups = computed(() =>
  warmupSets(working.value, state.data.profile.increments[warmBar.value ? 'upper' : 'dumbbell'], warmBar.value ? (state.data.profile.bar || 0) : 0)
)
</script>

<style scoped>
.flex-1 { flex: 1 1 0; }
.rir-toggle { height: 44px !important; }
.bar-viz { display: flex; align-items: center; height: 110px; gap: 3px; }
.sleeve { width: 60px; height: 14px; border-radius: 3px; background: rgba(160,160,160,0.6); }
.plate {
  width: 22px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
  background: rgb(var(--v-theme-primary)); color: #000; font-size: 0.6rem; font-weight: 700;
  writing-mode: vertical-rl;
}
</style>
