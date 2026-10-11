import { describe, it, expect } from 'vitest';
import fixtures from './fixtures.json';
import { g2j, j2g, monthLength, parseJalali } from '../src/jalali';

describe('one calendar shared with Python', () => {
  it('matches every Python fixture and round trips', () => {
    for (const [gregorian, jalali] of fixtures as [string, [number, number, number]][]) {
      expect(g2j(gregorian), gregorian).toEqual(jalali);
      expect(j2g(...jalali), gregorian).toBe(gregorian);
    }
  });
  it('validates leap days, bounds and localized digits', () => {
    expect(monthLength(1403, 12)).toBe(30);
    expect(parseJalali('۱۴۰۳/۱۲/۳۰')).toEqual([1403,12,30]);
    expect(parseJalali('١٤٠٣/١٢/٣٠')).toEqual([1403,12,30]);
    expect(() => parseJalali('1404/12/30')).toThrow();
    expect(() => g2j('2024-02-30')).toThrow();
    expect(() => g2j('1971-03-20')).toThrow();
    expect(() => j2g(1551, 1, 1)).toThrow();
  });
});

it('uses the same Saturday-first Persian weekday labels as Python', async () => {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { weekdays } = await import('../src/jalali');
  const path = fileURLToPath(new URL('../../src/superset_jalali/names.py', import.meta.url));
  const python = JSON.parse(execFileSync(process.env.PYTHON || 'python3', ['-c',
    'import json,runpy,sys; print(json.dumps(runpy.run_path(sys.argv[1])["WEEKDAYS"]))', path], {encoding:'utf8'}));
  expect(weekdays).toEqual(python);
  expect(weekdays).toEqual(['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه']);
});
