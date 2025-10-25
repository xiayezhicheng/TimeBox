<script setup lang="ts">
import { computed } from 'vue'
import FocusTimerCard from '../components/focus/FocusTimerCard.vue'
import { useStatsStore } from '../stores/stats'
import { useSettingsStore } from '../stores/settings'
import { formatDateTitle } from '../utils/datetime'
import SettingsShortcut from '../components/layout/SettingsShortcut.vue'

const statsStore = useStatsStore()
const settingsStore = useSettingsStore()

const today = computed(() => new Date())

const greeting = computed(() => {
  const hour = today.value.getHours()
  if (hour < 6) return '凌晨好'
  if (hour < 11) return '早上好'
  if (hour < 14) return '午安'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const todayMinutes = computed(() => {
  const sequence = statsStore.stats.effectiveMinutes7d
  return sequence.length ? sequence[sequence.length - 1] : 0
})
const goalMinutes = computed(() => settingsStore.settings.dailyGoalMin)
</script>

<template>
  <div class="focus">
    <header class="focus__header">
      <div class="focus__topline">
        <div>
          <p class="focus__date">{{ formatDateTitle(today) }}</p>
          <h1 class="focus__greeting">{{ greeting }}</h1>
        </div>
        <SettingsShortcut />
      </div>
      <div class="focus__stats">
        <span class="focus__stat">今日有效 {{ todayMinutes }} 分</span>
        <span class="focus__goal">目标 {{ goalMinutes }} 分</span>
      </div>
    </header>

    <FocusTimerCard class="focus__timer" />
  </div>
</template>

<style scoped>
.focus {
  padding: 24px 20px 40px;
  display: grid;
  gap: 24px;
}

.focus__header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.focus__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.focus__date {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.focus__greeting {
  margin: 0;
  font-size: clamp(20px, 6vw, 28px);
  font-weight: 700;
}

.focus__stats {
  display: flex;
  gap: 12px;
  font-size: 13px;
  opacity: 0.8;
}

.focus__stat {
  font-weight: 600;
}

.focus__goal {
  color: var(--text-muted);
}

.focus__timer {
  justify-self: center;
  width: min(420px, 100%);
}

@media (min-width: 1025px) {
  .focus {
    padding: 40px 48px;
    gap: 32px;
  }

  .focus__header {
    gap: 16px;
  }
}
</style>
