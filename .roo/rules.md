# Graphify-First Rule

Before making any code changes or reading source files in this project:

1. Check if `graphify-out/graph.json` exists
2. If yes, query it with Python `json` module to understand dependencies, affected files, and structure
3. Only read source files if the graph data is insufficient
4. If code may have changed since last graph build, run `graphify update . --code-only` first

This saves tokens by avoiding unnecessary file reads.
