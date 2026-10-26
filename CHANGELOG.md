# Changelog

## 0.1.0 — unreleased

- Persian RTL, Saturday-first Jalali picker for dashboard Time range native
  filters, including embedded dashboards with guest tokens; no Superset frontend
  build or Node installation needed by users.
- Calendar selection, Persian/Arabic/Latin date input, raw expressions and
  clearing the filter; inclusive UI dates emit standard half-open Gregorian
  ranges that remain valid after removing the plugin.
- Rolling today/yesterday and 7/30/90-day presets; fixed current/previous month
  and year presets computed using Tehran dates.
- Same-origin, fail-safe dynamic plugin discovery, immutable hashed bundles,
  URL-prefix support, existing-route preservation and a picker kill switch.
- Health endpoint reports package version, bundle name and missing/invalid
  bundle states without caching; health does not imply browser execution.
- Optional PostgreSQL Jalali Jinja macros provide 13 display/grouping columns
  through an inline year-table join, with configurable year bounds, Persian
  digits, strict identifier validation and NULL values for unmatched dates.
- Shared Nowruz table, unit tests, wheel build, and Trusted Publishing workflow.
- Tehran today ring, Friday weekend colours, and RTL arrow-key day navigation
  with one Tab stop; date input edits retain focus.
- Fixed full-week, current-season and previous-season presets using Tehran dates.
- Centred, viewport-bounded popover for overflowing filter bars.
- Consistent Persian weekday ZWNJ spelling and readable season keys such as
  `1403-3 پاییز`.
- Popover key-event isolation prevents Escape, Tab and handled calendar/button
  keys from reaching parent dialogs; Escape closes the picker and returns focus
  to its trigger, while Tab/Shift+Tab remain trapped inside it.
- Optional validated `tz` argument and `sql_timezone` default for PostgreSQL
  `timestamptz` macros; both macros must use the same timezone.
- Inherited host font, copied to the portaled popover, and light/dark palettes
  detected on each opening with accessible text and calendar state contrast.
- Trigger accessible name announces the Persian selection instead of the
  internal filter id; preserves the title tooltip and a debugging data attribute.
- Idempotent startup mutator chain preserves the existing mutator and logs an
  ERROR when dynamic plugins are enabled without their discovery route.
- Incomplete or invalid calendar ranges are discarded silently when switching
  tabs; valid ranges remain in the draft. Manual month/year navigation clears
  stale arrow-key focus requests, preventing the grid from stealing focus.
- Release checklist and expanded real-instance verification steps; Superset
  runtime verification remains pending.
- Column arguments accept double-quoted identifiers for mixed-case PostgreSQL
  columns.
- The year join is an equality join on the Gregorian year, which PostgreSQL
  runs as a hash join with one lookup per row.
