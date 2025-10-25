<script setup lang="ts">
import { computed } from 'vue'
import { useSessionsStore } from '../stores/sessions'
import { useDiscomfortStore } from '../stores/discomfort'
import { useSettingsStore } from '../stores/settings'
import { formatMinutesToClock } from '../utils/format'

const sessionsStore = useSessionsStore()
const discomfortStore = useDiscomfortStore()
const settingsStore = useSettingsStore()

const completedSessions = computed(() =>
  [...sessionsStore.sessions]
    .filter((session) => session.completed)
    .sort((a, b) => (b.endEpoch ?? 0) - (a.endEpoch ?? 0)),
)

const weeklyData = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const result: { label: string; minutes: number }[] = []
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(today)
    day.setDate(today.getDate() - i)
    const key = day.toDateString()
    const minutes = completedSessions.value.reduce((sum, session) => {
      if (!session.endEpoch) return sum
      const sessionDay = new Date(session.endEpoch)
      sessionDay.setHours(0, 0, 0, 0)
      if (sessionDay.toDateString() === key) {
        return sum + Math.round(session.durationSec / 60)
      }
      return sum
    }, 0)
    result.push({ label: `${day.getMonth() + 1}/${day.getDate()}`, minutes })
  }
  return result
})

const maxWeeklyMinutes = computed(() =>
  weeklyData.value.reduce((max, item) => Math.max(max, item.minutes), 0) || 1,
)

const ioRatio = computed(() => {
  let input = 0
  let output = 0
  completedSessions.value.forEach((session) => {
    const minutes = Math.round(session.durationSec / 60)
    if (session.type === 'input') input += minutes
    else output += minutes
  })
  const ratio = output === 0 ? (input === 0 ? 1 : Infinity) : input / output
  return {
    input,
    output,
    text: output === 0 ? (input === 0 ? '1.0' : '∞') : ratio.toFixed(2),
  }
})

const tenRuleCount = computed(() =>
  sessionsStore.sessions.reduce((sum, session) => sum + session.urgeDelays, 0),
)

const discomfortCount = computed(() =>
  sessionsStore.sessions.reduce((sum, session) => sum + session.discomforts.length, 0),
)

const recentSessions = computed(() => completedSessions.value.slice(0, 10))

const discomfortHistory = computed(() =>
  discomfortStore.executedLog.slice(-10).map((entry) => {
    const label = resolveStrategyLabel(entry.category, entry.id)
    return {
      ...entry,
      label,
    }
  }),
)

function resolveStrategyLabel(
  category: 'physical' | 'cognitive' | 'emotional',
  id: string,
) {
  const list = settingsStore.settings.strategies[category]
  const item = list.find((strategy) => strategy.id === id)
  return item ? item.label : id
}
</script>

<template>
  <div class="log">
    <header class="log__header">
      <h1>记录</h1>
      <p class="log__subtitle">回看有效分钟、输入输出比，以及三问产出</p>
    </header>

    <section class="log__grid">
      <article class="log__card log__card--chart">
        <header>
          <h2>本周有效分钟</h2>
          <span>{{ formatMinutesToClock(weeklyData.reduce((s, d) => s + d.minutes, 0)) }}</span>
        </header>
        <div class="log__bars">
          <div v-for="day in weeklyData" :key="day.label" class="log__bar">
            <div
              class="log__bar-fill"
              :style="{ height: `${(day.minutes / maxWeeklyMinutes) * 100}%` }"
            ></div>
            <span class="log__bar-label">{{ day.label }}</span>
            <span class="log__bar-value">{{ day.minutes }}</span>
          </div>
        </div>
      </article>

      <article class="log__card log__card--stat">
        <header>
          <h2>输入 / 输出比</h2>
        </header>
        <div class="log__ratio">
          <span class="log__ratio-value">{{ ioRatio.text }}</span>
          <p>输入 {{ ioRatio.input }} 分 · 输出 {{ ioRatio.output }} 分</p>
        </div>
      </article>

      <article class="log__card log__card--stat">
        <header>
          <h2>10 分钟法则</h2>
        </header>
        <div class="log__stat-number">{{ tenRuleCount }}</div>
        <p class="log__stat-desc">记录“先缓冲”共 {{ tenRuleCount }} 次</p>
      </article>

      <article class="log__card log__card--stat">
        <header>
          <h2>不适被处理</h2>
        </header>
        <div class="log__stat-number">{{ discomfortCount }}</div>
        <p class="log__stat-desc">三类不适策略共执行 {{ discomfortCount }} 次</p>
      </article>
    </section>

    <section v-if="discomfortHistory.length" class="log__discomfort">
      <h2>不适处方日志</h2>
      <ul>
        <li v-for="entry in discomfortHistory" :key="entry.at + entry.id">
          <span>{{ entry.label }}</span>
          <span>{{ entry.category === 'physical' ? '物理' : entry.category === 'cognitive' ? '认知' : '情绪' }}</span>
          <time>{{ new Date(entry.at).toLocaleString() }}</time>
        </li>
      </ul>
    </section>

    <section class="log__sessions">
      <header class="log__sessions-header">
        <h2>会话回顾</h2>
        <span>{{ completedSessions.length }} 次完成</span>
      </header>

      <p v-if="!recentSessions.length" class="log__empty">还没有完成的会话，专注一次试试。</p>

      <div v-else class="log__session-list">
        <article v-for="session in recentSessions" :key="session.id" class="log__session">
          <header>
            <strong>{{ session.type === 'input' ? '输入' : '输出' }}</strong>
            <span>{{ session.endEpoch ? new Date(session.endEpoch).toLocaleString() : '进行中' }}</span>
            <span>{{ Math.round(session.durationSec / 60) }} 分钟</span>
          </header>
          <dl>
            <div>
              <dt>我学到了</dt>
              <dd>{{ session.notes.learned || '—' }}</dd>
            </div>
            <div>
              <dt>我卡在哪</dt>
              <dd>{{ session.notes.stuck || '—' }}</dd>
            </div>
            <div>
              <dt>下一步</dt>
              <dd>{{ session.notes.next || '—' }}</dd>
            </div>
          </dl>
          <ul v-if="session.minOutputAssets?.length" class="log__assets">
            <li v-for="asset in session.minOutputAssets" :key="asset">
              <a :href="asset" target="_blank" rel="noopener">{{ asset }}</a>
            </li>
          </ul>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.log {
  padding: 24px 20px 80px;
  display: grid;
  gap: 24px;
}

.log__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log__subtitle {
  margin: 0;
  color: var(--text-muted);
}

.log__grid {
  display: grid;
  gap: 16px;
}

@media (min-width: 768px) {
  .log__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.log__card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  padding: 20px;
  display: grid;
  gap: 16px;
}

.log__card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log__card--chart {
  grid-column: span 2;
}

.log__bars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
  height: 180px;
}

.log__bar {
  display: grid;
  gap: 6px;
  justify-items: center;
}

.log__bar-fill {
  width: 100%;
  border-radius: 12px 12px 4px 4px;
  background: var(--color-primary);
  transition: height 160ms ease-out;
}

.log__bar-label {
  font-size: 12px;
  color: var(--text-muted);
}

.log__bar-value {
  font-size: 12px;
  font-weight: 600;
}

.log__ratio {
  display: grid;
  gap: 8px;
  text-align: center;
}

.log__ratio-value {
  font-size: 32px;
  font-weight: 700;
}

.log__stat-number {
  font-size: 36px;
  font-weight: 700;
}

.log__stat-desc {
  margin: 0;
  color: var(--text-muted);
}

.log__sessions {
  display: grid;
  gap: 16px;
}

.log__sessions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log__empty {
  margin: 0;
  color: var(--text-muted);
}

.log__session-list {
  display: grid;
  gap: 16px;
}

.log__discomfort {
  display: grid;
  gap: 12px;
}

.log__discomfort ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.log__discomfort li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  font-size: 13px;
}

.log__session {
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  background: #fff;
  padding: 16px;
  display: grid;
  gap: 12px;
}

.log__session header {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
}

.log__session dl {
  display: grid;
  gap: 12px;
  margin: 0;
}

.log__session dt {
  font-size: 12px;
  color: var(--text-muted);
}

.log__session dd {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
}

.log__assets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.log__assets a {
  color: var(--color-primary);
  word-break: break-all;
}

@media (min-width: 1025px) {
  .log {
    padding: 32px 32px 64px;
  }
}
</style>
