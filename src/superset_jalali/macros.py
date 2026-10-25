"""PostgreSQL expressions for virtual datasets. Inputs are identifiers, never SQL."""
import re
from flask import current_app, has_app_context
from .names import MONTHS, SEASONS, WEEKDAYS
from .nowruz import NOWRUZ

_PLAIN = r'[A-Za-z_][A-Za-z0-9_]*'
# A plain identifier or a double-quoted one; "" escapes a quote, NUL is never allowed.
_PART = rf'(?:{_PLAIN}|"(?:[^"\x00]|"")+")'


def _identifier(value: str, *, dotted=False, empty=False) -> str:
    """Plain identifiers are emitted unquoted; quoted column parts keep their quotes and case."""
    pattern = rf'{_PART}(?:\.{_PART})*' if dotted else _PLAIN
    if not isinstance(value, str) or (not (empty and value == '') and not re.fullmatch(pattern, value)):
        raise ValueError(f'Invalid SQL identifier: {value!r}')
    for part in re.findall(_PART, value):
        name = part[1:-1].replace('""', '"') if part.startswith('"') else part
        if len(name.encode()) > 63:
            raise ValueError('PostgreSQL identifiers must fit in 63 bytes')
    return value


def _config():
    return current_app.config.get('JALALI', {}) if has_app_context() else {}


def _date_expression(col: str, tz) -> str:
    tz = _config().get('sql_timezone') if tz is None else tz
    if tz is None:
        return f'({col})::date'
    if not isinstance(tz, str) or not re.fullmatch(r'[A-Za-z]+(?:/[A-Za-z0-9_+\-]+){0,2}', tz):
        raise ValueError(f'Invalid SQL timezone: {tz!r}')
    return f"(({col}) AT TIME ZONE '{tz}')::date"


def _year_rows(lo, hi):
    """One row per Gregorian year: Jalali year gy - 621 starts at that year's March Nowruz."""
    def year(jy):
        return jy if lo <= jy <= hi else 'NULL'
    def day(jy):
        return f"DATE '{NOWRUZ[jy]}'" if jy in NOWRUZ else 'NULL'
    first, last = int(NOWRUZ[lo][:4]), int(NOWRUZ[hi][:4]) + 1
    return [(gy, day(gy - 621), day(gy - 622), year(gy - 621), year(gy - 622)) for gy in range(first, last + 1)]


def jalali_join(col: str, alias: str = '_jy', *, tz=None) -> str:
    col, alias = _identifier(col, dotted=True), _identifier(alias)
    date = _date_expression(col, tz)
    config = _config()
    lo, hi = config.get('sql_min_year', 1390), config.get('sql_max_year', 1420)
    if type(lo) is not int or type(hi) is not int or not 1350 <= lo <= hi <= 1550:
        raise ValueError('SQL years must satisfy 1350 <= min <= max <= 1550')
    rows = ',\n  '.join(f'({", ".join(map(str, row))})' for row in _year_rows(lo, hi))
    # Equality on the Gregorian year lets PostgreSQL hash join: one lookup per source row.
    return (f'LEFT JOIN (VALUES\n  {rows}\n) AS {alias}(gyear, nowruz, prev_nowruz, year_after, year_before)\n'
            f'  ON {alias}.gyear = EXTRACT(YEAR FROM {date})::int')


def jalali_columns(col: str, alias: str = '_jy', prefix: str = 'jalali_', digits=None, *, tz=None) -> str:
    col, alias = _identifier(col, dotted=True), _identifier(alias)
    date = _date_expression(col, tz)
    _identifier(prefix, empty=True)
    digits = _config().get('sql_digits', 'latin') if digits is None else digits
    if digits not in ('latin', 'persian'):
        raise ValueError('sql_digits must be latin or persian')
    after = f'{date} >= {alias}.nowruz'
    y = f'(CASE WHEN {after} THEN {alias}.year_after ELSE {alias}.year_before END)'
    start = f'(CASE WHEN {after} THEN {alias}.nowruz ELSE {alias}.prev_nowruz END)'
    doy = f'({date} - {start})'
    m = f'(CASE WHEN {doy} < 186 THEN {doy} / 31 + 1 ELSE ({doy} - 186) / 30 + 7 END)'
    d = f'(CASE WHEN {doy} < 186 THEN {doy} % 31 + 1 ELSE ({doy} - 186) % 30 + 1 END)'
    season = f'(({m} - 1) / 3 + 1)'
    weekday = f'((EXTRACT(DOW FROM {date})::int + 1) % 7)'
    def label(index, names):
        return '(CASE ' + index + ' ' + ' '.join(f"WHEN {i} THEN '{name}'" for i, name in enumerate(names, 1)) + ' END)'
    ym = f"({y}::text || '-' || lpad({m}::text, 2, '0'))"
    text_date = f"({y}::text || '/' || lpad({m}::text, 2, '0') || '/' || lpad({d}::text, 2, '0'))"
    month_name = label(m, MONTHS)
    expressions = {
        'year': y, 'month_num': m, 'day': d, 'date': text_date,
        'date_int': f'({y} * 10000 + {m} * 100 + {d})', 'month': ym,
        'month_name': month_name, 'month_label': f"({ym} || ' ' || {month_name})",
        'season': label(season, SEASONS), 'season_key': f"({y}::text || '-' || {season}::text || ' ' || {label(season, SEASONS)})",
        'weekday': label(f'({weekday} + 1)', WEEKDAYS), 'weekday_num': weekday,
        'week_start': f'({date} - {weekday})',
    }
    text_fields = {'date', 'month', 'month_label', 'season_key'}
    result = []
    for key, expr in expressions.items():
        name = _identifier(prefix + key)
        if digits == 'persian' and key in text_fields:
            expr = f"translate({expr}, '0123456789', '۰۱۲۳۴۵۶۷۸۹')"
        result.append(f'CASE WHEN {y} IS NOT NULL THEN {expr} END AS {name}')
    return ',\n'.join(result)
