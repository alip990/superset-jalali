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

it.each([
  ['2024-09-20T21:00:00Z', '2024-09-21', '2024-09-28'], // Tehran Saturday
  ['2024-09-27T12:00:00Z', '2024-09-21', '2024-09-28'], // Friday
  ['2025-03-20T12:00:00Z', '2025-03-15', '2025-03-22'], // 1403/12/30
  ['2025-03-21T12:00:00Z', '2025-03-15', '2025-03-22'], // 1404/01/01
])('this week covers the full Saturday–Friday week at %s', (now, start, end) => {
  const options = presets(new Date(now));
  const week = options.find(p => p.id === 'week')!;
  expect(week?.label).toBe('این هفته');
  expect(week?.value).toBe(`${start}T00:00:00 : ${end}T00:00:00`);
  const range = parse(week.value, []);
  if (range.kind !== 'range') throw new Error('Expected absolute week');
  expect(emit(range.start, range.end)).toBe(week.value);
});

it.each([
  ['2024-03-20T12:00:00Z', '2024-03-20', '2024-06-21', '2023-12-22'],
  ['2024-06-20T12:00:00Z', '2024-03-20', '2024-06-21', '2023-12-22'],
  ['2024-06-21T12:00:00Z', '2024-06-21', '2024-09-22', '2024-03-20'],
  ['2024-09-22T12:00:00Z', '2024-09-22', '2024-12-21', '2024-06-21'],
  ['2024-12-21T12:00:00Z', '2024-12-21', '2025-03-21', '2024-09-22'],
  ['2025-03-20T20:29:59Z', '2024-12-21', '2025-03-21', '2024-09-22'], // leap Esfand 30
  ['2025-03-20T20:30:00Z', '2025-03-21', '2025-06-22', '2024-12-21'], // Tehran Nowruz
])('seasons have half-open Jalali boundaries at %s', (now, start, end, previous) => {
  const options = presets(new Date(now));
  const season = options.find(p => p.id === 'season')!;
  const previousSeason = options.find(p => p.id === 'previous-season')!;
  expect(season?.label).toBe('این فصل');
  expect(season?.value).toBe(`${start}T00:00:00 : ${end}T00:00:00`);
  expect(previousSeason?.label).toBe('فصل گذشته');
  expect(previousSeason?.value).toBe(`${previous}T00:00:00 : ${start}T00:00:00`);
  for (const preset of [season, previousSeason]) {
    const range = parse(preset.value, []);
    if (range.kind !== 'range') throw new Error('Expected absolute season');
    expect(emit(range.start, range.end)).toBe(preset.value);
    expect(parse(preset.value, options).kind).toBe('preset');
  }
});
