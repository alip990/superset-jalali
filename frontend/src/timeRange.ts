import { addDays, epoch, fa, format, g2j, j2g, Jalali, latin, NOWRUZ_SENTINEL } from './jalali';
export interface Preset { id: string; label: string; value: string }
/** A range without times covers whole days, end inclusive; with times (HH:MM) the end is exclusive. */
export type Range = {kind:'range'; start:Jalali; end:Jalali; startTime?:string; endTime?:string};
export type Parsed = {kind:'none'} | {kind:'preset'; preset:Preset} | Range | {kind:'raw'; value:string};
const tomorrow = 'DATEADD(DATETIME("today"), 1, day)';
const absolute = (a: string, b: string, ta = '00:00', tb = '00:00') => `${a}T${ta}:00 : ${b}T${tb}:00`;
/** A 24-hour HH:MM time with Persian, Arabic or Latin digits, returned with Latin digits. */
export function parseTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(latin(value.trim()));
  if (!match) throw new Error('ساعت را به شکل ۲۴ ساعته مانند ۰۸:۰۰ وارد کنید');
  return `${match[1]}:${match[2]}`;
}
export function tehranToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tehran', calendar:'gregory', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const field = (type: string) => parts.find(p => p.type === type)!.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
export function presets(now = new Date()): Preset[] {
  const today = tehranToday(now), [y, m] = g2j(today);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const boundary = (year: number) => year === 1551 ? NOWRUZ_SENTINEL : j2g(year, 1, 1);
  const weekStart = addDays(today, -((new Date(epoch(today)).getUTCDay() + 1) % 7));
  const seasonM = Math.floor((m - 1) / 3) * 3 + 1;
  const seasonStart = j2g(y, seasonM, 1);
  return [
    {id:'today', label:'امروز', value:`today : ${tomorrow}`},
    {id:'yesterday', label:'دیروز', value:'DATEADD(DATETIME("today"), -1, day) : today'},
    ...[7,30,90].map(n => ({id:String(n), label:formatNumber(n)+' روز اخیر', value:`DATEADD(DATETIME("today"), ${1-n}, day) : ${tomorrow}`})),
    // For date-and-time columns; "now" follows Superset's server timezone.
    ...[1,24].map(n => ({id:n+'h', label:formatNumber(n)+' ساعت اخیر', value:`DATEADD(DATETIME("now"), -${n}, hour) : now`})),
    {id:'week', label:'این هفته', value:absolute(weekStart, addDays(weekStart,7))},
    {id:'month', label:'این ماه', value:absolute(j2g(y,m,1), m === 12 ? boundary(y+1) : j2g(y,m+1,1))},
    {id:'previous-month', label:'ماه گذشته', value:absolute(j2g(prevY,prevM,1), j2g(y,m,1))},
    {id:'season', label:'این فصل', value:absolute(seasonStart, seasonM === 10 ? boundary(y+1) : j2g(y,seasonM+3,1))},
    {id:'previous-season', label:'فصل گذشته', value:absolute(seasonM === 1 ? j2g(y-1,10,1) : j2g(y,seasonM-3,1), seasonStart)},
    {id:'year', label:'امسال', value:absolute(boundary(y), boundary(y+1))},
    {id:'previous-year', label:'سال گذشته', value:absolute(boundary(y-1), boundary(y))},
  ];
}
const formatNumber = (n: number) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
/** Whole days with the end day included, or, with times, start included and end excluded as Superset applies ranges. */
export function emit(start: Jalali, end: Jalali, startTime?: string, endTime?: string): string {
  const a = j2g(...start), b = j2g(...end);
  if (startTime === undefined && endTime === undefined) {
    if (a > b) throw new Error('تاریخ پایان باید پس از تاریخ آغاز باشد');
    return absolute(a, addDays(b, 1));
  }
  const ta = parseTime(startTime ?? ''), tb = parseTime(endTime ?? '');
  if (`${a}T${ta}` >= `${b}T${tb}`) throw new Error('زمان پایان باید پس از زمان آغاز باشد');
  return absolute(a, b, ta, tb);
}
export function parse(value?: string, options = presets()): Parsed {
  if (!value || value === 'No filter') return {kind:'none'};
  const preset = options.find(p => p.value === value);
  if (preset) return {kind:'preset', preset};
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):00 : (\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):00$/.exec(value);
  if (match) {
    const [, a, ta, b, tb] = match;
    try {
      // Midnight on both sides is a whole-day range, so saved dashboards keep their meaning.
      if (ta === '00:00' && tb === '00:00') {
        const start = g2j(a), end = g2j(addDays(b, -1));
        if (j2g(...start) <= j2g(...end)) return {kind:'range', start, end};
      } else {
        const start = g2j(a), end = g2j(b);
        emit(start, end, ta, tb);
        return {kind:'range', start, end, startTime:ta, endTime:tb};
      }
    } catch { /* Unrepresentable expressions stay editable as raw text. */ }
  }
  return {kind:'raw', value};
}
export function label(value?: string, options = presets()): string {
  const parsed = parse(value, options);
  switch (parsed.kind) {
    case 'none': return 'بدون فیلتر';
    case 'preset': return parsed.preset.label;
    case 'range': return parsed.startTime === undefined ? `${format(parsed.start)} تا ${format(parsed.end)}`
      : `${format(parsed.start)} ساعت ${fa(parsed.startTime)} تا ${format(parsed.end)} ساعت ${fa(parsed.endTime!)}`;
    case 'raw': return parsed.value;
  }
}
