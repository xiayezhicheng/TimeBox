import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { Session, SessionNotes, TimeboxType } from '../types/models'
import { loadSessions, saveSessions } from '../services/storage'
import { createId } from '../utils/id'

interface RuntimeState {
  status: 'idle' | 'running' | 'paused' | 'awaiting-review'
  sessionId?: string
  timeboxId?: string
  type: TimeboxType
  targetDurationSec: number
  startEpoch?: number
  pauseEpoch?: number
  accumulatedPauseSec: number
  urgeBuffer: {
    active: boolean
    startedAt?: number
    remainingSec: number
    outcome?: 'stayed' | 'left'
  }
  urgeDelays: number
  discomforts: string[]
}

const DEFAULT_NOTES: SessionNotes = {
  learned: '',
  stuck: '',
  next: '',
}

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<Session[]>([])
  const ready = ref(false)
  const runtime = reactive<RuntimeState>({
    status: 'idle',
    sessionId: undefined,
    timeboxId: undefined,
    type: 'input',
    targetDurationSec: 0,
    startEpoch: undefined,
    pauseEpoch: undefined,
    accumulatedPauseSec: 0,
    urgeBuffer: { active: false, remainingSec: 600 },
    urgeDelays: 0,
    discomforts: [],
  })

  async function bootstrap() {
    if (ready.value) return
    const stored = await loadSessions()
    sessions.value = stored.map((session) => ({
      ...session,
      type: session.type ?? 'input',
    }))
    ready.value = true
  }

  watch(
    sessions,
    async () => {
      if (!ready.value) return
      await saveSessions(sessions.value)
    },
    { deep: true },
  )

  const currentSession = computed(() =>
    runtime.sessionId ? sessions.value.find((s) => s.id === runtime.sessionId) : undefined,
  )

  const isRunning = computed(() => runtime.status === 'running')

  function elapsedSeconds(now = Date.now()): number {
    if (!runtime.startEpoch) return 0
    const base = Math.max(0, now - runtime.startEpoch)
    const paused = runtime.accumulatedPauseSec * 1000
    const activePause = runtime.pauseEpoch ? now - runtime.pauseEpoch : 0
    const totalPaused = paused + (runtime.status === 'paused' ? activePause : 0)
    return Math.max(0, Math.floor((base - totalPaused) / 1000))
  }

  function remainingSeconds(now = Date.now()): number {
    const elapsed = elapsedSeconds(now)
    return Math.max(0, runtime.targetDurationSec - elapsed)
  }

  function startSession(payload: {
    timeboxId?: string
    type: TimeboxType
    durationSec: number
    startEpoch?: number
    notes?: SessionNotes
  }) {
    const startEpoch = payload.startEpoch ?? Date.now()
    const session: Session = {
      id: createId(),
      timeboxId: payload.timeboxId ?? createId(),
      startEpoch,
      durationSec: 0,
      type: payload.type,
      urgeDelays: 0,
      discomforts: [],
      notes: { ...DEFAULT_NOTES, ...(payload.notes ?? {}) },
    }
    sessions.value.push(session)

    runtime.status = 'running'
    runtime.sessionId = session.id
    runtime.timeboxId = payload.timeboxId ?? session.timeboxId
    runtime.type = payload.type
    runtime.targetDurationSec = payload.durationSec
    runtime.startEpoch = startEpoch
    runtime.accumulatedPauseSec = 0
    runtime.pauseEpoch = undefined
    runtime.urgeBuffer = { active: false, remainingSec: 600 }
    runtime.urgeDelays = 0
    runtime.discomforts = []
  }

  function pauseSession(now = Date.now()) {
    if (runtime.status !== 'running') return
    runtime.status = 'paused'
    runtime.pauseEpoch = now
  }

  function resumeSession(now = Date.now()) {
    if (runtime.status !== 'paused' || !runtime.pauseEpoch) return
    const pausedSec = Math.floor((now - runtime.pauseEpoch) / 1000)
    runtime.accumulatedPauseSec += pausedSec
    runtime.pauseEpoch = undefined
    runtime.status = 'running'
  }

  function stopSession(now = Date.now()) {
    if (!runtime.sessionId) return
    const session = sessions.value.find((s) => s.id === runtime.sessionId)
    if (!session) return
    session.endEpoch = now
    session.durationSec = elapsedSeconds(now)
    session.urgeDelays = runtime.urgeDelays
    session.discomforts = [...runtime.discomforts]
    runtime.status = 'awaiting-review'
  }

  function finalizeSession(notes: SessionNotes, assets?: string[]) {
    if (!runtime.sessionId) return
    const session = sessions.value.find((s) => s.id === runtime.sessionId)
    if (!session) return
    session.notes = notes
    session.minOutputAssets = assets?.length ? assets : undefined
    session.completed = true
    runtime.status = 'idle'
    runtime.sessionId = undefined
    runtime.timeboxId = undefined
  }

  function cancelSession() {
    if (!runtime.sessionId) return
    sessions.value = sessions.value.filter((s) => s.id !== runtime.sessionId)
    runtime.status = 'idle'
    runtime.sessionId = undefined
    runtime.timeboxId = undefined
  }

  function setNotes(sessionId: string, notes: SessionNotes) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    session.notes = notes
  }

  function recordUrgeDelay(outcome: 'stayed' | 'left') {
    runtime.urgeDelays += 1
    runtime.urgeBuffer = {
      active: false,
      remainingSec: 600,
      outcome,
    }
    const session = currentSession.value
    if (session) {
      session.urgeDelayOutcome = outcome
      session.urgeDelays = runtime.urgeDelays
    }
  }

  function startUrgeBuffer(now = Date.now()) {
    runtime.urgeBuffer = {
      active: true,
      startedAt: now,
      remainingSec: 600,
    }
  }

  function updateUrgeBuffer(now = Date.now()) {
    if (!runtime.urgeBuffer.active || !runtime.urgeBuffer.startedAt) return 600
    const elapsed = Math.floor((now - runtime.urgeBuffer.startedAt) / 1000)
    const remaining = Math.max(0, 600 - elapsed)
    runtime.urgeBuffer.remainingSec = remaining
    return remaining
  }

  function resetUrgeBuffer() {
    runtime.urgeBuffer = { active: false, remainingSec: 600 }
  }

  function appendDiscomfort(tag: string) {
    if (!runtime.discomforts.includes(tag)) {
      runtime.discomforts.push(tag)
    }
  }

  function updateAssets(sessionId: string, assets: string[]) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    session.minOutputAssets = assets
  }

  return {
    ready,
    sessions,
    runtime,
    currentSession,
    isRunning,
    bootstrap,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    finalizeSession,
    cancelSession,
    setNotes,
    recordUrgeDelay,
    startUrgeBuffer,
    updateUrgeBuffer,
    resetUrgeBuffer,
    appendDiscomfort,
    updateAssets,
    elapsedSeconds,
    remainingSeconds,
  }
})
