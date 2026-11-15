import { React, core, ComponentRegistry } from './shims';
import { Block, blocksFor, dayOf, perDay, rangeEnd, supported, weekdayOf } from './calendarLayout';
import { fa, format, months, weekdays } from './jalali';

export const KEY = 'cal_heatmap';
const EMPTY = 'rgba(128,128,128,.2)';

interface CalendarData {data: Record<string, Record<string, number>>; domain: string; subdomain: string; range: number; start: number}
/** The props Superset's own cal_heatmap transformProps produces. */
export interface CalendarProps {
  data: CalendarData; height?: number; cellSize?: number; cellPadding?: number; cellRadius?: number;
  domainGranularity?: string; subdomainGranularity?: string; linearColorScheme?: string; steps?: number;
  showLegend?: boolean; showMetricName?: boolean; showValues?: boolean;
  valueFormatter: (value: number) => string; verboseMap?: Record<string, string>;
}
type Loader = (() => unknown) | undefined;

/** The domain to draw, or undefined when Superset's own chart must draw it. */
function plan(props: CalendarProps, values: Record<string, number>) {
  const {data, domainGranularity = data?.domain, subdomainGranularity = data?.subdomain} = props;
  if (!supported(domainGranularity ?? '', subdomainGranularity ?? '') || !Number.isFinite(data.start) || !Number.isFinite(data.range)) return undefined;
  const days = perDay(values), keys = [...days.keys()].sort();
  const start = dayOf(data.start / 1000), end = rangeEnd(data.start, domainGranularity as 'month' | 'year', data.range);
  // Cover the whole requested range, and any day that has data outside it.
  const first = [start, keys[0] ?? start].sort()[0], last = [end, keys[keys.length - 1] ?? end].sort().pop()!;
  const blocks = blocksFor(domainGranularity as 'month' | 'year', first, last);
  return blocks && {days, blocks};
}

function Legend({colors, values, size, format: fmt}: {colors: string[]; values: number[]; size: number; format: (v: number) => string}) {
  return <div style={{display:'flex', gap:2, marginBottom:6}} aria-hidden="true">
    {colors.map((color, index) => <svg key={index} width={size} height={size}><title>{fmt(values[index])}</title><rect width={size} height={size} fill={color}/></svg>)}
  </div>;
}

function Month({block, days, color, size, pad, radius, showValues, fmt, show, hide}: {
  block: Block; days: Map<string, number>; color: (v: number | undefined) => string; size: number; pad: number; radius: number;
  showValues: boolean; fmt: (v: number) => string; show: (event: React.MouseEvent<SVGRectElement>, text: string) => void; hide: () => void;
}) {
  const unit = size + pad, label = block.month ? `${months[block.month - 1]} ${fa(block.year)}` : fa(block.year);
  const width = block.columns * unit;
  return <div style={{display:'inline-block', margin:'0 6px 10px'}}>
    <svg width={width} height={7 * unit + 16} role="img" aria-label={label}>
      {block.cells.map(cell => {
        const value = days.get(cell.iso), text = `${weekdays[weekdayOf(cell.iso)]} ${format(cell.jalali)}${value === undefined ? '' : ': ' + fmt(value)}`;
        // Column 0 is the first week; weeks run right to left.
        const x = (block.columns - 1 - cell.column) * unit, y = cell.row * unit;
        return <g key={cell.iso} data-date={cell.iso}>
          <rect x={x} y={y} width={size} height={size} rx={radius} fill={color(value)} onMouseMove={event => show(event, text)} onMouseLeave={hide}><title>{text}</title></rect>
          {showValues && value !== undefined && <text x={x + size / 2} y={y + size / 2} fontSize={Math.max(6, size * 0.45)} textAnchor="middle" dominantBaseline="central" fill="currentColor" pointerEvents="none">{fmt(value)}</text>}
        </g>;
      })}
      <text x={width / 2} y={7 * unit + 12} fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.7}>{label}</text>
    </svg>
  </div>;
}

export function JalaliCalendar(props: CalendarProps) {
  const {data, height, cellSize = 10, cellPadding = 3, cellRadius = 0, steps = 10, showLegend = true, showMetricName = true,
    showValues = false, linearColorScheme, valueFormatter, verboseMap = {}} = props;
  const [tip, setTip] = React.useState<{x: number; y: number; text: string}>();
  const root = React.useRef<HTMLDivElement>(null);
  const scheme = core.getSequentialSchemeRegistry().get(linearColorScheme ?? '');
  const show = (event: React.MouseEvent<SVGRectElement>, text: string) => {
    const box = root.current?.getBoundingClientRect();
    if (box) setTip({x:event.clientX - box.left, y:event.clientY - box.top, text});
  };
  return <div ref={root} className="superset-jalali-calendar-heatmap" dir="rtl" style={{position:'relative', height, overflow:'auto'}}>
    {Object.keys(data.data).map(metric => {
      const drawn = plan(props, data.data[metric]);
      if (!drawn) return null;
      const values = [...drawn.days.values()];
      const extent: [number, number] = values.length ? [Math.min(...values), Math.max(...values)] : [0, 1];
      const scale = scheme ? scheme.createLinearScale(extent) : () => '#ccc';
      const step = steps > 1 ? (extent[1] - extent[0]) / (steps - 1) : 0;
      const legend = Array.from({length: Math.max(1, steps)}, (_, index) => extent[0] + step * index);
      const color = (value: number | undefined) => value === undefined ? EMPTY : scale(value);
      return <div key={metric} style={{marginBottom:8}}>
        {showMetricName && <div>{`معیار: ${verboseMap[metric] || metric}`}</div>}
        {showLegend && <Legend colors={legend.map(value => scale(value))} values={legend} size={cellSize} format={valueFormatter}/>}
        <div style={{display:'flex', flexWrap:'wrap'}}>
          {drawn.blocks.map(block => <Month key={`${block.year}-${block.month}`} block={block} days={drawn.days} color={color} size={cellSize} pad={cellPadding}
            radius={cellRadius} showValues={showValues} fmt={valueFormatter} show={show} hide={() => setTip(undefined)}/>)}
        </div>
      </div>;
    })}
    {tip && <div role="tooltip" style={{position:'absolute', left:tip.x + 12, top:tip.y + 12, background:'#253746', color:'#fff', padding:'6px 8px', borderRadius:4, fontSize:12, pointerEvents:'none', whiteSpace:'nowrap', zIndex:10}}>{tip.text}</div>}
  </div>;
}

/** Draws Jalali months when it can, and otherwise hands the same props to Superset's original component. */
export function makeComponent(loadOriginal: Loader) {
  function Fallback(props: CalendarProps) {
    // Superset's component is an emotion-styled forwardRef (an object, not a function), so keep it in a box.
    const [original, setOriginal] = React.useState<{component: unknown}>();
    React.useEffect(() => {
      let live = true;
      Promise.resolve(loadOriginal?.()).then(loaded => {
        const component = (loaded && (loaded as {default?: unknown}).default) || loaded;
        if (live && component) setOriginal({component});
      }).catch(() => undefined);
      return () => {live = false;};
    }, []);
    return original ? React.createElement(original.component as never, props as never) : null;
  }
  function CalendarHeatmap(props: CalendarProps) {
    const domain = props.domainGranularity ?? props.data?.domain, subdomain = props.subdomainGranularity ?? props.data?.subdomain;
    const metrics = Object.values(props.data?.data ?? {});
    // Anything outside month/year × day, or outside the supported years, is Superset's own drawing.
    const drawable = supported(domain ?? '', subdomain ?? '') && metrics.every(values => plan(props, values));
    return drawable ? <JalaliCalendar {...props}/> : <Fallback {...props}/>;
  }
  (CalendarHeatmap as unknown as {supersetJalali: boolean}).supersetJalali = true;
  return CalendarHeatmap;
}

/** Replace the drawing code registered for cal_heatmap; safe to call twice and when Superset has not registered it. */
export function registerCalendarHeatmap(registry: ComponentRegistry): void {
  const item = registry.items?.[KEY];
  if (item && 'value' in item && (item.value as {supersetJalali?: boolean})?.supersetJalali) return;
  const loadOriginal: Loader = item && 'loader' in item ? item.loader : item && 'value' in item ? () => item.value : undefined;
  registry.remove(KEY); // Drops the cached promise of the original, and avoids the overwrite warning.
  registry.registerValue(KEY, makeComponent(loadOriginal));
}
