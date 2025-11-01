export interface Env {
  DB: D1Database
}

interface RegisterPayload {
  label?: string
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
