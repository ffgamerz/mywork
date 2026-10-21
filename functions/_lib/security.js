export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function headersFor(request) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' }
  const origin = request.headers.get('Origin')
  // Same-origin browser calls only. Server clients do not need CORS.
  if (origin && origin === new URL(request.url).origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Bot-Key'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
  }
  return headers
}

export function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers })
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function equalSecret(a, b) {
  const [x, y] = await Promise.all([digest(a), digest(b)])
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export async function upstream(env, path, options = {}) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...options.headers },
    signal: AbortSignal.timeout(15000),
    // Workers supports manual/follow; manual also prevents leaking server
    // credentials to a redirect destination (3xx is rejected by callers).
    redirect: 'manual',
  })
}

export async function authenticate(request, env) {
  let userId
  const botKey = request.headers.get('X-Bot-Key')
  if (botKey !== null) {
    if (botKey.length > 512 || !env.BOT_API_KEY || env.BOT_API_KEY.length < 32 || !UUID_RE.test(env.BOT_USER_ID || '')) return null
    if (!(await equalSecret(botKey, env.BOT_API_KEY))) return null
    userId = env.BOT_USER_ID
  } else {
    const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/i)
    if (!match || match[1].length > 16384) return null
    const response = await upstream(env, '/auth/v1/user', { headers: { Authorization: `Bearer ${match[1]}` } })
    if (!response.ok) return null
    userId = (await response.json()).id
  }
  if (!UUID_RE.test(userId || '')) return null
  // Check the database on EVERY request, including bot calls: demoting/deleting
  // this profile immediately revokes access. Never trust JWT metadata for roles.
  const response = await upstream(env, `/rest/v1/profiles?select=role,requires_password_change&id=eq.${userId}&limit=1`)
  if (!response.ok) return null
  const profile = (await response.json())[0]
  if (profile?.role?.trim().toLowerCase() !== 'super_admin' || profile.requires_password_change === true) return null
  return { userId }
}

// Best-effort burst protection per isolate; use Cloudflare WAF for a global limit.
const buckets = new Map()
export function rateLimited(key, now = Date.now()) {
  let bucket = buckets.get(key)
  if (!bucket || now - bucket.start >= 60000) {
    if (buckets.size >= 2000) {
      for (const [id, item] of buckets) if (now - item.start >= 60000) buckets.delete(id)
      if (buckets.size >= 2000) return true
    }
    bucket = { start: now, count: 0 }
    buckets.set(key, bucket)
  }
  return ++bucket.count > 120
}
