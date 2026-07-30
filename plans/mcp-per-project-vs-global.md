# MCP Setup: Per-Project vs Global

## Jawapan Pendek

**Layer 2 ada 2 komponen — satu kena per-project, satu boleh global.**

| Komponen | Kena Setup Per Project? | Kenapa? |
|----------|------------------------|---------|
| [`.roo/rules/rules.md`](.roo/rules/rules.md) | ✅ **Ya** | Rules tu specifik untuk project tu |
| MCP `graphify` serve | ❌ **Tak perlu** — kalau guna alternatif |

## Pilihan Setup MCP

### Pilihan A: Global MCP (Sekali setup, untuk semua project)

Letak dalam **global settings** (`mcp_settings.json`):

```json
{
  "mcpServers": {
    "graphify": {
      "command": "python",
      "args": ["-m", "graphify.serve", "/absolute/path/to/current/project/graph.json"]
    }
  }
}
```

**Masalah:** Path dia absolute — hanya untuk SATU project. Kalau buka project lain, MCP serve graph yang salah.

### Pilihan B: Project MCP — `.roo/mcp.json` (Per project ✅)

Dalam setiap project, buat `.roo/mcp.json`:

```json
{
  "mcpServers": {
    "graphify": {
      "command": "python",
      "args": ["-m", "graphify.serve", "/Users/azmanrazali/web/mywork/graphify-out/graph.json"]
    }
  }
}
```

**Masalah:** Kena buat untuk setiap project. Tapi Antigravity IDE akan baca `.roo/mcp.json` project dulu — dia override global.

### Pilihan C: 🏆 **REKOMENDASI — Guna Python json module (Zero Config)**

Ini **dah ada dalam [`rules.md`](.roo/rules/rules.md) point #2**:

> "query it with Python `json` module to understand dependencies"

**Ini maksudnya:**
- Tak perlu MCP serve langsung
- Setiap kali nak query graph, AI guna `read_file` untuk baca [`graphify-out/graph.json`](graphify-out/graph.json)
- Atau (dalam Code mode) guna `execute_command` + Python
- **Works for ANY project** yang ada `graphify-out/graph.json`
- **Zero setup** — just copy rules file

### Pilihan D: Smart Wrapper Script (Advanced)

Buat satu script `graphify-query` dalam PATH:

```bash
#!/bin/bash
# ~/bin/graphify-query
# Detect current project dari working directory
PROJECT_DIR=$(pwd)
# Cari graph.json naik ke parent directories
GRAPH_FILE=$(find "$PROJECT_DIR" -maxdepth 3 -name "graph.json" -path "*/graphify-out/*" | head -1)
if [ -z "$GRAPH_FILE" ]; then
  echo "No graph.json found"
  exit 1
fi
python3 -m graphify.serve "$GRAPH_FILE"
```

Then MCP global pointing ke script ni:
```json
{
  "graphify": {
    "command": "bash",
    "args": ["-c", "~/bin/graphify-query"]
  }
}
```

**Power.** Tapi overkill untuk sekarang.

---

## Recommendation untuk Awak

| Lapisan | Setup | Maintenance | Power |
|---------|-------|-------------|-------|
| Layer 1: Rules sahaja | 2 minit per project | Senang | ✅ Cukup |
| Layer 2: Rules + read_file graph.json | ✅ **Paling praktikal** | Senang | ✅✅ Power |
| Layer 2: Rules + MCP serve | 5 minit setup + per project | Sederhana | ✅✅✅ Maximum |
| Layer 3: Custom Mode | 10 minit sekali | Senang | ✅✅✅✅ |

**Yang paling praktikal untuk awak:**
1. Copy [`rules.md`](.roo/rules/rules.md) ke setiap project — **2 minit**
2. Dalam rules tu, suruh AI guna `read_file` untuk baca `graphify-out/graph.json` direct
3. Tak payah setup MCP langsung

**Sebab MCP serve guna absolute path** — jadi untuk multi-project, cara paling bersih adalah guna Python json module direct. Jimat setup, jimat headache.
