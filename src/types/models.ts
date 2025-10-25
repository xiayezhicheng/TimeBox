export type TimeboxType = 'input' | 'output'
export type TimeboxStatus = 'planned' | 'running' | 'done' | 'skipped'

export interface Timebox {
  id: string
  date: string // yyyy-MM-dd
  start: string // HH:mm
  end: string // HH:mm
  type: TimeboxType
  title?: string
  pairedId?: string
  status: TimeboxStatus
  autoPaired?: boolean
}

export interface SessionNotes {
  learned: string
  stuck: string
  next: string
}

export interface Session {
  id: string
  timeboxId: string
  startEpoch: number
  endEpoch?: number
  durationSec: number
  type: TimeboxType
  urgeDelays: number
  discomforts: string[]
  notes: SessionNotes
  minOutputAssets?: string[]
  completed?: boolean
  urgeDelayOutcome?: 'stayed' | 'left'
}

export interface StrategyAction {
  id: string
  label: string
  description?: string
  enabled: boolean
  kind: 'timer' | 'switch-mode' | 'hydrate' | 'ai-prompt' | 'journal' | 'custom'
  payload?: Record<string, unknown>
}

export interface StrategyCollection {
  physical: StrategyAction[]
  cognitive: StrategyAction[]
  emotional: StrategyAction[]
}

export interface Settings {
  dailyGoalMin: number
  themeTags: string[]
  fomoPolicy: 'blockOrLater'
  strategies: StrategyCollection
  appearance: {
    theme: 'system' | 'light' | 'dark'
  }
}

export interface Stats {
  effectiveMinutes7d: number[]
  ioRatio: number
  discomfortHandledCount: number
  streakDays: number
  tenMinRuleCount: number
}

export interface LaterItem {
  id: string
  title: string
  createdAt: string
  type: TimeboxType
}
