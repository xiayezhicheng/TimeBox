import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { StrategyAction } from '../types/models'
import { useSettingsStore } from './settings'
import { useStatsStore } from './stats'
import { useSessionsStore } from './sessions'

type CategoryKey = 'physical' | 'cognitive' | 'emotional'

const categoryMeta: { id: CategoryKey; label: string }[] = [
  { id: 'physical', label: '物理不适' },
  { id: 'cognitive', label: '认知不适' },
  { id: 'emotional', label: '情绪不适' },
]

export const useDiscomfortStore = defineStore('discomfort', () => {
  const settings = useSettingsStore()
  const stats = useStatsStore()
  const sessions = useSessionsStore()

  const activeCategory = ref<CategoryKey>('physical')
  const selected = ref<string[]>([])
  const executedLog = ref<{ id: string; at: string; category: CategoryKey }[]>([])
  const lastAction = ref<{ strategy: StrategyAction; category: CategoryKey; at: number } | null>(null)

  const categories = categoryMeta

  const availableStrategies = computed(() => settings.enabledStrategies)

  async function bootstrap() {
    // reserved for future async work (e.g., worker registration)
    return Promise.resolve()
  }

  function setCategory(category: CategoryKey) {
    activeCategory.value = category
    selected.value = []
  }

  function toggleStrategy(id: string) {
    const idx = selected.value.indexOf(id)
    if (idx === -1) selected.value.push(id)
    else selected.value.splice(idx, 1)
  }

  function runStrategy(id: string) {
    const strategy = findStrategy(activeCategory.value, id)
    if (!strategy) return
    executeStrategy(strategy, activeCategory.value)
  }

  function findStrategy(category: CategoryKey, id: string): StrategyAction | undefined {
    return availableStrategies.value[category].find((item) => item.id === id)
  }

  function executeStrategy(strategy: StrategyAction, category: CategoryKey) {
    stats.incrementDiscomfortHandled()
    executedLog.value.push({ id: strategy.id, category, at: new Date().toISOString() })
    sessions.appendDiscomfort(strategy.id)
    lastAction.value = { strategy, category, at: Date.now() }
    // Detailed actions handled later in focus workflow
  }

  return {
    categories,
    activeCategory,
    selected,
    executedLog,
    lastAction,
    availableStrategies,
    bootstrap,
    setCategory,
    toggleStrategy,
    runStrategy,
  }
})
