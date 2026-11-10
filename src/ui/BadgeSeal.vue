<template>
  <span class="seal" :class="{ on: earned, secret: hidden }" :style="{ width: size + 'px', height: size * 1.12 + 'px' }">
    <svg :viewBox="`0 0 100 112`" :width="size" :height="size * 1.12" aria-hidden="true">
      <defs v-if="earned">
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="tone.light" />
          <stop offset="1" :stop-color="tone.dark" />
        </linearGradient>
      </defs>
      <!-- Ribbon tails behind the seal -->
      <g v-if="earned" class="ribbon">
        <path d="M33 74 L24 108 L35 101 L42 109 L48 78 Z" :fill="ring" />
        <path d="M67 74 L76 108 L65 101 L58 109 L52 78 Z" :fill="ring" />
      </g>
      <!-- The zigzag seal: dotted outline until earned -->
      <polygon
        :points="points" class="edge"
        :fill="earned ? `url(#${gid})` : 'none'"
        :stroke="earned ? ring : 'currentColor'"
        :stroke-width="earned ? 3.2 : 2.4"
        :stroke-dasharray="earned ? null : '0.1 4.2'"
        stroke-linecap="round" stroke-linejoin="round"
      />
      <circle v-if="earned" cx="50" cy="48" r="29" fill="rgba(255,255,255,0.16)" />
      <circle v-if="earned" cx="50" cy="48" r="29" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" />
      <path :d="iconPath" :fill="earned ? '#fff' : 'currentColor'" :opacity="earned ? 1 : 0.55" transform="translate(32 30) scale(1.5)" />
      <!-- Tier pips: how far up the levels this badge is -->
      <g v-if="pips">
        <circle
          v-for="i in pips" :key="i" :cx="50 + (i - (pips + 1) / 2) * 7" cy="81" r="2.6"
          :fill="i <= level ? (earned ? '#fff' : 'currentColor') : 'none'"
          :stroke="earned ? '#fff' : 'currentColor'" stroke-width="1.2" :opacity="earned ? 0.95 : 0.5"
        />
      </g>
    </svg>
    <span v-if="badge.kind === 'feat' && count > 1 && showCount" class="times t-num">×{{ count }}</span>
  </span>
</template>

<script setup>
// One badge, drawn as a seal with a zigzag edge.
//   Not earned: a dotted zigzag outline and a faded icon.
//   Earned: filled in its group's colour, with a ribbon and an edge in its tier's colour (Bronze → Diamond).
//   Feats earned more than once get a ×N chip.
import { computed } from 'vue'
import * as icons from './icons.js'
import { BADGE_BY_ID } from '../lib/badges.js'
import { GROUP_TONE, TIER_COLOR } from './badgeUi.js'

const props = defineProps({
  id: { type: String, required: true },
  level: { type: Number, default: 0 },
  count: { type: Number, default: 0 },
  size: { type: Number, default: 64 },
  showCount: { type: Boolean, default: true },
  levels: { type: Number, default: null } // how many tiers (for the pips); from the badge if not given
})

let n = 0
const gid = `seal-g-${Date.now().toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const badge = computed(() => BADGE_BY_ID[props.id] || { group: 'milestones', icon: 'medal', kind: 'level', levels: [1] })
const earned = computed(() => props.level > 0 || props.count > 0)
const hidden = computed(() => badge.value.secret && !earned.value)
const tone = computed(() => GROUP_TONE[badge.value.group] || GROUP_TONE.milestones)
const tiers = computed(() => props.levels ?? (typeof badge.value.levels === 'function' ? 5 : (badge.value.levels?.length || 0)))
const pips = computed(() => (badge.value.kind === 'level' && tiers.value > 1 ? tiers.value : 0))
// The edge and ribbon: the tier you're at (single-step badges and feats use the group's dark tone)
const ring = computed(() => (pips.value && props.level ? TIER_COLOR[Math.min(props.level, 5) - 1] : tone.value.edge))
const iconPath = computed(() => icons[hidden.value ? 'help' : badge.value.icon] || icons.medal)

// 18 points around (50, 48), alternating long and short
const points = (() => {
  const out = []
  const N = 18
  for (let i = 0; i < N * 2; i++) {
    const a = (Math.PI * i) / N - Math.PI / 2
    const r = i % 2 ? 40 : 46
    out.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(48 + r * Math.sin(a)).toFixed(2)}`)
  }
  return out.join(' ')
})()
</script>

<style scoped>
.seal { position: relative; display: inline-block; flex: 0 0 auto; color: var(--ink-3); line-height: 0; }
.seal svg { display: block; overflow: visible; }
.seal.on .edge { filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.18)); }
.times {
  position: absolute; right: -4px; bottom: 10%; line-height: 1;
  padding: 3px 6px; border-radius: 10px; font-size: 12px; font-weight: 700;
  background: var(--ink); color: var(--paper); box-shadow: 0 0 0 2px var(--paper);
}
</style>
