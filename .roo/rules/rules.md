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
```
search_files:
  path: src
  regex: <pattern>
  file_pattern: "*.jsx"
```
Returns line numbers → use as `anchor_line` in next step.

### Step 2: `read_file` with `indentation` mode
NEVER read full files with `slice` mode. Always use `indentation` mode with the `anchor_line` from search results.
```
read_file:
  path: src/Component.jsx
  mode: indentation
  indentation:
    anchor_line: <line_from_search>
    max_levels: 0
    include_siblings: false
```
This returns ONLY the relevant code block, not the entire file.

### Step 3: `apply_diff` for edits
Use `apply_diff` with precise SEARCH/REPLACE blocks. Do NOT use `write_to_file` for existing files — it rewrites the entire file and wastes tokens.

### Step 4: Batch all changes in one turn
Each conversation turn has a base token overhead. Combine multiple related changes into a single prompt instead of making them one-by-one.
