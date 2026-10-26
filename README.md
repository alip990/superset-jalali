# superset-jalali

[![CI](https://github.com/alip990/superset-jalali/actions/workflows/ci.yml/badge.svg)](https://github.com/alip990/superset-jalali/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/superset-jalali)](https://pypi.org/project/superset-jalali/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

A Persian, RTL, Saturday-first **Jalali date picker** for dashboard **Time range**
native filters, including embedded dashboards. Jalali display and grouping
columns for PostgreSQL datasets: added in one click to a table picked in the UI,
or with Jinja macros in a virtual dataset. One pip package;
no Superset changes, frontend rebuild, Node installation, or database migration
is needed by users.

## Install

In your Dockerfile based on `apache/superset:6.1.x` (choose an actual patch tag):

```dockerfile
RUN uv pip install --python /app/.venv/bin/python superset-jalali==0.1.0
```

In `superset_config.py`, after your existing configuration:

```python
from superset_jalali import init_jalali
init_jalali(globals())
```

**Call `init_jalali(globals())` as the LAST line of `superset_config.py`.**
Overwriting `BLUEPRINTS` or `FEATURE_FLAGS` afterwards can leave dynamic plugins
enabled without their discovery route, causing every dashboard to hang.

Restart Superset. The package must be installed in the same Python environment
as Superset, including workers that render virtual datasets. Before the first
PyPI publication, install the built wheel instead of the version above.

| Plugin | Superset | Verification |
| --- | --- | --- |
| 0.1.x | 6.1.x | real-instance verification pending |

Complete [docs/VERIFY.md](docs/VERIFY.md) before each release and before upgrading
Superset. This plugin relies on internal APIs; other versions are not supported.
Report completed checks in a [GitHub issue](https://github.com/alip990/superset-jalali/issues/new),
including the Superset patch version, plugin version, environment details and
each checklist result described in `docs/VERIFY.md`.

## What users see

Open a dashboard's Time range native filter to choose presets, select a Jalali
start and end day, type dates with Persian/Arabic/Latin digits, or enter a raw
Superset expression in «پیشرفته». Month and year navigation cover 1350–1550.
The trigger shows «بدون فیلتر», a preset name, or a Jalali range. Today in
`Asia/Tehran` has a visible ring; Fridays use the weekend colour.

The day grid has one Tab stop. In RTL order, **Left** moves to the next day,
**Right** to the previous day, and **Up/Down** move seven days. Crossing a month
changes the visible month; **Enter/Space** selects the focused day. Arrow keys
move focus in the grid; editing the از / تا inputs keeps focus in the input.

The popover normally anchors to the trigger. In Superset's overflowing filter
bar it opens as a centred fixed panel, with width and height limited to the
viewport and scrolling for smaller screens.

The UI end date is inclusive. Selecting 1403/07/01–1403/07/30 emits the standard
half-open Gregorian range:

```text
2024-09-22T00:00:00 : 2024-10-22T00:00:00
```

Charts still filter their Gregorian date column with ordinary range predicates,
so indexes can be used. Saved values remain valid after removing the plugin.
Unknown existing expressions remain visible and editable as raw text.

### Requirements for charts

A chart needs a **date column marked temporal** and a **time pill**: an adhoc
`TEMPORAL_RANGE` filter on that column. Leave its value as **No filter** to let
the dashboard native filter supply the range. Superset normally adds this pill
when a dataset has a default datetime column. Check the native filter's chart
scope as well. A picker selection alone cannot add a missing time pill.

Embedded dashboards also need Superset's normal embedded configuration and a
valid guest token. The plugin uses Superset's existing request authentication.

### Presets and timezones

Today, yesterday, and the last 7/30/90 days are rolling expressions. For example:

```text
today : DATEADD(DATETIME("today"), 1, day)
DATEADD(DATETIME("today"), -6, day) : DATEADD(DATETIME("today"), 1, day)
```

Rolling presets include today and remain current when saved as dashboard
defaults. `today` follows Superset's server timezone; recommend `TZ=Asia/Tehran`.

«این هفته», «این ماه», «ماه گذشته», «این فصل», «فصل گذشته», «امسال», and
«سال گذشته» are calculated using the current date in `Asia/Tehran`, then saved
as **fixed absolute dates**. «این هفته» covers the full Saturday–Friday week;
seasons start on 1 Farvardin, Tir, Mehr and Dey, including leap Esfand 30 in
winter. They do not
roll forward automatically. Use rolling presets for dashboard defaults.
Gregorian midnight values have no timezone suffix; coordinate Superset,
PostgreSQL session, and source-data timezones.

## Jalali columns without SQL

A dataset created from a table in **Datasets → + Dataset** (a physical
dataset) can get Jalali columns in one click. The plugin adds up to 13
**calculated columns** to the dataset; each one is a single expression that
calls the `jalali(col, field)` Jinja function, for example
`{{ jalali('"OccouredDate"', 'month_label') }}`. Nobody types SQL.

### Which path to use

| | Calculated columns (this section) | Virtual dataset with `jalali_columns` + `jalali_join` |
| --- | --- | --- |
| Dataset | Table picked in the UI | SQL Lab query saved as a dataset |
| SQL to write | None | 3 lines ([below](#optional-postgresql-jinja-macros)) |
| Speed | Fine with a date filter; slower on full-history charts | Fastest; best for large tables and full-history charts |
| Values | Identical (checked row by row in CI) | Identical |

Measured on 2026-10-26 with `scripts/bench_macros.py`: 5,000,000 rows,
PostgreSQL 16.15 on aarch64, index on the date column, best of 3:

| Query | Virtual dataset (join) | Calculated columns |
| --- | --- | --- |
| Group by `jalali_date`, one-month date filter | 0.061 s | 0.117 s |
| Group by `jalali_month_label`, all rows, years 1400–1410 | 4.47 s | 8.73 s |
| Group by `jalali_month_label`, all rows, years 1390–1420 | 4.49 s | 11.36 s |
| Count where `jalali_year = 1403` (avoid this) | 1.02 s | 2.68 s |
| Plain SQL, group by Gregorian month, all rows | 1.23 s | 1.23 s |

With a dashboard date filter both are fast; for full-history charts on very
large tables prefer the virtual dataset.

### Requirements

- PostgreSQL database; template processing enabled explicitly:

  ```python
  FEATURE_FLAGS = {**FEATURE_FLAGS, "ENABLE_TEMPLATE_PROCESSING": True}
  ```

  Without it Superset sends `{{ jalali(...) }}` to the database unrendered,
  so the page and CLI refuse to add columns.
- `init_jalali(globals())` with macros enabled (the default).
- You can edit the dataset: Admin, or an owner with `can write on Dataset`.
- Run `superset init` after installing or upgrading, as for any Superset
  upgrade, so the menu link gets its permission.

### With the page

1. Open **Settings → Data → Jalali columns**, or `/superset-jalali/columns/`.
2. Choose the dataset and its date column. Only PostgreSQL datasets you may
   edit, and their physical date/timestamp columns, are listed.
3. Keep all 13 fields checked (or pick some), keep the prefix `jalali_`.
   Choose timezone **Asia/Tehran** only for `timestamptz` columns.
4. Click «افزودن ستون‌های جلالی». The columns appear in **Edit dataset →
   Calculated columns**. «حذف ستون‌های جلالی» removes only the columns the
   plugin created from that date column.

### With the CLI

```sh
superset jalali add-columns --dataset CR.DeviceCrime --column OccouredDate
superset jalali add-columns --dataset 12 --column created_at --tz Asia/Tehran --fields year,month_label
superset jalali remove-columns --dataset CR.DeviceCrime --column OccouredDate
```

`--dataset` is an id, `table` or `schema.table`. Commands run as `--user`
(default: the first Admin) and print the created, updated or removed names.

### Columns

| Column | Type | Persian name | Example for 2024-10-09 |
| --- | --- | --- | --- |
| `jalali_year` | INTEGER | سال جلالی | 1403 |
| `jalali_month_num` | INTEGER | شماره ماه جلالی | 7 |
| `jalali_day` | INTEGER | روز ماه جلالی | 18 |
| `jalali_date` | VARCHAR | تاریخ جلالی | 1403/07/18 |
| `jalali_date_int` | INTEGER | تاریخ جلالی (عددی) | 14030718 |
| `jalali_month` | VARCHAR | ماه جلالی (کلید) | 1403-07 |
| `jalali_month_name` | VARCHAR | نام ماه جلالی | مهر |
| `jalali_month_label` | VARCHAR | ماه جلالی | 1403-07 مهر |
| `jalali_season` | VARCHAR | فصل جلالی | پاییز |
| `jalali_season_key` | VARCHAR | فصل جلالی (کلید) | 1403-3 پاییز |
| `jalali_weekday` | VARCHAR | روز هفته | چهارشنبه |
| `jalali_weekday_num` | INTEGER | شماره روز هفته (شنبه = ۰) | 4 |
| `jalali_week_start` | DATE | شروع هفته (شنبه) | 2024-10-05 |

The Persian name is the column's label in Explore. Values follow the
`sql_min_year`/`sql_max_year` window, `sql_digits` and `sql_timezone` settings,
and are NULL for NULL dates or dates outside the window, exactly as in the
virtual-dataset macros.

### Rules

- **Filter dashboards on the real date column.** Keep it as the dataset's
  temporal column; the Jalali picker filters it with an index-friendly range.
- **Never filter on a Jalali column** (`jalali_year = 1403`, a Select filter on
  `jalali_month`): every row is converted first and the index is not used.
- **Sort month labels by `jalali_month` or `jalali_date_int`**, not by the
  Persian name; `jalali_month_label` itself also sorts correctly as text.
- `ENABLE_TEMPLATE_PROCESSING` must stay on, or the columns stop rendering.
- Existing columns with the same name and not created by the plugin are never
  overwritten: the action fails with a conflict (HTTP 409) and lists them.
  Columns the plugin created are updated in place. They carry a marker in
  their `extra` field.

## Optional PostgreSQL Jinja macros

Explicitly enable template processing if appropriate for your Superset setup:

```python
FEATURE_FLAGS = {**FEATURE_FLAGS, "ENABLE_TEMPLATE_PROCESSING": True}
```

`init_jalali` adds the helpers but does **not** enable template processing.
Use both macros in a virtual dataset:

```sql
SELECT
  t.*,
  {{ jalali_columns('t.created_at') }}
FROM your_table AS t
{{ jalali_join('t.created_at') }}
```

See [docs/USAGE.md](docs/USAGE.md) for a step-by-step guide: creating the
dataset, building charts, quoted column names, several date columns, options,
performance tips and troubleshooting.

No database tables or functions are created. Dates outside the configured
window, and NULL source dates, produce NULL in **all** derived columns.

| Column | Type | Example for 2024-10-09 |
| --- | --- | --- |
| `jalali_year` | integer | 1403 |
| `jalali_month_num` | integer | 7 |
| `jalali_day` | integer | 18 |
| `jalali_date` | text | 1403/07/18 |
| `jalali_date_int` | integer | 14030718 |
| `jalali_month` | text | 1403-07 |
| `jalali_month_name` | text | مهر |
| `jalali_month_label` | text | 1403-07 مهر |
| `jalali_season` | text | پاییز |
| `jalali_season_key` | text | 1403-3 پاییز (seasons 1–4) |
| `jalali_weekday` | text | چهارشنبه |
| `jalali_weekday_num` | integer | 4 (Saturday=0) |
| `jalali_week_start` | date | 2024-10-05 (Saturday, Gregorian date) |

`jalali_season_key` combines the year, season number (1–4) and Persian name,
for example `1403-3 پاییز`. It sorts chronologically and reads well as a chart
label. Weekday labels use Persian ZWNJ spelling: یک‌شنبه، سه‌شنبه، پنج‌شنبه.

Use `alias` and `prefix` to add more than one source date:

```sql
SELECT {{ jalali_columns('t.created_at', alias='_created', prefix='created_', digits='persian') }}
FROM your_table AS t
{{ jalali_join('t.created_at', alias='_created') }}
```

The column may be a dotted name whose parts are plain or double-quoted
identifiers, for example `t.created_at`, `t."OccouredDate"` or
`"CR"."DeviceCrime"."OccouredDate"`. Quote mixed-case or upper-case columns:
PostgreSQL folds unquoted names to lower case, so `t.OccouredDate` means
`t.occoureddate`. Quoted parts are emitted exactly as written; inside them,
`""` is an escaped quote. The alias and prefix are plain ASCII identifiers
without quotes or dots. PostgreSQL also returns unquoted output names in lower
case, so a prefix like `Jalali_` produces `jalali_year`. Expressions, comments,
whitespace outside quotes and arbitrary SQL are rejected. Each identifier part
must fit PostgreSQL's 63-byte limit. Aliases must match in the two macros and
avoid dataset collisions.
`digits='persian'` translates digits in text keys/labels only; numeric columns
stay numeric. `g2j(date)` and `j2g(year, month, day)` are also available to Jinja.

`jalali(col, field, tz=None, digits=None)` returns one of the 13 fields as a
single expression, with no join, for calculated columns or any SQL where a join
is not possible. `field` is a column name without the prefix, such as `year`
or `month_label`; other arguments behave as in `jalali_columns`. Its values
are identical to the join's.

### Performance

- The join is an equality join on the Gregorian year: PostgreSQL does one hash
  lookup per row, so the size of the SQL year window hardly affects speed.
- Always filter on the real date column; the Jalali picker does this.
  PostgreSQL then uses the date index and computes Jalali values only for the
  filtered rows.
- Do not filter on a Jalali column, such as `jalali_year = 1403` or a Select
  filter on `jalali_month`: the index cannot be used and every row is converted
  first.
- Full-history charts over millions of rows still compute labels for each row;
  rely on the Superset data cache, or a pre-aggregated table if needed.
- Use `SELECT t.*`, not `SELECT *`: the join adds helper columns (`gyear`,
  `nowruz`, `prev_nowruz`, `year_after`, `year_before`) that can clash with
  source column names.

`scripts/bench_macros.py` times these cases on a synthetic 5,000,000-row table
(`PG_DSN=postgresql://... python scripts/bench_macros.py`; `--help` for options).

### Timestamps with time zone

For PostgreSQL **`timestamptz` columns only**, set `tz='Asia/Tehran'` to derive
Jalali dates from Tehran local time rather than the database session timezone:

```sql
SELECT
  t.*,
  {{ jalali_columns('t.created_at', tz='Asia/Tehran') }}
FROM your_table AS t
{{ jalali_join('t.created_at', tz='Asia/Tehran') }}
```

**Both macros in a pair must use the same timezone.** The join chooses the
Jalali year using the same local date that the columns use for days, months,
weekdays and week starts. For example, `2025-03-20 21:00:00+00` is 1404/01/01
in Tehran, but 1403/12/30 when cast in a UTC database session.

Alternatively, set `JALALI['sql_timezone'] = 'Asia/Tehran'` as a shared default.
A non-`None` `tz` argument overrides it; omitting `tz` or passing `None` uses
the configuration. With both unset, the existing `(col)::date` SQL remains
unchanged and follows the database session timezone for `timestamptz`.

For **plain `timestamp` or `date` columns, do not set `tz` or `sql_timezone`**:
`AT TIME ZONE` on a plain timestamp converts in the other direction, producing
a `timestamptz` whose subsequent date cast depends on the session timezone.
If your datasets mix column types, leave `sql_timezone` unset and pass explicit
`tz` arguments only for `timestamptz` pairs.
Timezone values accept letters followed by up to two slash-separated parts
containing letters, digits, underscores, plus or minus signs (for example
`UTC`, `Asia/Tehran`, `Etc/GMT+3`). PostgreSQL must recognize the chosen zone.

## Configuration

```python
JALALI = {
    "datefilter_enabled": True,
    "sql_min_year": 1390,
    "sql_max_year": 1420,
    "sql_digits": "latin",
    "sql_timezone": None,
    "columns_ui_enabled": True,
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `datefilter_enabled` | `True` | Kill switch: `False` returns an empty plugin list. Restart and fully reload dashboards to restore the stock picker. |
| `sql_min_year` | `1390` | First year included in the inline SQL table. |
| `sql_max_year` | `1420` | Last year, inclusive; must satisfy 1350 ≤ min ≤ max ≤ 1550. |
| `sql_digits` | `"latin"` | `"latin"` or `"persian"` for text values; the macro's `digits` argument overrides it. |
| `sql_timezone` | `None` | Local timezone for `timestamptz` columns only; a non-`None` macro `tz` argument overrides it. Use the same timezone in both macros. |
| `columns_ui_enabled` | `True` | `False` hides the Jalali columns page and menu link; the page and its API return 404. The CLI and existing columns keep working. Independent of `datefilter_enabled`. |

The join cost barely depends on the SQL year window; narrow it only to
NULL out unwanted years. The SQL settings do not restrict the picker's calendar.

`init_jalali(globals(), datefilter=False)` adds the macros and the Jalali
columns page; it registers the blueprint but sets `datefilter_enabled` to
`False`, so the picker stays off. `init_jalali(globals(), macros=False)` adds
only the picker. Repeated calls are
safe; existing blueprints, feature flags and Jinja helpers are preserved, except
that requesting the picker sets `DYNAMIC_PLUGINS=True`.
The plugin also chains any existing `FLASK_APP_MUTATOR`, calling it first. It
then logs an error at startup if dynamic plugins are enabled without their
discovery route (the check does not raise or repair the configuration), and
adds the **Settings → Data → Jalali columns** menu link when macros are on.

### Manual equivalent

For explicit configuration instead of the convenience function:

```python
from superset_jalali import blueprint, JINJA_ADDONS

BLUEPRINTS = list(globals().get("BLUEPRINTS", []))
if blueprint not in BLUEPRINTS:
    BLUEPRINTS.append(blueprint)
FEATURE_FLAGS = {**globals().get("FEATURE_FLAGS", {}), "DYNAMIC_PLUGINS": True}
JINJA_CONTEXT_ADDONS = {**JINJA_ADDONS, **globals().get("JINJA_CONTEXT_ADDONS", {})}
# Set ENABLE_TEMPLATE_PROCESSING explicitly if you want the SQL macros.
```

Always register the blueprint when enabling dynamic plugins on Superset 6.x.
The manual configuration above does not install the startup check or the menu
link; open `/superset-jalali/columns/` directly.
An already registered discovery route is preserved and logged; configure that
route's catalogue to include the Jalali bundle if needed.

## Limitations

- Explore keeps the Gregorian picker. The override affects dashboard Time range
  native filters only.
- The chart header's filter indicator shows Gregorian ISO dates.
- Superset time grains and time comparisons remain Gregorian. Use the Jalali
  columns for Jalali grouping, labels and comparisons.
- Calendar presets are fixed dates. Rolling expressions use the server timezone.
- Macros and Jalali columns support PostgreSQL only in v0.1. Without a configured timezone,
  `timestamptz`-to-date casts use the database session timezone; values outside
  the SQL year window yield NULL.
- An existing `filter.dateFilterControl` override takes precedence.
- The bundle comes from the Superset origin. Default Superset Talisman allows
  the scoped inline styles; customized CSP must also allow them. Re-run the
  checklist with your actual policy.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| All dashboards spin forever | `DYNAMIC_PLUGINS=True` without `/dynamic-plugins/api/read`, often because `BLUEPRINTS` or `FEATURE_FLAGS` was overwritten after initialization. Call `init_jalali(globals())` as the last line of `superset_config.py` and restart; check the startup ERROR log and ensure the route returns HTTP 200 with `result`. Also inspect proxy/auth middleware errors. |
| Stock picker appears | Check `/superset-jalali/health`, console bundle-loading errors, CSP, the kill switch, and any existing registry override. |
| Charts are not filtered | Check for a temporal date column, its No filter time pill, and native filter chart scope. |
| Macros remain literal or are unavailable | Explicitly enable `ENABLE_TEMPLATE_PROCESSING`, call `init_jalali` after your settings, and install the package in all workers. |
| Derived SQL columns are NULL | Check source NULLs, year bounds, matching join aliases and database timezone. |
| Jalali columns page says template processing is off | Set `FEATURE_FLAGS["ENABLE_TEMPLATE_PROCESSING"] = True` and restart. |
| No "Jalali columns" menu link | Run `superset init`, check `columns_ui_enabled`, or open `/superset-jalali/columns/`. |
| Page lists no datasets | Only PostgreSQL datasets you own (or all, for Admin) with `can write on Dataset` are listed. |
| `column t.xyz does not exist` for a mixed-case column | Quote the column part exactly as created: `t."OccouredDate"`. |

See [USAGE.md](docs/USAGE.md) for the SQL macro guide,
[HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) for pinned upstream references and
[VERIFY.md](docs/VERIFY.md) for manual release checks.

## Build and publish

Maintainers need Node 22 and Python 3.10+; package users do not need Node.

```sh
cd frontend
npm ci
npm test
npm run build
cd ..
python -m pip install -e '.[dev]'
pytest
python -m build
```

Set `PG_DSN` (for example `postgresql://postgres@localhost:5432/postgres`) to
also run `tests/test_sql_postgres.py`, which executes the macros on PostgreSQL
and compares every day from 1985 to 2045 with the Python calendar. CI runs it
against a `postgres:16` service; without `PG_DSN` it is skipped.

`nowruz.ts` and comparison fixtures are generated from the committed Python
table. The version comes from `pyproject.toml`. esbuild produces minified ESM,
a sourcemap, a hashed bundle and `manifest.json`; the build fails above 60 KB
gzipped or if React/ReactDOM/antd are bundled. Built static files are gitignored
and included in both distributions; `static/columns.html` and
`static/columns.js` are plain committed sources that the build leaves alone.
Build the frontend **before** Python packaging. CI checks that the wheel
contains its manifest's JS file and the columns page files.

Configure a PyPI Trusted Publisher for package `superset-jalali`, your GitHub
owner/repository, workflow `release.yml`, and environment `pypi`; create that
GitHub environment. The release workflow rebuilds and tests, publishes to PyPI
using OIDC, and attaches the wheel to a GitHub release. No PyPI token is stored
in the repository.

## Release checklist

For maintainers, complete these steps before pushing a release tag:

- [ ] Configure PyPI Trusted Publishing for project `superset-jalali`, GitHub
  owner `alip990`, repository `superset-jalali`, workflow `release.yml` and
  environment `pypi`; ensure the GitHub `pypi` environment exists.
- [ ] Set or bump the release version in `pyproject.toml`, the sole version
  source, and finalize its CHANGELOG entry. For this first release, use `0.1.0`.
- [ ] Run the frontend tests/build, `pytest` and `python -m build`; confirm the
  wheel includes its hashed JS bundle, manifest, `columns.html` and `columns.js`.
- [ ] Complete [docs/VERIFY.md](docs/VERIFY.md) on Superset **6.1.x**, recording
  the exact patch version and all results. Include an admin dashboard, an
  embedded dashboard with a guest token, missing-bundle fallback, Escape inside
  the filter-settings dialog, dark mode and the host theme font, timezone-aware
  macros, startup logging and health states.
- [ ] After real-instance verification passes, record the tested version and
  date in the compatibility table. Keep it pending until those checks are done.
- [ ] Commit and push the release preparation, then push `v<version>` matching
  `pyproject.toml` (for example, `git tag v0.1.0` then
  `git push origin v0.1.0`). Confirm the release workflow succeeds and the wheel
  is attached to the GitHub release.

## License

[Apache-2.0](LICENSE).
