import { NOWRUZ } from './nowruz';
export type Jalali = [number, number, number];
const DAY = 86400000;
const years = Object.keys(NOWRUZ).map(Number);
const starts = years.map(y => Date.parse(NOWRUZ[y] + 'T00:00:00Z'));
export const months = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
export const weekdays = ['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];
export const fa = (value: string | number) => String(value).replace(/[0-9]/g, c => '۰۱۲۳۴۵۶۷۸۹'[Number(c)]);
export const latin = (value: string) => value.replace(/[۰-۹٠-٩]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 1776 : 1632)));
export function epoch(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('تاریخ نامعتبر');
  const n = Date.parse(iso + 'T00:00:00Z');
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== iso) throw new Error('تاریخ نامعتبر');
  return n;
}
export const addDays = (iso: string, n: number) => new Date(epoch(iso) + n * DAY).toISOString().slice(0,10);
export function g2j(iso: string): Jalali {
  const n = epoch(iso);
  if (n < starts[0] || n >= starts[starts.length - 1]) throw new Error('تاریخ خارج از محدوده است');
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (starts[mid] <= n) lo = mid; else hi = mid - 1;
  }
  const doy = (n - starts[lo]) / DAY;
  return doy < 186 ? [years[lo], Math.floor(doy / 31) + 1, doy % 31 + 1] : [years[lo], Math.floor((doy - 186) / 30) + 7, (doy - 186) % 30 + 1];
}
export function monthLength(y: number, m: number): number {
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < 1350 || y > 1550 || m < 1 || m > 12) throw new Error('سال یا ماه نامعتبر');
  return m <= 6 ? 31 : m < 12 ? 30 : (epoch(NOWRUZ[y + 1]) - epoch(NOWRUZ[y])) / DAY - 336;
}
export function j2g(y: number, m: number, d: number): string {
  if (!Number.isInteger(d) || d < 1 || d > monthLength(y, m)) throw new Error('روز نامعتبر');
  return addDays(NOWRUZ[y], (m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + d - 1);
}
export function parseJalali(value: string): Jalali {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(latin(value.trim()));
  if (!match) throw new Error('تاریخ را به شکل ۱۴۰۳/۰۷/۰۱ وارد کنید');
  const result = match.slice(1).map(Number) as Jalali;
  j2g(...result);
  return result;
}
export const format = (date: Jalali) => fa(date.map((v, i) => String(v).padStart(i === 0 ? 4 : 2, '0')).join('/'));

export const NOWRUZ_SENTINEL = NOWRUZ[1551];
