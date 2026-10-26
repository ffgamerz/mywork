# Mywork API — panduan untuk AI lain

## Status dan konfigurasi

API sudah live dan diuji pada Cloudflare Pages (projek `bol-services`, repo `mywork`).

**Base URL: `https://bol-services.pages.dev/api/v1`**

Gunakan key Mywork yang diberikan pemilik melalui saluran secret.

Untuk mesin lokal pemilik:

```bash
cd /Users/azmanrazali/web/mywork
npm run dev:api
```

Base URL lokal: `http://127.0.0.1:8788/api/v1`.
Vite di port5173 hanya frontend. AI di mesin lain tidak boleh menggunakan
localhost komputer pemilik; gunakan URL HTTPS live di atas.

Pemilik perlu menyediakan dua environment variable pada mesin AI:

```text
MYWORK_API_URL=https://bol-services.pages.dev/api/v1
MYWORK_BOT_KEY=<API key Mywork daripada pemilik>
```

Key diperlukan pada setiap request: `X-Bot-Key: <MYWORK_BOT_KEY>`.
Jangan guna service-role key Supabase sebagai bot key. Jangan minta password
web, cetak key, masukkan key dalam URL, commit key, atau hantar key kepada AI
lain tanpa arahan pemilik. `.dev.vars` di server mengandungi credential lebih
kuat dan **tidak boleh dikongsi**. Kongsi dokumen ini sahaja; key secara saluran
secret berasingan. Key Mywork berbeza daripada Affiliate.

Bot dipaut kepada akaun super_admin; server semak role pada setiap request.
`admin` biasa tidak dibenarkan. Bot tidak perlu login melalui browser.

## Arahan kerja untuk AI

1. Baca arahan pemilik dan panduan ini. Gunakan API untuk data Mywork.
2. Mulakan dengan `GET /api/v1` untuk discovery; simpan ID sebenar daripada
   respons. Jangan reka ID atau nama field.
3. Buat bacaan/carían dahulu. Jika banyak keputusan, tunjukkan padanan dan
   dapatkan sasaran yang jelas sebelum mengubahnya.
4. **Minta arahan/pengesahan pemilik sebelum menambah, mengubah atau memadam
   apa-apa data.** Tunjukkan rekod sasaran dan field sebelum/selepas. Arahan
   spesifik yang sudah diberi tidak perlu ditanya berulang.
5. Selepas perubahan dibenarkan, hantar satu mutation, kemudian GET ID yang
   sama dan sahkan hasil. Jangan uji API dengan rekod bisnes sebenar.
6. Jangan tandakan bayaran selesai atau jalankan pembayaran. Payment endpoints
   adalah read-only. Jangan bypass API terus ke Supabase apabila request ditolak.
7. Jangan deploy/push, ubah credential, role atau permission tanpa arahan pemilik.

## Request dan response

```bash
# Discovery
curl "$MYWORK_API_URL" -H "X-Bot-Key: $MYWORK_BOT_KEY"

# Cari produk
curl --get "$MYWORK_API_URL/inventory" \
  -H "X-Bot-Key: $MYWORK_BOT_KEY" --data-urlencode 'q=pes' --data-urlencode 'limit=20'

# Production belum dibayar untuk tempoh tertentu
curl --get "$MYWORK_API_URL/stock-productions" \
  -H "X-Bot-Key: $MYWORK_BOT_KEY" --data-urlencode 'paid=false' \
  --data-urlencode 'from=2026-10-01' --data-urlencode 'to=2026-10-21'
```

Senarai:

```json
{"data":[{"id":"ID sebenar","product_name":"Pes Kari"}],"pagination":{"limit":20,"offset":0,"total":1}}
```

Item: `{"data":{"id":"ID sebenar"}}`. Ralat: `{"error":"Unauthorized"}`.
ID boleh UUID atau bigint. Kekalkan bigint sebagai string; jangan convert
ke JavaScript Number yang mungkin hilang ketepatan.

## Resource dan operasi

| Resource | Kegunaan | Operasi |
| --- | --- | --- |
| inventory | Produk, kadar upah, tempoh luput | GET/POST/PATCH/DELETE |
| stock-productions | Batch production, kuantiti, tarikh, pekerja | GET/POST/PATCH/DELETE |
| ads-records | Perbelanjaan iklan TikTok/Shopee | GET/POST/PATCH/DELETE |
| receipt-records | Rekod resit pembelian | GET/POST/PATCH/DELETE |
| raw-materials | Bahan, unit, harga, fraction | GET/POST/PATCH/DELETE |
| product-recipes | Resipi untuk produk | GET/POST/PATCH/DELETE |
| recipe-ingredients | Bahan dan kuantiti resipi | GET/POST/PATCH/DELETE |
| purchase-plans | Pelan pembelian | GET/POST/PATCH/DELETE |
| purchase-plan-items | Item bahan dalam pelan | GET/POST/PATCH/DELETE |
| purchase-plan-batches | Bilangan batch produk dalam pelan | GET/POST/PATCH/DELETE |
| ads-payments | Rekod pembayaran iklan | GET sahaja |
| receipt-payments | Rekod pembayaran resit | GET; PATCH `paid_date` sahaja (dengan `expected_paid_date`) |
| wage-payments | Rekod pembayaran upah | GET sahaja |

GET collection `/resource`; GET/PATCH/DELETE satu rekod `/resource/ID`;
POST satu rekod `/resource`. Body mutation mesti JSON object,
`Content-Type: application/json`. Tiada bulk write.

Contoh **selepas mendapat arahan pemilik**:

```bash
# Ubah kadar upah produk tertentu
curl -X PATCH "$MYWORK_API_URL/inventory/$INVENTORY_ID" \
  -H "X-Bot-Key: $MYWORK_BOT_KEY" -H 'Content-Type: application/json' \
  --data '{"wage_rate":2.50}'

# Baca semula untuk pengesahan
curl "$MYWORK_API_URL/inventory/$INVENTORY_ID" -H "X-Bot-Key: $MYWORK_BOT_KEY"
```

Field writable dan required ada dalam respons discovery serta `API.md`.
`user_id` ditetapkan server, bukan input AI. `current_stock`, `payment_id`,
`paid_amount`, `paid_date` (kecuali receipt-payments di atas), role dan permission tidak boleh diubah melalui body.
Harga/total pembelian tidak dikira automatik. Tarikh menggunakan YYYY-MM-DD;
nilai ini date-only, bukan masa penjadualan. Gunakan tarikh Malaysia seperti
diminta pemilik; jangan tukar tarikh berdasarkan UTC secara automatik.

### Betulkan paid_date receipt-payments (selepas arahan pemilik)

Hanya `paid_date` boleh diubah, wajib bersama `expected_paid_date` (nilai semasa
yang baru dibaca). Tarikh mesti sah dan bukan masa depan (tarikh Malaysia).
409 = nilai sudah berubah, baca semula dan cuba lagi; 404 = id tiada.

```bash
curl "$MYWORK_API_URL/receipt-payments/14" -H "X-Bot-Key: $MYWORK_BOT_KEY"
curl -X PATCH "$MYWORK_API_URL/receipt-payments/14" \
  -H "X-Bot-Key: $MYWORK_BOT_KEY" -H 'Content-Type: application/json' \
  --data '{"paid_date":"2026-10-25","expected_paid_date":"2026-10-26"}'
```

## Filter dan pagination

Semua collection: `limit=1..100`, `offset`, `sort`, `order=asc|desc`.
Default50, newest created_at dahulu, null dates terakhir. Gunakan offset+limit
sehingga data.length<limit atau offset+data.length>=pagination.total (jika total
diketahui). Baca data yang boleh berubah dengan berhati-hati semasa pagination.
Tiada repeated parameters, arbitrary select, joins, OR atau SQL filter.

| Filter | Disokong pada |
| --- | --- |
| q | inventory(product_name), stock-productions(batch_no), ads-records(title), raw-materials(name), product-recipes(recipe_name), purchase-plans(notes) |
| from/to | stock production_date; ads date; receipt receipt_date; plan plan_date; payments paid_date/date_paid |
| paid=true/false | stock-productions, ads-records, receipt-records |
| inventory_id | stock-productions, product-recipes, purchase-plan-batches |
| production_name, is_finished=true/false | stock-productions |
| ads_platform=tiktok/shopee | ads-records |
| recipe_id, raw_material_id | recipe-ingredients |
| purchase_plan_id, raw_material_id | purchase-plan-items |
| purchase_plan_id | purchase-plan-batches |

`q` ialah substring literal case-insensitive. Ia bukan AI semantic search.
`paid` semak kewujudan tarikh/rujukan bayaran sahaja, bukan bukti pindahan bank.
Untuk hubungan, baca collection berasingan menggunakan foreign ID sebenar.

## Contoh Python tanpa dependency tambahan

```python
import json, os
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError

base = os.environ['MYWORK_API_URL'].rstrip('/')
key = os.environ['MYWORK_BOT_KEY']

def mywork_get(resource='', **filters):
    url = base + ('/' + resource if resource else '')
    if filters:
        url += '?' + urlencode(filters)
    req = Request(url, headers={'X-Bot-Key': key})
    try:
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    except HTTPError as error:
        # Print only status/body error; never request headers or credential.
        raise RuntimeError(f'Mywork HTTP {error.code}') from None

products = mywork_get('inventory', q='pes', limit=20)
print(products['data'])
```

## Ralat dan retry

- 400: periksa field/filter/format; jangan retry request sama.
- 401: key/role tidak sah; minta pemilik semak, jangan cuba bypass.
- 404: baca semula senarai dan sahkan ID.
- 405: operasi tidak dibenarkan (contohnya menulis payment).
- 409: konflik atau FK; tunjukkan kepada pemilik.
- 429: patuhi Retry-After, biasanya60s.
- 500/502/503: isu server/config/upstream. Bacaan boleh retry dengan backoff.
  **Jangan retry POST/PATCH/DELETE secara automatik selepas timeout**: operasi
  mungkin sudah berjaya. Baca semula dahulu untuk mengelakkan duplikasi.

Tiada transaksi berbilang resource atau idempotency key. Delete boleh mencetuskan
cascade database. Sahkan hubungan sebelum meminta pemilik meluluskan pemadaman.

## Pengesahan dan batas semasa

22 unit/security tests lulus. Integration read-only: credential betul,
semakan super_admin, discovery, semua13collection, item IDs, search produk,
filter tarikh/paid/status, pagination dan input tidak sah diuji terhadap
database sebenar. Skrip: `npm run test:api:integration` (memerlukan .dev.vars).
Tiada rekod database ditambah/diubah/dipadam untuk ujian ini.
Mutation hanya diuji dengan mock; belum diuji pada sandbox database.
Live Cloudflare URL telah lulus 39 read-only HTTP integration checks pada
21 Oktober 2026. Jalankan semula dengan:
`MYWORK_API_URL=https://bol-services.pages.dev/api/v1 npm run test:api:integration`.
Audit perlindungan role/RLS
database belum disahkan penuh. Rujuk `API.md` untuk kontrak teknikal lengkap.
