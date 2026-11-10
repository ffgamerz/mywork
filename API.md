# Mywork API v1

Client/AI handoff: [AI-API-GUIDE.md](./AI-API-GUIDE.md). Share the guide, not
server credentials. Live base URL: `https://bol-services.pages.dev/api/v1`.

Base path: `/api/v1`. Implemented using Cloudflare Pages Functions.
No login credentials, service key or bot key belong in React, Vite variables,
URLs, Git, browser localStorage or this document.

## Authentication and access

Every data/discovery request requires either:

- `X-Bot-Key: <BOT_API_KEY>` with server-configured `BOT_USER_ID`, or
- `Authorization: Bearer <Supabase access token>`.

Both require an existing `profiles` row with role `super_admin` and no
`requires_password_change = true`. The profile is checked on EVERY request.
Other roles and module permissions do not grant API access in v1. A bad bot
key does not fall back to a Bearer token. Bot key must be at least 32 characters;
use a distinct cryptographically random 32-byte/64-hex key for Mywork. Do not
reuse the Affiliate key. Anyone holding it has super-admin operational data
access: give it only to trusted clients.

The server service-role key bypasses RLS. Therefore this is explicitly a
super-admin API over all operational records, not an ordinary staff API or
tenant-scoped API. New owned rows use the verified caller/BOT_USER_ID as
`user_id`; clients cannot override it. Protect `profiles.role` against ordinary
user updates at the database level. Existing frontend RLS policies are not
changed by this implementation; their audit is a separate prerequisite for
trusting the database role boundary.

Server environment variables (Cloudflare Pages > Settings > Variables and Secrets):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Actual HTTPS Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Server service-role key, configured as secret |
| `BOT_API_KEY` | Mywork-specific random key, configured as secret |
| `BOT_USER_ID` | Existing super-admin UUID; demoting/deleting it revokes bot access |
| `BOT_KEY_NAME` | Optional audit name for bot writes (`A–Z a–z 0–9 _ . -`, max 64). Default `mywork-bot` |

Configure production and preview independently. Never copy production secrets
to public/untrusted previews. Without configuration requests fail closed.
Same-origin CORS only; CORS is not authentication. All responses use no-store.
Burst limit: 120 requests/minute per IP per isolate, including failed auth.
This is NOT a globally enforced quota; add Cloudflare WAF rate limits if needed.

## Routes

- `GET /api/v1` — authenticated resource/field discovery.
- `GET /api/v1/<resource>` — collection with pagination.
- `GET /api/v1/<resource>/<id>` — one record.
- `POST /api/v1/<resource>` — one JSON record.
- `PATCH /api/v1/<resource>/<id>` — only supplied fields.
- `DELETE /api/v1/<resource>/<id>` — one record; database FK/cascade rules apply.

ID accepts canonical UUID or positive bigint as a string (no JS number rounding).
IDs and user_id cannot be created/changed by clients. No bulk mutations or
arbitrary Supabase queries/table names. Updates can affect paid record amounts,
so read the row before editing. Payment linking and marking paid are excluded
from generic resources; `ads-payments` is the only guarded payment write path
(see its section below).

| Resource | Table | Writable fields (required on POST marked *) |
| --- | --- | --- |
| inventory | inventory | product_name*, expiry_month, wage_rate |
| stock-productions | stock_productions | inventory_id*, batch_no*, production_date*, expiry_date*, quantity*, production_name, is_finished |
| ads-records | records | amount*, ads_platform*, date*, title (defaults to RM amount) |
| receipt-records | receipt_records | receipt_date*, amount* |
| raw-materials | raw_materials | name*, unit*, price*, calculation_mode*, fraction_grams, fraction_unit, purchase_exact |
| product-recipes | product_recipes | inventory_id*, recipe_name, batch_size_desc |
| recipe-ingredients | recipe_ingredients | recipe_id*, raw_material_id*, quantity_used*, unit_used* |
| purchase-plans | purchase_plans | plan_date, notes, total_estimated_cost |
| purchase-plan-items | purchase_plan_items | purchase_plan_id*, raw_material_id*, total_quantity_needed*, unit*, raw_quantity_needed, raw_unit, unit_price, estimated_cost |
| purchase-plan-batches | purchase_plan_batches | purchase_plan_id*, inventory_id*, batch_count* |
| ads-payments | ads_payment | POST (creates payment and links records, guarded), PATCH `transfer_own_acc_link`, `transfer_cc_link`, `notes`, `reference`, DELETE (unlinks records, deletes payment). See below |
| receipt-payments | receipts_payment | PATCH only: `paid_date` (+ required guard `expected_paid_date`), see below |
| wage-payments | wage_payments | Read only |

No auth/user management, role changes, bank transfer execution, receipt file
upload or storage signing endpoints. Mark-as-paid exists only as `ads-payments`
POST below. No automatic shopping-list or wage
calculation: v1 exposes underlying records. Multi-record purchase-plan edits
are separate operations, NOT atomic; clients must handle partial failures.
Calculated totals/snapshotted prices are supplied explicitly, not recomputed.

JSON objects only, Content-Type application/json, max streamed body 64 KiB.
Unknown fields rejected. Text max 10,000 chars. Numeric values must be JSON
numbers >=0 and <=1e12; quantities/batch/expiry counts require positive integers
where applicable. Dates require real YYYY-MM-DD calendar dates; expiry cannot
precede production. Fraction materials require positive fraction_grams and
fraction_unit g/ml (including merged PATCH state).

## Receipt payment paid_date correction

`PATCH /receipt-payments/:id` with `{"paid_date":"YYYY-MM-DD","expected_paid_date":"YYYY-MM-DD"}`.
Only `paid_date` is writable; no POST/DELETE, no other fields. `paid_date` must be
a real calendar date and not after today in Malaysia (UTC+8). `expected_paid_date`
is required and must equal the stored value (optimistic concurrency guard); a
mismatch returns 409 (re-read and retry), a missing id returns 404, bad input 400.

## Ads payment records (ads-payments)

Write path mirrors the Payment History UI (Mark as Paid and saved transfer links).
Owner approval is still required before any real (non dry_run) write: show the
dry_run result first. Money is handled in integer sen; `total_amount` must equal
the sum of the selected record amounts exactly. Links must be `https://` URLs
(max 2000 chars). Text fields max 2000 chars. Clear a field with `null`.

**Migration required first:** apply `supabase/migrations/20261110000000_ads_payment_api_audit.sql`
(adds `reference`, `notes`, `created_by`, `updated_by`, `updated_at` to `ads_payment`).
Until it is applied, POST and PATCH return 400 "Database rejected the request".

Actor audit: `created_by`/`updated_by` are `bot:<BOT_KEY_NAME>` (default `bot:mywork-bot`)
or `user:<uuid>` for Bearer callers. Each successful mutation writes one JSON log line
(`ads_payment.create|update|delete`) without headers or keys.

### POST /ads-payments

```json
{
  "record_ids": ["103", "104"],
  "total_amount": 3319.43,
  "paid_date": "2026-10-15",
  "reference": "TRF-1",
  "notes": "Oktober",
  "transfer_own_acc_link": "https://drive.google.com/file/d/EXAMPLE_OWN/view",
  "transfer_cc_link": null,
  "dry_run": true
}
```

- `record_ids` (required): 1–100 unique record IDs (strings, or safe JSON integers).
- `total_amount` (required): number > 0, at most 2 decimals.
- `paid_date` (required): real `YYYY-MM-DD`, not after today (Malaysia).
- `reference`, `notes`, `transfer_own_acc_link`, `transfer_cc_link` (optional).
- `dry_run` (optional, default false). Unknown fields return 400.

`dry_run: true` returns 200 with no writes:

```json
{"dry_run":true,"data":{"payment":{"total_amount":3319.43,"paid_date":"2026-10-15","reference":"TRF-1","notes":"Oktober","transfer_own_acc_link":"https://drive.google.com/file/d/EXAMPLE_OWN/view","transfer_cc_link":null,"created_by":"bot:mywork-bot"},"records":[{"id":"103","amount":1120.38,"date":"2026-10-15","ads_platform":"tiktok","title":"Iklan A"},{"id":"104","amount":2199.05,"date":"2026-10-15","ads_platform":"shopee","title":"Iklan B"}],"records_total":3319.43}}
```

Real write (same body, `dry_run` false or omitted) returns 201. The payment is
inserted first, then the records are linked with a guard (`payment_id IS NULL`):

```json
{"data":{"payment":{"id":500,"total_amount":3319.43,"paid_date":"2026-10-15","reference":"TRF-1","notes":"Oktober","transfer_own_acc_link":"https://drive.google.com/file/d/EXAMPLE_OWN/view","transfer_cc_link":null,"created_by":"bot:mywork-bot","updated_by":"bot:mywork-bot","updated_at":"2026-10-15T08:00:00.000Z"},"records":[{"id":"103","payment_id":500,"amount":1120.38},{"id":"104","payment_id":500,"amount":2199.05}]}}
```

### PATCH /ads-payments/:id

Only `transfer_own_acc_link`, `transfer_cc_link`, `notes`, `reference` (at least one).
Any other field (including `total_amount`, `paid_date`, `record_ids`, `payment_id`)
returns 400 `Invalid or unknown field: X`.

```json
{"transfer_own_acc_link":"https://drive.google.com/file/d/EXAMPLE_OWN/view","transfer_cc_link":null,"notes":"Disahkan"}
```

Returns 200 `{"data":{...full ads_payment row...}}`. Optional `"dry_run":true`
returns 200 `{"dry_run":true,"data":{"before":{...},"after":{...}}}` with no write.

### DELETE /ads-payments/:id

Undo a mistake. The body is optional; if sent it must be JSON with only `dry_run`.
Records are unlinked first, then the payment is deleted. The database has no
soft delete, so the returned snapshot is the backup.

```json
{"data":{"deleted_payment":{"id":500,"total_amount":3319.43,"paid_date":"2026-10-15","reference":"TRF-1","notes":"Oktober","transfer_own_acc_link":null,"transfer_cc_link":null,"created_by":"bot:mywork-bot","updated_by":"bot:mywork-bot","updated_at":"2026-10-15T08:00:00.000Z"},"unlinked_record_ids":["103","104"]},"backup_note":"Deleted row returned above; keep it to restore."}
```

`dry_run: true` in the body returns 200 `{"dry_run":true,"data":{"payment":{...},"records":[...]}}`.

### Errors

| Status | Body | Meaning |
| --- | --- | --- |
| 400 | `{"error":"Record amounts do not match total_amount","records_total":3319.43,"total_amount":3319.42}` | Sum of record amounts differs by any sen |
| 400 | `{"error":"Invalid or unknown field: total_amount"}` | Field not allowed on this method |
| 404 | `{"error":"Ads record(s) not found","missing_ids":["999"]}` | A record ID does not exist |
| 404 | `{"error":"Record not found"}` | Payment ID missing (PATCH/DELETE) |
| 409 | `{"error":"Ads record(s) already linked to a payment","linked":[{"id":"103","payment_id":77}]}` | A record already has a payment |
| 409 | `{"error":"Linking failed; payment rolled back"}` | Another request linked a record first; the new payment was removed |
| 502 | `{"error":"Linking failed; payment rolled back"}` | Link step had a database error; the new payment was removed |
| 502 | `{"error":"Unlink failed; nothing deleted"}` | DELETE stopped before deleting anything |
| 502 | `{"error":"Delete failed; records re-linked"}` | DELETE failed after unlinking; records were linked back |
| 500 | `{"error":"Rollback incomplete","payment_id":500}` | Compensation failed. A human must check payment 500 and records with `payment_id` 500 |

Database messages are never returned. Partial writes can only be undone by the
compensation steps above; PostgREST here has no multi-statement transaction.

## Collection filters

Common: `limit=1..100` (default50), `offset=0..1000000`, `sort=<writable field|id|created_at|date field>`,
`order=asc|desc` (default desc). Stable ID tie-breaker; empty/null dates last.
Unknown/repeated parameters rejected. Joins and `select` are not supported;
read related resources by their foreign IDs instead.

- `q` literal case-insensitive substring: inventory product_name, stock batch_no,
  ads title, materials name, recipes recipe_name, purchase plans notes.
- `from`, `to` inclusive dates: stock production_date, ads date, receipts
  receipt_date, plans plan_date, ads/receipt payments paid_date, wage date_paid.
- `paid=true|false`: stocks paid_date present/null, ads/receipts payment_id present/null.
- stocks: `inventory_id`, `production_name`, `is_finished=true|false`.
- ads: `ads_platform=tiktok|shopee`.
- recipes: `inventory_id`.
- ingredients: `recipe_id`, `raw_material_id`.
- purchase items: `purchase_plan_id`, `raw_material_id`.
- purchase batches: `purchase_plan_id`, `inventory_id`.

Response: `{data:[...], pagination:{limit,offset,total}}` for lists,
`{data:{...}}` for item/create/update/delete. DELETE returns the removed row.
Errors: 400 invalid input, 401 rejected credentials/role, 404 missing row,
405 forbidden method, 409 database conflict, 429 burst limit, 502 upstream
failure, 503 unconfigured server. Database internals never returned.

## Example client

Load MYWORK_API_URL and MYWORK_BOT_KEY from your local secret manager, not Git:

```bash
curl --get "$MYWORK_API_URL/inventory" \
  -H "X-Bot-Key: $MYWORK_BOT_KEY" --data-urlencode 'q=pes' --data-urlencode 'limit=10'

curl "$MYWORK_API_URL/stock-productions?paid=false&from=2026-10-01&to=2026-10-21" \
  -H "X-Bot-Key: $MYWORK_BOT_KEY"

# Only execute an actual mutation after reviewing the intended record/body.
curl -X PATCH "$MYWORK_API_URL/inventory/$INVENTORY_ID" \
  -H "X-Bot-Key: $MYWORK_BOT_KEY" -H 'Content-Type: application/json' \
  --data '{"wage_rate":2.50}'
```

## Local testing and rollout

1. `npm run dev` verifies existing UI at localhost:5173. Vite alone does NOT
   serve the API. `npm run dev:api` serves the exact function handler on
   127.0.0.1:8788/api/v1 using ignored `.dev.vars` (see `.dev.vars.example`).
2. `npm run test:api`: isolated mocked upstream tests; no production mutations.
3. `npx eslint src/ functions/` and `npm run build`.
4. Real Pages runtime: `wrangler pages dev dist` with `.dev.vars`.
   Built `dist/_routes.json` invokes functions only for `/api/*`.
5. Configure real secrets and confirm profile role protection/RLS in Supabase.
6. After explicit deploy/push approval, deploy via existing Git integration.
7. Test missing/wrong credential rejection, then authenticated read of each
   resource, filters and one disposable sandbox CRUD record. Do not test writes
   against production business records. Local mocks do not prove live schema.

Rotate lost/exposed bot key by generating a replacement, updating BOT_API_KEY
in each deployed environment and updating trusted clients. Old key stops
working; no database data is lost. Never put key values in API documentation.

Verification (21 October 2026): 22 isolated tests pass; lint, Vite build and
Pages Functions compilation pass. Server credentials are stored only in ignored
`.dev.vars` with permissions 0600. The configured bot identity was verified as
an existing super_admin with no pending password change. Authenticated discovery
and GET collection/item succeeded for all 13 resources against the real
Supabase database. `npm run test:api:integration` passed 39 read-only checks,
including literal product search, date/paid/boolean filters, pagination and
missing/wrong credential rejection. No business records were changed.
Mutation behavior against a sandbox, remaining filter combinations and
database role-protection policies still require separate verification.
Deployment completed on 21 October 2026 to Cloudflare Pages project
`bol-services` (GitHub repository `ffgamerz/mywork`, branch main). All 39 read-only
integration checks also passed over live HTTPS. No database migrations or
business record mutations were performed. Mutation operations remain mock-tested.

Live verification command:
```bash
MYWORK_API_URL=https://bol-services.pages.dev/api/v1 npm run test:api:integration
```
