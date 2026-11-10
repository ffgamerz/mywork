// Write path for ads-payments: mirrors src/AdsRecordManager.jsx (Mark as Paid + saveLinks).
// PostgREST gives no multi-statement transaction here, so this is a guarded write
// plus compensating rollback: the link PATCH only touches records with payment_id IS NULL,
// and if it links fewer rows than requested the new payment is unlinked and deleted again.
import { json, upstream } from './security.js'
import { fail, readBody, readOptionalBody } from './input.js'
import { resources, date, malaysiaToday } from './resources.js'

const { writeFields } = resources['ads-payments']
const PAYMENT_ID = /^[1-9]\d{0,18}$/
const RECORD_ID = /^[1-9]\d{0,18}$/
const TEXT_FIELDS = ['transfer_own_acc_link', 'transfer_cc_link', 'notes', 'reference']
const CREATE_FIELDS = ['record_ids', 'total_amount', 'paid_date', 'dry_run', ...TEXT_FIELDS]

// Money in integer sen so float sums (1120.38 + 2199.05) compare exactly.
const sen = v => Math.round(Number(v) * 100)
const money = cents => Number((cents / 100).toFixed(2))
const validMoney = v => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e12 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6
const now = () => new Date().toISOString()
const writeOptions = (method, body) => ({ method, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) })
const db = (env, path, options) => upstream(env, `/rest/v1/${path}`, options)
const audit = (event, fields) => console.log(JSON.stringify({ event, ...fields }))

// Non-2xx DB responses keep the generic mapping; DB messages are never returned.
class DbError extends Error { constructor(response) { super('database'); this.response = response } }
const check = response => { if (!response.ok) throw new DbError(response); return response }
function dbFailure(response, headers) {
  const status = response.status === 409 ? 409 : response.status === 400 ? 400 : 502
  return json({ error: status === 409 ? 'Record conflicts with data or references' : status === 400 ? 'Database rejected the request' : 'Database request failed' }, status, headers)
}

function recordIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail('record_ids must contain 1–100 record IDs')
  const ids = value.map(v => (typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : v))
  if (!ids.every(v => typeof v === 'string' && RECORD_ID.test(v))) fail('Invalid record ID in record_ids')
  if (new Set(ids).size !== ids.length) fail('record_ids must be unique')
  return ids
}

// Pulls dry_run out of a body. Anything else left over is rejected by the caller.
function takeDryRun(body) {
  if (!Object.hasOwn(body, 'dry_run')) return false
  const value = body.dry_run
  delete body.dry_run
  if (typeof value !== 'boolean') fail('dry_run must be true or false')
  return value
}

const text = value => (typeof value === 'string' && value.trim() === '' ? null : value)

async function loadPayment(env, id) {
  const rows = await check(await db(env, `ads_payment?select=*&id=eq.${id}&limit=1`)).json()
  return rows[0] || null
}

// PATCH records with a filter. Returns the rows PostgREST sent back.
async function patchRecords(env, filter, changes) {
  const response = await db(env, `records?${filter}&select=id,payment_id,amount`, writeOptions('PATCH', changes))
  return response.ok ? { ok: true, rows: await response.json() } : { ok: false, rows: [] }
}

// Undo a payment created by this request. Returns false if any step did not complete.
async function rollbackPayment(env, paymentId, stamp) {
  try {
    const unlink = await patchRecords(env, `payment_id=eq.${paymentId}`, { payment_id: null, updated_at: stamp })
    if (!unlink.ok) return false
    const removed = await db(env, `ads_payment?id=eq.${paymentId}`, { method: 'DELETE' })
    return removed.ok
  } catch {
    return false
  }
}

async function createPayment(request, env, actor, headers) {
  const body = await readBody(request)
  const dryRun = takeDryRun(body)
  for (const key of Object.keys(body)) if (!CREATE_FIELDS.includes(key)) fail(`Invalid or unknown field: ${key}`)
  for (const key of ['record_ids', 'total_amount', 'paid_date']) if (!Object.hasOwn(body, key)) fail(`Missing required field: ${key}`)
  const ids = recordIds(body.record_ids)
  if (!validMoney(body.total_amount)) fail('total_amount must be a positive number with at most 2 decimals')
  const totalAmount = money(sen(body.total_amount))
  if (!date(body.paid_date) || body.paid_date > malaysiaToday()) fail('paid_date must be a real YYYY-MM-DD date, not after today')
  const fields = {}
  for (const key of TEXT_FIELDS) {
    if (!Object.hasOwn(body, key)) { fields[key] = null; continue }
    if (!writeFields[key](body[key])) fail(`Invalid ${key}`)
    fields[key] = text(body[key])
  }

  // a. Every record must exist.
  const lookup = await check(await db(env, `records?select=id,amount,date,ads_platform,title,payment_id&id=in.(${ids.join(',')})`))
  const found = await lookup.json()
  const byId = new Map(found.map(row => [String(row.id), row]))
  const missing = ids.filter(id => !byId.has(id))
  if (missing.length) return json({ error: 'Ads record(s) not found', missing_ids: missing }, 404, headers)
  const records = ids.map(id => byId.get(id))

  // b. Records must not already be paid (payment_id not null).
  const linked = records.filter(row => row.payment_id !== null && row.payment_id !== undefined).map(row => ({ id: String(row.id), payment_id: row.payment_id }))
  if (linked.length) return json({ error: 'Ads record(s) already linked to a payment', linked }, 409, headers)

  // c. Record amounts must add up to total_amount exactly (in sen).
  const recordsSen = records.reduce((sum, row) => sum + sen(row.amount), 0)
  if (recordsSen !== sen(body.total_amount)) return json({ error: 'Record amounts do not match total_amount', records_total: money(recordsSen), total_amount: totalAmount }, 400, headers)

  const payment = { total_amount: totalAmount, paid_date: body.paid_date, ...fields }

  // d. Dry run: show exactly what would be written. No writes.
  if (dryRun) {
    return json({
      dry_run: true,
      data: {
        payment: { ...payment, created_by: actor },
        records: records.map(row => ({ id: String(row.id), amount: row.amount, date: row.date, ads_platform: row.ads_platform, title: row.title })),
        records_total: money(recordsSen),
      },
    }, 200, headers)
  }

  // e. Insert the payment.
  const stamp = now()
  const insert = await check(await db(env, 'ads_payment', writeOptions('POST', { ...payment, created_by: actor, updated_by: actor, updated_at: stamp })))
  const created = (await insert.json())[0]
  if (!created) return json({ error: 'Database request failed' }, 502, headers)

  // f. Link the records, guarded by payment_id IS NULL. Any shortfall rolls back.
  let linkedRows = null
  let linkFailed = false
  try {
    const result = await patchRecords(env, `id=in.(${ids.join(',')})&payment_id=is.null`, { payment_id: created.id, updated_at: stamp })
    if (result.ok) linkedRows = result.rows; else linkFailed = true
  } catch {
    linkFailed = true
  }
  if (linkFailed || linkedRows.length !== ids.length) {
    if (!(await rollbackPayment(env, created.id, stamp))) return json({ error: 'Rollback incomplete', payment_id: created.id }, 500, headers)
    return json({ error: 'Linking failed; payment rolled back' }, linkFailed ? 502 : 409, headers)
  }

  // g. Success.
  audit('ads_payment.create', { payment_id: created.id, record_ids: ids, total_amount: created.total_amount, actor })
  return json({ data: { payment: created, records: linkedRows.map(row => ({ id: String(row.id), payment_id: row.payment_id, amount: row.amount })) } }, 201, headers)
}

async function updatePayment(request, env, actor, headers, id) {
  const body = await readBody(request)
  const dryRun = takeDryRun(body)
  const keys = Object.keys(body)
  if (!keys.length) fail('Empty changes')
  for (const key of keys) if (!TEXT_FIELDS.includes(key)) fail(`Invalid or unknown field: ${key}`)
  for (const key of keys) if (!writeFields[key](body[key])) fail(`Invalid ${key}`)
  const changes = Object.fromEntries(keys.map(key => [key, text(body[key])]))

  const before = await loadPayment(env, id)
  if (!before) return json({ error: 'Record not found' }, 404, headers)
  if (dryRun) return json({ dry_run: true, data: { before, after: { ...before, ...changes } } }, 200, headers)

  const rows = await (await check(await db(env, `ads_payment?id=eq.${id}`, writeOptions('PATCH', { ...changes, updated_by: actor, updated_at: now() })))).json()
  if (!rows[0]) return json({ error: 'Record not found' }, 404, headers)
  audit('ads_payment.update', { payment_id: rows[0].id, record_ids: null, changed: keys, total_amount: rows[0].total_amount, actor })
  return json({ data: rows[0] }, 200, headers)
}

async function deletePayment(request, env, actor, headers, id) {
  const body = await readOptionalBody(request)
  const dryRun = takeDryRun(body)
  if (Object.keys(body).length) fail(`Invalid or unknown field: ${Object.keys(body)[0]}`)

  const payment = await loadPayment(env, id)
  if (!payment) return json({ error: 'Record not found' }, 404, headers)
  const records = await (await check(await db(env, `records?select=id,amount,payment_id&payment_id=eq.${id}`))).json()
  if (dryRun) return json({ dry_run: true, data: { payment, records: records.map(row => ({ id: String(row.id), amount: row.amount, payment_id: row.payment_id })) } }, 200, headers)

  // Unlink first. A single PostgREST UPDATE is atomic, so a failure here changes nothing.
  const stamp = now()
  let unlink
  try {
    unlink = await patchRecords(env, `payment_id=eq.${id}`, { payment_id: null, updated_at: stamp })
  } catch {
    unlink = { ok: false, rows: [] }
  }
  if (!unlink.ok) return json({ error: 'Unlink failed; nothing deleted' }, 502, headers)
  const unlinkedIds = unlink.rows.map(row => String(row.id))

  let deleted = null
  try {
    const removed = await db(env, `ads_payment?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
    if (removed.ok) deleted = await removed.json()
  } catch {
    deleted = null
  }
  if (deleted === null) {
    // Delete failed after unlinking: compensate by linking the same records back.
    if (!unlinkedIds.length) return json({ error: 'Database request failed' }, 502, headers)
    const relink = await patchRecords(env, `id=in.(${unlinkedIds.join(',')})&payment_id=is.null`, { payment_id: payment.id, updated_at: stamp }).catch(() => ({ ok: false }))
    if (!relink.ok) return json({ error: 'Rollback incomplete', payment_id: payment.id }, 500, headers)
    return json({ error: 'Delete failed; records re-linked' }, 502, headers)
  }
  // Delete answered OK but matched no row: the payment was removed concurrently.
  if (!deleted.length) return json({ error: 'Record not found' }, 404, headers)

  audit('ads_payment.delete', { payment_id: payment.id, record_ids: unlinkedIds, total_amount: payment.total_amount, actor })
  return json({ data: { deleted_payment: deleted[0], unlinked_record_ids: unlinkedIds }, backup_note: 'Deleted row returned above; keep it to restore.' }, 200, headers)
}

// Entry point for every non-GET request to ads-payments. The router has already
// authenticated the caller and parsed the path into `id`.
export async function handleAdsPayments({ request, env, actor, headers, method, id }) {
  if (new URL(request.url).search) fail('Query parameters allowed only on collection GET')
  try {
    if (method === 'POST') return id ? json({ error: 'Method not allowed for this path' }, 405, headers) : await createPayment(request, env, actor, headers)
    if (!id) return json({ error: 'Method not allowed for this path' }, 405, headers)
    if (!PAYMENT_ID.test(id)) fail('Invalid record ID')
    if (method === 'PATCH') return await updatePayment(request, env, actor, headers, id)
    return await deletePayment(request, env, actor, headers, id)
  } catch (error) {
    if (error instanceof DbError) return dbFailure(error.response, headers)
    throw error
  }
}
