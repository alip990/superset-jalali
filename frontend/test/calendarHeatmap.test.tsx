import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tree: ReactTestRenderer;
let mod: typeof import('../src/calendarHeatmap');
const scheme = {createLinearScale: (extent: [number, number]) => (value: number) => `color(${extent[0]}..${extent[1]}:${value})`};
beforeEach(async () => {
  vi.stubGlobal('window', {
    '__superset__/react': React, '__superset__/react-dom': {},
    '__superset__/@superset-ui/core': {getSequentialSchemeRegistry: () => ({get: (id: string) => id === 'known' ? scheme : undefined})},
  });
  mod = await import('../src/calendarHeatmap');
});
afterEach(() => {if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); vi.resetModules();});

/** Data like Superset's explore_json response: one metric, one value per UTC day, 2025-01-20 .. 2025-04-30. */
function dataFor(domain = 'month', subdomain = 'day') {
  const values: Record<string, number> = {};
  for (let t = Date.UTC(2025, 0, 20); t <= Date.UTC(2025, 3, 30); t += 86400000) values[String(t / 1000)] = Math.round((t - Date.UTC(2025, 0, 19)) / 86400000);
  return {data: {'تعداد': values}, domain, subdomain, range: 4, start: Date.UTC(2025, 0, 20)};
}
const base = (over = {}) => ({data: dataFor(), height: 400, cellSize: 14, cellPadding: 2, cellRadius: 0, steps: 5, linearColorScheme: 'known',
  showLegend: true, showMetricName: true, showValues: false, domainGranularity: 'month', subdomainGranularity: 'day',
  valueFormatter: (v: number) => `#${v}`, verboseMap: {}, ...over});
const render = (Component: (props: never) => unknown, props: object) => {
  act(() => {tree = create(React.createElement(Component as never, props as never));});
  return tree.root;
};
const cells = () => tree.root.findAll(node => node.type === 'g' && node.props['data-date']);
const renderAtWidth = (props: object, width: number) => {
  act(() => {tree = create(React.createElement(mod.JalaliCalendar as never, props as never),
    {createNodeMock: () => ({clientWidth: width, getBoundingClientRect: () => ({left: 0, top: 0, width})})});});
};
const sizeOfCells = () => cells()[0].findByType('rect').props.width;

it('draws one cell per Jalali day, right to left, with Jalali tooltips', () => {
  render(mod.JalaliCalendar as never, base());
  expect(cells()).toHaveLength(30 + 30 + 31 + 31); // Bahman, Esfand (leap), Farvardin, Ordibehesht
  const labels = tree.root.findAllByType('svg').filter(svg => svg.props.role === 'img').map(svg => svg.props['aria-label']);
  expect(labels).toEqual(['بهمن ۱۴۰۳', 'اسفند ۱۴۰۳', 'فروردین ۱۴۰۴', 'اردیبهشت ۱۴۰۴']);
  const text = (iso: string) => cells().find(g => g.props['data-date'] === iso)!.findByType('title').children.join('');
  expect(text('2025-03-20')).toBe('پنج‌شنبه ۱۴۰۳/۱۲/۳۰: #60'); // last day of leap Esfand
  expect(text('2025-03-21')).toBe('جمعه ۱۴۰۴/۰۱/۰۱: #61');
  expect(text('2025-01-20')).toBe('دوشنبه ۱۴۰۳/۱۱/۰۱: #1');
  expect(text('2025-01-21')).not.toContain('January');
  // Columns run right to left: the first week of a month is the rightmost column.
  const rect = (iso: string) => cells().find(g => g.props['data-date'] === iso)!.findByType('rect').props;
  expect(rect('2025-01-20').x).toBeGreaterThan(rect('2025-01-27').x);
  const unit = rect('2025-01-20').width + 2; // cell size + padding
  expect(rect('2025-01-20').y).toBe(2 * unit); // Monday, the third row after Saturday and Sunday
  expect(rect('2025-01-24')).toMatchObject({y: 6 * unit}); // Friday is the last row
});

it('colours by the linear scheme, tells empty days from days outside the range, and honours the legend, metric name and values', () => {
  const props = base({data: {...dataFor(), data: {'تعداد': {'1737331200': 4, '1737417600': 8}}, range: 1}, showValues: true});
  render(mod.JalaliCalendar as never, props);
  const fills = cells().map(g => g.findByType('rect').props.fill);
  expect(fills.filter(fill => fill.startsWith('color(4..8:'))).toEqual(['color(4..8:4)', 'color(4..8:8)']);
  // 1403/11 has 30 days: 2 with data, Jan 22-31 are in the requested range but empty, Feb 1-18 are outside it.
  expect(fills.filter(fill => fill === 'rgba(128,128,128,.16)')).toHaveLength(10);
  expect(fills.filter(fill => fill === 'rgba(128,128,128,.05)')).toHaveLength(18);
  expect(tree.root.findAllByType('text').filter(t => t.props.pointerEvents === 'none').map(t => t.children.join(''))).toEqual(['#4', '#8']);
  expect(JSON.stringify(tree.toJSON())).toContain('معیار: تعداد');
  const legend = tree.root.findByProps({'data-legend': 'true'});
  expect(legend.findAllByType('span')[1].props.style.background).toBe('linear-gradient(to left, ' + [4, 5, 6, 7, 8].map(v => `color(4..8:${v})`).join(', ') + ')');
  expect(legend.findAllByType('span').map(span => span.children.join(''))).toEqual(['کم', '', 'زیاد', '#4 – #8']);
  act(() => tree.unmount());
  render(mod.JalaliCalendar as never, base({showLegend: false, showMetricName: false, linearColorScheme: 'unknown'}));
  expect(JSON.stringify(tree.toJSON())).not.toContain('معیار');
  expect(tree.root.findAllByProps({'data-legend': 'true'})).toHaveLength(0);
  expect(cells()[0].findByType('rect').props.fill).toBe('#ccc');
});

it('grows the cells to the width of the chart, never below the Cell Size and never above 30', () => {
  renderAtWidth(base(), 1400);
  expect(sizeOfCells()).toBe(30);
  act(() => tree.unmount());
  renderAtWidth(base(), 400);
  expect(sizeOfCells()).toBe(14); // narrower than the cells would need: the configured size wins and the months wrap
  act(() => tree.unmount());
  renderAtWidth(base(), 700);
  const middle = sizeOfCells();
  expect(middle).toBeGreaterThan(14); expect(middle).toBeLessThan(30);
  act(() => tree.unmount());
  renderAtWidth(base({cellSize: 40}), 1400);
  expect(sizeOfCells()).toBe(40);
  expect(cells()[0].findByType('rect').props.rx).toBeGreaterThanOrEqual(8); // rounded cells
  act(() => tree.unmount());
  render(mod.JalaliCalendar as never, base({cellSize: 12, cellRadius: 9}));
  expect(cells()[0].findByType('rect').props.rx).toBe(9); // a larger configured radius is kept
});

it('shows weekday letters with Friday in the weekend colour, and rings today (Tehran date)', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2025-03-21T12:00:00Z'));
  try {
    render(mod.JalaliCalendar as never, base());
    const first = tree.root.findAllByType('svg').filter(svg => svg.props.role === 'img')[0];
    const letters = first.findAllByType('text');
    expect(letters.map(t => t.children.join(''))).toEqual(['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']);
    expect(letters.map(t => t.props.fill)).toEqual([...Array(6).fill('currentColor'), '#d6455c']);
    const stroke = (iso: string) => cells().find(g => g.props['data-date'] === iso)!.findByType('rect').props.stroke;
    expect(stroke('2025-03-21')).toBe('currentColor');
    expect(stroke('2025-03-20')).toBe('none');
    expect(cells().filter(g => g.findByType('rect').props.stroke === 'currentColor')).toHaveLength(1);
  } finally {vi.useRealTimers();}
});

it('says so when there is no data in the range, and uses readable text on every colour', () => {
  render(mod.JalaliCalendar as never, base({data: {...dataFor(), data: {'تعداد': {}}}}));
  expect(JSON.stringify(tree.toJSON())).toContain('داده‌ای برای نمایش در این بازه نیست.');
  expect(cells().length).toBeGreaterThan(0);
  act(() => tree.unmount());
  const dark = {createLinearScale: () => () => 'rgb(10, 20, 30)'}, light = {createLinearScale: () => () => 'rgb(250, 250, 200)'};
  for (const [scheme, ink] of [[dark, '#ffffff'], [light, '#1f2933']] as const) {
    vi.stubGlobal('window', {'__superset__/react': React, '__superset__/react-dom': {},
      '__superset__/@superset-ui/core': {getSequentialSchemeRegistry: () => ({get: () => scheme})}});
    vi.resetModules();
    return import('../src/calendarHeatmap').then(({JalaliCalendar}) => {
      act(() => {tree = create(React.createElement(JalaliCalendar as never, base({showValues: true, data: {...dataFor(), data: {'تعداد': {'1737331200': 1, '1737417600': 2}}}}) as never));});
      expect(tree.root.findAllByType('text').filter(t => t.props.pointerEvents === 'none').map(t => t.props.fill)).toEqual([ink, ink]);
    });
  }
});

it('shows a tooltip on hover', () => {
  act(() => {tree = create(React.createElement(mod.JalaliCalendar as never, base() as never),
    {createNodeMock: () => ({getBoundingClientRect: () => ({left: 10, top: 20})})});});
  const rect = cells()[3].findByType('rect');
  act(() => rect.props.onMouseMove({clientX: 50, clientY: 40}));
  const tip = tree.root.findAll(node => node.props.role === 'tooltip')[0];
  expect(tip.findAllByType('div')[1].children.join('')).toBe('پنج‌شنبه ۱۴۰۳/۱۱/۰۴');
  expect(tip.findByType('strong').children.join('')).toBe('#4');
  expect([tip.props.style.left, tip.props.style.top]).toEqual([50 - 10 + 14, 40 - 20 + 14]);
  act(() => rect.props.onMouseLeave());
  expect(tree.root.findAll(node => node.props.role === 'tooltip')).toHaveLength(0);
});

it('draws a Jalali year per block for the year domain', () => {
  const data = {...dataFor('year', 'day'), range: 1, start: Date.UTC(2025, 0, 20)};
  render(mod.JalaliCalendar as never, base({data, domainGranularity: 'year'}));
  const labels = tree.root.findAllByType('svg').filter(svg => svg.props.role === 'img').map(svg => svg.props['aria-label']);
  expect(labels).toEqual(['۱۴۰۳', '۱۴۰۴']);
  expect(cells()).toHaveLength(366 + 365);
});

function original() {
  const Original = (props: {marker?: string}) => <div id="original">{props.marker}</div>;
  return {Original, loader: vi.fn(() => Promise.resolve({default: Original}))};
}
const flush = () => act(async () => {await Promise.resolve(); await Promise.resolve();});

it.each([['week', 'day'], ['day', 'hour'], ['month', 'week']])("hands %s/%s to Superset's own chart with the same props", async (domain, subdomain) => {
  const {Original, loader} = original();
  const Component = mod.makeComponent(loader);
  render(Component as never, {...base({domainGranularity: domain, subdomainGranularity: subdomain}), marker: 'same props'});
  await flush();
  expect(tree.root.findAllByType(Original)).toHaveLength(1);
  expect(tree.root.findByType(Original).props.marker).toBe('same props');
  expect(cells()).toHaveLength(0);
});

it("hands over to Superset's own emotion-styled component, which is a forwardRef object and not a function", async () => {
  const Styled = React.forwardRef<HTMLDivElement, {marker?: string}>((props, ref) => <div id="styled" ref={ref}>{props.marker}</div>);
  expect(typeof Styled).toBe('object');
  render(mod.makeComponent(() => Promise.resolve({default: Styled})) as never, {...base({domainGranularity: 'week'}), marker: 'styled'});
  await flush();
  expect(tree.root.findAllByType(Styled)).toHaveLength(1);
  expect(tree.root.findByType(Styled).props.marker).toBe('styled');
  act(() => tree.unmount());
  render(mod.makeComponent(() => Promise.resolve(Styled)) as never, base({domainGranularity: 'week'})); // a module without default
  await flush();
  expect(tree.root.findAllByType(Styled)).toHaveLength(1);
});

it('also hands over data outside 1350–1550, and when there is nothing to hand over it renders nothing', async () => {
  const {Original, loader} = original();
  const old = {...dataFor(), start: Date.UTC(1960, 0, 1), data: {m: {'-315619200': 1}}};
  render(mod.makeComponent(loader) as never, base({data: old}));
  await flush();
  expect(tree.root.findAllByType(Original)).toHaveLength(1);
  act(() => tree.unmount());
  render(mod.makeComponent(undefined) as never, base({domainGranularity: 'week'}));
  await flush();
  expect(tree.toJSON()).toBeNull();
  expect(loader).toHaveBeenCalledTimes(1);
});

it('does not load the original chart when it can draw', async () => {
  const {loader} = original();
  render(mod.makeComponent(loader) as never, base());
  await flush();
  expect(loader).not.toHaveBeenCalled();
  expect(cells().length).toBeGreaterThan(0);
});

function fakeRegistry(item?: {value: unknown} | {loader: () => unknown}) {
  const calls: string[] = [], items: Record<string, unknown> = item ? {cal_heatmap: item} : {};
  return {calls, items, remove: (key: string) => {calls.push('remove'); delete items[key];},
    registerValue: (key: string, value: unknown) => {calls.push('register'); items[key] = {value};}} as never as
    import('../src/shims').ComponentRegistry & {calls: string[]};
}

it("replaces the registered component under cal_heatmap and keeps Superset's loader as the fallback", async () => {
  const {Original, loader} = original();
  const registry = fakeRegistry({loader});
  mod.registerCalendarHeatmap(registry);
  expect(registry.calls).toEqual(['remove', 'register']);
  const Replacement = (registry.items.cal_heatmap as {value: (props: object) => unknown}).value;
  expect(Replacement).toBeTypeOf('function');
  expect(loader).not.toHaveBeenCalled();
  render(Replacement as never, base({domainGranularity: 'week'}));
  await flush();
  expect(tree.root.findAllByType(Original)).toHaveLength(1);
  act(() => tree.unmount());
  render(Replacement as never, base());
  expect(cells().length).toBeGreaterThan(0);
  // A second call (the bundle evaluated again) must not wrap the replacement in itself.
  mod.registerCalendarHeatmap(registry);
  expect(registry.calls).toEqual(['remove', 'register']);
  expect(registry.items.cal_heatmap).toEqual({value: Replacement});
});

it('registers even when Superset has not, or registered a value instead of a loader', async () => {
  const none = fakeRegistry();
  mod.registerCalendarHeatmap(none);
  expect(none.calls).toEqual(['remove', 'register']);
  const {Original} = original();
  const value = fakeRegistry({value: Original});
  mod.registerCalendarHeatmap(value);
  render((value.items.cal_heatmap as {value: (props: object) => unknown}).value as never, base({domainGranularity: 'day'}));
  await flush();
  expect(tree.root.findAllByType(Original)).toHaveLength(1);
});
