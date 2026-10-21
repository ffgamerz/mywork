// Read-only integration against the real configured database. No writes.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/v1/[[path]].js'
import { resources } from '../functions/_lib/resources.js'

const env = Object.fromEntries(fs.readFileSync('.dev.vars', 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]
}))
const origin = 'https://mywork.integration'
let passed = 0
async function check(path, expected = 200, key = env.BOT_API_KEY) {
  const request = new Request(`${origin}/api/v1/${path}`, { headers: key === null ? {} : { 'X-Bot-Key': key } })
  const r = await onRequest({ request, env })
  const j = await r.json()
  assert.equal(r.status, expected, `${path}: ${r.status} ${j.error || ''}`)
  assert.equal(r.headers.get('Cache-Control'), 'no-store')
  passed++
  return j
}
await check('', 401, null)
await check('', 401, 'invalid-key')
await check('')
for (const name of Object.keys(resources)) {
  const j = await check(`${name}?limit=1`)
  assert.ok(Array.isArray(j.data)); assert.ok(j.data.length <= 1)
  if (j.data.length) {
    const item = await check(`${name}/${j.data[0].id}`)
    assert.equal(String(item.data.id), String(j.data[0].id))
  }
}
const listed = await check('inventory?limit=1')
if (listed.data.length) {
  const row = listed.data[0]
  const search = await check(`inventory?q=${encodeURIComponent(row.product_name)}&limit=100`)
  assert.ok(search.data.some(item => item.id === row.id), 'q must find a known product')
}
await check('inventory?q=a&sort=product_name&order=asc&limit=2&offset=0')
await check('stock-productions?paid=false&is_finished=false&from=2026-01-01&to=2026-12-31&limit=1')
await check('ads-records?ads_platform=tiktok&paid=false&limit=1')
await check('receipt-records?paid=true&limit=1')
await check('raw-materials?q=a&limit=1')
await check('inventory?select=*', 400)
await check('inventory?limit=1&limit=2', 400)
await check('stock-productions?from=2026-02-30', 400)
console.log(JSON.stringify({ passed, mode: 'read-only', writes: 0 }))
