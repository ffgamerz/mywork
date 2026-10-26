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
so read the row before editing; payment linking and marking paid are excluded.

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
| ads-payments | ads_payment | Read only |
| receipt-payments | receipts_payment | PATCH only: `paid_date` (+ required guard `expected_paid_date`), see below |
| wage-payments | wage_payments | Read only |

No auth/user management, role changes, payment execution/mark-paid, receipt file
upload or storage signing endpoints. No automatic shopping-list or wage
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
