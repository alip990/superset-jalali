"""Table-based calendar conversion, with no runtime calendar dependency."""
from bisect import bisect_right
from datetime import date, datetime, timedelta
import re
from .nowruz import NOWRUZ

YEARS = tuple(NOWRUZ)
STARTS = tuple(date.fromisoformat(NOWRUZ[y]) for y in YEARS)
DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')


def g2j(value: date) -> tuple[int, int, int]:
    if isinstance(value, datetime):
        value = value.date()
    if not STARTS[0] <= value < STARTS[-1]:
        raise ValueError('Gregorian date outside supported Jalali years 1350–1550')
    index = bisect_right(STARTS, value) - 1
    doy = (value - STARTS[index]).days
    if doy < 186:
        month, day = doy // 31 + 1, doy % 31 + 1
    else:
        month, day = (doy - 186) // 30 + 7, (doy - 186) % 30 + 1
    return YEARS[index], month, day


def month_length(year: int, month: int) -> int:
    if type(year) is not int or type(month) is not int or not 1350 <= year <= 1550 or not 1 <= month <= 12:
        raise ValueError('Invalid Jalali year or month')
    if month <= 6:
        return 31
    if month < 12:
        return 30
    return (date.fromisoformat(NOWRUZ[year + 1]) - date.fromisoformat(NOWRUZ[year])).days - 336


def j2g(year: int, month: int, day: int) -> date:
    if type(day) is not int or not 1 <= day <= month_length(year, month):
        raise ValueError('Invalid Jalali day')
    offset = (month - 1) * 31 if month <= 6 else 186 + (month - 7) * 30
    return date.fromisoformat(NOWRUZ[year]) + timedelta(days=offset + day - 1)


def parse_jalali(value: str) -> tuple[int, int, int]:
    match = re.fullmatch(r'([0-9]{4})[/-]([0-9]{1,2})[/-]([0-9]{1,2})', value.strip().translate(DIGITS))
    if not match:
        raise ValueError('Expected Jalali YYYY/MM/DD')
    parts = tuple(map(int, match.groups()))
    j2g(*parts)
    return parts
