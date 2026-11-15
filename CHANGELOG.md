# Changelog

## 0.4.0 — unreleased

**Breaking: columns removed and renamed.** After upgrading, run
`superset jalali add-columns` (or the Jalali columns page) again on each dataset
that has plugin columns; it deletes the obsolete ones and updates the rest. SQL
that uses `jalali_columns()` must stop selecting the removed names.

- Removed the fields `month`, `month_label`, `season_key` and `weekday_key`
  (`jalali_columns()`, `jalali()`, the page and the CLI). Use `jalali_year` with
  `jalali_month_num` or `jalali_month_name`, `jalali_season`, and
  `jalali_weekday_num`.
- `weekday_num` (`jalali_weekday_num`) now starts at 1 for Saturday (1 … 7);
  it was 0 … 6.
- New field `week_of_year` (`jalali_week_of_year`): the week number of the Jalali
  year, weeks Saturday→Friday, week 1 contains 1 Farvardin (same as
  `jdatetime`'s `weeknumber()`).
- `week_start` is now **text** `YYYY-MM-DD` (the Gregorian date of the Saturday)
  instead of a `DATE`, and with the default prefix its column has no `jalali_`
  prefix (`week_start`; any other prefix is kept: `created_` gives
  `created_week_start`). A `DATE` was drawn on Superset's time
  axis, whose ticks did not match the week-start bars, so the shown dates looked
  wrong. The old `jalali_week_start` calculated column is deleted when the new
  one is added.
- Adding columns also drops the plugin's obsolete columns (fields it no longer
  has); the result, the CLI and the page report them as `removed`.
- The benchmark script and README numbers use `jalali_month_name`.

## 0.3.0 — unreleased

- Opt-in `JALALI["jalali_calendar_heatmap"] = True`: Superset's own **Calendar
  Heatmap** (`cal_heatmap`) draws Jalali months (Farvardin … Esfand, weeks
  Saturday→Friday, right to left) with Jalali tooltips, so existing charts and
  dashboards turn Jalali without being edited. The chart keeps Superset's query,
  controls and colour schemes; only its drawing component is replaced. Domain
  month or year with subdomain day is drawn; other combinations (and dates
  outside 1350–1550) use Superset's original chart.

## 0.2.0 — unreleased

- New fields `week_start_date` (Jalali date of the week's Saturday, e.g.
  `1403/07/14`; sorts as text, for weekly charts) and `weekday_key`
  (`1 شنبه` … `7 جمعه`, sorts Saturday→Friday) in `jalali_columns()`,
  `jalali()`, the Jalali columns page and the CLI. Existing fields are
  unchanged; `week_start` stays a `DATE`. `week_start_date` is NULL when the
  Saturday falls before `sql_min_year`.
- Date filter: optional time of day («با ساعت») in the calendar tab. With
  times the range is start-inclusive, end-exclusive
  (`2024-09-22T08:00:00 : 2024-09-22T17:00:00`); without them nothing changes
  and saved midnight ranges keep their whole-day meaning. New presets
  «۱ ساعت اخیر» and «۲۴ ساعت اخیر».
- Jalali time formats for charts: `jalali_date`, `jalali_datetime`,
  `jalali_month`, `jalali_year` and `jalali_smart`, registered in Superset's
  shared time-format registry; type one into a chart's Time format (for
  example a Heatmap on a real date column). Opt-in
  `JALALI["jalali_smart_date"] = True` makes Superset's default `smart_date`
  formats Jalali in every chart. Docs: heatmap recipes and load order.

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
- `jalali(col, field)` Jinja function for dataset calculated columns.
- Add Jalali columns page and CLI: creates calculated columns on physical
  datasets (`/superset-jalali/columns/`, Settings → Data → Jalali columns,
  `superset jalali add-columns|remove-columns`); `columns_ui_enabled` switch.
- Refactor: one shared builder for all Jalali field formulas.
- `init_jalali(globals(), datefilter=False)` registers the blueprint for the
  columns page and turns the picker off with `datefilter_enabled = False`.
