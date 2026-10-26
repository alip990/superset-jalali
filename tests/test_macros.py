import pytest
import sqlglot
from flask import Flask
from superset_jalali.macros import jalali, jalali_columns, jalali_join


def test_sql_parses_and_columns():
    sql = f'SELECT t.*, {jalali_columns("t.created_at")} FROM events t {jalali_join("t.created_at")}'
    tree = sqlglot.parse_one(sql, read='postgres')
    assert len(tree.expressions) == 14
    assert 'jalali_week_start' in sql
    assert 'LEFT JOIN' in sql
    assert '1390' in sql and '1421' not in sql


@pytest.mark.parametrize('bad', ['x;drop table t', 'x --', 't.x()', 'x"', '', 'a..b'])
def test_bad_column(bad):
    for macro in [jalali_columns, jalali_join]:
        with pytest.raises(ValueError): macro(bad)


QUOTED_OK = ['occurred_at', 't.occurred_at', 't."OccouredDate"', '"CR"."DeviceCrime"."OccouredDate"',
             'public.t."Created At"', 't."Weird""Name"', 't."' + 'a' * 63 + '"', 't."' + 'ی' * 31 + '"',
             't."' + '""' * 63 + '"']
QUOTED_BAD = ['t."a" OR 1=1 --', 't."x";DROP TABLE fact', 't."unterminated', 't."a"b"', 't.col; select 1',
              't."a"\'', 't.""', '"a".', '.a', 't. a', 't.a b', 'now()', 't."a\x00b"',
              't."' + 'a' * 64 + '"', 't."' + 'ی' * 32 + '"', 't."' + '""' * 64 + '"', 't.' + 'a' * 64]


@pytest.mark.parametrize('good', QUOTED_OK)
@pytest.mark.parametrize('macro', [jalali_join, jalali_columns])
def test_plain_and_quoted_column_names_are_accepted(good, macro):
    assert good in macro(good)


@pytest.mark.parametrize('bad', QUOTED_BAD)
@pytest.mark.parametrize('macro', [jalali_join, jalali_columns])
def test_non_identifier_columns_are_rejected(bad, macro):
    with pytest.raises(ValueError): macro(bad)


def test_quoted_column_is_emitted_verbatim():
    cols, join = jalali_columns('t."OccouredDate"'), jalali_join('t."OccouredDate"')
    for sql in [cols, join]:
        assert '(t."OccouredDate")::date' in sql
        assert 't.OccouredDate' not in sql and 'occoureddate' not in sql
    tree = sqlglot.parse_one(f'SELECT t.*, {cols} FROM "CR"."DeviceCrime" t {join}', read='postgres')
    assert len(tree.expressions) == 14
    columns = {column.sql(dialect='postgres') for column in tree.find_all(sqlglot.exp.Column) if column.table == 't'}
    assert columns == {'t.*', 't."OccouredDate"'}


@pytest.mark.parametrize('kwargs', [{'alias': '"_jy"'}, {'alias': 'a.b'}, {'prefix': '"jalali_"'}, {'prefix': 'a b'}])
def test_alias_and_prefix_stay_plain(kwargs):
    with pytest.raises(ValueError): jalali_columns('t.d', **kwargs)
    if 'alias' in kwargs:
        with pytest.raises(ValueError): jalali_join('t.d', **kwargs)
    assert 'AS Jalali_year' in jalali_columns('t.d', prefix='Jalali_')


def test_alias_prefix_and_config():
    for kwargs in [{'alias': 'x.y'}, {'prefix': 'bad-'}]:
        with pytest.raises(ValueError): jalali_columns('t.d', **kwargs)
    with pytest.raises(ValueError): jalali_columns('d', digits='bad')
    app = Flask(__name__)
    app.config['JALALI'] = dict(sql_min_year=1403, sql_max_year=1404, sql_digits='persian')
    with app.app_context():
        sql = f'SELECT {jalali_columns("t.d")} FROM t {jalali_join("t.d")}'
        sqlglot.parse_one(sql, read='postgres')
        assert 'translate(' in sql and '۱۴۰۳' not in sql
        assert '1402' not in jalali_join('t.d')
        app.config['JALALI']['sql_max_year'] = 1551
        with pytest.raises(ValueError): jalali_join('t.d')


def _postgres(sql):
    return sqlglot.parse_one(sql, read='postgres').sql(dialect='postgres')


YEAR = _postgres('CASE WHEN (t.d)::date >= _jy.nowruz THEN _jy.year_after ELSE _jy.year_before END')
START = _postgres('CASE WHEN (t.d)::date >= _jy.nowruz THEN _jy.nowruz ELSE _jy.prev_nowruz END')


def test_each_column_is_null_on_unmatched_year():
    from sqlglot import exp
    tree = sqlglot.parse_one('SELECT ' + jalali_columns('t.d'), read='postgres')
    for column in tree.expressions:
        case = column.this
        assert isinstance(case, exp.Case)
        assert case.args.get('default') is None
        assert case.args['ifs'][0].this.sql(dialect='postgres') == f'({YEAR}) IS NOT NULL'
    with pytest.raises(ValueError): jalali_columns('x', prefix='a' * 60)
    with pytest.raises(ValueError): jalali_join('x', alias='a' * 64)


@pytest.mark.parametrize('month,expected', [(1, '1403-1 بهار'), (4, '1403-2 تابستان'), (7, '1403-3 پاییز'), (10, '1403-4 زمستان')])
@pytest.mark.parametrize('digits', ['latin', 'persian'])
def test_season_key_has_sortable_number_and_readable_name(month, expected, digits):
    import sqlite3
    from sqlglot import exp
    from datetime import date
    from superset_jalali.calendar import j2g
    doy = (j2g(1403, month, 1) - date(2024, 3, 20)).days
    tree = sqlglot.parse_one('SELECT ' + jalali_columns('t.d', digits=digits), read='postgres')
    column = next(column for column in tree.expressions if column.alias == 'jalali_season_key')
    # Supply the derived year and elapsed days; execute the emitted CASE/concatenation.
    def values(node):
        if isinstance(node, exp.Case) and node.sql(dialect='postgres') == YEAR:
            return exp.Literal.number(1403)
        if isinstance(node, exp.Sub) and node.right.unnest().sql(dialect='postgres') == START:
            return exp.Literal.number(doy)
        return node
    sql = exp.select(column.transform(values)).sql(dialect='sqlite')
    with sqlite3.connect(':memory:') as connection:
        connection.create_function('TRANSLATE', 3, lambda text, a, b: text.translate(str.maketrans(a, b)))
        actual = connection.execute(sql).fetchone()[0]
    if digits == 'persian':
        expected = expected.translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))
    assert actual == expected


@pytest.mark.parametrize('tz,expression', [
    (None, '(t.d)::date'),
    ('Asia/Tehran', "((t.d) AT TIME ZONE 'Asia/Tehran')::date"),
    ('UTC', "((t.d) AT TIME ZONE 'UTC')::date"),
    ('Etc/GMT+3', "((t.d) AT TIME ZONE 'Etc/GMT+3')::date"),
    ('America/Argentina/Buenos_Aires', "((t.d) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date"),
])
def test_timezone_applies_to_every_source_date(tz, expression):
    from sqlglot import exp
    join = jalali_join('t.d', tz=tz)
    columns = jalali_columns('t.d', tz=tz)
    assert join.endswith(f'ON _jy.gyear = EXTRACT(YEAR FROM {expression})::int')
    assert f'CASE WHEN {expression} >= _jy.nowruz THEN _jy.year_after' in columns
    assert f'({expression} - (CASE WHEN {expression} >= _jy.nowruz THEN _jy.nowruz' in columns
    assert f'EXTRACT(DOW FROM {expression})' in columns
    assert f'THEN ({expression} - ' in columns
    if tz is None:
        assert 'AT TIME ZONE' not in join + columns
    tree = sqlglot.parse_one(f'SELECT {columns} FROM events t {join}', read='postgres')
    expected = sqlglot.parse_one(expression, read='postgres').sql(dialect='postgres')
    casts = [node for node in tree.find_all(exp.Cast)
             if node.args['to'].is_type(exp.DataType.Type.DATE)
             and any(column.sql() == 't.d' for column in node.find_all(exp.Column))]
    assert casts
    assert all(node.sql(dialect='postgres') == expected for node in casts)


@pytest.mark.parametrize('macro', [jalali_join, jalali_columns])
def test_timezone_config_and_argument_precedence(macro):
    app = Flask(__name__)
    with app.app_context():
        assert 'AT TIME ZONE' not in macro('t.d')
        app.config['JALALI'] = {'sql_timezone': 'Asia/Tehran'}
        assert "((t.d) AT TIME ZONE 'Asia/Tehran')::date" in macro('t.d')
        assert macro('t.d', tz=None) == macro('t.d')
        sql = macro('t.d', tz='UTC')
        assert "AT TIME ZONE 'UTC'" in sql and 'Asia/Tehran' not in sql
        app.config['JALALI']['sql_timezone'] = "Asia/Tehran'; drop"
        assert "AT TIME ZONE 'UTC'" in macro('t.d', tz='UTC')
        app.config['JALALI']['sql_timezone'] = None
        assert 'AT TIME ZONE' not in macro('t.d')


@pytest.mark.parametrize('bad', ["Asia/Tehran'; drop", 'x y', '', '../a', 'UTC\n',
                                '/Asia/Tehran', 'A/B/C/D', 'Asia//Tehran', 1, True])
@pytest.mark.parametrize('macro', [jalali_join, jalali_columns])
def test_invalid_timezone_argument_and_config(bad, macro):
    with pytest.raises(ValueError): macro('t.d', tz=bad)
    app = Flask(__name__)
    app.config['JALALI'] = {'sql_timezone': bad}
    with app.app_context():
        with pytest.raises(ValueError): macro('t.d')


def _values(join):
    from datetime import date
    from sqlglot import exp
    tree = sqlglot.parse_one(f'SELECT 1 FROM t {join}', read='postgres')
    def value(node):
        if isinstance(node, exp.Null):
            return None
        if isinstance(node, exp.Cast):
            return date.fromisoformat(node.this.name)
        return int(node.name)
    return [tuple(value(node) for node in row.expressions) for row in tree.find(exp.Values).expressions]


def _window(lo, hi):
    app = Flask(__name__)
    app.config['JALALI'] = dict(sql_min_year=lo, sql_max_year=hi)
    return app


def test_join_is_an_equality_on_the_gregorian_year():
    from sqlglot import exp
    join = jalali_join('t.d')
    condition = sqlglot.parse_one(f'SELECT 1 FROM t {join}', read='postgres').find(exp.Join).args['on']
    assert isinstance(condition, exp.EQ)
    assert condition.sql(dialect='postgres') == _postgres('_jy.gyear = EXTRACT(YEAR FROM (t.d)::date)::int')
    assert not list(condition.find_all(exp.GTE, exp.LT, exp.GT, exp.LTE))
    assert 'AS _jy(gyear, nowruz, prev_nowruz, year_after, year_before)' in join


@pytest.mark.parametrize('lo,hi', [(1390, 1420), (1400, 1410), (1403, 1403), (1350, 1351), (1549, 1550), (1350, 1550)])
def test_values_rows_cover_the_window_once_per_gregorian_year(lo, hi):
    from datetime import date, timedelta
    from superset_jalali.calendar import g2j
    from superset_jalali.nowruz import NOWRUZ
    with _window(lo, hi).app_context():
        join, cols = jalali_join('t.d'), jalali_columns('t.d')
        sqlglot.parse_one(f'SELECT t.*, {cols} FROM t {join}', read='postgres')
    rows = _values(join)
    first, last = date.fromisoformat(NOWRUZ[lo]).year, date.fromisoformat(NOWRUZ[hi]).year
    assert len(rows) == last - first + 2
    assert [row[0] for row in rows] == list(range(first, last + 2))
    assert rows[0][4] is None and rows[-1][3] is None
    assert (rows[0][2] is None) == (lo == 1350)
    # Evaluate the emitted lookup for every day around the window.
    by_year = {row[0]: row for row in rows}
    day, end = date.fromisoformat(NOWRUZ[lo]) - timedelta(400), min(date.fromisoformat(NOWRUZ[hi + 1]) + timedelta(400), date(2172, 3, 19))
    while day <= end:
        row = by_year.get(day.year)
        year = start = None
        if row:
            year, start = (row[3], row[1]) if day >= row[1] else (row[4], row[2])
        expected = g2j(day)[0] if day >= date(1971, 3, 21) else None
        if expected is not None and lo <= expected <= hi:
            assert year == expected and g2j(start) == (year, 1, 1), day
        else:
            assert year is None, day
        day += timedelta(1 if lo != 1350 or hi != 1550 else 7)


ALIASES = ['jalali_year', 'jalali_month_num', 'jalali_day', 'jalali_date', 'jalali_date_int', 'jalali_month',
           'jalali_month_name', 'jalali_month_label', 'jalali_season', 'jalali_season_key',
           'jalali_weekday', 'jalali_weekday_num', 'jalali_week_start']


def test_columns_keep_their_names_and_order():
    tree = sqlglot.parse_one('SELECT ' + jalali_columns('t.d'), read='postgres')
    assert [column.alias for column in tree.expressions] == ALIASES


@pytest.mark.parametrize('field', [alias.removeprefix('jalali_') for alias in ALIASES])
def test_single_field_is_one_expression(field):
    from sqlglot import exp
    sql = jalali('t.d', field)
    tree = sqlglot.parse_one(f'SELECT {sql} AS v FROM events t', read='postgres')
    assert not list(tree.find_all(exp.Join, exp.Subquery, exp.Values))
    assert isinstance(tree.expressions[0].this, exp.Case)
    assert 'make_date' not in sql and "DATE '2024-03-20'" in sql
    year = tree.expressions[0].this.args['ifs'][0].this
    assert isinstance(year, exp.Is) and year.this.unnest().sql(dialect='postgres').startswith(
        _postgres('CASE WHEN (t.d)::date >= (CASE EXTRACT(YEAR FROM (t.d)::date)::int WHEN 2011 THEN 1 END) THEN 1 END')[:60])


def test_single_field_rejects_unknown_fields_and_identifiers():
    for field in ['years', 'jalali_year', '', 'YEAR', None]:
        with pytest.raises(ValueError, match='month_label'): jalali('t.d', field)
    for bad in QUOTED_BAD + ['x;drop table t', '']:
        with pytest.raises(ValueError): jalali(bad, 'year')


def test_single_field_quotes_mixed_case_columns():
    sql = jalali('t."OccouredDate"', 'month_label')
    assert '(t."OccouredDate")::date' in sql and 'OccouredDate)' not in sql
    sqlglot.parse_one(f'SELECT {jalali(chr(34) + "OccouredDate" + chr(34), "date")} FROM "MixedCase"', read='postgres')


@pytest.mark.parametrize('bad', ["Asia/Tehran'; drop", 'x y', '', 1, True])
def test_single_field_timezone_and_digits_match_jalali_columns(bad):
    with pytest.raises(ValueError): jalali('t.d', 'date', tz=bad)
    with pytest.raises(ValueError): jalali('t.d', 'date', digits='bad')
    assert "((t.d) AT TIME ZONE 'Asia/Tehran')::date" in jalali('t.d', 'date', tz='Asia/Tehran')
    assert 'translate(' in jalali('t.d', 'date', digits='persian')
    assert 'translate(' not in jalali('t.d', 'date_int', digits='persian')
    app = _window(1403, 1404)
    app.config['JALALI'].update(sql_timezone='UTC', sql_digits='persian')
    with app.app_context():
        sql = jalali('t.d', 'month')
        assert "AT TIME ZONE 'UTC'" in sql and 'translate(' in sql and 'THEN 1402' not in sql
        app.config['JALALI']['sql_max_year'] = 1551
        with pytest.raises(ValueError): jalali('t.d', 'year')


@pytest.mark.parametrize('lo,hi', [(1390, 1420), (1350, 1351), (1549, 1550)])
def test_single_field_year_lists_match_the_join_table(lo, hi):
    with _window(lo, hi).app_context():
        rows, sql = _values(jalali_join('t.d')), jalali('t.d', 'day')
    for index in range(1, 5):
        listed = [(row[0], row[index]) for row in rows if row[index] is not None]
        for gyear, value in listed:
            literal = f"DATE '{value}'" if index < 3 else str(value)
            assert f'WHEN {gyear} THEN {literal}' in sql
    assert 'THEN NULL' not in sql
