import { describe, expect, it } from 'vitest';
import { blocksFor, dayOf, perDay, rangeEnd, supported, weekdayOf } from '../src/calendarLayout';

describe('calendar layout', () => {
  it('draws only month or year domains of days', () => {
    expect(supported('month', 'day')).toBe(true);
    expect(supported('year', 'day')).toBe(true);
    for (const [domain, subdomain] of [['week', 'day'], ['day', 'hour'], ['hour', 'min'], ['month', 'week'], ['month', 'month'], ['year', 'month'], ['', '']]) {
      expect(supported(domain, subdomain), `${domain}/${subdomain}`).toBe(false);
    }
  });

  it('reads Superset timestamps as UTC days and Saturday-first weekdays', () => {
    expect(dayOf('1737331200.0')).toBe('2025-01-20');
    expect(dayOf(1737331200)).toBe('2025-01-20');
    expect(weekdayOf('2024-10-05')).toBe(0); // Saturday
    expect(weekdayOf('2024-10-04')).toBe(6); // Friday
    expect(weekdayOf('2024-10-09')).toBe(4); // Wednesday
  });

  it('sums values per day and skips bad keys', () => {
    const days = perDay({'1737331200.0': 5, '1737334800': 7, '1737417600': 1, 'x': 9, '1737504000': NaN as number});
    expect([...days]).toEqual([['2025-01-20', 12], ['2025-01-21', 1]]);
  });

  it('knows the last day Superset covers: the start month or year counts as the first domain', () => {
    expect(rangeEnd(Date.parse('2025-01-20T00:00:00Z'), 'month', 4)).toBe('2025-04-30');
    expect(rangeEnd(Date.parse('2025-01-31T00:00:00Z'), 'month', 1)).toBe('2025-01-31');
    expect(rangeEnd(Date.parse('2024-07-01T00:00:00Z'), 'year', 2)).toBe('2025-12-31');
  });

  it('splits a Gregorian range into whole Jalali months, with leap Esfand', () => {
    const blocks = blocksFor('month', '2025-01-20', '2025-04-30')!;
    expect(blocks.map(block => [block.year, block.month, block.cells.length])).toEqual([
      [1403, 11, 30], [1403, 12, 30], [1404, 1, 31], [1404, 2, 31]]); // 2025-01-20 is 1403/11/01
    expect(blocks[1].cells[29].jalali).toEqual([1403, 12, 30]);
    expect(blocks[1].cells[29].iso).toBe('2025-03-20');
    expect(blocks[2].cells[0].iso).toBe('2025-03-21');
    expect(blocksFor('month', '2026-03-01', '2026-03-31')!.map(block => [block.year, block.month, block.cells.length]))
      .toEqual([[1404, 12, 29], [1405, 1, 31]]); // 1404 is not a leap year
  });

  it('puts each day in a Saturday-first week column and weekday row', () => {
    for (const block of blocksFor('month', '2024-09-22', '2024-12-31')!) {
      let column = 0, row = weekdayOf(block.cells[0].iso);
      for (const cell of block.cells) {
        expect([cell.column, cell.row], cell.iso).toEqual([column, weekdayOf(cell.iso)]);
        expect(cell.row).toBe(row);
        row = (row + 1) % 7; if (row === 0) column++;
      }
      expect(block.columns).toBe(block.cells[block.cells.length - 1].column + 1);
    }
    const mehr = blocksFor('month', '2024-09-22', '2024-09-22')![0]; // 1403/07/01 is a Sunday
    expect(mehr.cells[0]).toMatchObject({jalali: [1403, 7, 1], column: 0, row: 1});
    expect(mehr.cells.filter(cell => cell.row === 6).map(cell => cell.jalali[2])).toEqual([6, 13, 20, 27]); // Fridays
  });

  it('draws whole Jalali years with their real length', () => {
    const years = blocksFor('year', '2024-03-20', '2025-03-21')!;
    expect(years.map(block => [block.year, block.month, block.cells.length])).toEqual([[1403, 0, 366], [1404, 0, 365]]);
    expect(years[0].cells[0]).toMatchObject({iso: '2024-03-20', jalali: [1403, 1, 1], column: 0, row: 4});
    expect(years[0].cells[365].jalali).toEqual([1403, 12, 30]);
    expect(blocksFor('year', '2150-03-21', '2150-03-21')![0].year).toBe(1529);
  });

  it('refuses ranges it cannot draw', () => {
    expect(blocksFor('month', '1960-01-01', '1960-02-01')).toBeUndefined();
    expect(blocksFor('month', '2025-01-01', '2024-01-01')).toBeUndefined();
    expect(blocksFor('month', '2172-03-20', '2172-04-01')).toBeUndefined();
    expect(blocksFor('month', '2025-01-01', '2100-01-01')).toBeUndefined(); // more than 60 blocks
    expect(blocksFor('month', 'not a date', '2025-01-01')).toBeUndefined();
  });
});
