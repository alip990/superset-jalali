import json
import jinja2
import pytest
from superset_jalali import columns
from superset_jalali.columns import FIELDS, ColumnsError, ConflictError, obsolete_plan, plan_columns, remove_plan
from superset_jalali.macros import column_name, jalali, jalali_columns

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
    assert [column_name('jalali_', field.name) for field in FIELDS] == [column.alias for column in tree.expressions]
    assert len({field.label for field in FIELDS}) == len(FIELDS) == 12
    assert not {'month', 'month_label', 'season_key', 'weekday_key'} & {field.name for field in FIELDS}


def test_plan_for_a_plain_column():
    plan = plan_columns(EXISTING, 'occurred_at')
    assert [column['column_name'] for column in plan] == [column_name('jalali_', field.name) for field in FIELDS]
    first = plan[0]
    assert first == {
        'column_name': 'jalali_year', 'expression': "{{ jalali('occurred_at', 'year') }}", 'type': 'INTEGER',
        'verbose_name': 'سال جلالی', 'is_dttm': False, 'groupby': True, 'filterable': True,
        'extra': json.dumps({'superset_jalali': {'source': 'occurred_at', 'field': 'year', 'version': 2}}),
    }
    types = {column['column_name']: column['type'] for column in plan}
    assert types['jalali_date'] == 'VARCHAR' and types['jalali_weekday_num'] == 'INTEGER'
    assert types['jalali_week_of_year'] == 'INTEGER'
    # The Gregorian Saturday is text, so Superset draws it as a category, and has no jalali_ prefix.
    assert types['week_start'] == 'VARCHAR' and 'jalali_week_start' not in types
    assert types['jalali_week_start_date'] == 'VARCHAR'
    labels = {column['column_name']: column['verbose_name'] for column in plan}
    assert labels['jalali_weekday_num'] == 'شماره روز هفته (شنبه = ۱)' and labels['jalali_week_of_year'] == 'هفته از سال'
    assert labels['week_start'] == 'شروع هفته (شنبه، میلادی)' and labels['jalali_week_start_date'] == 'شروع هفته (تاریخ جلالی)'
    for column in plan:
        field = json.loads(column['extra'])['superset_jalali']['field']
        assert _render(column['expression']) == jalali('occurred_at', field)


def test_plan_quotes_mixed_case_without_table_alias():
    plan = plan_columns(EXISTING, 'OccouredDate', fields=['month_name'])
    assert plan[0]['expression'] == """{{ jalali('"OccouredDate"', 'month_name') }}"""
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
    assert plan_columns(EXISTING, 'created', fields=['week_start'])[0]['column_name'] == 'week_start'
    assert plan_columns(EXISTING, 'created', fields=['week_start'], prefix='')[0]['column_name'] == 'week_start'
    # Only the default prefix is dropped; others are kept, so the name stays a valid identifier.
    assert plan_columns(EXISTING, 'created', fields=['week_start'], prefix='jalali_1_')[0]['column_name'] == 'jalali_1_week_start'


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
    assert plan_columns(existing, 'occurred_at', fields=['month_name'])[0]['column_name'] == 'jalali_month_name'


def test_plugin_columns_are_updated_in_place():
    ours = plan_columns(EXISTING, 'occurred_at', fields=['year', 'month_name'])
    replanned = plan_columns(EXISTING + ours, 'created', fields=['year'], tz='Asia/Tehran')
    assert replanned[0]['column_name'] == 'jalali_year'
    assert "jalali('created', 'year', tz='Asia/Tehran')" in replanned[0]['expression']


def _marked(name, field, source='occurred_at', version=1):
    return {'column_name': name, 'extra': json.dumps({'superset_jalali': {'source': source, 'field': field, 'version': version}})}


def test_obsolete_columns_are_fields_the_plugin_dropped_and_renamed_week_starts():
    old = [_marked('jalali_month', 'month'), _marked('jalali_month_label', 'month_label'),
           _marked('jalali_season_key', 'season_key'), _marked('created_weekday_key', 'weekday_key', 'created'),
           _marked('jalali_week_start', 'week_start'), _marked('created_week_start', 'week_start', 'created'),
           _marked('jalali_year', 'year'), _marked('jalali_week_start_date', 'week_start_date', version=2)]
    mine = [{'column_name': 'jalali_month_num', 'extra': None}, {'column_name': 'my_month', 'extra': '{"x": 1}'}]
    existing = EXISTING + mine + old
    # Dropped fields always go; the old jalali_week_start goes once week_start replaces it.
    assert obsolete_plan(existing, {'jalali_year', 'week_start'}) == [
        'jalali_month', 'jalali_month_label', 'jalali_season_key', 'created_weekday_key', 'jalali_week_start']
    # Without the replacement the old column is kept: it still works, it just returns text now.
    assert 'jalali_week_start' not in obsolete_plan(existing, {'jalali_year'})
    assert 'created_week_start' not in obsolete_plan(existing, {'created_week_start', 'week_start'})
    assert obsolete_plan(EXISTING, {'week_start'}) == []


def test_adding_columns_drops_obsolete_ones_in_one_update(monkeypatch):
    from types import SimpleNamespace
    from superset_jalali import superset_ops
    def column(id, name, field=None, type='VARCHAR', is_dttm=False, expression=None):
        extra = None if field is None else _marked(name, field)['extra']
        return SimpleNamespace(id=id, column_name=name, type=type, is_dttm=is_dttm, expression=expression, extra=extra)
    existing = [column(1, 'occurred_at', type='TIMESTAMP', is_dttm=True), column(2, 'jalali_year', 'year'),
                column(3, 'jalali_month_label', 'month_label'), column(4, 'jalali_week_start', 'week_start'),
                column(5, 'notes')]
    updates = []
    monkeypatch.setattr(superset_ops, '_dataset', lambda dataset_id: SimpleNamespace(id=dataset_id, columns=existing))
    monkeypatch.setattr(superset_ops, '_update', lambda dataset, payload: updates.append(payload))
    monkeypatch.setattr(superset_ops, '_as_user', lambda user, action: action())
    result = superset_ops.add_jalali_columns(7, 'occurred_at', user=None)
    assert result['removed'] == ['jalali_month_label', 'jalali_week_start']
    assert 'week_start' in result['created'] and 'jalali_week_of_year' in result['created']
    assert result['updated'] == ['jalali_year']
    names = [column['column_name'] for column in updates[0]]
    assert 'jalali_month_label' not in names and 'jalali_week_start' not in names
    assert {'occurred_at', 'notes', 'jalali_year', 'week_start'} <= set(names)
    assert len(names) == len(set(names)) == 2 + len(FIELDS)


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
