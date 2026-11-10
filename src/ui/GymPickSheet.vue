<template>
  <Sheet :model-value="modelValue" :title="t('Where are you training?')" @update:model-value="(v) => emit('update:modelValue', v)">
    <div class="group radios" role="radiogroup" :aria-label="t('Gym')">
      <button
        v-for="g in gyms" :key="g.id" class="group-row radio-row" role="radio" :aria-checked="g.id === selected"
        @click="pick(g)"
      >
        <Icon name="place" class="t-muted" />
        <span class="grow">{{ gymName(g) }}</span>
        <Icon v-if="g.id === selected" name="checkBold" :size="20" />
      </button>
    </div>
    <p class="t-tiny t-muted note">{{ live ? t('Switches the equipment, plates and machine settings to that gym. Machines use what you did there.') : t('Only changes where this workout counts as done.') }}</p>
  </Sheet>
</template>

<script setup>
// Pick the gym for a workout: the one you're in (switches the gym you're at) or a finished one (relabels it).
import { computed } from 'vue'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import { toast } from './toast.js'
import { state, getSession, setSessionGym } from '../store.js'
import { activeGyms, gymName, sessionGymId } from '../lib/climbing.js'
import { t } from '../i18n/index.js'

const props = defineProps({ modelValue: Boolean, sessionId: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])
const session = computed(() => getSession(props.sessionId))
const gyms = computed(() => activeGyms(state.data.settings))
const selected = computed(() => sessionGymId(session.value, state.data.settings))
const live = computed(() => !!session.value && !session.value.finishedAt)
function pick (g) {
  emit('update:modelValue', false)
  if (g.id === selected.value) return
  setSessionGym(props.sessionId, g.id)
  toast(live.value ? t('At {gym}', { gym: gymName(g) }) : t('Moved to {gym}', { gym: gymName(g) }))
}
</script>

<style scoped>
.radios { background: var(--card-2); }
.radio-row { min-height: 54px; text-align: left; gap: 12px; }
.note { margin: 10px 4px 0; }
</style>
