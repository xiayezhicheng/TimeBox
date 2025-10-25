import { reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { Session, Stats } from '../types/models'
import { loadStats, saveStats } from '../services/storage'

export const useStatsStore = defineStore('stats', () => {
  const ready = ref(false)
  const stats = reactive<Stats>({
    effectiveMinutes7d: Array.from({ length: 7 }, () => 0),
    ioRatio: 1,
    discomfortHandledCount: 0,
    streakDays: 0,
    tenMinRuleCount: 0,
  })

  async function bootstrap() {
    if (ready.value) return
    Object.assign(stats, await loadStats())
    ready.value = true
  }

  watch(
    () => ({ ...stats }),
    async () => {
      if (!ready.value) return
      await saveStats(stats)
    },
    { deep: true },
  )

  function recordEffectiveMinutes(minutes: number) {
    stats.effectiveMinutes7d.shift()
    stats.effectiveMinutes7d.push(minutes)
  }

  function recordIORatio(inputMinutes: number, outputMinutes: number) {
    if (outputMinutes === 0) {
      stats.ioRatio = inputMinutes === 0 ? 1 : Infinity
      return
    }
    stats.ioRatio = Number((inputMinutes / outputMinutes).toFixed(2))
  }

  function incrementDiscomfortHandled() {
    stats.discomfortHandledCount += 1
  }

  function incrementTenMinRule() {
    stats.tenMinRuleCount += 1
  }

  function updateStreak(currentStreak: number) {
    stats.streakDays = currentStreak
  }

  function recalculateFromSessions(sessions: Session[]) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const last7: number[] = []
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today)
      day.setDate(today.getDate() - i)
      const key = day.toDateString()
      const minutes = sessions.reduce((sum, session) => {
        if (!session.completed || !session.endEpoch) return sum
        const sessionDay = new Date(session.endEpoch)
        sessionDay.setHours(0, 0, 0, 0)
        if (sessionDay.toDateString() === key) {
          return sum + Math.round(session.durationSec / 60)
        }
        return sum
      }, 0)
      last7.push(minutes)
    }
    stats.effectiveMinutes7d = last7

    const total = sessions.reduce(
      (acc, session) => {
        if (!session.completed) return acc
        const minutes = Math.round(session.durationSec / 60)
        if (session.type === 'input') acc.input += minutes
        else acc.output += minutes
        acc.ten += session.urgeDelays
        acc.discomfort += session.discomforts.length
        return acc
      },
      { input: 0, output: 0, ten: 0, discomfort: 0 },
    )

    stats.ioRatio = total.output === 0 ? (total.input === 0 ? 1 : Infinity) : Number((total.input / total.output).toFixed(2))
    stats.tenMinRuleCount = total.ten
    stats.discomfortHandledCount = total.discomfort

    let streak = 0
    for (let i = 0; i < 365; i += 1) {
      const day = new Date(today)
      day.setDate(today.getDate() - i)
      const hasSession = sessions.some((session) => {
        if (!session.completed || !session.endEpoch) return false
        const sessionDay = new Date(session.endEpoch)
        sessionDay.setHours(0, 0, 0, 0)
        return sessionDay.getTime() === day.getTime()
      })
      if (hasSession) {
        streak += 1
      } else {
        break
      }
    }
    stats.streakDays = streak
  }

  return {
    ready,
    stats,
    bootstrap,
    recordEffectiveMinutes,
    recordIORatio,
    incrementDiscomfortHandled,
    incrementTenMinRule,
    updateStreak,
    recalculateFromSessions,
  }
})
