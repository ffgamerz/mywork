# Cara Setup Rules Secara Global untuk Semua Projek

## Masalah

[`.roo/rules/rules.md`](.roo/rules/rules.md) hanya wujud dalam project `mywork` ni. Projek baru atau projek lain tak akan ada rules ni — jadi AI tak akan guna token-saving strategy.

## Penyelesaian: Ada 3 Cara

---

## Cara 1: Global Custom Instructions ✅ **PALING MUDAH**

Roo Code ada setting **global custom instructions** yang akan digunakan untuk **setiap projek** tanpa perlu buat apa-apa.

**Langkah:**
1. Buka VS Code Settings (`Cmd + ,`)
2. Cari `roo-cline.customInstructions` atau `Roo Code: Custom Instructions`
3. Paste content rules ni:

```
# Graphify-First Rule

Before making any code changes or reading source files in this project:

1. Check if `graphify-out/graph.json` exists
2. If yes, query it with Python `json` module or read it directly to understand dependencies, affected files, and structure
3. Only read source files if the graph data is insufficient
4. If code may have changed since last graph build, run `graphify update . --code-only` first

This saves tokens by avoiding unnecessary file reads.

# Token-Saving Reading Strategy

When you MUST read source files, use this order of operations to minimise token usage:

### Step 1: `search_files` first
Use regex search to find exact lines before reading any file.

### Step 2: `read_file` with `indentation` mode
NEVER read full files with `slice` mode. Always use `indentation` mode with the `anchor_line` from search results.

### Step 3: `apply_diff` for edits
Use `apply_diff` with precise SEARCH/REPLACE blocks. Do NOT use `write_to_file` for existing files.

### Step 4: Batch all changes in one turn
Combine multiple related changes into a single prompt instead of making them one-by-one.
```

**Kelebihan:**
- ✅ Sekali setup, semua projek guna
- ✅ Tak perlu buat apa-apa untuk projek baru
- ✅ Override kalau project `.roo/rules/rules.md` wujud (project-level menang)

**Kekurangan:**
- Kena edit setting manually (tapi sekali je)

---

## Cara 2: Simpan Master Rules dalam Home Directory

Buat satu master rules file di home directory, then symlink dari setiap project.

**Langkah 1: Buat master rules**
```bash
mkdir -p ~/.roo-rules
cp /Users/azmanrazali/web/mywork/.roo/rules/rules.md ~/.roo-rules/rules.md
```

**Langkah 2: Symlink untuk setiap project**
```bash
# Dalam setiap project
ln -sf ~/.roo-rules/rules.md .roo/rules/rules.md
```

**Kelebihan:**
- ✅ Update satu tempat, semua project dapat
- ✅ Boleh version control master rules

**Kekurangan:**
- ❌ Kena buat symlink untuk setiap project (termasuk projek baru)
- ❌ Windows maybe problematic with symlinks

---

## Cara 3: Custom Mode dengan Built-in Rules

Buat custom mode dalam [`custom_modes.yaml`](.../settings/custom_modes.yaml) yang ada rules terus dalam roleDefinition:

```yaml
customModes:
  - slug: token-saver
    name: "🪙 Token Saver"
    roleDefinition: |
      You are a token-efficiency expert.

      RULES:
      1. Before reading any file, check graphify-out/graph.json first
      2. Use search_files to find exact line numbers
      3. Use read_file with indentation mode - NEVER read full files
      4. Use apply_diff for edits - NEVER use write_to_file for existing files
      5. Batch all changes in minimal turns
    groups:
      - read:
        - graphify-out/**
        - src/**/*.jsx
        - src/**/*.js
      - edit:
        - src/**/*.jsx
        - src/**/*.js
```

Then bila guna mode ni dalam mana-mana project, rules akan terpakai.

**Kelebihan:**
- ✅ Boleh guna mode lain kalau nak bypass rules
- ✅ Rules terbina dalam mode — tak perlu rules file

**Kekurangan:**
- ❌ Kena ingat guna mode ni (tak automatik macam Cara 1)
- ❌ Kena define mode dulu

---

## Recommendation

| Cara | Setup | Maintenance | Coverage | Rating |
|------|-------|-------------|----------|--------|
| **1: Global Custom Instructions** | 2 minit sekali | Zero | Semua projek ✅ | 🏆 |
| 2: Symlink Master Rules | 1 minit per projek | Update one place | Projek aktif je | 👍 |
| 3: Custom Mode | 5 minit sekali | Zero | Bila guna mode tu | 👌 |

**🏆 GLOBAL CUSTOM INSTRUCTIONS adalah yang paling praktikal.**

Sebab:
1. Setup **sekali** — lupa pasal
2. Cover **semua projek** — even projek yang belum dibuat
3. Project-level `.roo/rules/rules.md` **akan override** kalau ada — so boleh customize per project bila perlu
4. Tak perlu maintain symlink, tak perlu ingat nak switch mode
