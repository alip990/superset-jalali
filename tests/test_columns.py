import json
import jinja2
import pytest
from superset_jalali import columns
from superset_jalali.columns import FIELDS, ColumnsError, ConflictError, plan_columns, remove_plan
from superset_jalali.macros import jalali, jalali_columns

EXISTING = [
    {'column_name': 'occurred_at', 'type': 'TIMESTAMP WITHOUT TIME ZONE', 'is_dttm': True},
    {'column_name': 'OccouredDate', 'type': 'TIMESTAMP', 'is_dttm': False},
    {'column_name': 'created', 'type': 'DATE', 'is_dttm': False},
    {'column_name': 'amount', 'type': 'NUMERIC(10, 2)', 'is_dttm': False},
    {'column_name': 'flagged', 'type': 'VARCHAR', 'is_dttm': True, 'expression': "occurred_at + interval '1 day'"},
]


def _render(expression):
    return jinja2.Environment().from_string(expression).render(jalali=jalali)


def test_fields_follow_jalali_columns():
    import sqlglot
    tree = sqlglot.parse_one('SELECT ' + jalali_columns('t.d'), read='postgres')
    assert ['jalali_' + field.name for field in FIELDS] == [column.alias for column in tree.expressions]
    assert len({field.label for field in FIELDS}) == 13


def test_plan_for_a_plain_column():
    plan = plan_columns(EXISTING, 'occurred_at')
    assert [column['column_name'] for column in plan] == ['jalali_' + field.name for field in FIELDS]
    first = plan[0]
    assert first == {
        'column_name': 'jalali_year', 'expression': "{{ jalali('occurred_at', 'year') }}", 'type': 'INTEGER',
        'verbose_name': 'سال جلالی', 'is_dttm': False, 'groupby': True, 'filterable': True,
        'extra': json.dumps({'superset_jalali': {'source': 'occurred_at', 'field': 'year', 'version': 1}}),
    }
    types = {column['column_name']: column['type'] for column in plan}
    assert types['jalali_date'] == 'VARCHAR' and types['jalali_week_start'] == 'DATE'
    assert types['jalali_weekday_num'] == 'INTEGER'
    assert plan[-2]['verbose_name'] == 'شماره روز هفته (شنبه = ۰)'
    for column in plan:
        field = column['column_name'].removeprefix('jalali_')
        assert _render(column['expression']) == jalali('occurred_at', field)


def test_plan_quotes_mixed_case_without_table_alias():
    plan = plan_columns(EXISTING, 'OccouredDate', fields=['month_label'])
    assert plan[0]['expression'] == """{{ jalali('"OccouredDate"', 'month_label') }}"""
    assert '("OccouredDate")::date' in _render(plan[0]['expression'])
    assert json.loads(plan[0]['extra'])['superset_jalali']['source'] == 'OccouredDate'


@pytest.mark.parametrize('name', ['Created At', 'تاریخ', 'a"b', "it's", 'a\\b', 'x}}y', 'a.b'])
def test_plan_quotes_and_escapes_unusual_names(name):
    existing = [{'column_name': name, 'type': 'DATE'}]
    plan = plan_columns(existing, name, fields=['date'], tz='Asia/Tehran')
    sql = _render(plan[0]['expression'])
    assert ('"' + name.replace('"', '""') + '"') in sql and "AT TIME ZONE 'Asia/Tehran'" in sql


def test_field_subset_prefix_and_timezone():
    plan = plan_columns(EXISTING, 'created', fields=['week_start', 'year'], prefix='created_', tz='Asia/Tehran')
    assert [column['column_name'] for column in plan] == ['created_year', 'created_week_start']
    assert plan[0]['expression'] == "{{ jalali('created', 'year', tz='Asia/Tehran') }}"
    assert plan_columns(EXISTING, 'created', fields=['day'], prefix='')[0]['column_name'] == 'day'


@pytest.mark.parametrize('kwargs', [{'fields': ['years']}, {'fields': []}, {'fields': 'year'},
                                    {'prefix': 'bad-'}, {'prefix': '"x"'}, {'prefix': None}, {'prefix': 'a' * 60},
                                    {'tz': "Asia/Tehran'; drop"}, {'tz': ''}])
def test_invalid_options(kwargs):
    with pytest.raises(ColumnsError) as error:
        plan_columns(EXISTING, 'occurred_at', **kwargs)
    assert error.value.status == 400


@pytest.mark.parametrize('source', ['amount', 'flagged', 'missing'])
def test_source_must_be_a_physical_temporal_column(source):
    with pytest.raises(ColumnsError, match=source) as error:
        plan_columns(EXISTING, source)
    assert error.value.status == 400


def test_conflict_with_a_column_not_created_by_the_plugin():
    existing = EXISTING + [{'column_name': 'jalali_year', 'expression': 'extract(year from occurred_at)'},
                           {'column_name': 'jalali_day', 'extra': '{"certified_by": "me"}'},
                           {'column_name': 'jalali_date', 'extra': 'not json'}]
    with pytest.raises(ConflictError) as error:
        plan_columns(existing, 'occurred_at')
    assert error.value.status == 409
    assert str(error.value).endswith(': jalali_year, jalali_day, jalali_date')
    assert plan_columns(existing, 'occurred_at', fields=['month'])[0]['column_name'] == 'jalali_month'


def test_plugin_columns_are_updated_in_place():
    ours = plan_columns(EXISTING, 'occurred_at', fields=['year', 'month'])
    replanned = plan_columns(EXISTING + ours, 'created', fields=['year'], tz='Asia/Tehran')
    assert replanned[0]['column_name'] == 'jalali_year'
    assert "jalali('created', 'year', tz='Asia/Tehran')" in replanned[0]['expression']


def test_remove_plan_selects_only_marked_columns():
    occurred = plan_columns(EXISTING, 'occurred_at')
    created = plan_columns(EXISTING, 'created', fields=['year'], prefix='created_')
    other = [{'column_name': 'manual', 'extra': '{"warning_markdown": "x"}'}, {'column_name': 'none', 'extra': None},
             {'column_name': 'odd', 'extra': '{"superset_jalali": 1}'}, {'column_name': 'list', 'extra': '[]'}]
    existing = EXISTING + other + occurred + created
    assert remove_plan(existing) == [column['column_name'] for column in occurred + created]
    assert remove_plan(existing, 'created') == ['created_year']
    assert remove_plan(existing, 'amount') == []
    assert remove_plan(EXISTING) == []


def test_temporal_detection():
    assert columns.is_temporal({'type': 'TIMESTAMPTZ'}) and columns.is_temporal({'type': 'date'})
    assert columns.is_temporal({'type': 'TIMESTAMP WITH TIME ZONE'}) and columns.is_temporal({'is_dttm': True})
    assert not columns.is_temporal({'type': 'VARCHAR(10)'}) and not columns.is_temporal({'type': None})
    assert not columns.is_temporal({'type': 'UPDATED'})
