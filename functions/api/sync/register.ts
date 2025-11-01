import type { D1Database } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
}

interface RegisterPayload {
  label?: string
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS sync_accounts (
        id TEXT PRIMARY KEY,
        label TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS storage_records (
        account_id TEXT NOT NULL,
        data_key TEXT NOT NULL,
        data_value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, data_key),
        FOREIGN KEY (account_id) REFERENCES sync_accounts(id) ON DELETE CASCADE
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_storage_records_account_updated
        ON storage_records (account_id, updated_at DESC)`,
    ),
  ])
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export const onRequestPost = async ({ env, request }: { env: Env; request: Request }) => {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    console.error('D1 database binding "DB" is not configured.')
    return jsonResponse({ error: 'D1_NOT_CONFIGURED' }, 500)
  }

  let payload: RegisterPayload = {}
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      payload = (await request.json()) as RegisterPayload
    }
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400)
  }

  const now = Date.now()
  const key = crypto.randomUUID().replace(/-/g, '')
  const label =
    typeof payload.label === 'string' && payload.label.trim().length > 0
      ? payload.label.trim().slice(0, 64)
      : null

  try {
    await ensureSchema(env.DB)

    await env.DB.prepare(
      `INSERT INTO sync_accounts (id, label, created_at, updated_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?3, ?3)`,
    )
      .bind(key, label, now)
      .run()

    return jsonResponse({ syncKey: key }, 201)
  } catch (error) {
    console.error('Failed to register sync key', error)
    return jsonResponse({ error: 'REGISTRATION_FAILED' }, 500)
  }
}
