import { authenticate, headersFor, json, rateLimited, upstream } from '../../_lib/security.js'
import { resources, recordId, date } from '../../_lib/resources.js'

class InputError extends Error {}
const fail = message => { throw new InputError(message) }
const MAX_BODY = 65536
async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) fail('Content-Type must be application/json')
  const reader = request.body?.getReader()
  if (!reader) fail('JSON object body required')
  let size = 0
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) { await reader.cancel(); fail('Body exceeds 64 KiB') }
    chunks.push(value)
  }
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }
  let body
  try { body = JSON.parse(new TextDecoder().decode(buffer)) } catch { fail('Invalid JSON') }
  if (!body || Array.isArray(body) || typeof body !== 'object') fail('JSON object required')
  return body
}

function queryFor(params, resource) {
  const allowed = new Set(['limit', 'offset', 'sort', 'order', ...(resource.search ? ['q'] : []), ...(resource.date ? ['from', 'to'] : []), ...(resource.paid ? ['paid'] : []), ...Object.keys(resource.filters || {})])
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) fail(`Unknown or repeated parameter: ${key}`)
  const integer = (key, fallback, max) => {
    if (!params.has(key)) return fallback
    const v = params.get(key)
    if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) > max) fail(`Invalid ${key}`)
    return Number(v)
  }
  const limit = integer('limit', 50, 100), offset = integer('offset', 0, 1000000)
  if (!limit) fail('limit must be 1–100')
  const sort = params.get('sort') || resource.sort
  if (!['id', resource.sort, resource.date, ...Object.keys(resource.fields)].includes(sort)) fail('Invalid sort')
  const order = params.get('order') || 'desc'
  if (!['asc', 'desc'].includes(order)) fail('Invalid order')
  const query = new URLSearchParams({ select: '*', limit: String(limit), offset: String(offset), order: `${sort}.${order}.nullslast${sort === 'id' ? '' : ',id.' + order}` })
  if (params.has('q')) {
    const q = params.get('q').trim()
    if (!q || q.length > 200) fail('q must contain 1–200 characters')
    // Regex escaping preserves literal %, _, *, quotes and parentheses.
    query.set(resource.search, 'imatch.' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  }
  for (const [key, validate] of Object.entries(resource.filters || {})) {
    if (!params.has(key)) continue
    const raw = params.get(key)
    const value = key === 'is_finished' ? raw === 'true' ? true : raw === 'false' ? false : null : raw
    if (!validate(value)) fail(`Invalid ${key}`)
    query.set(key, `eq.${raw}`)
  }
  const from = params.get('from'), to = params.get('to')
  if ((params.has('from') && !date(from)) || (params.has('to') && !date(to))) fail('Invalid date range')
  if (from && to && from > to) fail('from must not exceed to')
  if (from) query.append(resource.date, `gte.${from}`)
  if (to) query.append(resource.date, `lte.${to}`)
  if (params.has('paid')) {
    if (!['true', 'false'].includes(params.get('paid'))) fail('paid must be true or false')
    query.set(resource.paid, params.get('paid') === 'true' ? 'not.is.null' : 'is.null')
  }
  return query
}

const methodsFor = r => r.methods || (r.readOnly ? ['GET'] : ['GET', 'POST', 'PATCH', 'DELETE'])

// Removes and validates the guard value from a guarded PATCH body.
function takeGuard(body, resource) {
  if (!resource.guard) return undefined
  const { key, validate } = resource.guard
  if (!Object.hasOwn(body, key)) fail(`Missing required field: ${key} (current value, re-read the record first)`)
  const value = body[key]
  delete body[key]
  if (!validate(value)) fail(`Invalid ${key}`)
  return value
}

async function validateChanges(body, method, resource, id, env) {
  if (!Object.keys(body).length) fail('Empty changes')
  for (const [key, value] of Object.entries(body)) if (!Object.hasOwn(resource.fields, key) || !resource.fields[key](value)) fail(`Invalid or unknown field: ${key}`)
  if (method === 'POST') for (const key of resource.required) if (!(key in body)) fail(`Missing required field: ${key}`)
  // Validate cross-field invariants against the merged row on partial PATCH.
  let merged = body
  if (method === 'PATCH' && ['stock_productions', 'raw_materials'].includes(resource.table)) {
    const r = await upstream(env, `/rest/v1/${resource.table}?select=*&id=eq.${id}&limit=1`)
    if (!r.ok) throw new Error('Lookup failed')
    const rows = await r.json()
    merged = { ...rows[0], ...body }
  }
  if (resource.table === 'stock_productions' && merged.expiry_date < merged.production_date) fail('expiry_date must not precede production_date')
  if (resource.table === 'raw_materials' && merged.calculation_mode === 'fraction' && (!(merged.fraction_grams > 0) || !['g', 'ml'].includes(merged.fraction_unit))) fail('fraction mode requires positive fraction_grams and fraction_unit g or ml')
}

export async function onRequest({ request, env }) {
  const headers = headersFor(request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, headers)
  if (!request.headers.has('X-Bot-Key') && !request.headers.has('Authorization')) return json({ error: 'Unauthorized' }, 401, headers)
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return json({ error: 'Server not configured' }, 503, headers)
  try {
    const dbUrl = new URL(env.SUPABASE_URL)
    if (dbUrl.protocol !== 'https:' || dbUrl.pathname !== '/' || dbUrl.search || dbUrl.hash || dbUrl.username || dbUrl.password) throw new Error('Invalid server URL')
    if (rateLimited('ip:' + (request.headers.get('CF-Connecting-IP') || 'local'))) return json({ error: 'Too many requests' }, 429, { ...headers, 'Retry-After': '60' })
    const caller = await authenticate(request, env)
    if (!caller) return json({ error: 'Unauthorized' }, 401, headers)
    const url = new URL(request.url)
    const parts = url.pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean)
    const method = request.method
    if (!parts.length && method === 'GET') return json({ version: 1, resources: Object.fromEntries(Object.entries(resources).map(([name, r]) => [name, { methods: methodsFor(r), ...(r.guard ? { guard: r.guard.key } : {}), fields: Object.keys(r.fields), required: r.required }])) }, 200, headers)
    const [name, id] = parts
    const resource = Object.hasOwn(resources, name) ? resources[name] : null
    if (!resource || parts.length > 2) return json({ error: 'Not found' }, 404, headers)
    if (id && !recordId(id)) fail('Invalid record ID')
    if (!methodsFor(resource).includes(method) || (method === 'POST' && id) || (['PATCH', 'DELETE'].includes(method) && !id)) return json({ error: 'Method not allowed for this path' }, 405, headers)
    if ((id || method !== 'GET') && url.search) fail('Query parameters allowed only on collection GET')
    const query = !id && method === 'GET' ? queryFor(url.searchParams, resource) : new URLSearchParams({ select: '*' })
    if (id) query.set('id', `eq.${id}`)
    let body, guardValue
    if (['POST', 'PATCH'].includes(method)) {
      body = await readBody(request)
      if (method === 'PATCH') guardValue = takeGuard(body, resource)
      if (guardValue !== undefined) query.set(resource.guard.field, `eq.${guardValue}`)
      await validateChanges(body, method, resource, id, env)
      if (method === 'POST' && resource.owned) body.user_id = caller.userId
      if (method === 'POST' && name === 'ads-records' && !body.title) body.title = `RM ${body.amount.toFixed(2)}`
    }
    const response = await upstream(env, `/rest/v1/${resource.table}?${query}`, {
      method, headers: { 'Content-Type': 'application/json', Prefer: method === 'GET' ? 'count=exact' : 'return=representation' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) {
      const status = response.status === 409 ? 409 : response.status === 400 ? 400 : 502
      return json({ error: status === 409 ? 'Record conflicts with data or references' : status === 400 ? 'Database rejected the request' : 'Database request failed' }, status, headers)
    }
    const rows = await response.json()
    if (id && !rows.length && guardValue !== undefined) {
      const check = await upstream(env, `/rest/v1/${resource.table}?select=id&id=eq.${id}&limit=1`)
      if (!check.ok) throw new Error('Lookup failed')
      if ((await check.json()).length) return json({ error: `${resource.guard.field} has changed; re-read the record and retry` }, 409, headers)
    }
    if (id && !rows.length) return json({ error: 'Record not found' }, 404, headers)
    if (id || method === 'POST') return json({ data: rows[0] }, method === 'POST' ? 201 : 200, headers)
    const total = response.headers.get('Content-Range')?.split('/')[1]
    return json({ data: rows, pagination: { limit: Number(query.get('limit')), offset: Number(query.get('offset')), total: total && total !== '*' ? Number(total) : null } }, 200, headers)
  } catch (error) {
    if (!(error instanceof InputError)) console.error('Mywork API failure', error.name, error.stack?.split('\n').slice(1, 3).join('\n'))
    return json({ error: error instanceof InputError ? error.message : 'Internal server error' }, error instanceof InputError ? 400 : 500, headers)
  }
}
