import { fa, format, g2j, Jalali, months, weekdays } from './jalali';

/** The parts of @superset-ui/core this module uses (Superset 6.1.0 TimeFormatter and TimeFormatterRegistry). */
export type TimeValue = Date | number | null | undefined;
export interface Formatter { (value: TimeValue): string }
export interface TimeFormatterClass {
  new (config: {id: string; label?: string; description?: string; formatFunc: (value: Date) => string}): Formatter;
}
export interface TimeFormatterRegistry {
  get(id?: string): Formatter;
  has(id: string): boolean;
  remove(id: string): unknown;
  registerValue(id: string, value: Formatter): unknown;
}

export const JALALI_IDS = ['jalali_date', 'jalali_datetime', 'jalali_month', 'jalali_year', 'jalali_smart'] as const;
export const SMART_IDS = ['smart_date', 'smart_date_detailed', 'smart_date_verbose'] as const;
type Id = typeof JALALI_IDS[number] | typeof SMART_IDS[number];

interface Parts { date: Jalali; hour: number; minute: number; second: number; ms: number; weekday: string }
/** Wall-clock parts in UTC, as Superset's default (non-local!) formatters read naive timestamps. */
export function parts(value: Date): Parts | undefined {
  const time = value.getTime();
  if (!Number.isFinite(time)) return undefined;
  try {
    return {date:g2j(value.toISOString().slice(0, 10)), hour:value.getUTCHours(), minute:value.getUTCMinutes(),
      second:value.getUTCSeconds(), ms:value.getUTCMilliseconds(), weekday:weekdays[(value.getUTCDay() + 1) % 7]};
  } catch {
    return undefined; // Outside the 1350–1550 table.
  }
}
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (p: Parts, seconds = p.second !== 0 || p.ms !== 0) =>
  fa(`${pad(p.hour)}:${pad(p.minute)}` + (seconds ? `:${pad(p.second)}` : ''));
const midnight = (p: Parts) => !p.hour && !p.minute && !p.second && !p.ms;
const monthYear = ([y, m]: Jalali) => `${months[m - 1]} ${fa(y)}`;
const dayMonth = (p: Parts) => `${p.weekday} ${fa(p.date[2])} ${months[p.date[1] - 1]}`;

/** Jalali text for each id, or undefined to fall back to Superset's output. */
const FORMATS: Record<Id, (p: Parts) => string> = {
  jalali_date: p => format(p.date),
  jalali_datetime: p => `${format(p.date)} ${clock(p, false)}`,
  jalali_month: p => monthYear(p.date),
  jalali_year: p => fa(p.date[0]),
  // Like smart_date: the time when not midnight, else the year on Nowruz, the month on its 1st, else the date.
  jalali_smart: p => !midnight(p) ? clock(p) : p.date[2] !== 1 ? format(p.date) : p.date[1] === 1 ? fa(p.date[0]) : monthYear(p.date),
  smart_date: p => FORMATS.jalali_smart(p),
  smart_date_detailed: p => !midnight(p) ? `${format(p.date)} ${clock(p)}` : p.date[1] === 1 && p.date[2] === 1 ? fa(p.date[0]) : format(p.date),
  smart_date_verbose: p => !midnight(p) ? `${dayMonth(p)}، ${clock(p)}` : p.date[2] !== 1 ? dayMonth(p)
    : p.date[1] === 1 ? fa(p.date[0]) : monthYear(p.date),
};
const FALLBACK: Record<typeof JALALI_IDS[number], string> = {
  jalali_date: '%Y-%m-%d', jalali_datetime: '%Y-%m-%d %H:%M', jalali_month: '%Y-%m', jalali_year: '%Y', jalali_smart: 'smart_date',
};
const LABELS: Record<Id, string> = {
  jalali_date: 'Jalali date (۱۴۰۳/۰۷/۱۴)', jalali_datetime: 'Jalali date and time (۱۴۰۳/۰۷/۱۴ ۱۴:۳۰)',
  jalali_month: 'Jalali month (مهر ۱۴۰۳)', jalali_year: 'Jalali year (۱۴۰۳)', jalali_smart: 'Jalali adaptive',
  smart_date: 'Jalali adaptive', smart_date_detailed: 'Jalali detailed adaptive', smart_date_verbose: 'Jalali verbose adaptive',
};

const originals = new WeakMap<TimeFormatterRegistry, Partial<Record<string, Formatter>>>();

/**
 * Register the Jalali formatters; with smart, also replace Superset's three smart formatters.
 * Always overwrites, so a d3 formatter cached for an unknown "jalali_*" id before this bundle loaded is replaced.
 */
export function registerTimeFormats(registry: TimeFormatterRegistry, TimeFormatter: TimeFormatterClass, smart: boolean): void {
  // Superset's own formatters, captured once before any replacement, for values outside the table.
  const original = originals.get(registry) ?? {};
  originals.set(registry, original);
  const fallback = (id: string) => original[id] ?? (original[id] = registry.get(id));
  for (const id of SMART_IDS) fallback(id);
  const ids: Id[] = [...JALALI_IDS, ...(smart ? SMART_IDS : [])];
  for (const id of ids) {
    const backup = id in FALLBACK ? FALLBACK[id as keyof typeof FALLBACK] : id;
    const formatter = new TimeFormatter({id, label:LABELS[id], formatFunc:(value: Date) => {
      const p = parts(value);
      try {
        if (p) return FORMATS[id](p);
      } catch { /* Never break a chart; use Superset's output. */ }
      return fallback(backup)(value);
    }});
    registry.remove(id); // Avoid the overwrite warning; registerValue then adds it.
    registry.registerValue(id, formatter);
  }
}

/** True when the bundle URL carries ?name=1: flags that JALALI[...] settings pass to the browser (blueprint.py). */
export const flagFromUrl = (url: string, name: string) => {
  try {return new URL(url).searchParams.get(name) === '1';} catch {return false;}
};
/** The value of ?name=... on the bundle URL, or null. */
export const flagValue = (url: string, name: string) => {
  try {return new URL(url).searchParams.get(name);} catch {return null;}
};
/** JALALI['jalali_calendar_heatmap'] is on unless the server passes ?cal_heatmap=0. */
export const calendarHeatmapFromUrl = (url: string) => flagValue(url, 'cal_heatmap') !== '0';
/** JALALI['jalali_smart_date'] */
export const smartDateFromUrl = (url: string) => flagFromUrl(url, 'smart_date');
