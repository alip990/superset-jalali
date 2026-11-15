import { afterEach, describe, expect, it, vi } from 'vitest';
import { Formatter, JALALI_IDS, registerTimeFormats, SMART_IDS, smartDateFromUrl, TimeFormatterRegistry } from '../src/timeFormats';

/** A small stand-in for @superset-ui/core's TimeFormatter and TimeFormatterRegistry (OverwritePolicy.Warn). */
class FakeFormatter {
  id: string; label: string;
  constructor(config: {id: string; label?: string; formatFunc: (value: Date) => string}) {
    this.id = config.id; this.label = config.label ?? config.id;
    const run = (value: Date | number | null | undefined) =>
      value === null || value === undefined ? `${value}` : config.formatFunc(value instanceof Date ? value : new Date(value));
    return Object.assign(run, this) as unknown as FakeFormatter;
  }
}
function fakeRegistry() {
  const items = new Map<string, Formatter>(), warnings: string[] = [];
  // Unknown ids become literal "d3" formatters, as Superset caches them.
  const iso = (v: unknown) => {const d = new Date(v as number); return Number.isFinite(d.getTime()) ? d.toISOString() : 'Invalid Date';};
  const d3 = (id: string): Formatter => Object.assign((v: unknown) => v == null ? `${v}` : `d3:${id}:${iso(v)}`, {id});
  const registry: TimeFormatterRegistry & {items: typeof items; warnings: string[]} = {
    items, warnings,
    has: id => items.has(id),
    get: (id = 'smart_date') => {
      if (!items.has(id)) items.set(id, d3(id));
      return items.get(id)!;
    },
    remove: id => items.delete(id),
    registerValue: (id, value) => {if (items.has(id)) warnings.push(id); items.set(id, value);},
  };
  for (const id of SMART_IDS) registry.registerValue(id, Object.assign((v: unknown) => `superset:${id}:${v instanceof Date ? v.toISOString() : v}`, {id}));
  return registry;
}
const TimeFormatter = FakeFormatter as never;
const utc = (iso: string) => new Date(iso + 'Z');

describe('Jalali time formats', () => {
  const registry = fakeRegistry();
  registerTimeFormats(registry, TimeFormatter, false);
  const f = (id: string) => registry.get(id);

  it.each([
    ['jalali_date', '2024-10-05T14:30:00', '۱۴۰۳/۰۷/۱۴'],
    ['jalali_datetime', '2024-10-05T14:30:00', '۱۴۰۳/۰۷/۱۴ ۱۴:۳۰'],
    ['jalali_datetime', '2024-10-05T00:00:00', '۱۴۰۳/۰۷/۱۴ ۰۰:۰۰'],
    ['jalali_month', '2024-10-05T00:00:00', 'مهر ۱۴۰۳'],
    ['jalali_year', '2024-10-05T00:00:00', '۱۴۰۳'],
    ['jalali_date', '2024-03-20T00:00:00', '۱۴۰۳/۰۱/۰۱'], // Nowruz
    ['jalali_date', '2025-03-20T23:59:59', '۱۴۰۳/۱۲/۳۰'], // leap Esfand
    ['jalali_date', '2025-03-21T00:00:00', '۱۴۰۴/۰۱/۰۱'],
    ['jalali_smart', '2024-10-05T14:30:00', '۱۴:۳۰'],
    ['jalali_smart', '2024-10-05T14:30:15', '۱۴:۳۰:۱۵'],
    ['jalali_smart', '2024-10-05T00:00:00', '۱۴۰۳/۰۷/۱۴'],
    ['jalali_smart', '2024-09-22T00:00:00', 'مهر ۱۴۰۳'], // 1 Mehr
    ['jalali_smart', '2024-03-20T00:00:00', '۱۴۰۳'], // Nowruz
    ['jalali_smart', '2025-03-20T00:00:00', '۱۴۰۳/۱۲/۳۰'],
  ])('%s formats %s as %s', (id, iso, expected) => {
    expect(f(id)(utc(iso))).toBe(expected);
  });

  it('reads epoch milliseconds like Date values, in UTC wall-clock time', () => {
    for (const id of JALALI_IDS) expect(f(id)(Date.parse('2024-10-05T14:30:00Z'))).toBe(f(id)(utc('2024-10-05T14:30:00')));
    expect(f('jalali_date')(Date.parse('2024-10-05T23:30:00Z'))).toBe('۱۴۰۳/۰۷/۱۴');
  });

  it('falls back to Superset for null, invalid and out-of-range values, without throwing', () => {
    expect(f('jalali_date')(null)).toBe('null');
    expect(f('jalali_date')(undefined)).toBe('undefined');
    expect(f('jalali_date')(utc('1960-01-01T00:00:00'))).toBe('d3:%Y-%m-%d:1960-01-01T00:00:00.000Z');
    expect(f('jalali_month')(utc('2200-01-01T00:00:00'))).toBe('d3:%Y-%m:2200-01-01T00:00:00.000Z');
    expect(f('jalali_smart')(utc('1960-01-01T00:00:00'))).toBe('superset:smart_date:1960-01-01T00:00:00.000Z');
    expect(f('jalali_date')(new Date(NaN))).toBe('d3:%Y-%m-%d:Invalid Date');
  });

  it('leaves the smart formatters untouched without the flag', () => {
    expect(f('smart_date')(utc('2024-10-05T00:00:00'))).toBe('superset:smart_date:2024-10-05T00:00:00.000Z');
    expect(registry.warnings).toEqual([]);
  });
});

describe('global smart_date mode', () => {
  it('replaces the three smart formatters and keeps the originals as fallback', () => {
    const registry = fakeRegistry();
    registerTimeFormats(registry, TimeFormatter, true);
    expect(registry.get('smart_date')(utc('2024-10-05T00:00:00'))).toBe('۱۴۰۳/۰۷/۱۴');
    expect(registry.get()(utc('2024-09-22T00:00:00'))).toBe('مهر ۱۴۰۳');
    expect(registry.get('smart_date_detailed')(utc('2024-10-05T14:30:00'))).toBe('۱۴۰۳/۰۷/۱۴ ۱۴:۳۰');
    expect(registry.get('smart_date_detailed')(utc('2024-10-05T00:00:00'))).toBe('۱۴۰۳/۰۷/۱۴');
    expect(registry.get('smart_date_detailed')(utc('2024-03-20T00:00:00'))).toBe('۱۴۰۳');
    expect(registry.get('smart_date_verbose')(utc('2024-10-05T14:30:00'))).toBe('شنبه ۱۴ مهر، ۱۴:۳۰');
    expect(registry.get('smart_date_verbose')(utc('2024-10-09T00:00:00'))).toBe('چهارشنبه ۱۸ مهر');
    expect(registry.get('smart_date_verbose')(utc('2024-09-22T00:00:00'))).toBe('مهر ۱۴۰۳');
    expect(registry.get('smart_date')(utc('1960-01-01T00:00:00'))).toBe('superset:smart_date:1960-01-01T00:00:00.000Z');
    // Registering again (a second bundle evaluation) must not capture the Jalali versions as originals.
    registerTimeFormats(registry, TimeFormatter, true);
    expect(registry.get('smart_date_verbose')(utc('1960-01-01T00:00:00'))).toBe('superset:smart_date_verbose:1960-01-01T00:00:00.000Z');
  });

  it('replaces a d3 formatter cached for a jalali id before the bundle loaded', () => {
    const registry = fakeRegistry();
    expect(registry.get('jalali_date')(utc('2024-10-05T00:00:00'))).toMatch(/^d3:jalali_date:/);
    registerTimeFormats(registry, TimeFormatter, false);
    expect(registry.get('jalali_date')(utc('2024-10-05T00:00:00'))).toBe('۱۴۰۳/۰۷/۱۴');
    expect(registry.warnings).toEqual([]);
  });

  it.each([
    ['https://bi.example/superset-jalali/static/jalali-AB.js?smart_date=1', true],
    ['https://bi.example/superset-jalali/static/jalali-AB.js', false],
    ['https://bi.example/superset-jalali/static/jalali-AB.js?smart_date=0', false],
    ['not a url', false],
  ])('reads the flag from %s', (url, expected) => {
    expect(smartDateFromUrl(url)).toBe(expected);
  });
});

describe('bundle entry', () => {
  afterEach(() => {vi.unstubAllGlobals(); vi.resetModules(); vi.doUnmock('../src/timeFormats');});
  it.each([[true], [false]])('registers formats from its own URL (smart: %s)', async smart => {
    const calls: unknown[][] = [];
    vi.doMock('../src/timeFormats', async original => ({
      ...(await original<typeof import('../src/timeFormats')>()),
      smartDateFromUrl: (url: string) => {calls.push(['url', url]); return smart;},
      registerTimeFormats: (...args: unknown[]) => {calls.push(['register', ...args]);},
    }));
    const registry = {}, TimeFormatter = class {};
    vi.stubGlobal('__VERSION__', 'test');
    vi.stubGlobal('window', {'__superset__/react':{}, '__superset__/react-dom':{}, '__superset__/@superset-ui/core':{
      getExtensionsRegistry: () => ({get: () => undefined, set: () => undefined}),
      getTimeFormatterRegistry: () => registry, TimeFormatter,
    }});
    await import('../src/index');
    expect(calls[0]).toEqual(['url', expect.stringMatching(/src\/index\.ts$/)]);
    expect(calls[1]).toEqual(['register', registry, TimeFormatter, smart]);
  });

  it.each([[true], [false]])('replaces the calendar heatmap only when asked (flag: %s)', async flag => {
    const calls: unknown[][] = [];
    vi.doMock('../src/timeFormats', async original => ({
      ...(await original<typeof import('../src/timeFormats')>()),
      flagFromUrl: (url: string, name: string) => {calls.push(['flag', name]); return flag && name === 'cal_heatmap';},
      registerTimeFormats: () => undefined,
    }));
    vi.doMock('../src/calendarHeatmap', () => ({registerCalendarHeatmap: (registry: unknown) => {calls.push(['register', registry]);}}));
    const components = {};
    vi.stubGlobal('__VERSION__', 'test');
    vi.stubGlobal('window', {'__superset__/react':{}, '__superset__/react-dom':{}, '__superset__/@superset-ui/core':{
      getExtensionsRegistry: () => ({get: () => undefined, set: () => undefined}),
      getTimeFormatterRegistry: () => ({}), TimeFormatter: class {}, getChartComponentRegistry: () => components,
    }});
    await import('../src/index');
    expect(calls).toEqual(flag ? [['flag', 'cal_heatmap'], ['register', components]] : [['flag', 'cal_heatmap']]);
    vi.doUnmock('../src/calendarHeatmap');
  });

  it('keeps import.meta.url in the production bundle', async () => {
    const { build } = await import('esbuild');
    const path = '../esbuild.options.mjs';
    const { options } = await import(/* @vite-ignore */ path);
    const result = await build({...options('test', '/tmp/sj-build-test'), minify:false, sourcemap:false,
      absWorkingDir:new URL('..', import.meta.url).pathname, logLevel:'silent'});
    expect(result.warnings).toEqual([]);
    const js = new TextDecoder().decode(result.outputFiles!.find((f: {path: string}) => f.path.endsWith('.js'))!.contents);
    expect(js).toContain('import.meta.url');
    expect(js).not.toContain('import_meta');
  });
});
