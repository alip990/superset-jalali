from datetime import date, timedelta
import jdatetime
from persiantools.jdatetime import JalaliDate
import pytest
from superset_jalali.calendar import g2j, j2g, month_length, parse_jalali
from superset_jalali.nowruz import NOWRUZ


def test_all_days():
    day = date(1971, 3, 21)
    while day <= date(2172, 3, 19):
        expected = jdatetime.date.fromgregorian(date=day)
        actual = g2j(day)
        assert actual == (expected.year, expected.month, expected.day), day
        assert j2g(*actual) == day
        day += timedelta(days=1)


def test_table_and_anchors():
    assert list(NOWRUZ) == list(range(1350, 1552))
    for y, d in NOWRUZ.items():
        assert jdatetime.date(y, 1, 1).togregorian().isoformat() == d
        assert JalaliDate(y, 1, 1).to_gregorian().isoformat() == d
    assert NOWRUZ[1403] == '2024-03-20'
    assert NOWRUZ[1404] == '2025-03-21'
    assert NOWRUZ[1405] == '2026-03-21'


def test_leap_and_digits():
    assert month_length(1403, 12) == 30
    assert j2g(1403, 12, 30) == date(2025, 3, 20)
    for value in ['۱۴۰۳/۱۲/۳۰', '١٤٠٣/١٢/٣٠', '1403-12-30']:
        assert parse_jalali(value) == (1403, 12, 30)
    for value in ['1404/12/30', '1403/13/01', '1403/01/00', 'x1403/1/1']:
        with pytest.raises(ValueError): parse_jalali(value)
    for value in [date(1971, 3, 20), date.fromisoformat(NOWRUZ[1551])]:
        with pytest.raises(ValueError): g2j(value)
