import { it, expect } from 'vitest';
import { presets, parse, emit, label, tehranToday } from '../src/timeRange';
import { j2g, g2j, addDays } from '../src/jalali';

it('all presets round trip, including fixed calendar ranges', () => {
  const options = presets(new Date('2024-10-09T12:00:00Z'));
  for (const preset of options) {
    const result = parse(preset.value, options);
    expect(result.kind).toBe('preset');
    expect(label(preset.value, options)).toBe(preset.label);
  }
  expect(options.find(p => p.id === 'month')!.value).toBe('2024-09-22T00:00:00 : 2024-10-22T00:00:00');
  expect(options.find(p => p.id === '7')!.value).toBe('DATEADD(DATETIME("today"), -6, day) : DATEADD(DATETIME("today"), 1, day)');
});

it('inclusive UI emits half-open Gregorian range and random ranges round trip', () => {
  expect(emit([1403, 7, 1], [1403, 7, 30])).toBe('2024-09-22T00:00:00 : 2024-10-22T00:00:00');
  let seed = 42;
  for (let i = 0; i < 500; i++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const start = g2j(addDays('2011-03-21', seed % 10000));
    const end = g2j(addDays(j2g(...start), seed % 100));
    expect(parse(emit(start, end), [])).toEqual({kind:'range', start, end});
  }
  expect(() => emit([1403,7,30], [1403,7,1])).toThrow();
});

it('keeps unknown expressions raw, clears filters and uses Tehran day', () => {
  expect(parse('Last week')).toEqual({kind:'raw', value:'Last week'});
  expect(parse('No filter')).toEqual({kind:'none'});
  expect(parse(undefined)).toEqual({kind:'none'});
  expect(tehranToday(new Date('2024-03-20T21:00:00Z'))).toBe('2024-03-21');
  expect(parse('2024-02-30T00:00:00 : 2024-03-01T00:00:00', []).kind).toBe('raw');
  expect(parse('2024-10-22T12:00:00 : 2024-10-23T12:00:00', []).kind).toBe('raw');
});
