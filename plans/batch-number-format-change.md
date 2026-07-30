# Batch Number Format Change Plan

## Problem

When recording inventory production, the batch number is auto-generated with a `BATCH-` prefix (e.g., `BATCH-001`). The user wants:

1. **Remove the `BATCH-` prefix** — batch number should be purely numeric
2. **Default starting batch** for a new product (first production record) should be `010001`
3. **Increment logic** — subsequent batches should simply increment by +1 from the previous batch number for that product, maintaining the same number of digits

## Current Code (Inventory.jsx)

### Line 29 — Default state
```jsx
const [prodBatch, setProdBatch] = useState('BATCH-001')
```

### Lines 91-104 — Auto-generation useEffect
```jsx
useEffect(() => {
    let mounted = true
    if (!isStockModalOpen) return
    Promise.resolve().then(() => {
      if (!mounted) return
      if (productions.length === 0) setProdBatch('BATCH-001')
      else {
        const latestProd = productions[0]; const match = (latestProd?.batch_no || 'BATCH-000').match(/\d+$/)
        if (match) setProdBatch(`BATCH-${String(parseInt(match[0], 10) + 1).padStart(match[0].length, '0')}`)
        else setProdBatch(`BATCH-${productions.length + 1}`)
      }
    })
    return () => { mounted = false }
  }, [isStockModalOpen, productions])
```

## Required Changes

### 1. Change default state (line 29)
| Before | After |
|--------|-------|
| `'BATCH-001'` | `'010001'` |

### 2. Change auto-generation logic (lines 96-101)

| Scenario | Before | After |
|----------|--------|-------|
| No productions exist | `setProdBatch('BATCH-001')` | `setProdBatch('010001')` |
| Productions exist, regex matches | `BATCH-{incremented}` | just `{incremented}` (no prefix) |
| Productions exist, no regex match (fallback) | `BATCH-{productions.length + 1}` | pad to 6 digits: `String(productions.length + 1).padStart(6, '0')` |

**Key insight:** Since the new batch numbers are purely numeric (e.g., `010001`), the regex `/\d+$/` will match the **entire** string. So:
- `parseInt('010001', 10)` = `10001`
- `10001 + 1` = `10002`
- `.padStart(6, '0')` = `'010002'` ✅

### 3. Other touch points — No changes needed

| Function | Reason |
|----------|--------|
| `handleAddStock` (line 130) | Uses `prodBatch` state directly — no change needed |
| `handleOpenEditStockModal` (line 137) | Sets `prodBatch` from existing `stock.batch_no` — no change needed |
| `handleUpdateStock` (line 145) | Uses `prodBatch.trim()` — no change needed |

### 4. Backward compatibility

Existing records in the database still have old `BATCH-xxx` batch numbers. This is fine because:
- The change only affects **new** batch number generation
- Existing `BATCH-xxx` values are never re-processed by the generation logic
- Display of old records is unaffected — they show whatever `batch_no` is stored

## Files to Modify

| File | Lines | What |
|------|-------|------|
| `src/Inventory.jsx` | 29 | Default state value |
| `src/Inventory.jsx` | 96-101 | Auto-generation logic |

## Summary of Logic After Change

```
if no productions exist:
    batch = 010001
else:
    extract numeric part from latest batch_no (e.g., "010001")
    increment by 1 (e.g., 010002)
    maintain same digit count
```
