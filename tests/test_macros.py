import pytest
import sqlglot
from flask import Flask
from superset_jalali.macros import jalali_columns, jalali_join


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


def test_each_column_is_null_on_unmatched_year():
    from sqlglot import exp
    tree = sqlglot.parse_one('SELECT ' + jalali_columns('t.d'), read='postgres')
    for column in tree.expressions:
        case = column.this
        assert isinstance(case, exp.Case)
        assert case.args.get('default') is None
        assert case.args['ifs'][0].this.sql(dialect='postgres') == '_jy.year IS NOT NULL'
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
    # Supply the joined year and elapsed days; execute the emitted CASE/concatenation.
    def values(node):
        if isinstance(node, exp.Column) and node.sql() == '_jy.year':
            return exp.Literal.number(1403)
        if isinstance(node, exp.Sub) and node.right.sql() == '_jy.start_date':
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
    assert join.endswith(f'ON {expression} >= _jy.start_date AND {expression} < _jy.end_date')
    assert f'({expression} - _jy.start_date)' in columns
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
