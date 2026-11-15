# Using the Jalali SQL macros

A step-by-step guide to adding Jalali (Persian calendar) columns to Superset
datasets on PostgreSQL. For installation of the package and the dashboard date
picker, see the [README](../README.md).

No SQL needed? For a table picked in **Datasets → + Dataset**, use the
**Jalali columns** page or CLI instead: see
[Jalali columns without SQL](../README.md#jalali-columns-without-sql). This
guide covers the faster virtual-dataset macros.

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

- `jalali_columns(...)` goes in the `SELECT` list and adds 12 columns.
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
| `jalali_month_name` | text | مهر | Month name |
| `jalali_season` | text | پاییز | Season name |
| `jalali_weekday` | text | چهارشنبه | Weekday name |
| `jalali_weekday_num` | integer | 5 | Weekday order, Saturday = 1 … Friday = 7 |
| `jalali_week_of_year` | integer | 30 | Week number of the Jalali year (week 1 contains 1 Farvardin) |
| `week_start` | text | 2024-10-05 | Weekly X axis in Gregorian dates (the Saturday; no `jalali_` prefix) |
| `jalali_week_start_date` | text | 1403/07/14 | Weekly X axis in Jalali dates (the same Saturday) |

`week_start` is the Gregorian date of the Saturday that starts the week, as text
that sorts in date order. It is text and not a `DATE` because Superset draws a
`DATE` on a time axis whose tick labels do not fall on the week starts. A
default prefix `jalali_` is dropped for this column (any other prefix is kept),
so the default gives `week_start` and `created_` gives `created_week_start`. If your
table already has a column called `week_start`, give the pair another prefix
(a name clash is an error). Week 1 of `jalali_week_of_year` is the week
(Saturday→Friday) that contains 1 Farvardin, as in `jdatetime`; the last days of
a year can be in week 53 or 54.

All 12 columns are NULL when the source date is NULL or falls outside the
configured year window (default 1390–1420). `jalali_week_start_date` is also
NULL when the row's Saturday falls before `sql_min_year`: for example
1403/01/01 is a Wednesday, so with `sql_min_year: 1403` its week start
(1402/12/26) is NULL.

## 3. Build charts

- **Monthly bar or line chart:** X axis a custom SQL expression
  `jalali_year * 100 + jalali_month_num` (for example 140307), sorted ascending,
  metric `COUNT(*)`. For a single year, X axis `jalali_month_name` sorted by
  `jalali_month_num` also works.
- **Daily chart:** X axis `jalali_date`, sorted ascending.
- **Seasonal chart:** X axis `jalali_season`, or the custom SQL
  `jalali_year * 10 + (jalali_month_num - 1) / 3 + 1` sorted ascending.
- **Weekly chart:** X axis `week_start` (Gregorian) or `jalali_week_start_date`
  (Jalali), sorted ascending. Both are text, so each bar is labelled with its
  own Saturday; do not rely on a time axis for this. `jalali_week_of_year`
  gives the week number.
- **Weekday chart:** X axis `jalali_weekday_num` (1 = Saturday … 7 = Friday),
  sorted ascending; plain `jalali_weekday` names sort alphabetically.
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

This produces `created_year`, `created_month_name`, ..., `created_week_start`,
`closed_year`, and so on. Prefixes are returned in lower case: `Created_` gives `created_year`.

### Only the columns you need

By default `jalali_columns` adds all 12 columns. Pass `fields` to generate only
some, per date column, like `alias` and `prefix`:

```sql
SELECT
  t.*,
  {{ jalali_columns('t.created_at', alias='_created', prefix='created_',
                    fields=['weekday_num', 'month_name']) }},
  {{ jalali_columns('t.closed_at',  alias='_closed',  prefix='closed_',
                    fields=['year', 'week_of_year', 'week_start']) }}
FROM tickets AS t
{{ jalali_join('t.created_at', alias='_created') }}
{{ jalali_join('t.closed_at',  alias='_closed') }}
```

This adds exactly `created_weekday_num`, `created_month_name`, `closed_year`,
`closed_week_of_year` and `closed_week_start`, in that order (the order you
list). The valid names are `year`, `month_num`, `day`, `date`, `date_int`,
`month_name`, `season`, `weekday`, `weekday_num`, `week_of_year`, `week_start`
and `week_start_date`. A list, a tuple or a comma-separated string works
(`fields='weekday_num, month_name'`). An unknown name, a duplicate, an empty list
or anything that is not a plain field name is an error, and the message lists the
valid names. The SQL contains only the chosen columns, so it is shorter.
`jalali_join` is unchanged: it needs the same `alias` as its `jalali_columns`.

## 6. Options

| Argument | Where | Meaning |
| --- | --- | --- |
| `alias='_jy'` | both macros | Name of the joined year table; must match in the pair. |
| `prefix='jalali_'` | `jalali_columns` | Prefix of the output column names; `''` is allowed. |
| `fields=None` | `jalali_columns` | Which columns to generate, e.g. `['weekday_num', 'month_name']`; default all 12. |
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
- The picker's «با ساعت» times (README, *Time of day*) are wall-clock values:
  on a `timestamptz` column PostgreSQL compares them in the connection's
  session timezone, so `08:00` means 08:00 Tehran only if the session timezone
  is `Asia/Tehran`. On a `date` column leave «با ساعت» off.

## 7. Performance tips

The join matches each row to one year row by equality on the Gregorian year
(a hash join), so it stays fast and the year window size barely matters.

- **Filter on the real date column.** The Jalali picker does this; PostgreSQL
  uses the index and converts only the filtered rows.
- **Avoid filters on Jalali columns** (`jalali_year = 1403`, a Select filter on
  `jalali_month_num`). The index cannot be used, so every row is converted first.
  Prefer the date picker with a Jalali range instead.
- **Large full-history charts** still compute labels for every row. Keep the
  Superset cache enabled, or build a pre-aggregated table for very large data.

Measured on 5,000,000 rows (PostgreSQL 16): a one-month filtered chart takes
about 0.02–0.06 s; grouping all rows by `jalali_month_name` about 5.3 s
(previously 9–20 s). To measure on your own server:

```sh
pip install -e '.[dev]'
PG_DSN=postgresql://user:pass@host:5432/db python scripts/bench_macros.py
python scripts/bench_macros.py --drop   # remove the benchmark table
```

## 8. Jalali dates in charts

### Charts on Jalali text columns

The Jalali columns are text or numbers, so every chart shows them as they are.
Pick the sortable ones and sort the axis ascending:

- **Heatmap, day × hour** (ECharts *Heatmap*): X axis `hour_of_day`, or a
  calculated column `EXTRACT(HOUR FROM created_at)`; Y axis `jalali_date`.
  Sort both axes *Axis ascending*.
- **Heatmap, weekday × month:** X axis `jalali_weekday_num` (1 = Saturday),
  Y axis `jalali_month_num`, both *Axis ascending* (numbers sort numerically).
  Plain `jalali_weekday` names would sort alphabetically.
- **Heatmap, week × weekday** (a calendar): X axis `jalali_weekday_num`, Y axis
  `week_start` or `jalali_week_start_date`.
- **Weekly charts:** `week_start` or `jalali_week_start_date`.

### Jalali time formats for real date columns

The bundle registers these ids in Superset's shared time-format registry. Type
one into a chart's **Time format** box (*Customize*; the box accepts any value):

| Time format | Example |
| --- | --- |
| `jalali_date` | `۱۴۰۳/۰۷/۱۴` |
| `jalali_datetime` | `۱۴۰۳/۰۷/۱۴ ۱۴:۳۰` |
| `jalali_month` | `مهر ۱۴۰۳` |
| `jalali_year` | `۱۴۰۳` |
| `jalali_smart` | like *Adaptive formatting*: `۱۴:۳۰` when not midnight, `۱۴۰۳` on Nowruz, `مهر ۱۴۰۳` on the 1st of a month, else `۱۴۰۳/۰۷/۱۴` |

- **Heatmap or Table on a real date column:** set the time format to
  `jalali_date`.
- **Time-series chart (line, bar) on the real date column, time grain Day:**
  time format `jalali_date` or `jalali_smart`. ECharts places the axis ticks at
  Gregorian positions; turn on **Force categorical** for exactly one label per
  bar.
- **Time grains Month, Quarter and Year** group into Gregorian buckets
  (`DATE_TRUNC`): a Jalali label would name the Gregorian month's first day.
  Use `jalali_year` with `jalali_month_num` (see section 3) instead.
- The **Week** time grain groups by Monday-based Gregorian weeks. For
  Saturday-based weeks use the text column `week_start` (or
  `jalali_week_start_date`) without a time grain.

Values are read as wall-clock times, like Superset's default formats. Dates
outside 1350–1550, NULL and invalid values fall back to Superset's own output.

### Jalali everywhere (optional)

```python
JALALI = {**JALALI, "jalali_smart_date": True}
```

replaces Superset's default *Adaptive formatting* (`smart_date`) and its
detailed and verbose variants with Jalali versions, so every chart that uses the
default time format (time-series axes and tooltips, Table, Heatmap) shows Jalali
dates without per-chart settings. Charts with an explicit format such as
`%Y-%m-%d` keep it. Off by default; restart Superset and reload the page.

### Calendar Heatmap in Jalali (on by default)

Superset's **Calendar Heatmap** draws Gregorian month blocks with its own
library, which no format can change. The bundle replaces that chart's drawing
code, so every existing Calendar Heatmap (dashboards, embedded dashboards,
Explore) shows one card per Jalali month, with no setting to change. To keep
Superset's own Gregorian chart, turn it off and restart:

```python
JALALI = {**JALALI, "jalali_calendar_heatmap": False}
```

The chart shows the month name and year on each card, weekday letters (Friday in
red), rounded cells that grow to fill the width (never smaller than the chart's
Cell Size, at most 30 px), a gradient legend with the lowest and highest value,
a ring on today (Tehran date), faint cells for days outside the time range and
slightly darker ones for days in it without data, readable numbers on every
colour with "Show values", and a tooltip like `پنج‌شنبه ۱۴۰۳/۱۲/۳۰` with the
value. Query, controls, colour scheme and "Show values" are Superset's own;
Cell Size and Cell Padding are used as the smallest size and the gap, and Cell
Radius as the minimum rounding. Domain **month** or
**year** with subdomain **day** is drawn in Jalali; any other combination, and
dates outside 1350–1550, are drawn by Superset's original chart. The tooltip
date is always Jalali, whatever the chart's Time format says.

Superset's chart needs an explicit time range (it refuses «No filter» with "Please
provide both time bounds"): set the chart's Time range, or make sure the
dashboard's time filter has a value.

In Explore, a chart can render before the plugin bundle has loaded, and then
shows `jalali_date` literally (or Gregorian dates in the global mode) until it
renders again (Run, a control change, a resize). Dashboards wait for the bundle
and are not affected; see [HOW_IT_WORKS](HOW_IT_WORKS.md#load-order).

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `{{ jalali_columns(...) }}` shows up literally or "undefined" | Enable `ENABLE_TEMPLATE_PROCESSING`, call `init_jalali(globals())` last in the config, restart all workers. |
| `column t.occoureddate does not exist` | The column has capital letters: write `t."OccouredDate"`. |
| `Invalid SQL identifier` | The argument is not a plain/quoted column name; remove spaces, functions or casts. |
| All Jalali columns are NULL | Date is NULL or outside `sql_min_year`..`sql_max_year`; aliases differ between the two macros; or check the time zone. |
| Off by one day near midnight | `timestamptz` column without `tz='Asia/Tehran'`, or `tz` set on a plain `timestamp`. |
| Duplicate column name error | Use `SELECT t.*` instead of `SELECT *`, or rename the source column that clashes. |
| Slow dashboard | Filter with the date picker on the real date column, not on Jalali columns. |
| Axis shows the text `jalali_date` | The chart rendered before the plugin bundle loaded (Explore only); click Run. Check that `DYNAMIC_PLUGINS` is on. |
| Weekday axis in alphabetical order | Use `jalali_weekday_num` (1 = Saturday) and sort the axis ascending. |
