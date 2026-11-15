"""Run the macros on a real PostgreSQL; set PG_DSN to enable, e.g. postgresql://postgres@localhost/postgres."""
import os
from datetime import date, timedelta
import pytest
from flask import Flask
from superset_jalali.calendar import g2j
from superset_jalali.macros import jalali, jalali_columns, jalali_join
from superset_jalali.names import MONTHS, SEASONS, WEEKDAYS

pytestmark = pytest.mark.skipif(not os.environ.get('PG_DSN'), reason='PG_DSN is not set')
# week_start holds a Gregorian date, so it has no jalali_ prefix.
COLUMNS = ['jalali_year', 'jalali_month_num', 'jalali_day', 'jalali_date', 'jalali_date_int', 'jalali_month_name',
           'jalali_season', 'jalali_weekday', 'jalali_weekday_num', 'jalali_week_of_year', 'week_start',
           'jalali_week_start_date']
FIRST, LAST = date(1985, 1, 1), date(2045, 12, 31)


@pytest.fixture(scope='module')
def conn():
    psycopg = pytest.importorskip('psycopg')
    with psycopg.connect(os.environ['PG_DSN'], autocommit=True) as connection:
        connection.execute("SET TimeZone = 'UTC'")
        yield connection


def _sql(source, col, lo=1390, hi=1420, select='', **kwargs):
    app = Flask(__name__)
    app.config['JALALI'] = dict(sql_min_year=lo, sql_max_year=hi)
    with app.app_context():
        return (f'SELECT {select}{jalali_columns(col, **kwargs)}\n'
                f'FROM {source} AS t\n{jalali_join(col, tz=kwargs.get("tz"))}')


def jalali_text(day, lo=1350, hi=1550):
    """The Jalali date of day as yyyy/mm/dd, or None outside the SQL year window."""
    year, month, dom = g2j(day)
    return f'{year}/{month:02d}/{dom:02d}' if lo <= year <= hi else None


def week_of_year(day):
    """Week 1 contains 1 Farvardin; weeks run Saturday to Friday. jdatetime is the independent reference."""
    jdatetime = pytest.importorskip('jdatetime')
    return jdatetime.date.fromgregorian(date=day).weeknumber()


def expected(day, lo=1350, hi=1550):
    year, month, dom = g2j(day)
    weekday = (day.weekday() + 2) % 7  # Saturday = 0
    saturday = day - timedelta(weekday)
    return (year, month, dom, f'{year}/{month:02d}/{dom:02d}', year * 10000 + month * 100 + dom, MONTHS[month - 1],
            SEASONS[(month - 1) // 3], WEEKDAYS[weekday], weekday + 1, week_of_year(day), saturday.isoformat(),
            jalali_text(saturday, lo, hi))


@pytest.mark.parametrize('lo,hi', [(1390, 1420), (1400, 1410), (1403, 1403)])
def test_every_day_matches_python_calendar(conn, lo, hi):
    source = (f"(SELECT generate_series('{FIRST}'::timestamp, '{LAST}', '1 day')"
              " + interval '23 hours 59 minutes' AS d)")
    rows = conn.execute(_sql(source, 't.d', lo, hi, select='t.d::date AS day, ') + ' ORDER BY 1').fetchall()
    assert len(rows) == (LAST - FIRST).days + 1
    mismatches = []
    for day, *values in rows:
        want = expected(day, lo, hi) if lo <= g2j(day)[0] <= hi else (None,) * len(COLUMNS)
        if tuple(values) != want:
            mismatches.append((day, values, want))
    assert not mismatches[:5]


def test_persian_digits(conn):
    source = "(SELECT timestamp '2024-12-21 10:00' AS d)"
    row = conn.execute(_sql(source, 't.d', digits='persian')).fetchone()
    assert row[0] == 1403 and row[3] == '۱۴۰۳/۱۰/۰۱' and row[5] == 'دی'
    assert row[11] == '۱۴۰۳/۱۰/۰۱'  # week_start_date: 2024-12-21 is a Saturday
    assert row[10] == '2024-12-21' and row[8] == 1  # week_start keeps Latin digits: it is a Gregorian date


def test_null_source_date(conn):
    assert conn.execute(_sql('(SELECT NULL::timestamp AS d)', 't.d')).fetchone() == (None,) * len(COLUMNS)


@pytest.mark.parametrize('instant,expected_date', [('2025-03-20 21:00:00+00', '1404/01/01'),
                                                   ('2025-03-20 20:29:59+00', '1403/12/30')])
def test_timestamptz_in_tehran(conn, instant, expected_date):
    source = f"(SELECT timestamptz '{instant}' AS d)"
    row = conn.execute(_sql(source, 't.d', tz='Asia/Tehran')).fetchone()
    assert row[3] == expected_date


def test_quoted_mixed_case_column(conn):
    conn.execute('CREATE TEMP TABLE "MixedCase"("OccouredDate" timestamp)')
    try:
        conn.execute('''INSERT INTO "MixedCase" VALUES ('2025-03-21 08:00'), (NULL)''')
        rows = conn.execute(_sql('"MixedCase"', 't."OccouredDate"') + ' ORDER BY 1').fetchall()
        assert [row[3] for row in rows] == ['1404/01/01', None]
    finally:
        conn.execute('DROP TABLE "MixedCase"')


def test_join_keeps_the_row_count(conn):
    conn.execute('CREATE TEMP TABLE jalali_rows(d timestamp)')
    try:
        conn.execute('SELECT setseed(0.42)')
        conn.execute("""INSERT INTO jalali_rows
            SELECT timestamp '1995-01-01' + random() * interval '60 years' FROM generate_series(1, 20000)""")
        conn.execute("INSERT INTO jalali_rows VALUES (NULL), ('1900-01-01'), ('2011-03-20'), ('2042-03-21'), ('2300-01-01')")
        before = conn.execute('SELECT count(*) FROM jalali_rows').fetchone()[0]
        after = conn.execute(f'SELECT count(*) FROM ({_sql("jalali_rows", "t.d")}) AS v').fetchone()[0]
        assert before == after == 20005
        plan = '\n'.join(row[0] for row in conn.execute('EXPLAIN ' + _sql('jalali_rows', 't.d')).fetchall())
        assert 'Hash' in plan and 'Join Filter' not in plan
    finally:
        conn.execute('DROP TABLE jalali_rows')


def _both(source, lo=1390, hi=1420, **kwargs):
    """Join-path columns followed by the same 13 fields from jalali(), one row per source row."""
    app = Flask(__name__)
    app.config['JALALI'] = dict(sql_min_year=lo, sql_max_year=hi)
    with app.app_context():
        single = ', '.join(f'{jalali("t.d", name.removeprefix("jalali_"), **kwargs)} AS single_{name}' for name in COLUMNS)
        return (f'SELECT t.d, {jalali_columns("t.d", **kwargs)}, {single}\n'
                f'FROM {source} AS t\n{jalali_join("t.d", tz=kwargs.get("tz"))} ORDER BY 1')


def _mismatches(rows):
    width = len(COLUMNS)
    return [(row[0], name, row[1 + i], row[1 + width + i])
            for row in rows for i, name in enumerate(COLUMNS) if row[1 + i] != row[1 + width + i]]


@pytest.mark.parametrize('lo,hi,digits', [(1390, 1420, 'latin'), (1400, 1410, 'latin'), (1403, 1403, 'latin'),
                                          (1390, 1420, 'persian')])
def test_single_expression_equals_join_on_every_day(conn, lo, hi, digits):
    source = (f"(SELECT generate_series('{FIRST}'::timestamp, '{LAST}', '1 day')"
              " + interval '23 hours 59 minutes' AS d UNION ALL SELECT NULL)")
    rows = conn.execute(_both(source, lo, hi, digits=digits)).fetchall()
    assert len(rows) == (LAST - FIRST).days + 2
    assert any(row[1] is None for row in rows) and any(row[1] is not None for row in rows)
    assert _mismatches(rows) == []


def test_single_expression_equals_join_for_timestamptz_in_tehran(conn):
    source = ("(SELECT generate_series(timestamptz '2025-03-19 21:00:00+00', timestamptz '2025-03-21 21:00:00+00',"
              " interval '30 minutes') AS d)")
    rows = conn.execute(_both(source, tz='Asia/Tehran')).fetchall()
    assert len(rows) == 97 and _mismatches(rows) == []
    by_instant = {row[0].isoformat(): row[4] for row in rows}
    assert by_instant['2025-03-20T21:00:00+00:00'] == '1404/01/01'
    assert by_instant['2025-03-20T20:00:00+00:00'] == '1403/12/30'


def test_single_expression_on_a_table_without_alias(conn):
    conn.execute('CREATE TEMP TABLE "MixedCase"("OccouredDate" timestamp)')
    try:
        conn.execute('''INSERT INTO "MixedCase" VALUES ('2025-03-21 08:00'), ('2024-10-09 23:59'), (NULL)''')
        label = jalali('"OccouredDate"', 'date')
        rows = conn.execute(f'SELECT {label} FROM "MixedCase" ORDER BY "OccouredDate"').fetchall()
        assert rows == [('1403/07/18',), ('1404/01/01',), (None,)]
    finally:
        conn.execute('DROP TABLE "MixedCase"')


PERSIAN = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')


@pytest.mark.parametrize('digits', ['latin', 'persian'])
def test_week_fields_on_every_day(conn, digits):
    """Join and single expression against Python, 2008-01-01..2043-12-31 plus NULL, window 1387..1422."""
    lo, hi = 1387, 1422
    first, last = date(2008, 1, 1), date(2043, 12, 31)
    fields = ['weekday_num', 'week_of_year', 'week_start', 'week_start_date']
    app = Flask(__name__)
    app.config['JALALI'] = dict(sql_min_year=lo, sql_max_year=hi)
    with app.app_context():
        single = ', '.join(jalali('t.d', field, digits=digits) for field in fields)
        columns = ', '.join(f'v.{name}' for name in ['jalali_weekday_num', 'jalali_week_of_year', 'week_start', 'jalali_week_start_date'])
        sql = (f"SELECT t.d::date, {columns}, {single}\n"
               f"FROM (SELECT generate_series('{first}'::timestamp, '{last}', '1 day') + interval '13 hours' AS d"
               f" UNION ALL SELECT NULL) AS t\n"
               f"LEFT JOIN LATERAL (SELECT {jalali_columns('s.d', digits=digits)} FROM (SELECT t.d) AS s {jalali_join('s.d')}) AS v ON true"
               ' ORDER BY 1 NULLS LAST')
    rows = conn.execute(sql).fetchall()
    assert len(rows) == (last - first).days + 2
    assert rows[-1] == (None,) * 9
    mismatches, null_weeks = [], 0
    for day, *values in rows[:-1]:
        weekday = (day.weekday() + 2) % 7
        saturday = day - timedelta(weekday)
        if lo <= g2j(day)[0] <= hi:
            want = [weekday + 1, week_of_year(day), saturday.isoformat(), jalali_text(saturday, lo, hi)]
        else:
            want = [None] * 4
        null_weeks += want[3] is None and want[0] is not None
        if digits == 'persian' and want[3] is not None:
            want[3] = want[3].translate(PERSIAN)  # only the Jalali date takes Persian digits
        if values != want * 2:
            mismatches.append((day, values, want))
    assert mismatches[:5] == []
    assert null_weeks == 2  # 1387/01/01 (Thursday) and 1387/01/02: their Saturday is in 1386


@pytest.mark.parametrize('day,weekday_num,week,week_start,week_start_date', [
    (date(2024, 3, 20), 5, 1, '2024-03-16', '1402/12/26'),   # 1403/01/01, a Wednesday: its Saturday is in 1402
    (date(2024, 3, 22), 7, 1, '2024-03-16', '1402/12/26'),   # Friday 1403/01/03 still week 1
    (date(2024, 3, 23), 1, 2, '2024-03-23', '1403/01/04'),   # the first Saturday starts week 2
    (date(2025, 1, 2), 6, 42, '2024-12-28', '1403/10/08'),   # the Saturday is in the previous Gregorian year
    (date(2024, 10, 5), 1, 30, '2024-10-05', '1403/07/14'),  # a Saturday maps to itself
    (date(2025, 3, 20), 6, 53, '2025-03-15', '1403/12/25'),  # 1403/12/30, leap Esfand: the 53rd week
    (date(2025, 3, 21), 7, 1, '2025-03-15', '1403/12/25'),   # 1404/01/01, a Friday: week 1 of 1404
])
def test_week_fields_explicit_cases(conn, day, weekday_num, week, week_start, week_start_date):
    app = Flask(__name__)
    fields = ['weekday_num', 'week_of_year', 'week_start', 'week_start_date']
    with app.app_context():
        sql = f"SELECT {', '.join(jalali('t.d', field) for field in fields)} FROM (SELECT DATE '{day}' AS d) AS t"
        joined = _sql(f"(SELECT DATE '{day}' AS d)", 't.d')
    want = (weekday_num, week, week_start, week_start_date)
    assert conn.execute(sql).fetchone() == want
    row = dict(zip(COLUMNS, conn.execute(joined).fetchone()))
    assert (row['jalali_weekday_num'], row['jalali_week_of_year'], row['week_start'], row['jalali_week_start_date']) == want


def test_week_start_is_gregorian_text_not_a_date(conn):
    cursor = conn.execute(_sql("(SELECT DATE '2024-10-09' AS d)", 't.d'))
    row = dict(zip([column.name for column in cursor.description], cursor.fetchone()))
    assert row['week_start'] == '2024-10-05' and isinstance(row['week_start'], str)
    assert 'jalali_week_start' not in row
    conn.execute("SET DateStyle = 'SQL, DMY'")  # the text must not depend on the session's date style
    try:
        assert conn.execute(_sql("(SELECT DATE '2024-10-09' AS d)", 't.d')).fetchone()[10] == '2024-10-05'
    finally:
        conn.execute("SET DateStyle = 'ISO, MDY'")


def test_week_start_date_is_null_in_the_first_week_of_the_window(conn):
    # 1403/01/01 is a Wednesday: its Saturday 1402/12/26 is outside a window that starts at 1403.
    row = conn.execute(_sql("(SELECT DATE '2024-03-20' AS d UNION ALL SELECT DATE '2024-03-23')", 't.d', 1403, 1403)
                       + ' ORDER BY 1').fetchall()
    assert row[0][3] == '1403/01/01' and row[0][10] == '2024-03-16' and row[0][11] is None
    assert row[1][11] == '1403/01/04'
