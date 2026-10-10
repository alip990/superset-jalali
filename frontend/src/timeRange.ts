import { addDays, format, g2j, j2g, Jalali, NOWRUZ_SENTINEL } from './jalali';
export interface Preset { id: string; label: string; value: string }
export type Parsed = {kind:'none'} | {kind:'preset'; preset:Preset} | {kind:'range'; start:Jalali; end:Jalali} | {kind:'raw'; value:string};
const tomorrow = 'DATEADD(DATETIME("today"), 1, day)';
const absolute = (a: string, b: string) => `${a}T00:00:00 : ${b}T00:00:00`;
export function tehranToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tehran', calendar:'gregory', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const field = (type: string) => parts.find(p => p.type === type)!.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
export function presets(now = new Date()): Preset[] {
  const [y, m] = g2j(tehranToday(now));
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const boundary = (year: number) => year === 1551 ? NOWRUZ_SENTINEL : j2g(year, 1, 1);
  return [
    {id:'today', label:'امروز', value:`today : ${tomorrow}`},
    {id:'yesterday', label:'دیروز', value:'DATEADD(DATETIME("today"), -1, day) : today'},
    ...[7,30,90].map(n => ({id:String(n), label:formatNumber(n)+' روز اخیر', value:`DATEADD(DATETIME("today"), ${1-n}, day) : ${tomorrow}`})),
    {id:'month', label:'این ماه', value:absolute(j2g(y,m,1), m === 12 ? boundary(y+1) : j2g(y,m+1,1))},
    {id:'previous-month', label:'ماه گذشته', value:absolute(j2g(prevY,prevM,1), j2g(y,m,1))},
    {id:'year', label:'امسال', value:absolute(boundary(y), boundary(y+1))},
    {id:'previous-year', label:'سال گذشته', value:absolute(boundary(y-1), boundary(y))},
  ];
}
const formatNumber = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
export function emit(start: Jalali, end: Jalali): string {
  const a = j2g(...start), b = j2g(...end);
  if (a > b) throw new Error('تاریخ پایان باید پس از تاریخ آغاز باشد');
  return absolute(a, addDays(b, 1));
}
export function parse(value?: string, options = presets()): Parsed {
  if (!value || value === 'No filter') return {kind:'none'};
  const preset = options.find(p => p.value === value);
  if (preset) return {kind:'preset', preset};
  const match = /^(\d{4}-\d{2}-\d{2})T00:00:00 : (\d{4}-\d{2}-\d{2})T00:00:00$/.exec(value);
  if (match) {
    try {
      const start = g2j(match[1]), end = g2j(addDays(match[2], -1));
      if (j2g(...start) <= j2g(...end)) return {kind:'range', start, end};
    } catch { /* Unrepresentable expressions stay editable as raw text. */ }
  }
  return {kind:'raw', value};
}
export function label(value?: string, options = presets()): string {
  const parsed = parse(value, options);
  switch (parsed.kind) {
    case 'none': return 'بدون فیلتر';
    case 'preset': return parsed.preset.label;
    case 'range': return `${format(parsed.start)} تا ${format(parsed.end)}`;
    case 'raw': return parsed.value;
  }
}
