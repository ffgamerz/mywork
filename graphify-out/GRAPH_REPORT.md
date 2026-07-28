# Graph Report - mywork  (2026-07-28)

## Corpus Check
- 23 files · ~18,291 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 94 nodes · 136 edges · 13 communities (10 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4261ee22`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- devDependencies
- App.jsx
- dependencies
- package.json
- useToast
- ErrorBoundary
- ProductionPlanning.jsx
- React + Vite
- .roo/rules.md
- rules/rules.md

## God Nodes (most connected - your core abstractions)
1. `supabase` - 11 edges
2. `useToast()` - 9 edges
3. `ErrorBoundary` - 7 edges
4. `scripts` - 5 edges
5. `ProductionPlanning()` - 5 edges
6. `ToastBar()` - 4 edges
7. `App()` - 3 edges
8. `MyWage()` - 3 edges
9. `stripTrailing()` - 3 edges
10. `formatPurchaseQty()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `useToast()`  [EXTRACTED]
  src/App.jsx → src/utils/useToast.js
- `MyWage()` --calls--> `useToast()`  [EXTRACTED]
  src/MyWage.jsx → src/utils/useToast.js
- `ReceiptManager()` --calls--> `useToast()`  [EXTRACTED]
  src/ReceiptManager.jsx → src/utils/useToast.js
- `WageCalculator()` --calls--> `useToast()`  [EXTRACTED]
  src/WageCalculator.jsx → src/utils/useToast.js

## Import Cycles
- None detected.

## Communities (13 total, 3 thin omitted)

### Community 0 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, devDependencies, eslint, @eslint/js (+11 more)

### Community 1 - "App.jsx"
Cohesion: 0.26
Nodes (9): ADS_PLATFORMS, AdsRecordManager(), cardColors, navItems, Inventory(), Login(), Privileges(), Settings() (+1 more)

### Community 2 - "dependencies"
Cohesion: 0.15
Nodes (13): bootstrap, jspdf, jspdf-autotable, dependencies, bootstrap, jspdf, jspdf-autotable, react (+5 more)

### Community 3 - "package.json"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 4 - "useToast"
Cohesion: 0.44
Nodes (5): ToastBar(), MyWage(), ReceiptManager(), useToast(), WageCalculator()

### Community 6 - "ProductionPlanning.jsx"
Cohesion: 0.60
Nodes (4): calcIngredientCost(), formatPurchaseQty(), ProductionPlanning(), stripTrailing()

### Community 9 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

## Knowledge Gaps
- **30 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._