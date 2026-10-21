<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="router.back()"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ t('Body') }}</h1>
    <p class="t-small t-muted sub">{{ t('Weigh in under the same conditions each time, for example in the morning before breakfast.') }}</p>

    <!-- Weight -->
    <div class="card card-pad wcard">
      <div class="row kpis">
        <div class="grow">
          <div class="t-tiny t-muted">{{ t('Latest weight') }}</div>
          <div class="t-num kv">{{ latest ? `${fmtNum(latest.weight, 1)} ${latest.unit}` : '–' }}</div>
          <div v-if="latest" class="t-tiny t-muted">{{ relativeDay(latest.date + 'T12:00:00') }}</div>
        </div>
        <div v-if="change30 != null" class="right">
          <div class="t-tiny t-muted">{{ t('Last 30 days') }}</div>
          <div class="t-num kv">{{ change30 > 0 ? '+' : '' }}{{ fmtNum(change30, 1) }}</div>
        </div>
      </div>
      <Segmented v-if="bfPoints.length > 1 && weightPoints.length > 1" v-model="chartMode" class="chart-mode" :options="[{ label: t('Weight'), value: 'weight' }, { label: t('Body fat'), value: 'bf' }]" :label="t('Chart')" />
      <div v-if="(chartMode === 'bf' ? bfPoints : weightPoints).length > 1" class="chart">
        <Line :data="lineData" :options="lineOptions" />
      </div>
      <button class="btn btn-primary btn-block add" @click="openEntry()"><Icon name="plus" />{{ t('Log weight or measurements') }}</button>
    </div>

    <!-- Body composition -->
    <section>
      <div class="row sec-row">
        <h2 class="section-h grow">{{ t('Body composition') }}</h2>
        <button class="btn btn-sm btn-ghost" @click="openAbout"><Icon name="height" :size="18" />{{ t('Height and sex') }}</button>
      </div>
      <button v-if="!p.heightCm" class="card card-pad row comp-empty" @click="openAbout">
        <Icon name="height" />
        <span class="grow t-small">{{ t('Add your height to see BMI, lean mass and FFMI, and to estimate body fat from your measurements.') }}</span>
        <Icon name="chevronRight" class="chev" />
      </button>
      <div v-else class="comp">
        <div class="cbox">
          <div class="t-tiny t-muted">{{ t('Body fat') }}</div>
          <div class="t-num cv">{{ bf ? fmtNum(bf.value, 1) + '%' : '–' }}</div>
          <div class="t-tiny t-muted">{{ bf ? (bf.source === 'entered' ? t('entered {when}', { when: shortDate(bf.date) }) : t('estimated {when}', { when: shortDate(bf.date) })) : bfHint }}</div>
        </div>
        <div class="cbox">
          <div class="t-tiny t-muted">{{ t('Lean mass') }}</div>
          <div class="t-num cv">{{ lean != null ? fmtNum(lean, 1) : '–' }}<span v-if="lean != null" class="cu"> {{ unit }}</span></div>
          <div class="t-tiny t-muted">{{ t('weight without fat') }}</div>
        </div>
        <div class="cbox">
          <div class="t-tiny t-muted">{{ t('FFMI') }}</div>
          <div class="t-num cv">{{ ff ? fmtNum(ff.normalized, 1) : '–' }}</div>
          <div class="t-tiny t-muted">{{ ff ? ffmiLabel(ff.normalized) : t('needs body fat') }}</div>
        </div>
        <div class="cbox">
          <div class="t-tiny t-muted">{{ t('BMI') }}</div>
          <div class="t-num cv">{{ bmiV != null ? fmtNum(bmiV, 1) : '–' }}</div>
          <div class="t-tiny t-muted">{{ t("doesn't know muscle from fat") }}</div>
        </div>
      </div>
      <p v-if="p.heightCm" class="t-tiny t-muted foot">
        {{ t('FFMI is lean mass for your height: around 20 is typical for men who train, 25 is a very muscular natural lifter (women: about 3 lower). Measurement estimates of body fat can be 3–4 points off; watch the trend.') }}
      </p>
      <RouterLink to="/goals" class="btn btn-ghost btn-sm goals-link"><Icon name="goal" :size="18" />{{ t('Set a body goal') }}</RouterLink>
    </section>

    <!-- Measurements -->
    <section v-if="measureRows.length">
      <h2 class="section-h">{{ t('Measurements') }}</h2>
      <div class="group">
        <div v-for="m in measureRows" :key="m.key" class="group-row">
          <span class="grow">{{ measureLabel(m.key) }}</span>
          <span class="t-num mv">{{ fmtNum(m.last, 1) }} {{ m.unit }}</span>
          <span v-if="m.change != null" class="t-num t-small t-muted mc">{{ m.change > 0 ? '+' : '' }}{{ fmtNum(m.change, 1) }}</span>
        </div>
      </div>
      <p class="t-tiny t-muted foot">{{ t('Change is since your first measurement.') }}</p>
    </section>

    <!-- Photos -->
    <section>
      <div class="row ph-head">
        <h2 class="section-h grow">{{ t('Progress photos') }}</h2>
        <label class="btn btn-sm btn-soft">
          <Icon name="camera" :size="18" />{{ t('Add photo') }}
          <input type="file" accept="image/*" class="hidden-input" @change="pickPhoto">
        </label>
      </div>
      <div v-if="photoList.length" class="photos">
        <button v-for="p in photoList" :key="p.id" class="ph" :aria-label="t('Photo from {date}', { date: fmtDate(p.date + 'T12:00:00') })" @click="openPhoto(p)">
          <img v-if="thumbs[p.id]" :src="thumbs[p.id]" alt="">
          <span class="ph-date t-tiny">{{ shortDate(p.date) }}<template v-if="p.pose"> · {{ poseLabel(p.pose) }}</template></span>
        </button>
      </div>
      <p class="t-tiny t-muted foot">{{ t("Photos stay on this phone only. They aren't in backups and are never shared with the crew.") }}</p>
    </section>

    <!-- History -->
    <section v-if="entries.length">
      <h2 class="section-h">{{ t('Log') }}</h2>
      <div class="group">
        <button v-for="e in entries.slice(0, showAll ? 999 : 8)" :key="e.id" class="group-row" @click="openEntry(e)">
          <span class="t-small t-muted when">{{ shortDate(e.date) }}</span>
          <span class="grow t-num">{{ e.weight != null ? `${fmtNum(e.weight, 1)} ${e.unit}` : '' }}</span>
          <span class="t-tiny t-muted">{{ measuredCount(e) ? tn(measuredCount(e), '{n} measurement', '{n} measurements') : '' }}</span>
          <Icon name="chevronRight" class="chev" />
        </button>
      </div>
      <button v-if="entries.length > 8" class="btn btn-ghost btn-sm" @click="showAll = !showAll">{{ showAll ? t('Show fewer') : t('Show all {n}', { n: entries.length }) }}</button>
    </section>

    <!-- Entry sheet -->
    <Sheet v-model="entryOpen" :title="draft.id ? t('Edit entry') : t('New entry')">
      <label class="label" for="b-date">{{ t('Date') }}</label>
      <input id="b-date" v-model="draft.date" type="date" class="field" :max="state.today">
      <div class="label mt">{{ t('Weight') }}</div>
      <Stepper v-model="draft.weight" :label="t('Weight')" :unit="unit" :step="0.1" :min="0" decimals size="md" />
      <label class="label mt" for="b-bf">{{ t('Body fat (%, optional)') }}</label>
      <input id="b-bf" v-model.number="draft.bodyFat" type="number" inputmode="decimal" step="0.1" min="2" max="70" class="field t-num bf-in" :placeholder="t('From a smart scale, calipers or a scan')">
      <p class="t-tiny t-muted mt-s">{{ t('Leave it empty and the app estimates it from your waist and neck (and hips for women), once your height and sex are set.') }}</p>
      <div class="label mt">{{ t('Measurements ({u}, optional)', { u: mUnit }) }}</div>
      <div class="mgrid">
        <label v-for="k in MEASUREMENTS" :key="k" class="mfield">
          <span class="t-tiny t-muted">{{ measureLabel(k) }}</span>
          <input v-model.number="draft[k]" type="number" inputmode="decimal" step="0.1" min="0" class="field t-num" :aria-label="measureLabel(k)">
        </label>
      </div>
      <p class="t-tiny t-muted mt-s">{{ t("Waist at the belly button (women: the narrowest point), neck just below the Adam's apple, hips, arm and thigh at the widest point, relaxed.") }}</p>
      <template #actions>
        <button v-if="draft.id" class="btn btn-danger btn-lg" @click="removeEntry"><Icon name="trash" />{{ t('Delete') }}</button>
        <button v-else class="btn btn-soft btn-lg" @click="entryOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="!canSave" @click="saveEntry">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <!-- Height and sex -->
    <Sheet v-model="aboutOpen" :title="t('Height and sex')">
      <Stepper v-if="unit === 'kg'" v-model="about.cm" :label="t('Height')" unit="cm" :step="1" :min="100" :max="230" size="md" />
      <div v-else class="grid2">
        <Stepper v-model="about.ft" :label="t('Feet')" unit="ft" :step="1" :min="3" :max="7" size="md" />
        <Stepper v-model="about.inch" :label="t('Inches')" unit="in" :step="1" :min="0" :max="11" size="md" />
      </div>
      <div class="label mt">{{ t('Sex') }} <span class="t-faint">{{ t('(optional)') }}</span></div>
      <Segmented v-model="about.sex" :options="sexOptions" allow-none :label="t('Sex')" />
      <p class="t-tiny t-muted mt-s">{{ t('Only used for the body-fat estimate and the DOTS score, which use different formulas for men and women. It stays on this phone.') }}</p>
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="aboutOpen = false">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" @click="saveAbout">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <!-- New photo: pick the pose -->
    <Sheet v-model="poseOpen" :title="t('Add photo')">
      <img v-if="pending.preview" :src="pending.preview" alt="" class="preview">
      <div class="label mt">{{ t('Pose') }}</div>
      <Segmented v-model="pending.pose" :options="poseOptions" :label="t('Pose')" />
      <label class="label mt" for="p-date">{{ t('Date') }}</label>
      <input id="p-date" v-model="pending.date" type="date" class="field" :max="state.today">
      <template #actions>
        <button class="btn btn-soft btn-lg" @click="cancelPhoto">{{ t('Cancel') }}</button>
        <button class="btn btn-primary btn-lg" :disabled="pending.saving" @click="storePhoto">{{ t('Save') }}</button>
      </template>
    </Sheet>

    <!-- Photo viewer, with an optional side-by-side against the first photo of the same pose -->
    <Sheet v-model="viewOpen" :title="viewing ? fmtDate(viewing.date + 'T12:00:00') : ''">
      <template v-if="viewing">
        <div class="viewer" :class="{ two: compare && firstOfPose }">
          <figure v-if="compare && firstOfPose">
            <img :src="full[firstOfPose.id] || thumbs[firstOfPose.id]" alt="">
            <figcaption class="t-tiny t-muted">{{ shortDate(firstOfPose.date) }}</figcaption>
          </figure>
          <figure>
            <img :src="full[viewing.id] || thumbs[viewing.id]" alt="">
            <figcaption v-if="compare && firstOfPose" class="t-tiny t-muted">{{ shortDate(viewing.date) }}</figcaption>
          </figure>
        </div>
        <label v-if="firstOfPose" class="cmp t-small">
          <Toggle v-model="compare" />
          <span>{{ t('Compare with your first {pose} photo', { pose: poseLabel(viewing.pose).toLowerCase() }) }}</span>
        </label>
      </template>
      <template #actions>
        <button class="btn btn-danger btn-lg" @click="removePhoto"><Icon name="trash" />{{ t('Delete') }}</button>
        <button class="btn btn-primary btn-lg" @click="viewOpen = false">{{ t('Done') }}</button>
      </template>
    </Sheet>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } from 'chart.js'
import Icon from '../ui/Icon.vue'
import Sheet from '../ui/Sheet.vue'
import Stepper from '../ui/Stepper.vue'
import Segmented from '../ui/Segmented.vue'
import Toggle from '../ui/Toggle.vue'
import { toast } from '../ui/toast.js'
import { state, persist, saveBodyEntry, deleteBodyEntry, addPhotoRecord, removePhotoRecord, MEASUREMENTS, newId, goalsWithProgress } from '../store.js'
import { latestBodyFat, bodyFatSeries, avgWeight, leanMass, ffmi, bmi, CM_PER_IN } from '../lib/body.js'
import { goalTitle } from '../lib/goalText.js'
import { fmtNum, relativeDay, fmtDate } from '../lib/format.js'
import { convertLoad } from '../lib/training.js'
import { savePhoto, photoUrl, deletePhotoFiles } from '../lib/photos.js'
import { useChartTheme } from '../lib/chartTheme.js'
import { t, tn, locale } from '../i18n/index.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

const router = useRouter()
const ct = useChartTheme()
const unit = computed(() => state.data.profile.unit)
const mUnit = computed(() => (unit.value === 'lb' ? 'in' : 'cm'))
const shortDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' })

const MEASURE_LABELS = { waist: 'Waist', neck: 'Neck', chest: 'Chest', arm: 'Arm', thigh: 'Thigh', hips: 'Hips' }
const measureLabel = (k) => t('measure|' + MEASURE_LABELS[k])
const POSES = { front: 'pose|Front', side: 'pose|Side', back: 'pose|Back' }
const poseLabel = (p) => t(POSES[p] || POSES.front)
const poseOptions = computed(() => Object.keys(POSES).map(k => ({ label: poseLabel(k), value: k })))

// ── Weight ──
const entries = computed(() => [...state.data.body.entries].sort((a, b) => b.date.localeCompare(a.date)))
const inUnit = (e) => convertLoad(e.weight, e.unit, unit.value)
const weightPoints = computed(() => [...entries.value].reverse().filter(e => e.weight != null).map(e => ({ date: e.date, w: Math.round(inUnit(e) * 10) / 10 })))
const latest = computed(() => {
  const e = entries.value.find(x => x.weight != null)
  return e ? { ...e, weight: inUnit(e), unit: unit.value } : null
})
const change30 = computed(() => {
  const pts = weightPoints.value
  if (pts.length < 2) return null
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const base = pts.find(p => p.date >= cutoff) || pts[0]
  const last = pts[pts.length - 1]
  return base === last ? null : last.w - base.w
})
// ── Body composition ──
const p = computed(() => state.data.profile)
const bf = computed(() => latestBodyFat(state.data.body.entries, p.value))
const bfPoints = computed(() => bodyFatSeries(state.data.body.entries, p.value).map(x => ({ date: x.date, w: x.bf.value })))
const avgW = computed(() => avgWeight(state.data.body.entries, unit.value))
const lean = computed(() => (bf.value && avgW.value ? leanMass(avgW.value, bf.value.value) : null))
const kg = computed(() => (avgW.value ? convertLoad(avgW.value, unit.value, 'kg') : null))
const ff = computed(() => (bf.value && kg.value ? ffmi(kg.value, bf.value.value, p.value.heightCm) : null))
const bmiV = computed(() => (kg.value ? bmi(kg.value, p.value.heightCm) : null))
const bfHint = computed(() => {
  if (!p.value.sex) return t('enter it, or set your sex for an estimate')
  return t('enter it, or log waist and neck')
})
function ffmiLabel (v) {
  const adj = p.value.sex === 'female' ? 3 : 0
  if (v < 18 - adj) return t('below average')
  if (v < 20 - adj) return t('average')
  if (v < 22 - adj) return t('above average')
  if (v < 25 - adj) return t('very muscular')
  return t('exceptional')
}
const chartMode = ref('weight')

// ── Height and sex ──
const aboutOpen = ref(false)
const about = reactive({ cm: 175, ft: 5, inch: 9, sex: null })
const sexOptions = computed(() => [{ label: t('Male'), value: 'male' }, { label: t('Female'), value: 'female' }])
function openAbout () {
  const cm = p.value.heightCm || 175
  const totalIn = Math.round(cm / CM_PER_IN)
  Object.assign(about, { cm: Math.round(cm), ft: Math.floor(totalIn / 12), inch: totalIn % 12, sex: p.value.sex || null })
  aboutOpen.value = true
}
function saveAbout () {
  p.value.heightCm = unit.value === 'kg' ? about.cm : Math.round(((about.ft || 0) * 12 + (about.inch || 0)) * CM_PER_IN * 10) / 10
  p.value.sex = about.sex || null
  persist()
  aboutOpen.value = false
  toast(t('Saved'))
}

const series = computed(() => (chartMode.value === 'bf' && bfPoints.value.length > 1 ? bfPoints.value : weightPoints.value))
const seriesUnit = computed(() => (series.value === bfPoints.value ? '%' : unit.value))
const lineData = computed(() => ({
  labels: series.value.map(p => shortDate(p.date)),
  datasets: [{
    label: seriesUnit.value === '%' ? t('Body fat') : t('Weight'),
    data: series.value.map(p => p.w),
    borderColor: ct.value.series[0], backgroundColor: ct.value.series[0],
    borderWidth: 2, tension: 0.25, pointRadius: 3, pointHoverRadius: 6, pointBorderWidth: 2, pointBorderColor: ct.value.surface
  }]
}))
const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: { legend: { display: false }, tooltip: { padding: 10, cornerRadius: 10, callbacks: { label: (c) => `${fmtNum(c.parsed.y, 1)} ${seriesUnit.value}` } } },
  scales: {
    x: { ticks: { color: ct.value.ink, maxRotation: 0, autoSkip: true, maxTicksLimit: 5 }, grid: { display: false }, border: { display: false } },
    y: { ticks: { color: ct.value.ink, maxTicksLimit: 5 }, grid: { color: ct.value.grid }, border: { display: false } }
  }
}))

// ── Measurements ──
const measuredCount = (e) => MEASUREMENTS.filter(k => e[k] != null).length
const measureRows = computed(() => {
  const asc = [...entries.value].reverse()
  return MEASUREMENTS.map(key => {
    const with_ = asc.filter(e => e[key] != null)
    if (!with_.length) return null
    const first = with_[0]; const last = with_[with_.length - 1]
    return { key, last: last[key], unit: last.mUnit || mUnit.value, change: with_.length > 1 ? last[key] - first[key] : null }
  }).filter(Boolean)
})

// ── Entry sheet ──
const entryOpen = ref(false)
const showAll = ref(false)
const draft = reactive({})
function openEntry (e = null) {
  const prev = latest.value
  Object.keys(draft).forEach(k => delete draft[k])
  Object.assign(draft, e
    ? { ...e, weight: e.weight != null ? inUnit(e) : null }
    : { id: null, date: state.today, weight: prev?.weight ?? null, bodyFat: null })
  entryOpen.value = true
}
const canSave = computed(() => !!draft.date && (draft.weight > 0 || draft.bodyFat > 0 || MEASUREMENTS.some(k => draft[k] > 0)))
function saveEntry () {
  const bfv = draft.bodyFat > 0 && draft.bodyFat < 70 ? draft.bodyFat : null
  const saved = saveBodyEntry({ ...draft, weight: draft.weight > 0 ? draft.weight : null, bodyFat: bfv, unit: unit.value, mUnit: mUnit.value })
  entryOpen.value = false
  const g = saved.reached?.[0]
  if (g) {
    const gp = goalsWithProgress.value.find(x => x.goal.id === g.id)?.p
    toast(t('Goal reached: {goal}', { goal: goalTitle(g, gp?.target ?? g.target, gp?.unit ?? g.unit) }), { actionLabel: t('Goals'), action: () => router.push('/goals') })
  } else toast(t('Saved'))
}
function removeEntry () {
  deleteBodyEntry(draft.id)
  entryOpen.value = false
  toast(t('Entry deleted'))
}

// ── Photos ──
const photoList = computed(() => [...state.data.body.photos].sort((a, b) => b.date.localeCompare(a.date)))
const thumbs = reactive({})
const full = reactive({})
watch(photoList, async (list) => {
  for (const p of list) if (!thumbs[p.id]) thumbs[p.id] = await photoUrl(p.thumb || p.file)
}, { immediate: true })

const poseOpen = ref(false)
const pending = reactive({ file: null, preview: '', pose: 'front', date: state.today, saving: false })
function pickPhoto (ev) {
  const f = ev.target.files?.[0]
  ev.target.value = ''
  if (!f) return
  if (pending.preview) URL.revokeObjectURL(pending.preview)
  Object.assign(pending, { file: f, preview: URL.createObjectURL(f), pose: 'front', date: state.today, saving: false })
  poseOpen.value = true
}
function cancelPhoto () {
  poseOpen.value = false
}
async function storePhoto () {
  pending.saving = true
  try {
    const id = newId()
    const paths = await savePhoto(pending.file, id)
    addPhotoRecord({ id, date: pending.date, pose: pending.pose, ...paths })
    poseOpen.value = false
    toast(t('Photo saved'))
  } catch (e) {
    toast(t("Couldn't save the photo: {e}", { e: e.message || e }))
  } finally {
    pending.saving = false
  }
}

const viewOpen = ref(false)
const viewing = ref(null)
const compare = ref(false)
const firstOfPose = computed(() => {
  if (!viewing.value) return null
  const same = [...state.data.body.photos].filter(p => (p.pose || 'front') === (viewing.value.pose || 'front')).sort((a, b) => a.date.localeCompare(b.date))
  return same[0] && same[0].id !== viewing.value.id ? same[0] : null
})
async function openPhoto (p) {
  viewing.value = p
  compare.value = false
  viewOpen.value = true
  if (!full[p.id]) full[p.id] = await photoUrl(p.file)
}
watch(compare, async (on) => {
  const f = firstOfPose.value
  if (on && f && !full[f.id]) full[f.id] = await photoUrl(f.file)
})
async function removePhoto () {
  const p = viewing.value
  viewOpen.value = false
  removePhotoRecord(p.id)
  await deletePhotoFiles(p)
  delete thumbs[p.id]; delete full[p.id]
  toast(t('Photo deleted'))
}
</script>

<style scoped>
.sub { margin-top: 6px; }
.wcard { margin-top: 16px; }
.kpis { align-items: flex-start; }
.kv { font-size: 32px; font-weight: 700; line-height: 1.1; }
.right { text-align: right; }
.chart { height: 200px; margin-top: 14px; }
.add { margin-top: 16px; }
.mv { font-size: 18px; font-weight: 600; }
.mc { min-width: 48px; text-align: right; }
.foot { margin: 8px 4px 0; }
.ph-head { align-items: flex-end; }
.ph-head .btn { margin-bottom: 4px; position: relative; overflow: hidden; }
.hidden-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ph { position: relative; aspect-ratio: 3 / 4; border-radius: 12px; overflow: hidden; background: var(--card); }
.ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph-date { position: absolute; left: 6px; bottom: 6px; padding: 2px 8px; border-radius: 10px; background: rgba(21, 32, 46, 0.7); color: #fff; font-weight: 600; }
.when { width: 70px; flex: 0 0 auto; }
.mt { margin-top: 18px; }
.mt-s { margin-top: 10px; }
.sec-row { align-items: flex-end; }
.sec-row .btn { margin-bottom: 4px; }
.comp-empty { width: 100%; text-align: left; gap: 12px; }
.comp { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cbox { background: var(--card); border-radius: var(--r-card); padding: 14px 16px; min-width: 0; }
.cv { font-size: 28px; font-weight: 700; line-height: 1.15; }
.cu { font-size: 16px; font-weight: 600; color: var(--ink-2); margin-left: 4px; }
.goals-link { margin-top: 6px; }
.chart-mode { margin-top: 14px; }
.bf-in { text-align: left; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.mfield { display: flex; flex-direction: column; gap: 4px; }
.mfield .field { text-align: center; font-size: 18px; }
.preview { width: 100%; max-height: 40vh; object-fit: contain; border-radius: 12px; background: var(--card-2); }
.viewer { display: grid; gap: 8px; }
.viewer.two { grid-template-columns: 1fr 1fr; }
.viewer figure { margin: 0; text-align: center; }
.viewer img { width: 100%; max-height: 60vh; object-fit: contain; border-radius: 12px; background: var(--card-2); }
.cmp { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
</style>
