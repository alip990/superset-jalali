import { core } from './shims';
import { DateFilter } from './DateFilter';
import { registerTimeFormats, smartDateFromUrl } from './timeFormats';
declare const __VERSION__: string;
const reg = core.getExtensionsRegistry();
if (!reg.get('filter.dateFilterControl')) reg.set('filter.dateFilterControl', DateFilter);
try {
  // ?smart_date=1 on the bundle URL is JALALI['jalali_smart_date'] (blueprint.py).
  registerTimeFormats(core.getTimeFormatterRegistry(), core.TimeFormatter, smartDateFromUrl(import.meta.url));
} catch (error) {
  console.error('superset-jalali: Jalali time formats not registered', error);
}
(window as unknown as Record<string, unknown>).__SUPERSET_JALALI__ = {version: __VERSION__};
