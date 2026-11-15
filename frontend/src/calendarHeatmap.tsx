import { React, core, ComponentRegistry } from './shims';
import { Block, blocksFor, dayOf, perDay, rangeEnd, supported, weekdayOf } from './calendarLayout';
import { fa, format, months, weekdays } from './jalali';
import { luminance } from './theme';
import { tehranToday } from './timeRange';

export const KEY = 'cal_heatmap';
// Neutral greys that work on light and dark themes.
const IN_RANGE_EMPTY = 'rgba(128,128,128,.16)', OUT_OF_RANGE = 'rgba(128,128,128,.05)', CARD_BORDER = 'rgba(128,128,128,.28)';
const WEEKEND = '#d6455c', WEEKDAY_INITIALS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const MAX_CELL = 30, CARD_PADDING = 10, LABEL_COLUMN = 16, CARD_GAP = 12;

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
  return blocks && {days, blocks, start: first, end: last};
}

/** Black or white text, whichever reads better on the cell colour. */
const inkOn = (fill: string) => ((luminance(fill) ?? 0.5) > 0.45 ? '#1f2933' : '#ffffff');

function Legend({scale, extent, steps, format: fmt}: {scale: (value: number) => string; extent: [number, number]; steps: number; format: (v: number) => string}) {
  const count = Math.max(2, steps), stops = Array.from({length: count}, (_, index) => scale(extent[0] + (extent[1] - extent[0]) * index / (count - 1)));
  // In a right-to-left page the gradient starts on the right: low values on the right, as the reading order goes.
  return <div data-legend="true" style={{display:'flex', alignItems:'center', gap:6, fontSize:11, opacity:0.85}}>
    <span>کم</span>
    <span style={{display:'inline-block', width:110, height:8, borderRadius:4, background:`linear-gradient(to left, ${stops.join(', ')})`}} role="img" aria-label={`${fmt(extent[0])} تا ${fmt(extent[1])}`}/>
    <span>زیاد</span>
    <span style={{opacity:0.7}} dir="ltr">{fmt(extent[0])} – {fmt(extent[1])}</span>
  </div>;
}

interface TooltipState {x: number; y: number; weekday: string; date: string; value?: string; color: string}

function Month({block, days, start, end, today, color, size, pad, radius, showValues, fmt, show, hide}: {
  block: Block; days: Map<string, number>; start: string; end: string; today: string; color: (v: number | undefined) => string;
  size: number; pad: number; radius: number; showValues: boolean; fmt: (v: number) => string;
  show: (event: React.MouseEvent<SVGRectElement>, state: Omit<TooltipState, 'x' | 'y'>) => void; hide: () => void;
}) {
  const unit = size + pad, title = block.month ? months[block.month - 1] : '', year = fa(block.year);
  const label = block.month ? `${title} ${year}` : year;
  const gridWidth = block.columns * unit, labelWidth = size >= 12 ? LABEL_COLUMN : 0;
  return <div style={{border:`1px solid ${CARD_BORDER}`, borderRadius:10, padding:`8px ${CARD_PADDING}px 6px`, margin:`0 ${CARD_GAP / 2}px ${CARD_GAP}px`}}>
    <div style={{fontSize:13, lineHeight:'18px', marginBottom:6, display:'flex', gap:5, alignItems:'baseline'}}>
      <strong>{title || year}</strong>{title && <span style={{opacity:0.6, fontSize:12}}>{year}</span>}
    </div>
    <svg width={labelWidth + gridWidth} height={7 * unit - pad} role="img" aria-label={label} style={{display:'block'}}>
      {labelWidth > 0 && WEEKDAY_INITIALS.map((initial, row) =>
        // Centred in its own column: text-anchor "end" flips in a right-to-left page and runs out of the svg.
        <text key={row} x={gridWidth + labelWidth / 2} y={row * unit + size / 2} fontSize={Math.min(12, size * 0.6)} textAnchor="middle" dominantBaseline="central"
          fill={row === 6 ? WEEKEND : 'currentColor'} opacity={row === 6 ? 0.95 : 0.6}>{initial}</text>)}
      {block.cells.map(cell => {
        const value = days.get(cell.iso), inRange = cell.iso >= start && cell.iso <= end, weekday = weekdays[weekdayOf(cell.iso)];
        const jalaliDate = format(cell.jalali), text = `${weekday} ${jalaliDate}${value === undefined ? '' : ': ' + fmt(value)}`;
        const fill = value !== undefined ? color(value) : inRange ? IN_RANGE_EMPTY : OUT_OF_RANGE;
        // Column 0 is the first week; weeks run right to left, after the weekday letters.
        const x = (block.columns - 1 - cell.column) * unit, y = cell.row * unit;
        return <g key={cell.iso} data-date={cell.iso}>
          <rect x={x} y={y} width={size} height={size} rx={radius} fill={fill} stroke={cell.iso === today ? 'currentColor' : 'none'} strokeWidth={cell.iso === today ? 2 : 0}
            onMouseMove={event => show(event, {weekday, date: jalaliDate, value: value === undefined ? undefined : fmt(value), color: fill})} onMouseLeave={hide}><title>{text}</title></rect>
          {showValues && value !== undefined && <text x={x + size / 2} y={y + size / 2} fontSize={Math.max(6, size * 0.4)} textAnchor="middle" dominantBaseline="central"
            fill={inkOn(fill)} pointerEvents="none">{fmt(value)}</text>}
        </g>;
      })}
    </svg>
  </div>;
}

export function JalaliCalendar(props: CalendarProps) {
  const {data, height, cellSize = 10, cellPadding = 3, cellRadius = 0, steps = 10, showLegend = true, showMetricName = true,
    showValues = false, linearColorScheme, valueFormatter, verboseMap = {}} = props;
  const [tip, setTip] = React.useState<TooltipState>();
  const [width, setWidth] = React.useState(960);
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const measure = () => {
      const measured = element.clientWidth || element.getBoundingClientRect?.().width;
      if (measured) setWidth(measured);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);
  const scheme = core.getSequentialSchemeRegistry().get(linearColorScheme ?? '');
  const today = tehranToday();
  const show = (event: React.MouseEvent<SVGRectElement>, state: Omit<TooltipState, 'x' | 'y'>) => {
    const box = root.current?.getBoundingClientRect();
    if (box) setTip({...state, x:event.clientX - box.left, y:event.clientY - box.top});
  };
  const drawn = Object.keys(data.data).flatMap((metric): {metric: string; plan: NonNullable<ReturnType<typeof plan>>}[] => {
    const found = plan(props, data.data[metric]);
    return found ? [{metric, plan: found}] : [];
  });
  const empty = drawn.every(item => item.plan.days.size === 0);
  return <div ref={root} className="superset-jalali-calendar-heatmap" dir="rtl" style={{position:'relative', height, overflow:'auto', padding:'4px 2px'}}>
    {drawn.map(({metric, plan: {days, blocks, start, end}}) => {
      const values = [...days.values()];
      const extent: [number, number] = values.length ? [Math.min(...values), Math.max(...values)] : [0, 1];
      const scale = scheme ? scheme.createLinearScale(extent) : () => '#ccc';
      const color = (value: number | undefined) => value === undefined ? IN_RANGE_EMPTY : scale(value);
      // Grow the cells to fill the width when the months fit on one row; never below the chart's Cell Size.
      const columns = blocks.reduce((sum, block) => sum + block.columns, 0);
      const fit = Math.floor((width - 8 - blocks.length * (2 * CARD_PADDING + LABEL_COLUMN + CARD_GAP + 2)) / columns) - cellPadding;
      const size = Math.max(cellSize, Math.min(MAX_CELL, fit)), radius = Math.max(cellRadius, Math.round(size * 0.22));
      return <div key={metric} style={{marginBottom:8}}>
        {(showMetricName || showLegend) && <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, margin:'0 6px 10px'}}>
          {showMetricName ? <div style={{fontSize:13}}>{`معیار: ${verboseMap[metric] || metric}`}</div> : <span/>}
          {showLegend && <Legend scale={scale} extent={extent} steps={steps} format={valueFormatter}/>}
        </div>}
        <div style={{display:'flex', flexWrap:'wrap'}}>
          {blocks.map(block => <Month key={`${block.year}-${block.month}`} block={block} days={days} start={start} end={end} today={today} color={color}
            size={size} pad={cellPadding} radius={radius} showValues={showValues} fmt={valueFormatter} show={show} hide={() => setTip(undefined)}/>)}
        </div>
      </div>;
    })}
    {empty && <div style={{textAlign:'center', opacity:0.6, padding:'8px 0'}}>داده‌ای برای نمایش در این بازه نیست.</div>}
    {tip && <div role="tooltip" style={{position:'absolute', left:Math.max(4, Math.min(tip.x + 14, width - 190)), top:tip.y + 14, background:'#1f2933', color:'#fff', padding:'7px 10px',
      borderRadius:8, fontSize:12, lineHeight:'18px', pointerEvents:'none', whiteSpace:'nowrap', zIndex:10, boxShadow:'0 4px 14px rgba(0,0,0,.28)'}}>
      <div style={{opacity:0.8}}>{`${tip.weekday} ${tip.date}`}</div>
      {tip.value !== undefined && <div style={{display:'flex', alignItems:'center', gap:6}}>
        <span style={{display:'inline-block', width:9, height:9, borderRadius:3, background:tip.color}}/><strong>{tip.value}</strong></div>}
    </div>}
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
