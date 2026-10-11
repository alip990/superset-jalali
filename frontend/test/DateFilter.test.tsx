import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parse, presets } from '../src/timeRange';
import { format } from '../src/jalali';

let tree: ReactTestRenderer;
let height: number;
let resize: (() => void) | undefined;
let DateFilter: typeof import('../src/DateFilter').DateFilter;
let Calendar: typeof import('../src/Calendar').Calendar;
beforeEach(async () => {
  height = 200; resize = undefined;
  vi.stubGlobal('window', {
    '__superset__/react':React,
    '__superset__/react-dom':{createPortal:(children: unknown) => children},
    '__superset__/@superset-ui/core':{getExtensionsRegistry: () => ({})},
    innerWidth:1000, innerHeight:600, addEventListener:vi.fn(), removeEventListener:vi.fn(),
    getComputedStyle:() => ({fontFamily:'Vazirmatn', color:'rgb(37, 55, 70)', backgroundColor:'rgba(0, 0, 0, 0)'}),
  });
  vi.stubGlobal('document', {getElementById:() => ({}), body:{}, addEventListener:vi.fn(), removeEventListener:vi.fn()});
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) {resize = callback;}
    observe() {} disconnect() {}
  });
  ({DateFilter} = await import('../src/DateFilter'));
  ({Calendar} = await import('../src/Calendar'));
});
afterEach(() => {if (tree) act(() => tree.unmount()); vi.unstubAllGlobals(); vi.resetModules();});
function open(value = 'No filter') {
  const onChange = vi.fn(), onOpenPopover = vi.fn(), onClosePopover = vi.fn();
  act(() => {tree = create(<DateFilter name="Time" value={value} onChange={onChange} onOpenPopover={onOpenPopover} onClosePopover={onClosePopover}/>, {
    createNodeMock: element => element.props.className === 'sj-trigger' ? {getBoundingClientRect:() => ({right:500,bottom:500}),focus:vi.fn()} : element.props.className === 'sj-popover' ? {get offsetHeight() {return height;},querySelector:() => ({focus:vi.fn()})} : {},
  });});
  act(() => tree.root.findByProps({className:'sj-trigger'}).props.onClick());
  return {onChange, onOpenPopover, onClosePopover};
}
const tab = (index: number) => act(() => tree.root.findAllByProps({role:'tab'})[index].props.onClick());
const apply = () => act(() => tree.root.findByProps({className:'sj-primary'}).props.onClick());

it.each([
  ['2024-09-22T00:00:00 : 2024-10-22T00:00:00', '۱۴۰۳/۰۷/۰۱ تا ۱۴۰۳/۰۷/۳۰'],
  ['today : DATEADD(DATETIME("today"), 1, day)', 'امروز'],
  ['No filter', 'بدون فیلتر'],
])('names the trigger using the selected range for %s', (value, text) => {
  const name = 'NATIVE_FILTER-abc123';
  act(() => {tree = create(<DateFilter name={name} value={value} onChange={vi.fn()}/>);});
  const trigger = tree.root.findByProps({className:'sj-trigger'});
  expect(trigger.props['aria-label']).toBe(`بازهٔ زمانی: ${text}`);
  expect(trigger.props['aria-label']).not.toContain(name);
  expect(trigger.props['data-filter-name']).toBe(name);
  expect(trigger.props.title).toBe(text);
});

it('keeps a calendar selection when switching to the raw expression tab', () => {
  const {onChange} = open(); tab(1);
  act(() => tree.root.findByType(Calendar).props.onSelect([1403,7,1]));
  act(() => tree.root.findByType(Calendar).props.onSelect([1403,7,30]));
  tab(2);
  expect(tree.root.findByProps({className:'sj-raw'}).props.value).toBe('2024-09-22T00:00:00 : 2024-10-22T00:00:00');
  apply();
  expect(onChange).toHaveBeenCalledWith('2024-09-22T00:00:00 : 2024-10-22T00:00:00');
});

it.each([
  ['1403/07/01', ''],
  ['', '1403/07/30'],
  ['1403/07/01', 'invalid'],
  ['1403/07/30', '1403/07/01'],
])('discards an incomplete or invalid calendar range %s to %s when switching tabs', (from, to) => {
  open(); tab(1);
  act(() => {
    tree.root.findByProps({'aria-label':'تاریخ آغاز'}).props.onChange({target:{value:from}});
    tree.root.findByProps({'aria-label':'تاریخ پایان'}).props.onChange({target:{value:to}});
  });
  apply();
  expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(1);
  tab(2);
  expect(tree.root.findByProps({className:'sj-raw'}).props.value).toBe('No filter');
  expect(tree.root.findAllByProps({role:'alert'})).toHaveLength(0);
  tab(1);
  expect(tree.root.findByProps({'aria-label':'تاریخ آغاز'}).props.value).toBe('');
  expect(tree.root.findByProps({'aria-label':'تاریخ پایان'}).props.value).toBe('');
  expect(tree.root.findByType(Calendar).props.start).toBeUndefined();
  expect(tree.root.findByType(Calendar).props.end).toBeUndefined();
});

it('keeps two valid date inputs in the draft when switching tabs', () => {
  open(); tab(1);
  act(() => {
    tree.root.findByProps({'aria-label':'تاریخ آغاز'}).props.onChange({target:{value:'1403/07/01'}});
    tree.root.findByProps({'aria-label':'تاریخ پایان'}).props.onChange({target:{value:'1403/07/30'}});
  });
  tab(2);
  expect(tree.root.findByProps({className:'sj-raw'}).props.value).toBe('2024-09-22T00:00:00 : 2024-10-22T00:00:00');
  tab(1);
  expect(tree.root.findByProps({'aria-label':'تاریخ آغاز'}).props.value).toBe('۱۴۰۳/۰۷/۰۱');
  expect(tree.root.findByProps({'aria-label':'تاریخ پایان'}).props.value).toBe('۱۴۰۳/۰۷/۳۰');
});

it('shows the selected absolute preset when switching to the calendar tab', () => {
  open('2024-09-22T00:00:00 : 2024-10-22T00:00:00'); tab(0);
  const preset = presets().find(p => p.id === 'month')!;
  act(() => tree.root.findAllByType('button').find(b => b.children.join('') === preset.label)!.props.onClick());
  tab(1);
  const range = parse(preset.value, []);
  if (range.kind !== 'range') throw new Error('Expected absolute range');
  expect(tree.root.findByProps({'aria-label':'تاریخ آغاز'}).props.value).toBe(format(range.start));
  expect(tree.root.findByProps({'aria-label':'تاریخ پایان'}).props.value).toBe(format(range.end));
});

it('repositions when the calendar makes the panel taller without repeating host callbacks', () => {
  const {onOpenPopover, onClosePopover} = open();
  expect(tree.root.findByProps({className:'sj-popover'}).props.style.top).toBe(392);
  height = 450; tab(1);
  expect(resize).toBeTypeOf('function');
  act(() => resize!());
  expect(tree.root.findByProps({className:'sj-popover'}).props.style.top).toBe(142);
  expect(onOpenPopover).toHaveBeenCalledTimes(1);
  expect(onClosePopover).not.toHaveBeenCalled();
});
