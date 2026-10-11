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
