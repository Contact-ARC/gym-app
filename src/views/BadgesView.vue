<template>
  <div class="page">
    <div class="topbar">
      <button class="icon-btn" :aria-label="t('Back')" @click="back"><Icon name="back" /></button>
    </div>
    <h1 class="t-title">{{ isMe ? t('Badges') : t("{name}'s badges", { name: memberName }) }}</h1>

    <p v-if="!st" class="card card-pad t-small t-muted">{{ t('{name} needs to update the app to show badges here.', { name: memberName }) }}</p>
    <template v-else>
      <!-- Tally and the three pinned -->
      <div class="card card-pad top">
        <div class="row tally">
          <span class="t-num big">{{ tally.earned }}</span>
          <span class="t-small t-muted grow">{{ t('of {n} badges earned', { n: tally.of }) }}</span>
        </div>
        <div class="bar"><div :style="{ width: Math.round((tally.earned / Math.max(1, tally.of)) * 100) + '%' }" /></div>
        <div class="show">
          <template v-for="i in 3" :key="i">
            <button v-if="pins[i - 1]" class="slot" :aria-label="badgeTitle(pins[i - 1], st[pins[i - 1]].level, st[pins[i - 1]].count, t, unit)" @click="open(pins[i - 1])">
              <BadgeSeal :id="pins[i - 1]" :level="st[pins[i - 1]].level" :count="st[pins[i - 1]].count" :size="58" />
            </button>
            <span v-else class="slot empty" />
          </template>
          <span class="t-tiny t-muted show-hint">{{ isMe ? t('Pin up to 3 from a badge to show them on your profile and the crew board.') : t('Pinned') }}</span>
        </div>
      </div>

      <!-- Close to the next one: the nearest levels you haven't got yet -->
      <template v-if="isMe && close.length">
        <h2 class="section-h">{{ t('Almost there') }}</h2>
        <div class="group">
          <button v-for="c in close" :key="c.id" class="group-row near" @click="open(c.id)">
            <BadgeSeal :id="c.id" :level="st[c.id].level" :count="st[c.id].count" :size="40" />
            <span class="grow">
              <span class="t-h3 truncate">{{ badgeName(c.id) }}<span class="t-muted"> · {{ tierLabel(c.id, st[c.id].level + 1) }}</span></span>
              <span class="bar sm"><span :style="{ width: Math.round(c.pct * 100) + '%' }" /></span>
            </span>
            <span class="t-small t-num t-muted">{{ c.text }}</span>
          </button>
        </div>
      </template>

      <section v-for="g in wall" :key="g.group">
        <h2 class="section-h">{{ groupName(g.group) }}</h2>
        <div class="grid">
          <button v-for="{ badge, st: s } in g.items" :key="badge.id" class="tile" :class="{ on: s.level || s.count }" @click="open(badge.id)">
            <BadgeSeal :id="badge.id" :level="s.level" :count="s.count" :size="64" />
            <span class="t-small name">{{ badge.secret && !(s.level || s.count) ? '???' : badgeName(badge.id) }}</span>
            <span v-if="badge.kind === 'level' && !(badge.secret && !s.level)" class="t-tiny t-muted sub t-num">
              <template v-if="s.next == null && s.level">{{ tierLabel(badge.id, s.level) }}</template>
              <template v-else>
                <span class="bar sm"><span :style="{ width: Math.round(badgeProgress(badge.id, s, unit).pct * 100) + '%' }" /></span>
              </template>
            </span>
            <span v-else-if="s.count === 1" class="t-tiny t-muted sub">{{ t('Earned') }}</span>
          </button>
        </div>
      </section>
    </template>

    <BadgeSheet v-model="sheetOpen" :id="sheetId" :st="st?.[sheetId] || undefined" :unit="unit" :is-me="isMe" :week-target="weekTarget" />
  </div>
</template>

<script setup>
// Your badges (or a crew member's with /badges/<id>): the tally and pinned ones, the nearest next levels,
// then every badge by group. Not earned yet: a dotted outline with how far along you are.
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../ui/Icon.vue'
import BadgeSeal from '../ui/BadgeSeal.vue'
import BadgeSheet from '../ui/BadgeSheet.vue'
import { state, weeklyMin, days } from '../store.js'
import { badgeWall, badgeTally, levelsOf, BADGE_BY_ID } from '../lib/badges.js'
import { myBadges, showcase } from '../lib/myBadges.js'
import { board, me, memberById, inCrew, refreshBoard } from '../lib/crew.js'
import { memberBadges } from '../ui/crewUi.js'
import { badgeName, badgeTitle, badgeProgress, groupName, tierName } from '../ui/badgeUi.js'
import { t } from '../i18n/index.js'

const route = useRoute()
const router = useRouter()
const who = computed(() => route.params.member || null)
const isMe = computed(() => !who.value || who.value === me.value)
const member = computed(() => (who.value ? memberById.value[who.value] : null))
const memberName = computed(() => member.value?.name || '')
const unit = computed(() => (isMe.value ? state.data.profile.unit : member.value?.stats?.pl?.unit || member.value?.stats?.month?.unit || 'kg'))
const st = computed(() => (isMe.value ? myBadges() : memberBadges(who.value)))
const weekTarget = computed(() => (state.data.goals.some(g => g.type === 'weekly' && !g.archived) ? weeklyMin.value : Math.min(6, Math.max(2, days.value.length || 3))))
const wall = computed(() => badgeWall(st.value))
const tally = computed(() => badgeTally(st.value))
const pins = computed(() => (isMe.value ? showcase() : (member.value?.stats?.showcase || []).filter(id => BADGE_BY_ID[id] && st.value?.[id])))

// The three nearest next levels (at least a quarter of the way there)
const close = computed(() => {
  if (!st.value) return []
  return Object.entries(st.value)
    .filter(([id, s]) => BADGE_BY_ID[id]?.kind === 'level' && s.next != null && s.value != null)
    .map(([id, s]) => ({ id, ...badgeProgress(id, s, unit.value) }))
    .filter(c => c.pct >= 0.25 && c.pct < 1)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)
})
const tierLabel = (id, level) => (levelsOf(BADGE_BY_ID[id], unit.value).length > 1 ? tierName(level) : t('Earned'))

const sheetOpen = ref(false)
const sheetId = ref('')
function open (id) { sheetId.value = id; sheetOpen.value = true }

onMounted(() => { if (inCrew.value && !board.fetchedAt) refreshBoard() })
function back () {
  if (window.history.state?.back) router.back()
  else router.replace(isMe.value ? '/progress' : '/crew')
}
</script>

<style scoped>
.top { display: grid; gap: 10px; margin-top: 10px; }
.tally { align-items: baseline; gap: 8px; }
.big { font-size: 34px; font-weight: 700; font-family: var(--font-num); }
.bar { display: block; height: 8px; border-radius: 4px; background: var(--card-2); overflow: hidden; }
.bar > div, .bar > span { display: block; height: 100%; border-radius: 4px; background: var(--ok); }
.bar.sm { height: 5px; width: 100%; margin-top: 6px; }
.show { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.slot { width: 58px; height: 65px; display: grid; place-items: center; flex: 0 0 auto; }
.slot.empty { border: 2px dotted var(--line); border-radius: 50%; width: 52px; height: 52px; }
.show-hint { flex: 1; min-width: 0; }
.near { gap: 12px; text-align: left; min-height: 64px; }
.near .grow { display: grid; min-width: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.tile { display: grid; justify-items: center; align-content: start; gap: 4px; padding: 12px 4px 10px; border-radius: 16px; text-align: center; min-height: 140px; }
.tile:active { background: var(--press); }
.tile.on { background: var(--card); }
.tile .name { font-weight: 600; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tile .sub { width: 72%; }
.tile:not(.on) .name { color: var(--ink-2); }
</style>
