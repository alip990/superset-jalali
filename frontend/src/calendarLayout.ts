import { addDays, epoch, g2j, j2g, Jalali, monthLength, NOWRUZ_SENTINEL } from './jalali';

const DAY = 86400000;
export type Domain = 'month' | 'year';
export interface Cell { iso: string; jalali: Jalali; column: number; row: number }
/** One calendar block: a Jalali month or year; columns are weeks starting on Saturday, rows run Saturday to Friday. */
export interface Block { year: number; month: number; columns: number; cells: Cell[] }

/** The only domain/subdomain pair drawn here; everything else is left to Superset's own chart. */
export const supported = (domain: string, subdomain: string): domain is Domain =>
  (domain === 'month' || domain === 'year') && subdomain === 'day';

/** UTC date (YYYY-MM-DD) of an epoch-seconds key, the way Superset's backend sends calendar data. */
export const dayOf = (seconds: number | string) => new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
/** 0 = Saturday … 6 = Friday. */
export const weekdayOf = (iso: string) => (new Date(epoch(iso)).getUTCDay() + 1) % 7;

/** Sum the values of each day; keys that are not valid timestamps are ignored. */
export function perDay(values: Record<string, number>): Map<string, number> {
  const days = new Map<string, number>();
  for (const [key, value] of Object.entries(values)) {
    const seconds = Number(key);
    if (!Number.isFinite(seconds) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const iso = dayOf(seconds);
    days.set(iso, (days.get(iso) ?? 0) + value);
  }
  return days;
}

/** Last day of the Gregorian range that `range` domains starting at `startMs` cover (Superset counts the start's own month or year). */
export function rangeEnd(startMs: number, domain: Domain, range: number): string {
  const start = new Date(startMs);
  const end = domain === 'month' ? Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + range, 0)
    : Date.UTC(start.getUTCFullYear() + range, 0, 0);
  return new Date(end).toISOString().slice(0, 10);
}

function block(domain: Domain, year: number, month: number): Block {
  const first = j2g(year, domain === 'year' ? 1 : month, 1);
  const length = domain === 'month' ? monthLength(year, month)
    : (epoch(year === 1550 ? NOWRUZ_SENTINEL : j2g(year + 1, 1, 1)) - epoch(first)) / DAY;
  const offset = weekdayOf(first);
  const cells = Array.from({length}, (_, index): Cell => {
    const iso = addDays(first, index), position = offset + index;
    return {iso, jalali: domain === 'month' ? [year, month, index + 1] : g2j(iso), column: Math.floor(position / 7), row: position % 7};
  });
  return {year, month: domain === 'month' ? month : 0, columns: Math.floor((offset + length - 1) / 7) + 1, cells};
}

/**
 * The Jalali blocks that cover firstIso..lastIso. Returns undefined outside the supported years
 * (1350–1550) or for an empty or reversed range, so the caller can use Superset's own chart.
 */
export function blocksFor(domain: Domain, firstIso: string, lastIso: string): Block[] | undefined {
  try {
    if (firstIso > lastIso) return undefined;
    const [firstYear, firstMonth] = g2j(firstIso), [lastYear, lastMonth] = g2j(lastIso);
    const result: Block[] = [];
    if (domain === 'year') {
      for (let year = firstYear; year <= lastYear; year++) result.push(block('year', year, 1));
    } else {
      for (let index = firstYear * 12 + firstMonth - 1; index <= lastYear * 12 + lastMonth - 1; index++) {
        result.push(block('month', Math.floor(index / 12), index % 12 + 1));
      }
    }
    return result.length > 60 ? undefined : result;
  } catch {
    return undefined;
  }
}
