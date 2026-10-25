# Using the Jalali SQL macros

A step-by-step guide to adding Jalali (Persian calendar) columns to Superset
datasets on PostgreSQL. For installation of the package and the dashboard date
picker, see the [README](../README.md).

## 1. Enable the macros

In `superset_config.py`, enable Jinja templating and register the package as the
**last** lines of the file:

```python
FEATURE_FLAGS = {**FEATURE_FLAGS, "ENABLE_TEMPLATE_PROCESSING": True}

from superset_jalali import init_jalali
init_jalali(globals())                    # picker + macros
# init_jalali(globals(), datefilter=False)  # macros only
```

Install the package in every Superset web and worker container, then restart.

## 2. Create a virtual dataset

In **SQL Lab**, write a query that calls both macros with the **same** column,
then choose **Save → Save dataset**:

```sql
SELECT
  t.*,
  {{ jalali_columns('t.created_at') }}
FROM my_table AS t
{{ jalali_join('t.created_at') }}
```

- `jalali_columns(...)` goes in the `SELECT` list and adds 13 columns.
- `jalali_join(...)` goes after the `FROM` table and adds a small inline year
  table. It creates no database objects.
- Use `t.*`, not `*`: the join adds helper columns (`gyear`, `nowruz`,
  `prev_nowruz`, `year_after`, `year_before`) that should not appear in the
  dataset or clash with your own columns.

### Columns added

| Column | Type | Example (2024-10-09) | Typical use |
| --- | --- | --- | --- |
| `jalali_year` | integer | 1403 | Year filter, yearly totals |
| `jalali_month_num` | integer | 7 | Month number |
| `jalali_day` | integer | 18 | Day of month |
| `jalali_date` | text | 1403/07/18 | Table display, daily X axis |
| `jalali_date_int` | integer | 14030718 | Sorting daily data |
| `jalali_month` | text | 1403-07 | Monthly X axis (sorts correctly) |
| `jalali_month_name` | text | مهر | Month name only |
| `jalali_month_label` | text | 1403-07 مهر | Monthly X axis with Persian name |
| `jalali_season` | text | پاییز | Season name |
| `jalali_season_key` | text | 1403-3 پاییز | Seasonal X axis (sorts correctly) |
| `jalali_weekday` | text | چهارشنبه | Weekday name |
| `jalali_weekday_num` | integer | 4 | Weekday order, Saturday = 0 |
| `jalali_week_start` | date | 2024-10-05 | Weekly grouping (Saturday-based) |

All 13 columns are NULL when the source date is NULL or falls outside the
configured year window (default 1390–1420).

## 3. Build charts

- **Monthly bar or line chart:** X axis `jalali_month_label` (or `jalali_month`),
  sort by the X axis ascending, metric `COUNT(*)`.
- **Daily chart:** X axis `jalali_date`, sorted ascending.
- **Seasonal chart:** X axis `jalali_season_key`.
- **Weekly chart:** X axis `jalali_week_start`; it is a real date, so Superset's
  temporal features work on it.
- **Table:** show `jalali_date` next to, or instead of, the Gregorian column.

Keep the dataset's **real date column** (`created_at`) as the temporal column.
The dashboard Jalali picker filters on it, so PostgreSQL can use its index.

## 4. Column names: plain or quoted

PostgreSQL lower-cases unquoted names. If a column was created with capital
letters (in quotes), write it **with double quotes** exactly as created:

```sql
SELECT
  t.*,
  {{ jalali_columns('t."OccouredDate"') }}
FROM "CR"."DeviceCrime" AS t
{{ jalali_join('t."OccouredDate"') }}
```

Accepted column forms (each dotted part is plain or double-quoted):

| Form | Example |
| --- | --- |
| column | `created_at` |
| table.column | `t.created_at` |
| quoted mixed case | `t."OccouredDate"` |
| schema.table.column | `"CR"."DeviceCrime"."OccouredDate"` |
| spaces inside quotes | `public.t."Created At"` |
| quote inside a name | `t."Weird""Name"` (`""` is one `"`) |

Expressions, functions, comments, `;` and anything that is not a pure
identifier are rejected with an error, so a macro argument can never inject SQL.
`alias` and `prefix` must be plain names (no quotes or dots).

## 5. More than one date column

Give each pair its own `alias`, and give the columns a `prefix`:

```sql
SELECT
  t.*,
  {{ jalali_columns('t.created_at', alias='_created', prefix='created_') }},
  {{ jalali_columns('t.closed_at',  alias='_closed',  prefix='closed_') }}
FROM tickets AS t
{{ jalali_join('t.created_at', alias='_created') }}
{{ jalali_join('t.closed_at',  alias='_closed') }}
```

This produces `created_year`, `created_month_label`, ..., `closed_year`, and so
on. Prefixes are returned in lower case: `Created_` gives `created_year`.

## 6. Options

| Argument | Where | Meaning |
| --- | --- | --- |
| `alias='_jy'` | both macros | Name of the joined year table; must match in the pair. |
| `prefix='jalali_'` | `jalali_columns` | Prefix of the output column names; `''` is allowed. |
| `digits='persian'` | `jalali_columns` | Persian digits in text columns (`۱۴۰۳/۰۷/۱۸`); numbers stay numeric. |
| `tz='Asia/Tehran'` | both macros | For `timestamptz` columns only: use Tehran local dates. Use the same value in both macros. |

Defaults for all datasets go in `superset_config.py`:

```python
JALALI = {
    "sql_min_year": 1390,     # first Jalali year with values
    "sql_max_year": 1420,     # last Jalali year with values (1350..1550)
    "sql_digits": "latin",    # or "persian"
    "sql_timezone": None,     # e.g. "Asia/Tehran" if all macro columns are timestamptz
}
```

### Time zones

- `timestamp` or `date` columns: do **not** set `tz`.
- `timestamptz` columns: set `tz='Asia/Tehran'` in **both** macros (or
  `sql_timezone`). Example: `2025-03-20 21:00:00+00` is 1404/01/01 in Tehran but
  1403/12/30 in UTC.

## 7. Performance tips

The join matches each row to one year row by equality on the Gregorian year
(a hash join), so it stays fast and the year window size barely matters.

- **Filter on the real date column.** The Jalali picker does this; PostgreSQL
  uses the index and converts only the filtered rows.
- **Avoid filters on Jalali columns** (`jalali_year = 1403`, a Select filter on
  `jalali_month`). The index cannot be used, so every row is converted first.
  Prefer the date picker with a Jalali range instead.
- **Large full-history charts** still compute labels for every row. Keep the
  Superset cache enabled, or build a pre-aggregated table for very large data.

Measured on 5,000,000 rows (PostgreSQL 16): a one-month filtered chart takes
about 0.02–0.06 s; grouping all rows by `jalali_month_label` about 4.4 s
(previously 9–20 s). To measure on your own server:

```sh
pip install -e '.[dev]'
PG_DSN=postgresql://user:pass@host:5432/db python scripts/bench_macros.py
python scripts/bench_macros.py --drop   # remove the benchmark table
```

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `{{ jalali_columns(...) }}` shows up literally or "undefined" | Enable `ENABLE_TEMPLATE_PROCESSING`, call `init_jalali(globals())` last in the config, restart all workers. |
| `column t.occoureddate does not exist` | The column has capital letters: write `t."OccouredDate"`. |
| `Invalid SQL identifier` | The argument is not a plain/quoted column name; remove spaces, functions or casts. |
| All Jalali columns are NULL | Date is NULL or outside `sql_min_year`..`sql_max_year`; aliases differ between the two macros; or check the time zone. |
| Off by one day near midnight | `timestamptz` column without `tz='Asia/Tehran'`, or `tz` set on a plain `timestamp`. |
| Duplicate column name error | Use `SELECT t.*` instead of `SELECT *`, or rename the source column that clashes. |
| Slow dashboard | Filter with the date picker on the real date column, not on Jalali columns. |
