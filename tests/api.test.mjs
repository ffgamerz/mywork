import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/v1/[[path]].js'
import { resources } from '../functions/_lib/resources.js'
import { rateLimited } from '../functions/_lib/security.js'

const userId = '12345678-1234-1234-1234-123456789abc'
const id = '12345678-1234-1234-1234-123456789def'
const env = { SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_KEY: 'server-secret', BOT_API_KEY: 'x'.repeat(48), BOT_USER_ID: userId }
const originalFetch = globalThis.fetch
test.after(() => { globalThis.fetch = originalFetch })
let requests = [], role = 'super_admin', passwordChange = false, databaseStatus = 200, row = { id }, bearerValid = true
test.beforeEach(() => {
  requests = []; role = 'super_admin'; passwordChange = false; databaseStatus = 200; row = { id }; bearerValid = true
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: new URL(url), ...options })
    if (url.includes('/auth/v1/user')) return Response.json(bearerValid ? { id: userId } : {}, { status: bearerValid ? 200 : 401 })
    if (url.includes('/profiles?')) return Response.json([{ role, requires_password_change: passwordChange }])
    return Response.json(databaseStatus === 200 ? [row] : { message: 'PRIVATE DATABASE SECRET' }, { status: databaseStatus, headers: { 'Content-Range': '0-0/1' } })
  }
})
const call = (path = '', method = 'GET', body, headers = {}, bindings = env) => onRequest({ env: bindings, request: new Request(`https://mywork.example/api/v1/${path}`, { method, headers: { 'X-Bot-Key': env.BOT_API_KEY, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }) })

test('missing credentials rejected before checking configuration or fetching', async () => {
  const r = await onRequest({ request: new Request('https://mywork.example/api/v1/'), env: {} })
  assert.equal(r.status, 401); assert.equal(requests.length, 0)
})
test('missing configuration fails closed', async () => { assert.equal((await call('', 'GET', undefined, {}, {})).status, 503) })
test('wrong and short bot keys rejected without DB calls', async () => {
  assert.equal((await call('', 'GET', undefined, { 'X-Bot-Key': 'wrong' })).status, 401)
  assert.equal((await call('', 'GET', undefined, {}, { ...env, BOT_API_KEY: 'short' })).status, 401)
  assert.equal(requests.length, 0)
})
test('bot requires a bound super admin and no pending password change', async () => {
  role = 'admin'; assert.equal((await call()).status, 401)
  role = 'default'; assert.equal((await call()).status, 401)
  role = 'super_admin'; passwordChange = true; assert.equal((await call()).status, 401)
})
test('bot role rechecked on every request and service key stays upstream', async () => {
  assert.equal((await call()).status, 200)
  role = 'default'; assert.equal((await call()).status, 401)
  assert.equal(requests.length, 2)
})
test('bearer token is verified with Auth before database role', async () => {
  const request = () => onRequest({ request: new Request('https://mywork.example/api/v1/', { headers: { Authorization: 'Bearer access-token' } }), env })
  assert.equal((await request()).status, 200)
  assert.equal(requests[0].headers.Authorization, 'Bearer access-token')
  assert.equal(requests[0].redirect, 'manual')
  bearerValid = false; assert.equal((await request()).status, 401)
})
test('discovery lists all known resources', async () => {
  const j = await (await call()).json(); assert.equal(Object.keys(j.resources).length, 13)
  assert.deepEqual(j.resources['wage-payments'].methods, ['GET'])
})
test('all resource collections and mixed UUID/bigint item IDs route correctly', async () => {
  for (const name of Object.keys(resources)) assert.equal((await call(name)).status, 200)
  for (const value of [id, '9007199254740993']) assert.equal((await call('inventory/' + value)).status, 200)
  assert.equal((await call('inventory/1.or(id.gt.0)')).status, 400)
})
test('forbids role/permission endpoints and prototype keys', async () => {
  for (const path of ['profiles', 'user-permissions', 'auth/users', '__proto__', 'constructor']) assert.equal((await call(path)).status, 404)
})
test('literal title search, pagination and null dates last', async () => {
  assert.equal((await call('inventory?q=a*&limit=10&offset=2&sort=product_name&order=desc')).status, 200)
  const q = requests.at(-1).url.searchParams
  assert.equal(q.get('product_name'), 'imatch.a\\*')
  assert.equal(q.get('order'), 'product_name.desc.nullslast,id.desc')
  assert.equal(q.get('limit'), '10'); assert.equal(q.get('offset'), '2')
})
test('rejects arbitrary SQL-like filters, duplicate params, invalid pagination', async () => {
  for (const query of ['select=*', 'q=a&q=b', 'sort=role', 'order=random', 'limit=0', 'limit=101', 'offset=-1', 'foo=bar']) assert.equal((await call('inventory?' + query)).status, 400)
})
test('date, paid, boolean and relational filters', async () => {
  assert.equal((await call(`stock-productions?from=2026-10-01&to=2026-10-21&paid=false&is_finished=false&inventory_id=${id}`)).status, 200)
  const q = requests.at(-1).url.searchParams
  assert.deepEqual(q.getAll('production_date'), ['gte.2026-10-01', 'lte.2026-10-21'])
  assert.equal(q.get('paid_date'), 'is.null'); assert.equal(q.get('is_finished'), 'eq.false')
  for (const query of ['from=2026-02-30', 'from=2026-10-21&to=2026-10-01', 'paid=null', 'is_finished=anything']) assert.equal((await call('stock-productions?' + query)).status, 400)
})
test('create injects owner and rejects impersonation/mass assignment', async () => {
  const r = await call('inventory', 'POST', { product_name: 'Pes Kari', wage_rate: 2, expiry_month: 12 })
  assert.equal(r.status, 201); assert.equal(JSON.parse(requests.at(-1).body).user_id, userId)
  for (const field of ['id', 'user_id', 'current_stock', 'role', '__proto__']) {
    const body = JSON.parse(`{"product_name":"Pes Kari","${field}":"${id}"}`)
    assert.equal((await call('inventory', 'POST', body)).status, 400)
  }
})
test('ads title default matches UI amount format', async () => {
  await call('ads-records', 'POST', { amount: 12.3, ads_platform: 'tiktok', date: '2026-10-21' })
  assert.equal(JSON.parse(requests.at(-1).body).title, 'RM 12.30')
})
test('validations reject empty, unknown, wrong types and missing fields', async () => {
  for (const body of [{}, [], null, { product_name: '' }, { product_name: 'OK', wage_rate: -1 }, { product_name: 'OK', expiry_month: 1.5 }]) assert.equal((await call('inventory', 'POST', body)).status, 400)
  assert.equal((await call('inventory', 'POST', '{broken')).status, 400)
  assert.equal((await call('inventory', 'POST', { product_name: 'a'.repeat(66000) })).status, 400)
  assert.equal((await call('inventory', 'POST', '{}', { 'Content-Type': 'text/plain' })).status, 400)
})
test('partial updates validate date pair and fraction fields against stored row', async () => {
  row = { id, production_date: '2026-10-21', expiry_date: '2027-10-21' }
  assert.equal((await call('stock-productions/' + id, 'PATCH', { expiry_date: '2026-10-20' })).status, 400)
  row = { id, calculation_mode: 'fraction', fraction_grams: 100, fraction_unit: 'g' }
  assert.equal((await call('raw-materials/' + id, 'PATCH', { fraction_grams: null })).status, 400)
})
test('payments read only; paid fields cannot be injected through writable resources', async () => {
  for (const resource of ['ads-payments', 'wage-payments']) for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await call(resource + (method === 'POST' ? '' : '/1'), method, method === 'DELETE' ? undefined : {})).status, 405)
  assert.equal((await call('stock-productions/' + id, 'PATCH', { paid_amount: 100 })).status, 400)
  assert.equal((await call('receipt-records/1', 'PATCH', { payment_id: 2 })).status, 400)
  for (const method of ['POST', 'DELETE']) assert.equal((await call('receipt-payments' + (method === 'POST' ? '' : '/1'), method, method === 'DELETE' ? undefined : {})).status, 405)
})
test('receipt-payments paid_date PATCH is guarded by expected_paid_date', async () => {
  row = { id: 14, paid_date: '2026-10-25' }
  const r = await call('receipt-payments/14', 'PATCH', { paid_date: '2026-10-25', expected_paid_date: '2026-10-26' })
  assert.equal(r.status, 200)
  const req = requests.at(-1)
  assert.equal(req.method, 'PATCH')
  assert.deepEqual(JSON.parse(req.body), { paid_date: '2026-10-25' })
  assert.equal(req.url.searchParams.get('id'), 'eq.14')
  assert.equal(req.url.searchParams.get('paid_date'), 'eq.2026-10-26')
  const j = await (await call()).json()
  assert.deepEqual(j.resources['receipt-payments'].methods, ['GET', 'PATCH'])
  assert.equal(j.resources['receipt-payments'].guard, 'expected_paid_date')
})
test('receipt-payments paid_date rejects missing guard, bad/future dates and other fields', async () => {
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  for (const body of [{ paid_date: '2026-10-25' }, { paid_date: '2026-02-30', expected_paid_date: '2026-10-26' }, { paid_date: '25/10/2026', expected_paid_date: '2026-10-26' }, { paid_date: future, expected_paid_date: '2026-10-26' }, { paid_date: '2026-10-25', expected_paid_date: 'x' }, { total_amount: 1, expected_paid_date: '2026-10-26' }, { expected_paid_date: '2026-10-26' }, { paid_date: '2026-10-25', expected_paid_date: '2026-10-26', wage_amount: 0 }]) {
    requests = []
    assert.equal((await call('receipt-payments/14', 'PATCH', body)).status, 400, JSON.stringify(body))
    assert.ok(!requests.some(x => x.method === 'PATCH'))
  }
})
test('receipt-payments paid_date stale guard returns 409, missing record 404', async () => {
  let exists = true
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes('/profiles?')) return Response.json([{ role: 'super_admin' }])
    if (options.method === 'PATCH') return Response.json([])
    return Response.json(exists ? [{ id: 14 }] : [])
  }
  assert.equal((await call('receipt-payments/14', 'PATCH', { paid_date: '2026-10-25', expected_paid_date: '2026-10-24' })).status, 409)
  exists = false
  assert.equal((await call('receipt-payments/14', 'PATCH', { paid_date: '2026-10-25', expected_paid_date: '2026-10-24' })).status, 404)
})
test('no bulk mutation, nested routes or query-injected mutation', async () => {
  assert.equal((await call('inventory', 'DELETE')).status, 405)
  assert.equal((await call('inventory/' + id, 'POST', {})).status, 405)
  assert.equal((await call('inventory/' + id + '?id=gt.0', 'DELETE')).status, 400)
  assert.equal((await call('inventory/' + id + '/more')).status, 404)
})
test('database internals and service secrets never returned', async () => {
  databaseStatus = 409; const r = await call('inventory'); assert.equal(r.status, 409)
  assert.doesNotMatch(await r.text(), /PRIVATE|server-secret/)
})
test('untrusted origin receives no CORS permission; responses never cached', async () => {
  const r = await call('', 'GET', undefined, { Origin: 'https://evil.example' })
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), null); assert.equal(r.headers.get('Cache-Control'), 'no-store')
  const p = await call('', 'OPTIONS', undefined, { Origin: 'https://mywork.example' })
  assert.equal(p.status, 204); assert.equal(p.headers.get('Access-Control-Allow-Origin'), 'https://mywork.example')
})
test('rate limit rejects request 121 and resets after one minute', () => {
  for (let i = 0; i < 120; i++) assert.equal(rateLimited('unit-test-isolated', 1000), false)
  assert.equal(rateLimited('unit-test-isolated', 1000), true)
  assert.equal(rateLimited('unit-test-isolated', 61000), false)
})
test('missing record maps to 404 and upstream failure is redacted', async () => {
  globalThis.fetch = async url => url.includes('/profiles?') ? Response.json([{ role: 'super_admin' }]) : Response.json([])
  assert.equal((await call('inventory/' + id)).status, 404)
  globalThis.fetch = async () => { throw new Error('server-secret PRIVATE') }
  const r = await call('inventory'); assert.equal(r.status, 500); assert.doesNotMatch(await r.text(), /PRIVATE|server-secret/)
})
