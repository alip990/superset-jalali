"""Run the macros on a real PostgreSQL; set PG_DSN to enable, e.g. postgresql://postgres@localhost/postgres."""
import os
from datetime import date, timedelta
import pytest
from flask import Flask
from superset_jalali.calendar import g2j
from superset_jalali.macros import jalali, jalali_columns, jalali_join
from superset_jalali.names import MONTHS, SEASONS, WEEKDAYS

pytestmark = pytest.mark.skipif(not os.environ.get('PG_DSN'), reason='PG_DSN is not set')
COLUMNS = ['jalali_year', 'jalali_month_num', 'jalali_day', 'jalali_date', 'jalali_date_int', 'jalali_month',
           'jalali_month_name', 'jalali_month_label', 'jalali_season', 'jalali_season_key',
           'jalali_weekday', 'jalali_weekday_num', 'jalali_week_start', 'jalali_week_start_date', 'jalali_weekday_key']
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


def expected(day, lo=1350, hi=1550):
    year, month, dom = g2j(day)
    season = (month - 1) // 3 + 1
    weekday = (day.weekday() + 2) % 7
    ym = f'{year}-{month:02d}'
    return (year, month, dom, f'{year}/{month:02d}/{dom:02d}', year * 10000 + month * 100 + dom, ym,
            MONTHS[month - 1], f'{ym} {MONTHS[month - 1]}', SEASONS[season - 1],
            f'{year}-{season} {SEASONS[season - 1]}', WEEKDAYS[weekday], weekday, day - timedelta(weekday),
            jalali_text(day - timedelta(weekday), lo, hi), f'{weekday + 1} {WEEKDAYS[weekday]}')


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
    assert row[0] == 1403 and row[3] == '۱۴۰۳/۱۰/۰۱' and row[5] == '۱۴۰۳-۱۰'
    assert row[9] == '۱۴۰۳-۴ زمستان'
    assert row[13] == '۱۴۰۳/۱۰/۰۱' and row[14] == '۱ شنبه'  # a Saturday


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
        label = jalali('"OccouredDate"', 'month_label')
        rows = conn.execute(f'SELECT {label} FROM "MixedCase" ORDER BY "OccouredDate"').fetchall()
        assert rows == [('1403-07 مهر',), ('1404-01 فروردین',), (None,)]
    finally:
        conn.execute('DROP TABLE "MixedCase"')


PERSIAN = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
WEEK_FIELDS = ['week_start_date', 'weekday_key']


@pytest.mark.parametrize('digits', ['latin', 'persian'])
def test_week_start_date_and_weekday_key_on_every_day(conn, digits):
    """Join and single expression against Python, 2008-01-01..2043-12-31 plus NULL, window 1387..1422."""
    lo, hi = 1387, 1422
    first, last = date(2008, 1, 1), date(2043, 12, 31)
    app = Flask(__name__)
    app.config['JALALI'] = dict(sql_min_year=lo, sql_max_year=hi)
    with app.app_context():
        single = ', '.join(jalali('t.d', field, digits=digits) for field in WEEK_FIELDS)
        sql = (f"SELECT * FROM (SELECT t.d::date, {jalali_columns('t.d', digits=digits)}, {single}\n"
               f"FROM (SELECT generate_series('{first}'::timestamp, '{last}', '1 day') + interval '13 hours' AS d"
               f" UNION ALL SELECT NULL) AS t\n{jalali_join('t.d')}) AS v ORDER BY 1 NULLS LAST")
    rows = [(row[0], *row[14:]) for row in conn.execute(sql).fetchall()]
    assert len(rows) == (last - first).days + 2
    assert rows[-1] == (None,) * 5
    mismatches, nulls = [], 0
    for day, *values in rows[:-1]:
        weekday = (day.weekday() + 2) % 7
        if lo <= g2j(day)[0] <= hi:
            week = jalali_text(day - timedelta(weekday), lo, hi)
            want = [week, f'{weekday + 1} {WEEKDAYS[weekday]}']
        else:
            want = [None, None]
        nulls += want[0] is None and want[1] is not None
        if digits == 'persian':
            want = [None if value is None else value.translate(PERSIAN) for value in want]
        if values != want * 2:
            mismatches.append((day, values, want))
    assert mismatches[:5] == []
    assert nulls == 2  # 1387/01/01 (Thursday) and 1387/01/02; their Saturday is in 1386


@pytest.mark.parametrize('day,week_start,weekday_key', [
    (date(2024, 3, 20), '1402/12/26', '5 چهارشنبه'),   # 1403/01/01: Saturday in the previous Jalali year
    (date(2025, 1, 2), '1403/10/08', '6 پنج‌شنبه'),     # Saturday in the previous Gregorian year
    (date(2024, 10, 5), '1403/07/14', '1 شنبه'),        # a Saturday maps to itself
    (date(2025, 3, 20), '1403/12/25', '6 پنج‌شنبه'),    # 1403/12/30, leap Esfand
    (date(2025, 3, 21), '1403/12/25', '7 جمعه'),        # 1404/01/01
])
def test_week_start_date_explicit_cases(conn, day, week_start, weekday_key):
    app = Flask(__name__)
    with app.app_context():
        sql = f"SELECT {jalali('t.d', 'week_start_date')}, {jalali('t.d', 'weekday_key')} FROM (SELECT DATE '{day}' AS d) AS t"
        joined = _sql(f"(SELECT DATE '{day}' AS d)", 't.d')
    assert conn.execute(sql).fetchone() == (week_start, weekday_key)
    assert conn.execute(joined).fetchone()[13:] == (week_start, weekday_key)


def test_week_start_date_is_null_in_the_first_week_of_the_window(conn):
    # 1403/01/01 is a Wednesday: its Saturday 1402/12/26 is outside a window that starts at 1403.
    row = conn.execute(_sql("(SELECT DATE '2024-03-20' AS d UNION ALL SELECT DATE '2024-03-23')", 't.d', 1403, 1403)
                       + ' ORDER BY 1').fetchall()
    assert row[0][3] == '1403/01/01' and row[0][12] == date(2024, 3, 16) and row[0][13] is None
    assert row[1][13] == '1403/01/04'
