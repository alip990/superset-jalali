# superset-jalali

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/superset-jalali)](https://pypi.org/project/superset-jalali/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

A Persian, RTL, Saturday-first **Jalali date picker** for dashboard **Time range**
native filters, including embedded dashboards. Optional Jinja macros add Jalali
display and grouping columns to PostgreSQL virtual datasets. One pip package;
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

Restart Superset. The package must be installed in the same Python environment
as Superset, including workers that render virtual datasets. Before the first
PyPI publication, install the built wheel instead of the version above.

| Plugin | Superset | Verification |
| --- | --- | --- |
| 0.1.x | 6.1.x | 6.1.0 source integration checked; real-instance verification pending |

Complete [docs/VERIFY.md](docs/VERIFY.md) before each release and before upgrading
Superset. This plugin relies on internal APIs; other versions are not supported.

## What users see

Open a dashboard's Time range native filter to choose presets, select a Jalali
start and end day, type dates with Persian/Arabic/Latin digits, or enter a raw
Superset expression in «پیشرفته». Month and year navigation cover 1350–1550.
The trigger shows «بدون فیلتر», a preset name, or a Jalali range.

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

«این ماه», «ماه گذشته», «امسال», and «سال گذشته» are calculated using the
current date in `Asia/Tehran`, then saved as **fixed absolute dates**. They do not
roll forward automatically. Use rolling presets for dashboard defaults.
Gregorian midnight values have no timezone suffix; coordinate Superset,
PostgreSQL session, and source-data timezones.

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
| `jalali_season_key` | text | 1403-3 (seasons 1–4) |
| `jalali_weekday` | text | چهارشنبه |
| `jalali_weekday_num` | integer | 4 (Saturday=0) |
| `jalali_week_start` | date | 2024-10-05 (Saturday, Gregorian date) |

Use `alias` and `prefix` to add more than one source date:

```sql
SELECT {{ jalali_columns('t.created_at', alias='_created', prefix='created_', digits='persian') }}
FROM your_table AS t
{{ jalali_join('t.created_at', alias='_created') }}
```

Inputs must be simple ASCII SQL identifiers: a dotted column name, an undotted
alias, and an undotted prefix. Expressions, quoted names, comments, whitespace
and arbitrary SQL are rejected. Each resulting identifier must fit PostgreSQL's
63-byte limit. Aliases must match in the two macros and avoid dataset collisions.
`digits='persian'` translates digits in text keys/labels only; numeric columns
stay numeric. `g2j(date)` and `j2g(year, month, day)` are also available to Jinja.

## Configuration

```python
JALALI = {
    "datefilter_enabled": True,
    "sql_min_year": 1390,
    "sql_max_year": 1420,
    "sql_digits": "latin",
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `datefilter_enabled` | `True` | Kill switch: `False` returns an empty plugin list. Restart and fully reload dashboards to restore the stock picker. |
| `sql_min_year` | `1390` | First year included in the inline SQL table. |
| `sql_max_year` | `1420` | Last year, inclusive; must satisfy 1350 ≤ min ≤ max ≤ 1550. |
| `sql_digits` | `"latin"` | `"latin"` or `"persian"` for text values; the macro's `digits` argument overrides it. |

Narrowing the SQL year window reduces join work and can make queries much
faster. The SQL settings do not restrict the picker's calendar.

`init_jalali(globals(), datefilter=False)` adds only macros.
`init_jalali(globals(), macros=False)` adds only the picker. Repeated calls are
safe; existing blueprints, feature flags and Jinja helpers are preserved, except
that requesting the picker sets `DYNAMIC_PLUGINS=True`.

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
An already registered discovery route is preserved and logged; configure that
route's catalogue to include the Jalali bundle if needed.

## Limitations

- Explore keeps the Gregorian picker. The override affects dashboard Time range
  native filters only.
- The chart header's filter indicator shows Gregorian ISO dates.
- Superset time grains and time comparisons remain Gregorian. Use the Jalali
  columns for Jalali grouping, labels and comparisons.
- Calendar presets are fixed dates. Rolling expressions use the server timezone.
- Macros support PostgreSQL only in v0.1. Timestamp-to-date casts use the database
  session timezone; values outside the SQL year window yield NULL.
- An existing `filter.dateFilterControl` override takes precedence.
- The bundle comes from the Superset origin. Default Superset Talisman allows
  the scoped inline styles; customized CSP must also allow them. Re-run the
  checklist with your actual policy.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Dashboard spins forever | Ensure the blueprint is registered and `/dynamic-plugins/api/read` returns HTTP 200 with `result`; inspect proxy/auth middleware errors. Do not enable the flag without the blueprint. |
| Stock picker appears | Check `/superset-jalali/health`, console bundle-loading errors, CSP, the kill switch, and any existing registry override. |
| Charts are not filtered | Check for a temporal date column, its No filter time pill, and native filter chart scope. |
| Macros remain literal or are unavailable | Explicitly enable `ENABLE_TEMPLATE_PROCESSING`, call `init_jalali` after your settings, and install the package in all workers. |
| Derived SQL columns are NULL | Check source NULLs, year bounds, matching join aliases and database timezone. |

See [HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) for pinned upstream references and
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

`nowruz.ts` and comparison fixtures are generated from the committed Python
table. The version comes from `pyproject.toml`. esbuild produces minified ESM,
a sourcemap, a hashed bundle and `manifest.json`; the build fails above 60 KB
gzipped or if React/ReactDOM/antd are bundled. Built static files are gitignored
and included in both distributions. Build the frontend **before** Python
packaging. CI checks that the wheel contains its manifest's JS file.

For your public GitHub repository, update the CI badge URL to its absolute
repository URL if your Markdown host does not resolve the relative badge path.
Configure a PyPI Trusted Publisher for package `superset-jalali`, your GitHub
owner/repository, workflow `release.yml`, and environment `pypi`; create that
GitHub environment. After completing the manual checklist, update the version
and changelog, then push a matching `v` tag (for example `v0.1.0`). The workflow
rebuilds and tests, publishes to PyPI using OIDC, and attaches the wheel to a
GitHub release. No PyPI token is stored in the repository.

## License

[Apache-2.0](LICENSE).
