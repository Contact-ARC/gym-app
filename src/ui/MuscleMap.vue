<template>
  <figure class="mm" :aria-label="label">
    <svg viewBox="0 0 230 210" role="img">
      <g v-for="(fig, fi) in figures" :key="fig.name" :transform="`translate(${fi * 120 + 5}, 0)`">
        <!-- body silhouette -->
        <g class="skin">
          <circle cx="50" cy="15" r="11" />
          <rect x="45" y="24" width="10" height="9" rx="3" />
          <path d="M28 36 Q50 30 72 36 L70 100 Q50 106 30 100 Z" />
          <path d="M28 38 Q20 40 18 52 L13 106 Q15 112 20 110 L27 62 Z" />
          <path d="M72 38 Q80 40 82 52 L87 106 Q85 112 80 110 L73 62 Z" />
          <path d="M31 98 Q50 92 69 98 L67 150 L64 196 Q60 201 56 196 L52 112 L48 112 L44 196 Q40 201 36 196 L33 150 Z" />
        </g>
        <!-- muscles -->
        <g v-for="(m, mi) in fig.muscles" :key="mi" :class="cls(m.k)">
          <ellipse v-if="m.t === 'ellipse'" v-bind="m.a" />
          <path v-else v-bind="m.a" />
        </g>
        <text x="50" y="208" text-anchor="middle" class="cap">{{ t(fig.name) }}</text>
      </g>
    </svg>
  </figure>
</template>

<script setup>
import { computed } from 'vue'
import { muscleLabel } from '../lib/format.js'
import { t } from '../i18n/index.js'

const props = defineProps({
  primary: { type: Array, default: () => [] },
  secondary: { type: Array, default: () => [] }
})

const label = computed(() => {
  const p = props.primary.map(muscleLabel).join(', ')
  const s = props.secondary.map(muscleLabel).join(', ')
  return s ? t('Muscles worked: {p}. Also: {s}', { p, s }) : t('Muscles worked: {p}', { p })
})

function cls (k) {
  if (props.primary.includes(k)) return 'm prim'
  if (props.secondary.includes(k)) return 'm sec'
  return 'm'
}

// Helpers: ellipse, path, and left/right mirroring around x = 50
const E = (k, cx, cy, rx, ry, rot = 0) => ({ k, t: 'ellipse', a: { cx, cy, rx, ry, transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined } })
const P = (k, d) => ({ k, t: 'path', a: { d } })
const pair = (fn) => [fn(1), fn(-1)]
const mx = (x, s) => (s > 0 ? x : 100 - x)

const front = [
  P('traps', 'M44 32 Q50 34 56 32 L64 37 Q50 35 36 37 Z'),
  ...pair(s => E('front_delts', mx(31, s), 44, 7, 8, s * -15)),
  ...pair(s => E('side_delts', mx(25, s), 46, 3.5, 7, s * -10)),
  ...pair(s => P('chest', s > 0 ? 'M49 41 L49 60 Q40 63 34 56 Q33 46 38 41 Z' : 'M51 41 L51 60 Q60 63 66 56 Q67 46 62 41 Z')),
  ...pair(s => E('biceps', mx(23, s), 64, 4.5, 10, s * 8)),
  ...pair(s => E('forearms', mx(17.5, s), 88, 4, 12, s * 6)),
  P('abs', 'M43 63 Q50 61 57 63 L56 96 Q50 99 44 96 Z'),
  ...pair(s => P('obliques', s > 0 ? 'M35 64 L41 64 L42 95 L36 92 Q33 78 35 64 Z' : 'M65 64 L59 64 L58 95 L64 92 Q67 78 65 64 Z')),
  ...pair(s => E('quads', mx(41, s), 128, 8, 21, s * 4)),
  ...pair(s => E('adductors', mx(47.5, s), 118, 2.5, 10)),
  ...pair(s => E('calves', mx(40, s), 172, 4.5, 14, s * 3))
]

const back = [
  P('traps', 'M42 32 Q50 30 58 32 L66 38 L56 44 L50 62 L44 44 L34 38 Z'),
  ...pair(s => E('rear_delts', mx(31, s), 44, 7, 8, s * 15)),
  ...pair(s => E('side_delts', mx(25, s), 46, 3.5, 7, s * -10)),
  ...pair(s => P('upper_back', s > 0 ? 'M44 46 L49 62 L49 70 L40 66 Q37 54 44 46 Z' : 'M56 46 L51 62 L51 70 L60 66 Q63 54 56 46 Z')),
  ...pair(s => P('lats', s > 0 ? 'M38 56 Q34 70 36 86 L47 92 L48 74 L39 66 Z' : 'M62 56 Q66 70 64 86 L53 92 L52 74 L61 66 Z')),
  ...pair(s => E('triceps', mx(23, s), 63, 4.5, 10, s * 8)),
  ...pair(s => E('forearms', mx(17.5, s), 88, 4, 12, s * 6)),
  P('lower_back', 'M44 80 Q50 78 56 80 L56 97 Q50 99 44 97 Z'),
  ...pair(s => E('glutes', mx(42, s), 108, 8.5, 9)),
  ...pair(s => E('hamstrings', mx(41, s), 136, 7.5, 18, s * 3)),
  ...pair(s => E('adductors', mx(47.5, s), 124, 2.5, 8)),
  ...pair(s => E('calves', mx(40, s), 170, 6, 14, s * 3))
]

const figures = [{ name: 'body|Front', muscles: front }, { name: 'body|Back', muscles: back }]
</script>

<style scoped>
.mm { margin: 0; }
svg { width: 100%; height: auto; max-height: 260px; display: block; }
.skin > * { fill: var(--card-2); }
.m > * { fill: var(--line); stroke: var(--card); stroke-width: 0.8; }
.m.sec > * { fill: var(--plate-red); fill-opacity: 0.38; }
.m.prim > * { fill: var(--plate-red); }
.cap { font-size: 9px; font-weight: 600; fill: var(--ink-2); font-family: var(--font); }
</style>
