# Token Saving Strategy untuk Project ni

## 1. Guna Graphify sebagai "Entry Point" Wajib

** sebelum** bagi apa-apa task ke AI (Code mode), minta dia check [`graphify-out/graph.json`](graphify-out/graph.json) dulu.

```
Prompt template:
"Check graphify-out/graph.json first. Only read source files if graph data is insufficient."
```

Ini dah ada dalam [`rules.md`](.roo/rules/rules.md) — Graphify-First Rule — pastikan rules tu sentiasa aktif.

## 2. Baca Hanya Line Yang Relevan Guna `indentation` mode

Daripada baca full file guna `slice` mode (baca dari L1), guna `indentation` mode dengan `anchor_line` yang tepat.

```
read_file:
  path: src/ProductionPlanning.jsx
  mode: indentation
  indentation:
    anchor_line: 70    # line function ProductionPlanning() starts
    max_levels: 0      # unlimited
    include_siblings: false
```

Ini akan return **satu complete function block** — bukan 600+ lines sekali gus.

## 3. Query graph.json dengan Python (bila boleh execute command)

Kalau mode benarkan `execute_command`, tanya graph.json direct:

```bash
python3 -c "
import json
g = json.load(open('graphify-out/graph.json'))
# Cari semua edges dari ProductionPlanning
for e in g['links']:
    if 'productionplanning' in e.get('source','') or 'productionplanning' in e.get('target',''):
        print(e['relation'], e.get('source_file',''), e.get('source_location',''))
"
```

Ini **zero token cost** sebab guna CPU tempatan.

## 4. Guna `search_files` untuk precise targeting

Daripada baca file besar, cari exact match dulu:

```
search_files:
  path: src
  regex: "<title>|<h[1-6]|color|style"
  file_pattern: "*.jsx"
```

Ini return line numbers → guna `indentation` mode dengan `anchor_line` dari situ.

## 5. Kenal pasti "Hot Zones" — Files yang jarang berubah

| File | Size (approx) | Kekerapan baca |
|------|--------------|----------------|
| `supabaseClient.js` | Kecil | Jarang berubah |
| `main.jsx` | Kecil | Jarang berubah |
| `App.jsx` | Sederhana | routing pattern stable |
| `ProductionPlanning.jsx` | **Besar (>600 lines)** | Sering diubah **tapi** guna indentation mode |
| `Inventory.jsx` | Sederhana | Moderate |
| `ToastBar.jsx` | Kecil | Stable (UI component) |

**Strategi:** Cache mental pattern untuk file yang jarang berubah. Jangan baca semula tiap kali.

## 6. Batch Multiple Edits dalam Satu Prompt

Daripada:
```
Turn 1: tukar color title merah
Turn 2: tukar font size
Turn 3: tambah margin
```

BUAT:
```
Prompt: "Tukar title ke merah, font size 24px, dan tambah margin-bottom 16px"
```

Setiap turn ada base token overhead (system prompt, conversation history) — kurangkan turn = jimat banyak token.

## 7. Guna `apply_diff` untuk precise edits — bukan `write_to_file`

`write_to_file` rewrite **entire file** → burn banyak token.
`apply_diff` hanya hantar **SEARCH/REPLACE block** → jauh lebih jimat.

Tapi `apply_diff` kena ada exact content — sebab tu guna `read_file` dulu dengan indentation mode untuk dapatkan exact lines.

## 8. Simpan Plan dalam `.md` — bukan dalam conversation

Daripada panjang lebar dalam chat, simpan analysis dalam [`plans/`](plans/) directory.

Contohnya:
- [`plans/production-planning-redesign.md`](plans/production-planning-redesign.md) — analysis refactoring
- [`plans/token-saving-strategy.md`](plans/token-saving-strategy.md) — ni lah dia

Bila next task, refer terus ke file ni → tak perlu ulang context.

---

## Flow Optimized

```
Task Masuk
    │
    ▼
[1] Check graph.json — faham dependencies (0 token cost)
    │
    ▼
[2] search_files untuk cari exact line number (low token)
    │
    ▼
[3] read_file indentation mode — baca specific block (low token)
    │
    ▼
[4] apply_diff — hantar minimal changes (low token)
    │
    ▼
Selesai — max 3-4 tool calls, token optimized ✅
```
