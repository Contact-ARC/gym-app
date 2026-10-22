<template>
  <article class="card post" :class="{ tappable: !full }" @click="open">
    <div class="row post-head">
      <span class="avatar" :style="avatarStyle(event.member_id)">{{ initial(event.member_id) }}</span>
      <div class="grow">
        <div class="t-small"><b>{{ memberName(event.member_id) }}</b> {{ action }}</div>
        <div class="t-tiny t-muted">{{ relativeDay(p.startedAt || event.created_at) }}</div>
      </div>
      <PlateBadge v-if="event.kind === 'workout' && p.day" :index="plateIndex(p.day)" :label="p.day === 'free' ? '+' : p.day" size="sm" />
      <span v-else-if="event.kind === 'badge'" class="kind-ic badge-ic"><Icon name="medal" :size="20" /></span>
      <span v-else-if="event.kind === 'crewChallenge'" class="kind-ic" :class="p.done || p.kind === 'versus' ? 'ok-ic' : 'muted-ic'"><Icon :name="p.kind === 'versus' ? 'versus' : 'finish'" :size="20" /></span>
      <span v-else class="kind-ic ok-ic"><Icon name="trophy" :size="20" /></span>
    </div>

    <template v-if="event.kind === 'workout'">
      <div class="t-h3 post-title">{{ sessionTitle({ dayName: p.dayName, dayNameEs: p.dayNameEs, dayId: p.day }) }}</div>
      <div class="t-small t-muted t-num">
        {{ t('{n} min', { n: fmtMins(p.minutes) }) }} · {{ tn(p.sets, '{n} set', '{n} sets') }}<template v-if="p.volume"> · {{ fmtNum(volume, 0) }} {{ unit }}</template>
      </div>
      <ul v-if="p.prs?.length" class="prs">
        <li v-for="r in p.prs" :key="r.exerciseId + r.type" class="t-small">
          <Icon name="trophy" :size="16" class="gold" />
          <span><b>{{ exerciseName(r.exerciseId, r.name) }}</b> {{ prText(r, r.unit).main }}</span>
        </li>
      </ul>
      <p v-if="!full && p.detail?.length" class="t-tiny t-muted more">{{ exList }}</p>
    </template>
    <div v-else-if="event.kind === 'badge'" class="t-h3 post-title">{{ badgeName(p) }}</div>
    <template v-else-if="event.kind === 'crewChallenge'">
      <div class="t-h3 post-title">{{ p.title }}</div>
      <div class="t-small t-muted">{{ challengeResult }}</div>
    </template>
    <div v-else class="t-h3 post-title">{{ tx(p, 'title') }}</div>

    <div class="post-foot">
      <Reactions :event="event">
        <button v-if="!full" class="react cm" :aria-label="t('Comments')" @click.stop="open">
          <Icon name="comment" :size="18" /><span v-if="event.comments" class="t-num">{{ event.comments }}</span>
        </button>
      </Reactions>
      <button v-if="!full && event.last_comment" class="last t-small truncate" @click.stop="open">
        <b>{{ memberName(event.last_comment.member_id) }}</b> {{ event.last_comment.body }}
      </button>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import PlateBadge from './PlateBadge.vue'
import Reactions from './Reactions.vue'
import { avatarStyle, initial, plateIndex, badgeName } from './crewUi.js'
import { memberName, exerciseName } from '../lib/crew.js'
import { state } from '../store.js'
import { convertLoad } from '../lib/training.js'
import { relativeDay, fmtNum, fmtMins, prText, sessionTitle } from '../lib/format.js'
import { t, tn, tx } from '../i18n/index.js'

const props = defineProps({
  event: { type: Object, required: true },
  full: Boolean // on the post's own page: no "open" behaviour, no comment preview
})
const router = useRouter()
const p = computed(() => props.event.payload || {})
const unit = computed(() => state.data.profile.unit)
const volume = computed(() => Math.round(convertLoad(p.value.volume || 0, p.value.unit || unit.value, unit.value)))

const action = computed(() => ({
  workout: t('finished a workout'),
  challenge: t('completed the challenge'),
  badge: t('earned a badge'),
  crewChallenge: p.value.kind === 'versus' ? t('won a crew challenge') : t('crew challenge over')
})[props.event.kind] || '')

const exList = computed(() => (p.value.detail || []).map(d => exerciseName(d.id, d.name, d.es?.name)).join(' · '))

const metricWord = (n) => {
  const m = p.value.metric
  if (m === 'volume') return `${fmtNum(Number(n) || 0, 0)} kg`
  return m === 'sets' ? tn(Number(n) || 0, '{n} set', '{n} sets') : tn(Number(n) || 0, '{n} workout', '{n} workouts')
}
const challengeResult = computed(() => {
  const c = p.value
  if (c.kind === 'together') {
    return c.done
      ? t('Done together: {total} of {target}', { total: metricWord(c.total), target: metricWord(c.target) })
      : t('Finished at {total} of {target}', { total: metricWord(c.total), target: metricWord(c.target) })
  }
  return c.winner ? t('{name} won with {v}', { name: memberName(c.winner), v: metricWord(c.best) }) : t('Nobody scored this time')
})

function open () {
  if (!props.full) router.push(`/crew/post/${props.event.id}`)
}
</script>

<style scoped>
.post { padding: 14px 16px; }
.post.tappable:active { background: var(--press); }
.post-head { gap: 10px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; flex: 0 0 auto; }
.kind-ic { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto; }
.ok-ic { background: var(--ok-soft); color: var(--ok); }
.badge-ic { background: var(--warn-soft); color: var(--warn); }
.muted-ic { background: var(--card-2); color: var(--ink-2); }
.post-title { margin-top: 10px; }
.prs { list-style: none; margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.prs li { display: flex; gap: 6px; align-items: flex-start; }
.gold { color: var(--warn); margin-top: 2px; flex: 0 0 auto; }
.more { margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.post-foot { margin-top: 12px; }
.react.cm {
  display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; margin-left: auto;
  border-radius: 18px; background: var(--card-2); color: var(--ink-2); font-weight: 700;
}
.last { display: block; width: 100%; text-align: left; margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: var(--card-2); color: var(--ink-2); }
.last b { color: var(--ink); }
</style>
