import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  CloudSyncManager,
  type CloudSyncEvent,
  loadPersistedCloudSyncState,
  persistCloudSyncState,
  registerSyncAccount,
} from '../services/cloudSync'
import { LocalStorageAdapter, setStorageAdapter } from '../services/storage'

const API_BASE = import.meta.env?.VITE_SYNC_API_BASE ?? ''

type SyncStatus = 'disabled' | 'syncing' | 'ready' | 'error'

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('disabled')
  const syncKey = ref<string | null>(null)
  const lastError = ref<string | null>(null)
  const lastSyncAt = ref<number | null>(null)
  const isBusy = ref(false)
  let manager: CloudSyncManager | null = null

  function handleEvent(event: CloudSyncEvent) {
    if (event.type === 'pull:success') {
      lastSyncAt.value = event.timestamp
      status.value = 'ready'
    }
    if (event.type === 'pull:error') {
      lastError.value =
        event.error instanceof Error ? event.error.message : String(event.error)
      status.value = 'error'
    }
    if (event.type === 'push:error') {
      lastError.value =
        event.error instanceof Error ? event.error.message : String(event.error)
      status.value = 'error'
    }
  }

  function resetAdapterToLocal() {
    setStorageAdapter(new LocalStorageAdapter())
  }

  function disposeManager() {
    manager?.dispose()
    manager = null
  }

  async function activateWithKey(key: string): Promise<void> {
    if (!key || typeof key !== 'string') {
      throw new Error('无效的同步密钥')
    }
    if (manager && manager.syncKey === key) {
      status.value = 'ready'
      return
    }

    disposeManager()
    manager = new CloudSyncManager({
      syncKey: key,
      apiBase: API_BASE,
      onEvent: handleEvent,
      localAdapter: new LocalStorageAdapter(),
    })

    syncKey.value = key
    status.value = 'syncing'
    lastError.value = null
    setStorageAdapter(manager.storageAdapter)

    try {
      await manager.pullAll()
      status.value = 'ready'
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      status.value = 'error'
      throw error
    }
  }

  async function bootstrap(): Promise<void> {
    const persisted = loadPersistedCloudSyncState()
    if (!persisted?.syncKey) {
      resetAdapterToLocal()
      status.value = 'disabled'
      syncKey.value = null
      lastSyncAt.value = null
      lastError.value = null
      return
    }

    try {
      await activateWithKey(persisted.syncKey)
      status.value = 'ready'
      if (manager?.lastPullAt) {
        lastSyncAt.value = manager.lastPullAt
      }
    } catch {
      // Already handled via activateWithKey
    }
  }

  async function registerNew(label?: string): Promise<string> {
    if (isBusy.value) throw new Error('正在处理中，请稍候')
    isBusy.value = true
    try {
      const key = await registerSyncAccount(API_BASE, label)
      await activateWithKey(key)
      return key
    } finally {
      isBusy.value = false
    }
  }

  async function connectWithKey(key: string): Promise<void> {
    if (isBusy.value) throw new Error('正在处理中，请稍候')
    const normalized = key.trim()
    if (!normalized) {
      throw new Error('请输入同步密钥')
    }
    isBusy.value = true
    try {
      await activateWithKey(normalized)
    } finally {
      isBusy.value = false
    }
  }

  async function pullNow(): Promise<void> {
    if (!manager) throw new Error('尚未启用云同步')
    status.value = 'syncing'
    lastError.value = null
    await manager.pullAll()
  }

  function disableSync() {
    disposeManager()
    persistCloudSyncState(null)
    syncKey.value = null
    lastSyncAt.value = null
    lastError.value = null
    status.value = 'disabled'
    resetAdapterToLocal()
  }

  const maskedKey = computed(() => {
    if (!syncKey.value) return ''
    if (syncKey.value.length <= 8) return syncKey.value
    return `${syncKey.value.slice(0, 4)}·${syncKey.value.slice(-4)}`
  })

  return {
    status,
    syncKey,
    isBusy,
    lastError,
    lastSyncAt,
    maskedKey,
    bootstrap,
    registerNew,
    connectWithKey,
    pullNow,
    disableSync,
  }
})
