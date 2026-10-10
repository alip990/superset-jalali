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

PostgreSQL macros use a bounded inline year table joined on the source date.
Display/grouping expressions do not alter the source column. All derived values
are NULL for a NULL date or dates outside the configured year window. Timestamp
casts to date follow the database session timezone; coordinate it with Superset
and the data's business timezone. Narrow the year window to reduce join work.
