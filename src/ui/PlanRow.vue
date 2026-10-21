<template>
  <RouterLink :to="`/plan/${plan.id}`" class="group-row">
    <span class="mine-ic" :class="{ on: active }"><Icon name="mine" :size="22" /></span>
    <div class="grow">
      <div class="t-h3 truncate">{{ plan.name || t('Untitled') }}</div>
      <div class="t-small t-muted truncate">
        {{ planDaysLine(plan) }} · {{ planStatus(plan) }}<template v-if="active && plan.use.mode === 'replace'">{{ ', ' + t('instead of the routine') }}</template>
      </div>
    </div>
    <Icon name="chevronRight" class="chev" />
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import { isPlanActive } from '../store.js'
import { planStatus, planDaysLine } from '../lib/format.js'
import { t } from '../i18n/index.js'

const props = defineProps({ plan: { type: Object, required: true } })
const active = computed(() => isPlanActive(props.plan))
</script>

<style scoped>
.mine-ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--card-2); color: var(--ink-2); flex: 0 0 auto; }
.mine-ic.on { background: var(--info-soft); color: var(--info); }
</style>
