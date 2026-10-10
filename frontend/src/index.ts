import { core } from './shims';
import { DateFilter } from './DateFilter';
declare const __VERSION__: string;
const reg = core.getExtensionsRegistry();
if (!reg.get('filter.dateFilterControl')) reg.set('filter.dateFilterControl', DateFilter);
(window as unknown as Record<string, unknown>).__SUPERSET_JALALI__ = {version: __VERSION__};
