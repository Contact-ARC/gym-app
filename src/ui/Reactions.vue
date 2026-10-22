<template>
  <div class="reacts" role="group" :aria-label="t('Reactions')">
    <button
      v-for="r in REACTIONS" :key="r.kind" class="react" :class="{ on: mine === r.kind, has: count(r.kind) > 0 }"
      :disabled="own" :aria-pressed="mine === r.kind" :aria-label="t(LABELS[r.kind])"
      @click.stop="onReact(r.kind)"
    >
      <span class="emo">{{ r.emoji }}</span><span v-if="count(r.kind)" class="t-num n">{{ count(r.kind) }}</span>
    </button>
    <slot />
  </div>
  <p v-if="names" class="t-tiny t-muted names truncate">{{ names }}</p>
</template>

<script setup>
import { computed } from 'vue'
import { REACTIONS, reactionKind, react, me, memberName } from '../lib/crew.js'
import { tap } from '../lib/native.js'
import { t } from '../i18n/index.js'

const props = defineProps({ event: { type: Object, required: true } })
const LABELS = { clap: 'High five', fire: 'Fire', strong: 'Strong', laugh: 'Funny' }

const own = computed(() => props.event.member_id === me.value)
const list = computed(() => Object.entries(props.event.reactions || {}).map(([id, v]) => [id, reactionKind(v)]))
const mine = computed(() => list.value.find(([id]) => id === me.value)?.[1] || null)
const count = (kind) => list.value.filter(([, k]) => k === kind).length
const names = computed(() => {
  if (!list.value.length) return ''
  const emoji = Object.fromEntries(REACTIONS.map(r => [r.kind, r.emoji]))
  return list.value.map(([id, k]) => `${emoji[k] || '👏'} ${memberName(id)}`).join('  ')
})
function onReact (kind) {
  tap()
  react(props.event.id, kind)
}
</script>

<style scoped>
.reacts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.react {
  display: inline-flex; align-items: center; gap: 4px; min-height: 36px; min-width: 44px; padding: 0 10px;
  border-radius: 18px; background: var(--card-2); color: var(--ink-2); font-weight: 700; justify-content: center;
}
.react .emo { font-size: 17px; line-height: 1; filter: grayscale(0.6); opacity: 0.75; }
.react.has .emo, .react.on .emo { filter: none; opacity: 1; }
.react.on { background: var(--warn-soft); color: var(--warn); box-shadow: inset 0 0 0 1.5px var(--warn); }
.react:disabled { cursor: default; }
.react:not(:disabled):active { transform: scale(0.94); }
.n { font-size: 14px; }
.names { margin-top: 6px; }
</style>
