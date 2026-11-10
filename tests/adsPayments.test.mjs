import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/v1/[[path]].js'
import { resources } from '../functions/_lib/resources.js'

// Route-level tests for ads-payments writes. The fetch mock is a tiny PostgREST
// stand-in: it filters by eq./in./is.null on the query string and records every call.
const userId = '12345678-1234-1234-1234-123456789abc'
const botKey = 'b'.repeat(48)
const env = { SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_KEY: 'server-secret', BOT_API_KEY: botKey, BOT_USER_ID: userId }
const originalFetch = globalThis.fetch
const originalLog = console.log
test.after(() => { globalThis.fetch = originalFetch; console.log = originalLog })

let state
function reset() {
  state = {
    calls: [],
    role: 'super_admin',
    bearerValid: true,
    records: new Map([
      ['103', { id: 103, amount: 1120.38, date: '2026-10-15', ads_platform: 'tiktok', title: 'Iklan A', payment_id: null }],
      ['104', { id: 104, amount: 2199.05, date: '2026-10-15', ads_platform: 'shopee', title: 'Iklan B', payment_id: null }],
    ]),
    payments: new Map(),
    nextId: 500,
    // (method, table, params) => HTTP status to fail with, or null
    fail: null,
    // runs once before the link PATCH, to simulate another request linking a record first
    beforeLink: null,
    logs: [],
  }
}

function matches(row, params) {
  for (const [key, expr] of params) {
    if (['select', 'limit', 'order', 'offset'].includes(key)) continue
    const value = row[key]
    if (expr === 'is.null') { if (value !== null && value !== undefined) return false; continue }
    if (expr === 'not.is.null') { if (value === null || value === undefined) return false; continue }
    if (expr.startsWith('eq.')) { if (String(value) !== expr.slice(3)) return false; continue }
    if (expr.startsWith('gte.')) { if (!(String(value) >= expr.slice(4))) return false; continue }
    if (expr.startsWith('lte.')) { if (!(String(value) <= expr.slice(4))) return false; continue }
    if (expr.startsWith('in.(')) { if (!expr.slice(4, -1).split(',').includes(String(value))) return false; continue }
    throw new Error(`unsupported filter ${key}=${expr}`)
  }
  return true
}

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url)
  const method = options.method || 'GET'
  const body = options.body ? JSON.parse(options.body) : undefined
  state.calls.push({ method, url: u, body, headers: options.headers })
  if (u.pathname === '/auth/v1/user') return state.bearerValid ? Response.json({ id: userId }) : Response.json({}, { status: 401 })
  if (u.pathname === '/rest/v1/profiles') return Response.json([{ role: state.role, requires_password_change: false }])
  const name = u.pathname.replace('/rest/v1/', '')
  if (!['records', 'ads_payment'].includes(name)) throw new Error(`unexpected upstream ${method} ${u.pathname}`)
  const params = u.searchParams
  const failing = state.fail?.(method, name, params)
  if (failing) return Response.json({ message: 'PRIVATE DATABASE DETAIL' }, { status: failing })
  if (name === 'records' && method === 'PATCH' && params.get('payment_id') === 'is.null' && state.beforeLink) {
    const hook = state.beforeLink
    state.beforeLink = null
    hook(state)
  }
  const store = name === 'records' ? state.records : state.payments
  const rows = [...store.values()].filter(row => matches(row, params))
  if (method === 'GET') return Response.json(rows.map(row => ({ ...row })), { headers: { 'Content-Range': `0-${rows.length}/${rows.length}` } })
  if (method === 'PATCH') { for (const row of rows) Object.assign(row, body); return Response.json(rows.map(row => ({ ...row }))) }
  if (method === 'DELETE') { for (const row of rows) store.delete(String(row.id)); return Response.json(rows.map(row => ({ ...row }))) }
  if (method === 'POST') {
    const row = { id: state.nextId++, created_at: '2026-11-10T00:00:00.000Z', ...body }
    store.set(String(row.id), row)
    return Response.json([{ ...row }], { status: 201 })
  }
  throw new Error(`unexpected method ${method}`)
}

test.beforeEach(() => {
  reset()
  console.log = line => state.logs.push(String(line))
})

// Request helper. anonymous: send no credentials at all.
function send(path, method = 'GET', body, options = {}) {
  const { headers = {}, anonymous = false, bindings = env } = options
  const init = { method, headers: { ...(anonymous ? {} : { 'X-Bot-Key': botKey }), ...headers } }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json', ...init.headers }
  }
  return onRequest({ env: bindings, request: new Request(`https://mywork.example/api/v1/${path}`, init) })
}

const writes = () => state.calls.filter(call => call.method !== 'GET')
const seedPayment = (overrides = {}) => state.payments.set('500', { id: 500, total_amount: 3319.43, paid_date: '2026-10-15', reference: null, notes: null, transfer_own_acc_link: null, transfer_cc_link: null, created_by: 'bot:mywork-bot', updated_by: null, updated_at: null, ...overrides })
const linkRecords = (ids, paymentId) => ids.forEach(id => { state.records.get(id).payment_id = paymentId })
const validBody = (extra = {}) => ({ record_ids: ['103', '104'], total_amount: 3319.43, paid_date: '2026-10-15', ...extra })
const logLines = () => state.logs.map(line => JSON.parse(line))

// ---- auth -----------------------------------------------------------------

test('POST/PATCH/DELETE without credentials are 401 with no database call', async () => {
  for (const [path, method, body] of [['ads-payments', 'POST', validBody()], ['ads-payments/500', 'PATCH', { notes: 'x' }], ['ads-payments/500', 'DELETE', undefined]]) {
    const r = await send(path, method, body, { anonymous: true })
    assert.equal(r.status, 401, `${method} ${path}`)
  }
  assert.equal(state.calls.length, 0)
})

test('wrong bot key is 401 before any database call', async () => {
  const r = await send('ads-payments', 'POST', validBody(), { headers: { 'X-Bot-Key': 'wrong' } })
  assert.equal(r.status, 401)
  assert.equal(state.calls.length, 0)
})

test('non super_admin is 401 for POST, PATCH and DELETE', async () => {
  seedPayment()
  state.role = 'admin'
  assert.equal((await send('ads-payments', 'POST', validBody())).status, 401)
  assert.equal((await send('ads-payments/500', 'PATCH', { notes: 'x' })).status, 401)
  assert.equal((await send('ads-payments/500', 'DELETE')).status, 401)
  assert.equal(writes().length, 0)
})

test('bearer caller is audited as user:<uuid>', async () => {
  const r = await send('ads-payments', 'POST', validBody({ dry_run: true }), { anonymous: true, headers: { Authorization: 'Bearer access-token' } })
  assert.equal(r.status, 200)
  assert.equal((await r.json()).data.payment.created_by, `user:${userId}`)
  assert.equal(writes().length, 0)
})

// ---- POST -----------------------------------------------------------------

test('POST links records and stores total as 3319.43 (1120.38 + 2199.05)', async () => {
  const r = await send('ads-payments', 'POST', validBody({ reference: 'TRF-1', notes: 'Oktober' }))
  assert.equal(r.status, 201)
  const j = await r.json()
  assert.equal(j.data.payment.id, 500)
  assert.equal(j.data.payment.total_amount, 3319.43)
  assert.deepEqual(j.data.records.map(x => x.id), ['103', '104'])
  assert.ok(j.data.records.every(x => x.payment_id === 500))

  const [insert, link] = writes()
  assert.equal(insert.method, 'POST')
  assert.equal(insert.url.pathname, '/rest/v1/ads_payment')
  assert.equal(insert.body.total_amount, 3319.43)
  assert.equal(insert.body.paid_date, '2026-10-15')
  assert.equal(insert.body.reference, 'TRF-1')
  assert.equal(insert.body.notes, 'Oktober')
  assert.equal(insert.body.created_by, 'bot:mywork-bot')
  assert.equal(insert.body.updated_by, 'bot:mywork-bot')
  assert.ok(!Number.isNaN(Date.parse(insert.body.updated_at)))
  assert.equal(link.method, 'PATCH')
  assert.equal(link.url.pathname, '/rest/v1/records')
  assert.equal(link.url.searchParams.get('payment_id'), 'is.null')
  assert.equal(link.url.searchParams.get('id'), 'in.(103,104)')
  assert.deepEqual(link.body, { payment_id: 500, updated_at: insert.body.updated_at })
})

test('bot actor uses BOT_KEY_NAME when valid and falls back when not', async () => {
  await send('ads-payments', 'POST', validBody(), { bindings: { ...env, BOT_KEY_NAME: 'mywork-ai' } })
  assert.equal(writes()[0].body.created_by, 'bot:mywork-ai')
  reset()
  await send('ads-payments', 'POST', validBody(), { bindings: { ...env, BOT_KEY_NAME: 'bad name!' } })
  assert.equal(writes()[0].body.created_by, 'bot:mywork-bot')
})

test('POST writes one audit line without credentials', async () => {
  await send('ads-payments', 'POST', validBody())
  const line = logLines().find(x => x.event === 'ads_payment.create')
  assert.deepEqual(line, { event: 'ads_payment.create', payment_id: 500, record_ids: ['103', '104'], total_amount: 3319.43, actor: 'bot:mywork-bot' })
  assert.ok(!state.logs.join('\n').includes('server-secret'))
  assert.ok(!state.logs.join('\n').includes(botKey))
})

test('POST dry_run returns the plan and performs no writes', async () => {
  const r = await send('ads-payments', 'POST', validBody({ dry_run: true }))
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.dry_run, true)
  assert.equal(j.data.payment.total_amount, 3319.43)
  assert.equal(j.data.payment.created_by, 'bot:mywork-bot')
  assert.equal(j.data.records_total, 3319.43)
  assert.deepEqual(j.data.records.map(x => x.id), ['103', '104'])
  assert.equal(writes().length, 0)
  assert.equal(logLines().length, 0)
})

test('POST rejects a record that is already linked, with no writes', async () => {
  linkRecords(['103'], 77)
  const r = await send('ads-payments', 'POST', validBody())
  assert.equal(r.status, 409)
  assert.deepEqual((await r.json()).linked, [{ id: '103', payment_id: 77 }])
  assert.equal(writes().length, 0)
})

test('POST rejects a total off by one sen, with no writes', async () => {
  const r = await send('ads-payments', 'POST', validBody({ total_amount: 3319.42 }))
  assert.equal(r.status, 400)
  const j = await r.json()
  assert.equal(j.error, 'Record amounts do not match total_amount')
  assert.equal(j.records_total, 3319.43)
  assert.equal(j.total_amount, 3319.42)
  assert.equal(writes().length, 0)
})

test('POST reports a missing record as 404 with missing_ids, no writes', async () => {
  const r = await send('ads-payments', 'POST', validBody({ record_ids: ['103', '999'] }))
  assert.equal(r.status, 404)
  assert.deepEqual(await r.json(), { error: 'Ads record(s) not found', missing_ids: ['999'] })
  assert.equal(writes().length, 0)
})

test('POST rejects future, impossible and non-date paid_date', async () => {
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  for (const paid_date of [future, '2026-02-30', '10/11/2026', undefined]) {
    const body = validBody({ paid_date })
    if (paid_date === undefined) delete body.paid_date
    assert.equal((await send('ads-payments', 'POST', body)).status, 400, String(paid_date))
  }
  assert.equal(writes().length, 0)
})

test('POST validates record_ids: empty, duplicate, too many, bad values', async () => {
  const bad = [[], ['103', '103'], Array.from({ length: 101 }, (_, i) => String(i + 1)), ['abc'], [0], ['1.5'], [-3]]
  for (const record_ids of bad) assert.equal((await send('ads-payments', 'POST', validBody({ record_ids }))).status, 400, JSON.stringify(record_ids))
  assert.equal(writes().length, 0)
})

test('POST accepts JSON numbers as record ids and normalises them', async () => {
  const r = await send('ads-payments', 'POST', validBody({ record_ids: [103, 104] }))
  assert.equal(r.status, 201)
  assert.equal(writes()[1].url.searchParams.get('id'), 'in.(103,104)')
})

test('POST rejects unknown fields, http links, long text and bad amounts with no writes', async () => {
  const bad = [
    validBody({ payment_id: 1 }),
    validBody({ transfer_own_acc_link: 'http://drive.example/a.pdf' }),
    validBody({ transfer_cc_link: 'https://' + 'a'.repeat(2000) }),
    validBody({ notes: 'x'.repeat(2001) }),
    validBody({ total_amount: 0 }),
    validBody({ total_amount: 10.005 }),
    validBody({ total_amount: '3319.43' }),
  ]
  for (const body of bad) assert.equal((await send('ads-payments', 'POST', body)).status, 400, JSON.stringify(body).slice(0, 80))
  assert.equal(writes().length, 0)
})

test('POST race: a record linked by someone else rolls the new payment back', async () => {
  state.beforeLink = s => { s.records.get('104').payment_id = 999 }
  const r = await send('ads-payments', 'POST', validBody())
  assert.equal(r.status, 409)
  assert.deepEqual(await r.json(), { error: 'Linking failed; payment rolled back' })

  const after = writes().slice(2)
  const unlink = after.find(c => c.method === 'PATCH')
  assert.equal(unlink.url.searchParams.get('payment_id'), 'eq.500')
  assert.deepEqual(unlink.body.payment_id, null)
  assert.ok(after.some(c => c.method === 'DELETE' && c.url.pathname === '/rest/v1/ads_payment' && c.url.searchParams.get('id') === 'eq.500'))
  assert.equal(state.payments.size, 0)
  assert.equal(state.records.get('103').payment_id, null)
  assert.equal(state.records.get('104').payment_id, 999)
})

test('POST link DB error rolls back and returns 502 with no DB text', async () => {
  state.fail = (method, table, params) => (method === 'PATCH' && table === 'records' && params.get('payment_id') === 'is.null' ? 500 : null)
  const r = await send('ads-payments', 'POST', validBody())
  assert.equal(r.status, 502)
  const text = await r.text()
  assert.equal(JSON.parse(text).error, 'Linking failed; payment rolled back')
  assert.doesNotMatch(text, /PRIVATE|server-secret/)
  assert.equal(state.payments.size, 0)
})

test('POST returns 500 Rollback incomplete when compensation cannot finish', async () => {
  state.beforeLink = s => { s.records.get('104').payment_id = 999 }
  state.fail = (method, table, params) => (method === 'PATCH' && table === 'records' && params.get('payment_id') === 'eq.500' ? 500 : null)
  const r = await send('ads-payments', 'POST', validBody())
  assert.equal(r.status, 500)
  assert.deepEqual(await r.json(), { error: 'Rollback incomplete', payment_id: 500 })
  assert.equal(state.payments.size, 1)
})

test('POST with a non-JSON content type is rejected', async () => {
  const r = await send('ads-payments', 'POST', 'record_ids=103', { headers: { 'Content-Type': 'text/plain' } })
  assert.equal(r.status, 400)
  assert.equal(writes().length, 0)
})

// ---- PATCH ----------------------------------------------------------------

test('PATCH updates links and notes with updated_by/updated_at', async () => {
  seedPayment()
  const r = await send('ads-payments/500', 'PATCH', { transfer_own_acc_link: 'https://drive.example/own.pdf', transfer_cc_link: null, notes: 'ok', reference: '  ' })
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.data.transfer_own_acc_link, 'https://drive.example/own.pdf')
  assert.equal(j.data.notes, 'ok')
  assert.equal(j.data.transfer_cc_link, null)
  assert.equal(j.data.reference, null)
  const patch = writes()[0]
  assert.equal(patch.method, 'PATCH')
  assert.equal(patch.url.searchParams.get('id'), 'eq.500')
  assert.equal(patch.body.updated_by, 'bot:mywork-bot')
  assert.ok(!Number.isNaN(Date.parse(patch.body.updated_at)))
  assert.equal(patch.body.total_amount, undefined)
  assert.ok(logLines().some(x => x.event === 'ads_payment.update' && x.payment_id === 500 && x.actor === 'bot:mywork-bot'))
})

test('PATCH rejects money, date, record and payment fields with no writes', async () => {
  seedPayment()
  for (const field of ['total_amount', 'paid_date', 'record_ids', 'payment_id', 'created_by']) {
    const r = await send('ads-payments/500', 'PATCH', { [field]: 1, notes: 'x' })
    assert.equal(r.status, 400, field)
    assert.equal((await r.json()).error, `Invalid or unknown field: ${field}`)
  }
  assert.equal((await send('ads-payments/500', 'PATCH', {})).status, 400)
  assert.equal((await send('ads-payments/500', 'PATCH', { transfer_cc_link: 'http://x.example' })).status, 400)
  assert.equal(writes().length, 0)
})

test('PATCH missing payment is 404', async () => {
  const r = await send('ads-payments/777', 'PATCH', { notes: 'x' })
  assert.equal(r.status, 404)
  assert.equal(writes().length, 0)
})

test('PATCH dry_run returns before and after with no write', async () => {
  seedPayment({ notes: 'old' })
  const r = await send('ads-payments/500', 'PATCH', { dry_run: true, notes: 'new' })
  const j = await r.json()
  assert.equal(r.status, 200)
  assert.equal(j.dry_run, true)
  assert.equal(j.data.before.notes, 'old')
  assert.equal(j.data.after.notes, 'new')
  assert.equal(writes().length, 0)
})

// ---- DELETE ---------------------------------------------------------------

test('DELETE unlinks records first, then deletes and returns a snapshot', async () => {
  seedPayment()
  linkRecords(['103', '104'], 500)
  const r = await send('ads-payments/500', 'DELETE')
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.data.deleted_payment.id, 500)
  assert.equal(j.data.deleted_payment.total_amount, 3319.43)
  assert.deepEqual(j.data.unlinked_record_ids, ['103', '104'])
  assert.equal(j.backup_note, 'Deleted row returned above; keep it to restore.')

  const [unlink, remove] = writes()
  assert.equal(unlink.method, 'PATCH')
  assert.equal(unlink.url.pathname, '/rest/v1/records')
  assert.equal(unlink.url.searchParams.get('payment_id'), 'eq.500')
  assert.equal(unlink.body.payment_id, null)
  assert.equal(remove.method, 'DELETE')
  assert.equal(remove.url.searchParams.get('id'), 'eq.500')
  assert.equal(state.payments.size, 0)
  assert.equal(state.records.get('103').payment_id, null)
  assert.ok(logLines().some(x => x.event === 'ads_payment.delete' && x.payment_id === 500 && x.actor === 'bot:mywork-bot'))
})

test('DELETE dry_run shows payment and records without writes', async () => {
  seedPayment()
  linkRecords(['103'], 500)
  const r = await send('ads-payments/500', 'DELETE', { dry_run: true })
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.equal(j.dry_run, true)
  assert.equal(j.data.payment.id, 500)
  assert.deepEqual(j.data.records.map(x => x.id), ['103'])
  assert.equal(writes().length, 0)
})

test('DELETE rejects a body with any field other than dry_run', async () => {
  seedPayment()
  assert.equal((await send('ads-payments/500', 'DELETE', { force: true })).status, 400)
  assert.equal(writes().length, 0)
})

test('DELETE missing payment is 404', async () => {
  const r = await send('ads-payments/777', 'DELETE')
  assert.equal(r.status, 404)
  assert.equal(writes().length, 0)
})

test('DELETE re-links records when the delete fails after unlinking', async () => {
  seedPayment()
  linkRecords(['103'], 500)
  state.fail = (method, table) => (method === 'DELETE' && table === 'ads_payment' ? 500 : null)
  const r = await send('ads-payments/500', 'DELETE')
  assert.equal(r.status, 502)
  assert.deepEqual(await r.json(), { error: 'Delete failed; records re-linked' })
  const relink = writes().at(-1)
  assert.equal(relink.method, 'PATCH')
  assert.equal(relink.url.searchParams.get('id'), 'in.(103)')
  assert.equal(relink.url.searchParams.get('payment_id'), 'is.null')
  assert.equal(relink.body.payment_id, 500)
  assert.equal(state.records.get('103').payment_id, 500)
})

test('unlink failure on DELETE changes nothing and returns 502', async () => {
  seedPayment()
  linkRecords(['103'], 500)
  state.fail = (method, table) => (method === 'PATCH' && table === 'records' ? 500 : null)
  const r = await send('ads-payments/500', 'DELETE')
  assert.equal(r.status, 502)
  assert.equal(writes().length, 1)
  assert.equal(state.payments.size, 1)
})

test('DELETE failure with no linked records is 502, not 404', async () => {
  seedPayment()
  state.fail = (method, table) => (method === 'DELETE' && table === 'ads_payment' ? 500 : null)
  const r = await send('ads-payments/500', 'DELETE')
  assert.equal(r.status, 502)
  assert.deepEqual(await r.json(), { error: 'Database request failed' })
  assert.equal(state.payments.size, 1)
})

// ---- routing, GET and discovery ---------------------------------------------

test('wrong methods and paths for ads-payments are 405 or 400', async () => {
  seedPayment()
  assert.equal((await send('ads-payments/500', 'POST', validBody())).status, 405)
  assert.equal((await send('ads-payments', 'PATCH', { notes: 'x' })).status, 405)
  assert.equal((await send('ads-payments', 'DELETE')).status, 405)
  assert.equal((await send('ads-payments/abc', 'PATCH', { notes: 'x' })).status, 400)
  assert.equal((await send('ads-payments?limit=1', 'PATCH', { notes: 'x' })).status, 400)
  assert.equal((await send('ads-payments/500/more', 'DELETE')).status, 404)
  assert.equal(writes().length, 0)
})

test('GET ads-payments still uses the generic collection path', async () => {
  const r = await send('ads-payments?limit=5&from=2026-10-01')
  assert.equal(r.status, 200)
  const get = state.calls.at(-1)
  assert.equal(get.method, 'GET')
  assert.equal(get.url.searchParams.get('select'), '*')
  assert.deepEqual(get.url.searchParams.getAll('paid_date'), ['gte.2026-10-01'])
  assert.equal((await send('ads-payments?foo=1')).status, 400)
  assert.equal(writes().length, 0)
})

test('discovery lists ads-payments with write methods and fields', async () => {
  const j = await (await send('')).json()
  const ads = j.resources['ads-payments']
  assert.deepEqual(ads.methods, ['GET', 'POST', 'PATCH', 'DELETE'])
  assert.deepEqual(ads.required, ['record_ids', 'total_amount', 'paid_date'])
  assert.deepEqual(ads.fields, ['record_ids', 'total_amount', 'paid_date', 'reference', 'notes', 'transfer_own_acc_link', 'transfer_cc_link'])
  assert.deepEqual(j.resources['wage-payments'].methods, ['GET'])
  assert.deepEqual(Object.keys(resources['ads-payments'].fields), [])
})
