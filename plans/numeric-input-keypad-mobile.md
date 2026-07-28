# Mobile Numeric Keypad for Number Inputs

## Problem

On mobile devices, `<input type="number">` fields sometimes show a full keyboard with symbol rows, or a numeric pad that includes non-numeric buttons (like `-`, `+`, `,`, etc.). The user wants **only the numeric keypad** to appear when tapping any number input on mobile.

## Solution

Add the `inputMode` attribute to all numeric `<input>` fields:

- **`inputMode="decimal"`** — For inputs accepting decimal/float values (e.g., price, wage rate, quantity with decimals). Shows numeric keypad with decimal point (`.`).
- **`inputMode="numeric"`** — For inputs accepting only whole integers (e.g., batch count, quantity, shelf life months). Shows numeric keypad without decimal point.

This is standard HTML and works across all modern mobile browsers (iOS Safari, Chrome, etc.).

## Files to Modify

### 1. [`src/ProductionPlanning.jsx`](../src/ProductionPlanning.jsx)

| Line | Input | Current Type | inputMode |
|------|-------|-------------|-----------|
| 512 | `matPrice` (Price RM) | `type="number" step="0.01"` | `decimal` |
| 520 | `matFractionG` (grams/ml) | `type="number" step="any"` | `decimal` |
| 559 | `ingQty` (Qty Used) | `type="number" step="any"` | `decimal` |
| 615 | `batch_count` | `type="number" min="1"` | `numeric` |
| 663 | `manualQty` (override qty) | `type="number" min="0" step="0.01"` | `decimal` |
| 802 | `editRecordQtys` | `type="number" min="0" step="0.01"` | `decimal` |

### 2. [`src/Inventory.jsx`](../src/Inventory.jsx)

| Line | Input | Current Type | inputMode |
|------|-------|-------------|-----------|
| 265 | `prodQty` (Add Stock - Quantity) | `type="number"` | `numeric` |
| 294 | `prodQty` (Edit Stock - Quantity) | `type="number"` | `numeric` |
| 379 | `expiryMonth` (Shelf Life) | `type="number"` | `numeric` |
| 380 | `wageRate` (Wage Rate per Unit) | `type="number" step="0.01"` | `decimal` |
| 401 | `editExpiryMonth` (Edit - Shelf Life) | `type="number"` | `numeric` |
| 402 | `editWageRate` (Edit - Wage Rate) | `type="number" step="0.01"` | `decimal` |

### 3. [`src/AdsRecordManager.jsx`](../src/AdsRecordManager.jsx)

| Line | Input | Current Type | inputMode |
|------|-------|-------------|-----------|
| 107 | `amount` (Add - Amount RM) | `type="number" step="0.01"` | `decimal` |
| 178 | `editAmount` (Edit - Amount RM) | `type="number" step="0.01"` | `decimal` |

### 4. [`src/ReceiptManager.jsx`](../src/ReceiptManager.jsx)

| Line | Input | Current Type | inputMode |
|------|-------|-------------|-----------|
| 142 | `amount` (Receipt Amount RM) | `type="number" step="0.01"` | `decimal` |
| 201 | `wageAmount` (Wage Rate RM) | `type="number" step="0.01"` | `decimal` |

### Files with NO changes needed (no numeric inputs):

- [`src/WageCalculator.jsx`](../src/WageCalculator.jsx) — Only `type="date"` and `type="text"` inputs
- [`src/MyWage.jsx`](../src/MyWage.jsx) — Only `type="date"` and `type="text"` inputs
- [`src/Settings.jsx`](../src/Settings.jsx) — Only `type="password"` and `type="text"` inputs
- [`src/Privileges.jsx`](../src/Privileges.jsx) — Only `type="text"`, `type="email"`, `type="password"` inputs
- [`src/Login.jsx`](../src/Login.jsx) — Only `type="email"` and `type="password"` inputs
- [`src/App.jsx`](../src/App.jsx) — Only `type="password"` inputs

## Implementation Pattern

Each change follows this pattern:

```jsx
// Before
<input type="number" step="0.01" ... />

// After (decimal)
<input type="number" step="0.01" inputMode="decimal" ... />

// After (integer)
<input type="number" inputMode="numeric" ... />
```

## Notes

- No CSS or JavaScript changes needed — this is purely an HTML attribute addition.
- No breaking changes — `inputMode` is a progressive enhancement; unsupported browsers simply ignore it.
- The `type="number"` is preserved for desktop browsers to still show spin buttons and validate numeric input.
