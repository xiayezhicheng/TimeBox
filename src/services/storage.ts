import type { Session, Settings, Stats, Timebox, LaterItem } from '../types/models'

const STORAGE_KEYS = {
  timeboxes: 'timeboxes',
  sessions: 'sessions',
  settings: 'settings',
  stats: 'stats',
  laterList: 'laterList',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

export interface StorageAdapter {
  getItem<T>(key: StorageKey): Promise<T | null> | T | null
  setItem<T>(key: StorageKey, value: T): Promise<void> | void
}

export class LocalStorageAdapter implements StorageAdapter {
  getItem<T>(key: StorageKey): T | null {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  setItem<T>(key: StorageKey, value: T): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

let currentAdapter: StorageAdapter = new LocalStorageAdapter()

export function setStorageAdapter(adapter: StorageAdapter) {
  currentAdapter = adapter
}

async function read<T>(key: StorageKey, fallback: () => T): Promise<T> {
  const stored = await currentAdapter.getItem<T>(key)
  if (stored) {
    return stored
  }
  const data = fallback()
  await currentAdapter.setItem(key, data)
  return data
}

async function write<T>(key: StorageKey, value: T): Promise<void> {
  await currentAdapter.setItem(key, value)
  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    const timestamp = Date.now()
    let transferable: unknown
    try {
      transferable = JSON.parse(JSON.stringify(value))
    } catch (error) {
      console.warn('Failed to clone data for service worker sync', error)
      transferable = null
    }
    navigator.serviceWorker.controller.postMessage({
      type: 'sync-records',
      payload: {
        key,
        value: transferable,
        timestamp,
      },
    })
  }
}

export async function loadTimeboxes(): Promise<Timebox[]> {
  return read(STORAGE_KEYS.timeboxes, () => [])
}

export async function saveTimeboxes(timeboxes: Timebox[]): Promise<void> {
  await write(STORAGE_KEYS.timeboxes, timeboxes)
}

export async function loadSessions(): Promise<Session[]> {
  return read(STORAGE_KEYS.sessions, () => [])
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await write(STORAGE_KEYS.sessions, sessions)
}

export async function loadSettings(): Promise<Settings> {
  return read(STORAGE_KEYS.settings, defaultSettings)
}

export async function saveSettings(settings: Settings): Promise<void> {
  await write(STORAGE_KEYS.settings, settings)
}

export async function loadStats(): Promise<Stats> {
  return read(STORAGE_KEYS.stats, () => ({
    effectiveMinutes7d: Array.from({ length: 7 }, () => 0),
    ioRatio: 1,
    discomfortHandledCount: 0,
    streakDays: 0,
    tenMinRuleCount: 0,
  }))
}

export async function saveStats(stats: Stats): Promise<void> {
  await write(STORAGE_KEYS.stats, stats)
}

export async function loadLaterList(): Promise<LaterItem[]> {
  return read(STORAGE_KEYS.laterList, () => [])
}

export async function saveLaterList(items: LaterItem[]): Promise<void> {
  await write(STORAGE_KEYS.laterList, items)
}

function defaultSettings(): Settings {
  return {
    dailyGoalMin: 60,
    themeTags: ['Cursor'],
    fomoPolicy: 'blockOrLater',
    appearance: {
      theme: 'system',
    },
    strategies: {
      physical: [
        {
          id: 'physical-stand',
          label: '立刻站立 2 分钟',
          enabled: true,
          kind: 'timer',
          payload: { duration: 120, prompt: '站起来伸展一下' },
        },
        {
          id: 'physical-water',
          label: '喝水提醒',
          enabled: true,
          kind: 'custom',
          payload: { event: 'hydrate' },
        },
        {
          id: 'physical-pomodoro',
          label: '计 25/5 番茄',
          enabled: true,
          kind: 'timer',
          payload: { duration: 1500, prompt: '保持轻松节奏，完成一个番茄' },
        },
        {
          id: 'physical-output',
          label: '切到输出模式 15 分钟',
          enabled: true,
          kind: 'switch-mode',
          payload: { type: 'output', duration: 900 },
        },
      ],
      cognitive: [
        {
          id: 'cognitive-ai',
          label: 'AI 提示：三个切题问题',
          enabled: true,
          kind: 'ai-prompt',
          payload: {},
        },
        {
          id: 'cognitive-scope',
          label: '换成具体样例操作 10 分钟',
          enabled: true,
          kind: 'timer',
          payload: { duration: 600 },
        },
        {
          id: 'cognitive-easy',
          label: '降低难度任务',
          enabled: true,
          kind: 'custom',
          payload: { event: 'reduce-scope' },
        },
      ],
      emotional: [
        {
          id: 'emotional-normalize',
          label: '正常化：不适=成长信号',
          enabled: true,
          kind: 'journal',
          payload: {
            template:
              '写下此刻感受，确认它合理、暂时。提醒自己“我在练习，允许不完美”。',
          },
        },
        {
          id: 'emotional-success',
          label: '回看最近 3 次成功记录',
          enabled: true,
          kind: 'custom',
          payload: { event: 'review-success' },
        },
        {
          id: 'emotional-later',
          label: '将新工具记入稍后清单',
          enabled: true,
          kind: 'custom',
          payload: { event: 'append-later' },
        },
      ],
    },
  }
}

export function getStorageKeys() {
  return STORAGE_KEYS
}
