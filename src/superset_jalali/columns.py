"""Plan the dataset calculated columns that call jalali(); no Superset imports."""
from collections import namedtuple
import json
import re
from .macros import _date_expression, _identifier, column_name

Field = namedtuple('Field', 'name type label')
# The column name is prefix + field name (macros.column_name); the order is the order of jalali_columns().
FIELDS = (
    Field('year', 'INTEGER', 'سال جلالی'),
    Field('month_num', 'INTEGER', 'شماره ماه جلالی'),
    Field('day', 'INTEGER', 'روز ماه جلالی'),
    Field('date', 'VARCHAR', 'تاریخ جلالی'),
    Field('date_int', 'INTEGER', 'تاریخ جلالی (عددی)'),
    Field('month_name', 'VARCHAR', 'نام ماه جلالی'),
    Field('season', 'VARCHAR', 'فصل جلالی'),
    Field('weekday', 'VARCHAR', 'روز هفته'),
    Field('weekday_num', 'INTEGER', 'شماره روز هفته (شنبه = ۱)'),
    Field('week_of_year', 'INTEGER', 'هفته از سال'),
    Field('week_start', 'VARCHAR', 'شروع هفته (شنبه، میلادی)'),
    Field('week_start_date', 'VARCHAR', 'شروع هفته (تاریخ جلالی)'),
)
MARKER = 'superset_jalali'


class ColumnsError(Exception):
    """A request the user can fix; status is the HTTP status for the API."""
    status = 400


class ConflictError(ColumnsError):
    status = 409


def marker(column):
    """The plugin marker of an existing column ({source, field, version}) or None."""
    try:
        extra = json.loads(column.get('extra') or '{}')
    except (TypeError, ValueError):
        return None
    value = extra.get(MARKER) if isinstance(extra, dict) else None
    return value if isinstance(value, dict) else None


def is_temporal(column):
    return bool(column.get('is_dttm')) or bool(re.search(r'\b(DATE|TIMESTAMP\w*)\b', (column.get('type') or '').upper()))


def _quote(name):
    """The SQL identifier for a column of a table queried without an alias."""
    if re.fullmatch(r'[a-z_][a-z0-9_]*', name):
        return name
    return '"' + name.replace('"', '""') + '"'


def _jinja_string(value):
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def plan_columns(existing_columns, source_column, fields=None, prefix='jalali_', tz=None):
    """Calculated columns to create or update, in field order."""
    by_name = {column['column_name']: column for column in existing_columns}
    source = by_name.get(source_column)
    if source is None:
        raise ColumnsError(f'Column {source_column!r} is not in the dataset')
    if source.get('expression') or not is_temporal(source):
        raise ColumnsError(f'Column {source_column!r} must be a physical date or timestamp column')
    names = [field.name for field in FIELDS]
    if fields is None:
        fields = names
    if not isinstance(fields, (list, tuple)) or not fields or any(field not in names for field in fields):
        raise ColumnsError(f'Invalid fields {fields!r}; use some of: {", ".join(names)}')
    if not isinstance(prefix, str) or (prefix and not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', prefix)):
        raise ColumnsError(f'Invalid prefix {prefix!r}: use letters, digits and underscores')
    try:
        quoted = _identifier(_quote(source_column), dotted=True)
        if tz is not None:
            _date_expression(quoted, tz)
        for name in fields:
            _identifier(column_name(prefix, name))
    except ValueError as error:
        raise ColumnsError(str(error)) from None
    def expression(field):
        arguments = [_jinja_string(quoted), _jinja_string(field)] + ([] if tz is None else ['tz=' + _jinja_string(tz)])
        return '{{ jalali(' + ', '.join(arguments) + ') }}'
    plan = [dict(column_name=column_name(prefix, field.name), expression=expression(field.name),
                 type=field.type, verbose_name=field.label, is_dttm=False, groupby=True, filterable=True,
                 extra=json.dumps({MARKER: {'source': source_column, 'field': field.name, 'version': 2}}))
            for field in FIELDS if field.name in fields]
    conflicts = [column['column_name'] for column in plan
                 if column['column_name'] in by_name and marker(by_name[column['column_name']]) is None]
    if conflicts:
        raise ConflictError('Columns already exist and were not created by superset-jalali: ' + ', '.join(conflicts))
    return plan


def obsolete_plan(existing_columns, planned_names):
    """Names of the plugin's columns that no longer fit: their field was removed from the plugin, or they were
    named with a prefix a Gregorian field no longer takes (jalali_week_start) and planned_names holds the new name."""
    fields = {field.name for field in FIELDS}
    result = []
    for column in existing_columns:
        found = marker(column)
        if found is None:
            continue
        field, name = found.get('field'), column['column_name']
        if field not in fields:
            result.append(name)
        elif name.endswith(field) and name != column_name(name[:-len(field)], field) \
                and column_name(name[:-len(field)], field) in planned_names:
            result.append(name)
    return result


def remove_plan(existing_columns, source_column=None):
    """Names of the plugin's columns, optionally only those derived from source_column."""
    return [column['column_name'] for column in existing_columns
            if (found := marker(column)) is not None and source_column in (None, found.get('source'))]
