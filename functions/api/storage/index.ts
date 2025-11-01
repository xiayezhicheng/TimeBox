import { parseJSONSafe } from '../../utils/json'

export interface Env {
  DB: D1Database
}

interface StorageRecordPayload {
  key: string
  value: unknown
  updatedAt?: number
}

const HEADER_SYNC_KEY = 'x-sync-key'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

async function getAccountId(env: Env, key: string) {
  const result = await env.DB.prepare(
    'SELECT id FROM sync_accounts WHERE id = ?1 LIMIT 1',
  )
    .bind(key)
    .first<{ id: string }>()
  return result?.id ?? null
}

async function updateAccountTouch(env: Env, key: string, timestamp: number) {
  await env.DB.prepare(
    `UPDATE sync_accounts
     SET updated_at = ?2,
         last_seen_at = ?2
     WHERE id = ?1`,
  )
    .bind(key, timestamp)
    .run()
}

async function listRecords(env: Env, accountId: string) {
  const rows = await env.DB.prepare(
    `SELECT data_key, data_value, updated_at
     FROM storage_records
     WHERE account_id = ?1`,
  )
    .bind(accountId)
    .all<{ data_key: string; data_value: string; updated_at: number }>()

  const records =
    rows.results?.map((row) => ({
      key: row.data_key,
      value: parseJSONSafe(row.data_value),
      updatedAt: row.updated_at,
    })) ?? []

  return records
}

async function saveRecords(env: Env, accountId: string, records: StorageRecordPayload[], timestamp: number) {
  if (!records.length) return 0

  const statements = records.map((record) => {
    const updated = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? Math.max(record.updatedAt, timestamp)
      : timestamp
    return env.DB.prepare(
      `INSERT INTO storage_records (account_id, data_key, data_value, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(account_id, data_key)
       DO UPDATE SET data_value = excluded.data_value, updated_at = excluded.updated_at`,
    ).bind(accountId, record.key, JSON.stringify(record.value ?? null), updated)
  })

  if (statements.length === 1) {
    await statements[0].run()
    return 1
  }

  await env.DB.batch(statements)
  return statements.length
}

function normalizeRecords(payload: unknown): StorageRecordPayload[] {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return payload.map((entry) => normalizeSingle(entry)).filter(Boolean) as StorageRecordPayload[]
  }
  if (typeof payload === 'object') {
    const objectPayload = payload as Record<string, unknown>
    if (Array.isArray(objectPayload.records)) {
      return objectPayload.records.map((entry) => normalizeSingle(entry)).filter(Boolean) as StorageRecordPayload[]
    }
    return [normalizeSingle(payload)].filter(Boolean) as StorageRecordPayload[]
  }
  return []
}

function normalizeSingle(input: unknown): StorageRecordPayload | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const key = typeof record.key === 'string' ? record.key : null
  if (!key) return null
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : undefined
  return {
    key,
    value: record.value,
    updatedAt,
  }
}

export const onRequestGet = async ({ env, request }: { env: Env; request: Request }) => {
  const syncKey = request.headers.get(HEADER_SYNC_KEY)?.trim()
  if (!syncKey) {
    return jsonResponse({ error: 'MISSING_SYNC_KEY' }, 401)
  }

  const accountId = await getAccountId(env, syncKey)
  if (!accountId) {
    return jsonResponse({ error: 'INVALID_SYNC_KEY' }, 403)
  }

  const now = Date.now()
  const records = await listRecords(env, accountId)
  await updateAccountTouch(env, accountId, now)
  return jsonResponse({ records, pulledAt: now })
}

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  const syncKey = request.headers.get(HEADER_SYNC_KEY)?.trim()
  if (!syncKey) {
    return jsonResponse({ error: 'MISSING_SYNC_KEY' }, 401)
  }

  const accountId = await getAccountId(env, syncKey)
  if (!accountId) {
    return jsonResponse({ error: 'INVALID_SYNC_KEY' }, 403)
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return jsonResponse({ error: 'INVALID_CONTENT_TYPE' }, 415)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch (error) {
    console.warn('Failed to parse storage payload', error)
    return jsonResponse({ error: 'INVALID_JSON' }, 400)
  }

  const records = normalizeRecords(payload)
  if (!records.length) {
    return jsonResponse({ error: 'EMPTY_PAYLOAD' }, 400)
  }

  const now = Date.now()
  // Limit batch size to prevent abuse
  const limited = records.slice(0, 20)
  const saved = await saveRecords(env, accountId, limited, now)
  await updateAccountTouch(env, accountId, now)

  return jsonResponse({ saved, updatedAt: now })
}
