import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { Settings, StrategyAction, StrategyCollection } from '../types/models'
import { loadSettings, saveSettings } from '../services/storage'

function ensureStrategyDefaults(collection: StrategyCollection): StrategyCollection {
  const normalize = (entries?: StrategyAction[]) =>
    (entries ?? []).map((item) => {
      const normalized: StrategyAction = {
        ...item,
        description: item.description ?? '',
        enabled: item.enabled ?? true,
      }
      return normalized
    })
  return {
    physical: normalize(collection.physical),
    cognitive: normalize(collection.cognitive),
    emotional: normalize(collection.emotional),
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const ready = ref(false)
  const settings = reactive<Settings>({
    dailyGoalMin: 60,
    themeTags: ['Cursor'],
    fomoPolicy: 'blockOrLater',
    appearance: { theme: 'system' },
    strategies: { physical: [], cognitive: [], emotional: [] },
  })

  async function bootstrap() {
    if (ready.value) return
    const stored = await loadSettings()
    Object.assign(settings, {
      ...stored,
      strategies: ensureStrategyDefaults(stored.strategies),
    })
    applyTheme(settings.appearance.theme)
    ready.value = true
  }

  watch(
    settings,
    async () => {
      if (!ready.value) return
      await saveSettings(settings)
    },
    { deep: true },
  )

  const enabledStrategies = computed(() => {
    const entries = settings.strategies
    return {
      physical: entries.physical.filter((item) => item.enabled),
      cognitive: entries.cognitive.filter((item) => item.enabled),
      emotional: entries.emotional.filter((item) => item.enabled),
    }
  })

  function setTheme(theme: Settings['appearance']['theme']) {
    settings.appearance.theme = theme
    applyTheme(theme)
  }

  function applyTheme(theme: Settings['appearance']['theme']) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (theme === 'system') {
      root.removeAttribute('data-theme')
      return
    }
    root.setAttribute('data-theme', theme)
  }

  function updateStrategy(
    category: keyof StrategyCollection,
    id: string,
    patch: Partial<StrategyAction>,
  ) {
    const target = settings.strategies[category]
    const index = target.findIndex((item) => item.id === id)
    if (index === -1) return
    const updated: StrategyAction = { ...target[index], ...patch } as StrategyAction
    target[index] = updated
  }

  function reorderStrategy(category: keyof StrategyCollection, from: number, to: number) {
    const list = settings.strategies[category]
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return
    const [moved] = list.splice(from, 1)
    if (!moved) return
    list.splice(to, 0, moved)
  }

  function toggleStrategy(category: keyof StrategyCollection, id: string, value?: boolean) {
    const list = settings.strategies[category]
    const target = list.find((entry) => entry.id === id)
    if (!target) return
    target.enabled = value ?? !target.enabled
  }

  return {
    ready,
    settings,
    enabledStrategies,
    bootstrap,
    setTheme,
    updateStrategy,
    reorderStrategy,
    toggleStrategy,
  }
})
