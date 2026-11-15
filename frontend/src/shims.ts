import type * as ReactTypes from 'react';
import type * as ReactDOMTypes from 'react-dom';
import type { TimeFormatterClass, TimeFormatterRegistry } from './timeFormats';

export interface DateFilterControlProps {
  value?: string;
  name: string;
  onChange: (value: string) => void;
  onOpenPopover?: () => void;
  onClosePopover?: () => void;
  isOverflowingFilterBar?: boolean;
  overlayStyle?: 'Modal' | 'Popover';
}
interface Registry { get: (key: string) => unknown; set: (key: string, value: unknown) => unknown }
function shared<T>(name: string): T {
  const module = (window as unknown as Record<string, any>)[`__superset__/${name}`];
  if (!module) throw new Error(`superset-jalali: host module ${name} missing; enable DYNAMIC_PLUGINS and register the blueprint`);
  return module.default ?? module;
}
export const React = shared<typeof ReactTypes>('react');
export const ReactDOM = shared<typeof ReactDOMTypes>('react-dom');
export interface SequentialScheme { createLinearScale: (extent: [number, number]) => (value: number) => string }
/** Superset's Registry: items hold either a value or a loader. */
export interface ComponentRegistry {
  items: Record<string, {value: unknown} | {loader: () => unknown} | undefined>;
  remove: (key: string) => unknown;
  registerValue: (key: string, value: unknown) => unknown;
}
export interface Core {
  getExtensionsRegistry: () => Registry;
  getTimeFormatterRegistry: () => TimeFormatterRegistry;
  TimeFormatter: TimeFormatterClass;
  getChartComponentRegistry: () => ComponentRegistry;
  getSequentialSchemeRegistry: () => {get: (id: string) => SequentialScheme | undefined};
}
export const core = shared<Core>('@superset-ui/core');
