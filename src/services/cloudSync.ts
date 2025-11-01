import { LocalStorageAdapter, type StorageAdapter, type StorageKey } from './storage'

const STATE_STORAGE_KEY = 'timebox:cloud-sync-state'
const DEFAULT_API_BASE = import.meta.env?.VITE_SYNC_API_BASE ?? ''

export interface CloudSyncState {
  syncKey: string
  recordVersions: Partial<Record<StorageKey, number>>
  lastPullAt?: number
}

export type CloudSyncEvent =
  | { type: 'push:success'; key: StorageKey; timestamp: number }
  | { type: 'push:error'; key: StorageKey; error: unknown }
  | { type: 'pull:success'; applied: number; timestamp: number }
  | { type: 'pull:error'; error: unknown }

export interface CloudSyncManagerOptions {
  syncKey: string
  apiBase?: string
  onEvent?: (event: CloudSyncEvent) => void
  localAdapter?: LocalStorageAdapter
}

interface PullResponse {
  records: Array<{ key: string; value: unknown; updatedAt: number }>
  pulledAt: number
}

function resolveApiBase(base?: string) {
  return base ?? (typeof DEFAULT_API_BASE === 'string' ? DEFAULT_API_BASE : '')
}

function toStorageKey(key: string): StorageKey | null {
  switch (key) {
    case 'timeboxes':
    case 'sessions':
    case 'settings':
    case 'stats':
    case 'laterList':
      return key
    default:
      return null
  }
}

export function loadPersistedCloudSyncState(): CloudSyncState | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STATE_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CloudSyncState
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.syncKey !== 'string' || !parsed.syncKey) return null
    return {
      syncKey: parsed.syncKey,
      recordVersions: parsed.recordVersions ?? {},
      lastPullAt: parsed.lastPullAt,
    }
  } catch {
    return null
  }
}

export function persistCloudSyncState(state: CloudSyncState | null) {
  if (typeof window === 'undefined') return
  if (!state) {
    window.localStorage.removeItem(STATE_STORAGE_KEY)
    return
  }
  const normalized: CloudSyncState = {
    syncKey: state.syncKey,
    recordVersions: state.recordVersions ?? {},
    lastPullAt: state.lastPullAt,
  }
  window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(normalized))
}

class CloudSyncClient {
  private readonly apiBase: string

  constructor(apiBase: string) {
    this.apiBase = apiBase
  }

  private url(path: string) {
    if (this.apiBase && this.apiBase.startsWith('http')) {
      return `${this.apiBase.replace(/\/+$/, '')}${path}`
    }
    return `${this.apiBase ?? ''}${path}`
  }

  async fetchRecords(syncKey: string): Promise<PullResponse> {
    const response = await fetch(this.url('/api/storage'), {
      method: 'GET',
      headers: {
        'X-Sync-Key': syncKey,
      },
      credentials: 'include',
    })
    if (!response.ok) {
      const errorPayload = await safeParseJson(response)
      const message = (errorPayload as { error?: string })?.error ?? `HTTP_${response.status}`
      throw new Error(`Sync pull failed: ${message}`)
    }
    const data = (await response.json()) as PullResponse
    if (!Array.isArray(data.records)) {
      throw new Error('Invalid sync payload')
    }
    return data
  }

  async pushRecord(syncKey: string, record: { key: string; value: unknown; updatedAt: number }): Promise<void> {
    const response = await fetch(this.url('/api/storage'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': syncKey,
      },
      body: JSON.stringify(record),
      credentials: 'include',
    })
    if (!response.ok) {
      const errorPayload = await safeParseJson(response)
      const message = (errorPayload as { error?: string })?.error ?? `HTTP_${response.status}`
      throw new Error(`Sync push failed: ${message}`)
    }
  }

  static async register(apiBase: string, label?: string): Promise<string> {
    const response = await fetch(resolveApiBase(apiBase) + '/api/sync/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label }),
    })
    if (!response.ok) {
      const errorPayload = await safeParseJson(response)
      const message = (errorPayload as { error?: string })?.error ?? `HTTP_${response.status}`
      throw new Error(`Failed to register sync key: ${message}`)
    }
    const result = (await response.json()) as { syncKey?: string }
    if (!result?.syncKey) {
      throw new Error('Invalid response when registering sync key')
    }
    return result.syncKey
  }
}

export async function registerSyncAccount(apiBase: string, label?: string): Promise<string> {
  return CloudSyncClient.register(apiBase, label)
}

export class CloudSyncManager {
  private readonly client: CloudSyncClient
  private readonly eventHandler?: (event: CloudSyncEvent) => void
  private readonly local: LocalStorageAdapter
  private readonly state: CloudSyncState
  private readonly adapter: StorageAdapter
  private disposed = false

  constructor(options: CloudSyncManagerOptions) {
    this.eventHandler = options.onEvent
    this.local = options.localAdapter ?? new LocalStorageAdapter()
    const apiBase = resolveApiBase(options.apiBase)
    this.client = new CloudSyncClient(apiBase)
    const restored = loadPersistedCloudSyncState()
    if (restored && restored.syncKey === options.syncKey) {
      this.state = { ...restored, recordVersions: restored.recordVersions ?? {} }
    } else {
      this.state = { syncKey: options.syncKey, recordVersions: {} }
      persistCloudSyncState(this.state)
    }
    this.adapter = this.createAdapter()
  }

  get syncKey() {
    return this.state.syncKey
  }

  get storageAdapter(): StorageAdapter {
    return this.adapter
  }

  get lastPullAt() {
    return this.state.lastPullAt
  }

  async pullAll(): Promise<number> {
    try {
      const payload = await this.client.fetchRecords(this.state.syncKey)
      let applied = 0
      for (const record of payload.records) {
        const key = toStorageKey(record.key)
        if (!key) continue
        const knownVersion = this.state.recordVersions?.[key] ?? 0
        if (record.updatedAt > knownVersion) {
          await this.local.setItem(key, record.value)
          this.state.recordVersions[key] = record.updatedAt
          applied += 1
        }
      }
      this.state.lastPullAt = payload.pulledAt
      persistCloudSyncState(this.state)
      this.emit({ type: 'pull:success', applied, timestamp: payload.pulledAt })
      return applied
    } catch (error) {
      this.emit({ type: 'pull:error', error })
      throw error
    }
  }

  dispose() {
    this.disposed = true
  }

  clearState() {
    persistCloudSyncState(null)
  }

  private emit(event: CloudSyncEvent) {
    if (this.disposed) return
    this.eventHandler?.(event)
  }

  private async pushRecord(key: StorageKey, value: unknown) {
    const timestamp = Date.now()
    try {
      await this.client.pushRecord(this.state.syncKey, { key, value, updatedAt: timestamp })
      this.state.recordVersions[key] = timestamp
      persistCloudSyncState(this.state)
      this.emit({ type: 'push:success', key, timestamp })
    } catch (error) {
      this.emit({ type: 'push:error', key, error })
    }
  }

  private createAdapter(): StorageAdapter {
    const manager = this
    return new (class RemoteStorageAdapter implements StorageAdapter {
      async getItem<T>(key: StorageKey): Promise<T | null> {
        return manager.local.getItem<T>(key)
      }

      async setItem<T>(key: StorageKey, value: T): Promise<void> {
        await manager.local.setItem<T>(key, value)
        manager.pushRecord(key, value)
      }
    })()
  }
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json()
  } catch {
    return null
  }
}
