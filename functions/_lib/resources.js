import { UUID_RE } from './security.js'

const text = v => typeof v === 'string' && v.length <= 10000
const requiredText = v => text(v) && v.trim().length > 0
const nullable = fn => v => v === null || fn(v)
const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12
const positive = v => number(v) && v > 0
const integer = v => positive(v) && Number.isSafeInteger(v)
const boolean = v => typeof v === 'boolean'
const oneOf = choices => v => choices.includes(v)
const uuid = v => typeof v === 'string' && UUID_RE.test(v)
export const recordId = v => typeof v === 'string' && (uuid(v) || /^[1-9]\d{0,18}$/.test(v))
export const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
// Today's date in Malaysia (UTC+8, no DST); paid dates may not be after it.
export const malaysiaToday = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10)
const pastDate = v => date(v) && v <= malaysiaToday()
const resource = (table, fields, required, options = {}) => ({ table, fields, required, sort: 'created_at', ...options })
// Ads payment text: null or <= 2000 chars. Links: null or an https:// URL, <= 2000 chars.
const adsNote = v => v === null || (typeof v === 'string' && v.length <= 2000)
const adsLink = v => v === null || (typeof v === 'string' && v.length <= 2000 && /^https:\/\/\S+$/.test(v))
// Ownership is injected server-side on create. No arbitrary tables/columns,
// role updates, payment linking or paid fields are exposed for mutation.
export const resources = {
  inventory: resource('inventory', { product_name: requiredText, expiry_month: integer, wage_rate: number }, ['product_name'], { owned: true, search: 'product_name' }),
  'stock-productions': resource('stock_productions', { inventory_id: uuid, batch_no: requiredText, production_date: date, expiry_date: date, quantity: integer, production_name: nullable(requiredText), is_finished: boolean }, ['inventory_id', 'batch_no', 'production_date', 'expiry_date', 'quantity'], { owned: true, search: 'batch_no', date: 'production_date', filters: { inventory_id: uuid, production_name: requiredText, is_finished: boolean }, paid: 'paid_date' }),
  'ads-records': resource('records', { title: requiredText, amount: number, ads_platform: oneOf(['tiktok', 'shopee']), date }, ['amount', 'ads_platform', 'date'], { owned: true, search: 'title', date: 'date', filters: { ads_platform: oneOf(['tiktok', 'shopee']) }, paid: 'payment_id' }),
  'receipt-records': resource('receipt_records', { receipt_date: date, amount: number }, ['receipt_date', 'amount'], { owned: true, date: 'receipt_date', paid: 'payment_id' }),
  'raw-materials': resource('raw_materials', { name: requiredText, unit: requiredText, price: number, calculation_mode: oneOf(['unit', 'fraction']), fraction_grams: nullable(positive), fraction_unit: nullable(oneOf(['g', 'ml'])), purchase_exact: boolean }, ['name', 'unit', 'price', 'calculation_mode'], { owned: true, search: 'name' }),
  'product-recipes': resource('product_recipes', { inventory_id: uuid, recipe_name: nullable(text), batch_size_desc: nullable(text) }, ['inventory_id'], { search: 'recipe_name', filters: { inventory_id: uuid } }),
  'recipe-ingredients': resource('recipe_ingredients', { recipe_id: uuid, raw_material_id: uuid, quantity_used: positive, unit_used: requiredText }, ['recipe_id', 'raw_material_id', 'quantity_used', 'unit_used'], { filters: { recipe_id: uuid, raw_material_id: uuid } }),
  'purchase-plans': resource('purchase_plans', { plan_date: date, notes: nullable(text), total_estimated_cost: number }, [], { owned: true, search: 'notes', date: 'plan_date' }),
  'purchase-plan-items': resource('purchase_plan_items', { purchase_plan_id: uuid, raw_material_id: uuid, total_quantity_needed: number, raw_quantity_needed: nullable(number), unit: requiredText, raw_unit: nullable(text), unit_price: nullable(number), estimated_cost: number }, ['purchase_plan_id', 'raw_material_id', 'total_quantity_needed', 'unit'], { filters: { purchase_plan_id: uuid, raw_material_id: uuid } }),
  'purchase-plan-batches': resource('purchase_plan_batches', { purchase_plan_id: uuid, inventory_id: uuid, batch_count: integer }, ['purchase_plan_id', 'inventory_id', 'batch_count'], { filters: { purchase_plan_id: uuid, inventory_id: uuid } }),
  // GET is the generic collection path (fields stays empty so sort/filters are unchanged).
  // POST/PATCH/DELETE are handled by functions/_lib/adsPayments.js; writeFields documents them.
  'ads-payments': resource('ads_payment', {}, ['record_ids', 'total_amount', 'paid_date'], {
    methods: ['GET', 'POST', 'PATCH', 'DELETE'], date: 'paid_date',
    writeFields: { record_ids: v => Array.isArray(v), total_amount: positive, paid_date: pastDate, reference: adsNote, notes: adsNote, transfer_own_acc_link: adsLink, transfer_cc_link: adsLink },
  }),
  // Only paid_date may be corrected, and only with an expected_paid_date guard
  // (optimistic concurrency): the update applies only if the stored value still matches.
  'receipt-payments': resource('receipts_payment', { paid_date: pastDate }, [], { methods: ['GET', 'PATCH'], date: 'paid_date', guard: { field: 'paid_date', key: 'expected_paid_date', validate: date } }),
  'wage-payments': resource('wage_payments', {}, [], { readOnly: true, date: 'date_paid' }),
}
