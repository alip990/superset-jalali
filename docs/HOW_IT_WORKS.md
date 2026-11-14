# How it works

The Python package adds a Flask blueprint and optional Jinja helpers. A small ESM
bundle uses Superset's own React 17 and extensions registry. Installing a wheel
requires neither Node nor a Superset frontend rebuild.

## Integration points checked against Superset 6.1.0

These are source checks, not a substitute for the real-instance checklist in
[VERIFY.md](VERIFY.md). All Superset links below pin the `6.1.0` tag.

| Fact | Source |
| --- | --- |
| The dashboard Time range native filter reads `filter.dateFilterControl` from `getExtensionsRegistry()` and falls back to `DateFilterControl`. | [TimeFilterPlugin.tsx](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/filters/components/Time/TimeFilterPlugin.tsx) |
| Its props include `value`, `name`, `onChange`, `onOpenPopover`, `onClosePopover`, `isOverflowingFilterBar`, and optional `overlayStyle`. | [ui-overrides/types.ts](https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/ui-overrides/types.ts) |
| The loader defines shared `react`, `react-dom`, `lodash`, `@superset-ui/core` and `@superset-ui/chart-controls` before importing bundles. The namespace is `window["__superset__/<name>"]`. | [DynamicPlugins/index.tsx](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/components/DynamicPlugins/index.tsx), [shared-modules.ts](https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/dynamic-plugins/shared-modules.ts) |
| The dashboard returns a loading component while `context.loading` is true, so registration finishes before the filter bar renders. | [Dashboard.tsx](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/dashboard/components/Dashboard.tsx) |
| Embedded pages include `DynamicPluginProvider`. With `EMBEDDED_SUPERSET` enabled, Flask-Login's request loader authenticates guest tokens, including requests to this blueprint. | [EmbeddedContextProviders.tsx](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/embedded/EmbeddedContextProviders.tsx), [security/manager.py, request_loader](https://github.com/apache/superset/blob/6.1.0/superset/security/manager.py) |
| The loader fetches `/dynamic-plugins/api/read`; its outer error handler does not clear the initial loading state. FAB 5 removed `RestCRUDView`, on which that legacy route depended. | [DynamicPlugins/index.tsx](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/components/DynamicPlugins/index.tsx), [FAB 4.5.0 views.py](https://github.com/dpgaspar/Flask-AppBuilder/blob/v4.5.0/flask_appbuilder/views.py), [FAB 5.0.2 views.py](https://github.com/dpgaspar/Flask-AppBuilder/blob/v5.0.2/flask_appbuilder/views.py) |
| Upstream closed the broken dynamic plugins API report as not planned, describing it as a beta feature that will be replaced by Extensions. | [apache/superset#35870](https://github.com/apache/superset/issues/35870) |
| `register_blueprints()` registers the `BLUEPRINTS` configuration at startup. | [initialization/__init__.py](https://github.com/apache/superset/blob/6.1.0/superset/initialization/__init__.py) |
| `_apply_filters()` applies the dashboard time range to existing `TEMPORAL_RANGE` filters; charts need a temporal date-column filter, the time pill. | [common/query_context_factory.py](https://github.com/apache/superset/blob/6.1.0/superset/common/query_context_factory.py) |
| Superset 6.1.0 specifies React `^17.0.2`. This plugin uses only React 17 APIs. | [frontend/package.json](https://github.com/apache/superset/blob/6.1.0/superset-frontend/package.json) |
| A calculated column's `expression` is rendered by the template processor when the column is selected, grouped or filtered (`TableColumn.get_sqla_col`). | [connectors/sqla/models.py#L993-L1005](https://github.com/apache/superset/blob/6.1.0/superset/connectors/sqla/models.py#L993-L1005) |
| The template processor is a no-op unless `ENABLE_TEMPLATE_PROCESSING` is enabled, so `{{ jalali(...) }}` would reach the database unrendered. | [jinja_context.py#L985-L995](https://github.com/apache/superset/blob/6.1.0/superset/jinja_context.py#L985-L995) |
| `UpdateDatasetCommand` checks `raise_for_ownership`, validates column names and saves through `DatasetDAO.update` in one transaction. | [commands/dataset/update.py#L66-L120](https://github.com/apache/superset/blob/6.1.0/superset/commands/dataset/update.py#L66-L120) |
| `DatasetDAO.update_columns` updates columns with an `id`, inserts those without, and deletes the ones not listed. | [daos/dataset.py#L262-L333](https://github.com/apache/superset/blob/6.1.0/superset/daos/dataset.py#L262-L333) |
| Admins pass `raise_for_ownership`; others must be owners. Guest users have `is_guest_user`. | [security/manager.py#L3125-L3150](https://github.com/apache/superset/blob/6.1.0/superset/security/manager.py#L3125-L3150), [#L3086](https://github.com/apache/superset/blob/6.1.0/superset/security/manager.py#L3086) |
| `FLASK_APP_MUTATOR` runs before `init_views()`; `menu_data` sends `appbuilder.menu.get_data()` to the React navbar, which puts the `Data` category into the Settings menu. | [initialization/__init__.py#L617-L624](https://github.com/apache/superset/blob/6.1.0/superset/initialization/__init__.py#L617-L624), [views/base.py#L270-L283](https://github.com/apache/superset/blob/6.1.0/superset/views/base.py#L270-L283), [Menu.tsx#L399-L436](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/features/home/Menu.tsx#L399-L436) |
| `CSRFProtect` protects every non-exempt view, blueprints included, and reads the `X-CSRFToken` header. | [initialization/__init__.py#L943-L948](https://github.com/apache/superset/blob/6.1.0/superset/initialization/__init__.py#L943-L948), [security/api.py#L108-L115](https://github.com/apache/superset/blob/6.1.0/superset/security/api.py#L108-L115) |
| The default CSP is `script-src 'self' 'strict-dynamic'` plus a per-request nonce, so a page's script tag needs that nonce. | [config.py#L2119-L2154](https://github.com/apache/superset/blob/6.1.0/superset/config.py#L2119-L2154) |
| The `superset` command is a `FlaskGroup`, which also offers the app's CLI groups, including blueprint `cli_group`s. | [cli/main.py#L54-L61](https://github.com/apache/superset/blob/6.1.0/superset/cli/main.py#L54-L61) |

## Discovery and failure handling

`init_jalali()` registers the blueprint before enabling `DYNAMIC_PLUGINS`. Discovery
always returns HTTP 200 with a `result` array: unauthenticated users, the kill
switch, a missing/invalid manifest, or an internal failure all receive an empty
array. Responses use `Cache-Control: no-store`.

A valid manifest points to a hashed bundle on Superset's own origin. URLs respect
WSGI `SCRIPT_NAME` and `APPLICATION_ROOT`. Bundles are immutable for one year.
They contain no React, ReactDOM, antd, or direct Superset package imports.
Registration preserves an existing date-filter override. The health endpoint
reports whether the manifest's file exists; it does not test browser execution.

A bundle import failure is caught by Superset and releases the loading state,
leaving the stock picker. A discovery request blocked by a proxy or middleware
before it reaches the blueprint can still cause the upstream loading bug.

If a future Superset version already registers the discovery URL, this blueprint
logs a warning and preserves that route. It cannot add an entry to someone else's
plugin catalogue; configure that catalogue to include our bundle and re-run the
manual checklist before declaring that version compatible.

## Calendar and SQL

`nowruz.py` is the only calendar source. All 202 anchors (1350–1551) were generated
with `jdatetime==6.1.0` and independently compared to `persiantools==4.0.0`. Year
1551 is an exclusive upper sentinel; selectable years are 1350–1550. Conversion
finds the last Nowruz at or before a Gregorian date and divides the day offset
into six 31-day months followed by 30-day months. The next anchor determines
Esfand's length. JS anchors and Python comparison fixtures are generated from
that source; exhaustive Python tests also check the independent library.

The UI treats its end day as inclusive. It emits midnight at the start and
midnight after the end in Gregorian ISO syntax, with no timezone suffix. Rolling
expressions are evaluated by Superset; calendar presets use the current Tehran
calendar day and become fixed dates. Native filters continue to target the
original Gregorian column, preserving normal range predicates and index use.

PostgreSQL macros join a bounded inline table with one row per Gregorian year.
Jalali year J starts at Nowruz in March of Gregorian year J + 621, so a date in
Gregorian year G belongs to Jalali year G - 621 on or after that year's Nowruz,
and to G - 622 before it. Each row holds the Gregorian year, its Nowruz, the
previous Nowruz and both Jalali years (NULL outside the window). The join is an
equality on `EXTRACT(YEAR ...)`, which PostgreSQL runs as a hash join with one
lookup per row; the columns then pick the year and year start with one
comparison. Display/grouping expressions do not alter the source column. All
derived values are NULL for a NULL date or dates outside the configured year
window. Timestamp casts to date follow the database session timezone; coordinate
it with Superset and the data's business timezone.

### One field as a single expression

`jalali(col, field)` computes the same values without a join, for dataset
calculated columns. The rows of the join's year table become literal `CASE`
lists on the Gregorian year `G = EXTRACT(YEAR FROM D)::int`:

```sql
NZ    = (CASE G WHEN 2011 THEN DATE '2011-03-21' WHEN 2012 THEN DATE '2012-03-20' ... END)  -- Nowruz of G - 621
PNZ   = (CASE G WHEN 2012 THEN DATE '2011-03-21' ... END)                                -- Nowruz of G - 622
YEAR  = (CASE WHEN D >= NZ THEN (CASE G WHEN 2011 THEN 1390 ... END)
                            ELSE (CASE G WHEN 2012 THEN 1390 ... END) END)
START = (CASE WHEN D >= NZ THEN NZ ELSE PNZ END)
```

The lists cover the same Gregorian years as the join table and omit its NULL
entries, so years outside the window or the Nowruz table fall through to NULL,
exactly like `year_after`/`year_before`. DATE literals are used instead of
`make_date()` per row, which was about 1.6x slower in a prototype. PostgreSQL
evaluates `G` once per simple `CASE`.

### One definition of each field

`_field_expressions(date, nowruz, prev_nowruz, year_after, year_before, digits)`
is the only code that knows how to compute the 15 fields (month and day from the
day of year, season, weekday, labels, Persian digits, week start, the NULL
wrapper). It receives the four values of the row's year-table entry, not an
already chosen year, so it can convert a second date with the same entry:
the Saturday `W = D - weekday` behind `week_start_date`. `W` can be in the
previous Jalali year (1403/01/01 is a Wednesday; its Saturday is 1402/12/26)
or the previous Gregorian year (2025-01-02 → 2024-12-28), but
`W >= D - 6 >= 1 January - 6 > prev_nowruz`, so `W >= NZ ? year_after :
year_before` and the matching Nowruz are still correct. `jalali_columns()`
passes the join alias's columns; `jalali()` passes the `CASE` expressions above. `tests/test_sql_postgres.py` compares both paths
for every day from 1985 to 2045 in three year windows, with Persian digits and
for `timestamptz` in Tehran. The single expression is longer (up to about 25 KB
for `month_label`) and about 2-2.5x slower on full-history aggregations; see
the README benchmark.

### Adding the calculated columns

`columns.plan_columns()` has no Superset imports. It checks that the source is
a physical date/timestamp column, quotes it unless it is a plain lower-case
identifier, and returns one column per field with expression
`{{ jalali('<source>', '<field>') }}`, a type, a Persian `verbose_name` and a
marker in `extra`:

```json
{"superset_jalali": {"source": "OccouredDate", "field": "month_label", "version": 1}}
```

Physical datasets are queried as `FROM schema.table` without an alias, so the
source is not prefixed. Existing columns with a target name and no marker are a
conflict (409); marked ones are updated in place. Removal deletes only marked
columns.

`superset_ops` applies the plan with Superset's own `UpdateDatasetCommand`
rather than writing `TableColumn` rows directly. In 6.1.0 the command accepts
column expressions and `extra`, checks ownership, validates duplicate names and
commits in one transaction, so the plugin needs no ORM writes of its own. It
replaces the whole column list, so the plugin sends every existing column's
`id` and `column_name` (unchanged columns keep their stored values) plus the new
ones. Before running the command the plugin also requires
`ENABLE_TEMPLATE_PROCESSING`, a PostgreSQL database, a non-guest user with
`can_write` on `Dataset`, and `raise_for_ownership`. `override_user()` sets
`g.user` to the acting user for the CLI.

The page `/superset-jalali/columns/` is a static HTML file plus a script. The
blueprint fills in the field list and Talisman's per-request nonce. The script
fetches Superset's CSRF token from `/api/v1/security/csrf_token/` (allowed for
Gamma and Alpha users in 6.1.0) and sends it as `X-CSRFToken`; Superset's
`CSRFProtect` validates POST and DELETE on the blueprint. The menu link is
added with `appbuilder.add_link(..., category="Data")` from the chained
`FLASK_APP_MUTATOR`. FAB creates its `menu_access` permission, which
`superset init` grants to Admin, Alpha and Gamma. The CLI is the blueprint's
`jalali` command group.

## Jalali time formats

`frontend/src/timeFormats.ts` registers `TimeFormatter` instances in the host's
`TimeFormatterRegistry` (both from the shared `@superset-ui/core`). Every chart
asks that registry for its formatter: `getTimeFormatter(id)` returns a
registered id first and only otherwise builds a d3 formatter
([TimeFormatterRegistry.ts#L48-L72](https://github.com/apache/superset/blob/6.1.0/superset-frontend/packages/superset-ui-core/src/time-format/TimeFormatterRegistry.ts#L48-L72)).
The ECharts Heatmap formats temporal axis values with
`getTimeFormatter(xAxisTimeFormat)`
([Heatmap/transformProps.ts#L222-L231](https://github.com/apache/superset/blob/6.1.0/superset-frontend/plugins/plugin-chart-echarts/src/Heatmap/transformProps.ts#L222-L231)),
and the time-series axis and tooltip formatters also resolve `smart_date`,
`smart_date_detailed` and `smart_date_verbose` through it
([utils/formatters.ts](https://github.com/apache/superset/blob/6.1.0/superset-frontend/plugins/plugin-chart-echarts/src/utils/formatters.ts#L36-L41)).
Superset registers those three in
[setupFormatters.ts#L96-L112](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/setup/setupFormatters.ts#L96-L112), before
any plugin loads.

Values arrive as `Date` or epoch milliseconds; naive database timestamps are
UTC instants whose UTC fields are the stored wall-clock time, so the formatters
read `getUTC*`, like Superset's non-`local!` formats, and convert the date with
the same `g2j` table as the picker. Values outside the table, NULL and invalid
dates use Superset's own formatter (`%Y-%m-%d`, `%Y-%m`, `%Y` or the original
smart formatter, captured before any replacement); a formatter never throws.

`JALALI["jalali_smart_date"]` reaches the browser without another request:
`_bundle_url()` appends `?smart_date=1` to the bundle URL in the discovery
response, and the module reads `new URL(import.meta.url).searchParams`. esbuild
keeps `import.meta` only when told the target supports it
(`supported: {"import-meta": true}` in `esbuild.options.mjs`; with plain
`es2019` it would be replaced by `{}`); `test/timeFormats.test.ts` builds the
bundle and checks this.

### Load order

- **Dashboards (including embedded) wait for the bundle.** `Dashboard.render()`
  returns `<Loading />` while `PluginContext.loading` is true
  ([Dashboard.tsx#L335-L340](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/dashboard/components/Dashboard.tsx#L335-L340)).
  `loading` starts as `isFeatureEnabled(DYNAMIC_PLUGINS)`
  ([DynamicPlugins/index.tsx#L134](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/components/DynamicPlugins/index.tsx#L134))
  and becomes false only after every discovered bundle has been imported
  ([#L142-L169](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/components/DynamicPlugins/index.tsx#L142-L169),
  [#L85-L99](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/components/DynamicPlugins/index.tsx#L85-L99)).
  Embedded dashboards use the same provider
  ([EmbeddedContextProviders.tsx#L72](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/embedded/EmbeddedContextProviders.tsx#L72))
  and the same `Dashboard` component through `DashboardPage`
  ([DashboardPage.tsx#L301-L306](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/dashboard/containers/DashboardPage.tsx#L301-L306)).
  Charts therefore render after the formats are registered.
- **Explore does not wait for built-in charts.** It waits only for the dynamic
  plugin whose key equals the chart's `viz_type`
  ([ExploreViewContainer/index.tsx#L370-L375](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/explore/components/ExploreViewContainer/index.tsx#L370-L375),
  [#L529-L534](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/explore/components/ExploreViewContainer/index.tsx#L529-L534))
  or for a missing control panel
  ([ControlPanelsContainer.tsx#L929](https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/explore/components/ControlPanelsContainer.tsx#L929)).
  A Heatmap whose data arrives before the bundle asks the registry for
  `jalali_date`, which then builds and **caches** a d3 formatter for that
  unknown id; d3 prints the id literally. The bundle therefore always
  overwrites its ids (`remove` then `registerValue`; the registry's policy is
  `OverwritePolicy.Warn`, so overwriting is allowed), and the next render uses
  Jalali. Remaining limitation: such an early chart keeps the literal text (or
  Gregorian dates in the global mode) until it renders again (Run, a control
  change or a resize). The bundle is small and cached as immutable, so this is
  rare and only on a cold Explore load.
