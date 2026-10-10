import type * as ReactTypes from 'react';
import type * as ReactDOMTypes from 'react-dom';

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
export const core = shared<{getExtensionsRegistry: () => Registry}>('@superset-ui/core');
