<template>
  <Sheet :model-value="modelValue" :title="hidden ? '???' : badgeName(id)" @update:model-value="(v) => emit('update:modelValue', v)">
    <div v-if="badge" class="bs">
      <div class="hero">
        <BadgeSeal :id="id" :level="st.level" :count="st.count" :size="112" />
        <div class="t-tiny t-muted up">{{ groupName(badge.group) }}</div>
        <div v-if="earned" class="t-h3">{{ badgeTitle(id, st.level, st.count, t, unit) }}</div>
        <div v-else class="t-small t-muted">{{ t('Not earned yet') }}</div>
      </div>

      <p class="how">{{ badgeHow(id, t, unit, { weekTarget, secretHidden: hidden }) }}</p>

      <!-- Where you are -->
      <div v-if="!hidden && badge.kind === 'level' && prog.text" class="prog">
        <div class="row t-small"><span class="grow t-muted">{{ isMe ? t('Your progress') : t('Their progress') }}</span><b class="t-num">{{ prog.text }}</b></div>
        <div class="bar"><div :style="{ width: Math.round(prog.pct * 100) + '%' }" /></div>
      </div>
      <div v-if="ladder.length > 1" class="group ladder">
        <div v-for="l in ladder" :key="l.level" class="group-row rung" :class="{ done: l.done }">
          <span class="dot" :style="{ background: l.done ? TIER_COLOR[l.level - 1] : 'transparent', borderColor: TIER_COLOR[l.level - 1] }" />
          <span class="grow">{{ l.label }}</span>
          <span class="t-small t-num" :class="l.done ? '' : 't-muted'">{{ l.at }}</span>
          <span class="t-tiny t-muted when">{{ l.date ? fmtDay(l.date) : '' }}</span>
        </div>
      </div>
      <div v-if="badge.kind === 'feat' && st.count" class="row t-small feat-line">
        <span class="grow">{{ tn(st.count, 'Earned once', 'Earned {n} times') }}</span>
        <span class="t-muted">{{ st.count > 1 ? t('first {a} · last {b}', { a: fmtDay(st.first), b: fmtDay(st.last) }) : fmtDay(st.first) }}</span>
      </div>
      <div v-else-if="badge.kind === 'level' && ladder.length === 1 && st.first" class="row t-small feat-line">
        <span class="grow">{{ t('Earned') }}</span><span class="t-muted">{{ fmtDay(st.first) }}</span>
      </div>

      <!-- The crew -->
      <template v-if="crew.counted > 1">
        <div class="label crew-h">{{ t('In your crew: {a} of {b}', { a: crew.holders.length, b: crew.counted }) }}</div>
        <div v-if="crew.holders.length" class="holders">
          <div v-for="h in crew.holders" :key="h.id" class="holder">
            <span class="av" :style="avatarStyle(h.id)">{{ initial(h.id) }}</span>
            <span class="grow truncate">{{ h.id === me ? t('You') : h.name }}<Icon v-if="first && first.id === h.id && crew.holders.length > 1" name="crown" :size="15" class="crown" /></span>
            <span class="t-small t-muted t-num">{{ badge.kind === 'feat' ? '×' + h.count : (ladder.length > 1 ? tierName(h.level) : '') }}</span>
          </div>
        </div>
        <p v-else class="t-small t-muted">{{ t('Nobody yet. Be the first.') }}</p>
        <p v-if="first && crew.holders.length > 1" class="t-tiny t-muted">{{ t('{name} got it first', { name: first.id === me ? t('You') : first.name }) }}</p>
      </template>
    </div>
    <template v-if="isMe && earned" #actions>
      <button class="btn btn-soft btn-lg btn-block" :disabled="!pinned && full" @click="togglePin">
        <Icon :name="pinned ? 'pinOff' : 'pin'" />{{ pinned ? t('Unpin from your profile') : full ? t('3 already pinned') : t('Pin to your profile') }}
      </button>
    </template>
  </Sheet>
</template>

<script setup>
// One badge up close: how to get it, its levels and when you reached them, and who in the crew has it.
import { computed } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import BadgeSeal from './BadgeSeal.vue'
import { toast } from './toast.js'
import { state, persist } from '../store.js'
import { BADGE_BY_ID } from '../lib/badges.js'
import { SHOWCASE_MAX } from '../lib/myBadges.js'
import { me } from '../lib/crew.js'
import { badgeName, badgeTitle, badgeHow, badgeProgress, badgeLadder, groupName, tierName, TIER_COLOR } from './badgeUi.js'
import { crewHolders, crewFirst, avatarStyle, initial } from './crewUi.js'
import { t, tn, locale } from '../i18n/index.js'

const props = defineProps({
  modelValue: Boolean,
  id: { type: String, default: '' },
  st: { type: Object, default: () => ({ level: 0, count: 0, value: 0 }) },
  unit: { type: String, default: 'kg' },
  isMe: { type: Boolean, default: true },
  weekTarget: { type: Number, default: 3 }
})
const emit = defineEmits(['update:modelValue'])
const badge = computed(() => BADGE_BY_ID[props.id])
const earned = computed(() => props.st.level > 0 || props.st.count > 0)
const hidden = computed(() => !!badge.value?.secret && !earned.value)
const prog = computed(() => badgeProgress(props.id, props.st, props.unit, t))
const ladder = computed(() => badgeLadder(props.id, props.st, props.unit, t))
const crew = computed(() => (props.id ? crewHolders(props.id) : { holders: [], counted: 0 }))
const first = computed(() => crewFirst(props.id))
const fmtDay = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '')

const pinned = computed(() => (state.data.badgeShowcase || []).includes(props.id))
const full = computed(() => (state.data.badgeShowcase || []).length >= SHOWCASE_MAX)
function togglePin () {
  const list = [...(state.data.badgeShowcase || [])]
  state.data.badgeShowcase = pinned.value ? list.filter(x => x !== props.id) : [...list, props.id].slice(0, SHOWCASE_MAX)
  persist()
  toast(pinned.value ? t('Pinned to your profile') : t('Unpinned'))
}
</script>

<style scoped>
.bs { display: grid; gap: 14px; }
.hero { display: grid; justify-items: center; gap: 6px; text-align: center; padding-top: 4px; }
.up { text-transform: uppercase; letter-spacing: 0.06em; }
.how { margin: 0; text-align: center; color: var(--ink-2); }
.prog { display: grid; gap: 6px; }
.bar { height: 8px; border-radius: 4px; background: var(--card-2); overflow: hidden; }
.bar > div { height: 100%; border-radius: 4px; background: var(--ok); transition: width 400ms ease; }
.ladder { background: var(--card-2); }
.rung { min-height: 44px; gap: 10px; }
.rung .dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid; flex: 0 0 auto; }
.rung .when { min-width: 74px; text-align: right; }
.feat-line { gap: 10px; padding: 0 4px; }
.crew-h { margin-top: 6px; }
.holders { display: grid; gap: 6px; }
.holder { display: flex; align-items: center; gap: 10px; min-height: 36px; }
.av { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px; flex: 0 0 auto; }
.crown { color: var(--warn); margin-left: 6px; vertical-align: -2px; }
</style>
