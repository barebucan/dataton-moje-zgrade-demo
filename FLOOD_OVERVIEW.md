# Flood overview v204

Derived from sealed v203. Original source rasters, geometry, depth classes and data joins remain unchanged. Default map coloring uses the most frequent scenario with an explicit modeled depth classification. Unknown or boundary classifications in more frequent scenarios produce an incomplete class. All explicit no_value classifications are required for clear. The detailed view retains all three source scenario outcomes.

No numerical flood probability or building damage risk is inferred. Existing source method, 10% footprint depth threshold and source scale remain visible. API geometry seed and bulk values carry only a compact summary; full scenario table loads in building detail.

Verification in parent tests/b-preview.json and b-derived-data.json. Desktop and mobile flows, selected-scenario share/reload, coverage totals, all four themes checked. Immutable v203 archive preserved.
