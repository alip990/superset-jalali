// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { format, Jalali } from '../src/jalali';

let container: HTMLDivElement;
let Calendar: typeof import('../src/Calendar').Calendar;
let DateFilter: typeof import('../src/DateFilter').DateFilter;
beforeEach(async () => {
  vi.useFakeTimers({toFake:['Date']});
  vi.setSystemTime(new Date('2024-09-26T21:00:00Z')); // Friday in Tehran, Thursday UTC
  Object.assign(window, {
    '__superset__/react':React, '__superset__/react-dom':ReactDOM,
    '__superset__/@superset-ui/core':{getExtensionsRegistry: () => ({})},
  });
  ({Calendar} = await import('../src/Calendar'));
  ({DateFilter} = await import('../src/DateFilter'));
  container = document.createElement('div'); document.body.appendChild(container);
});
afterEach(() => {
  act(() => {ReactDOM.unmountComponentAtNode(container);});
  container.remove(); vi.useRealTimers(); vi.restoreAllMocks();
});
function calendar(year = 1403, month = 7, start?: Jalali) {
  const selected: Jalali[] = [];
  function View() {
    const [view, setView] = React.useState([year,month]);
    return <Calendar year={view[0]} month={view[1]} start={start} onNavigate={(y,m) => setView([y,m])} onSelect={date => selected.push(date)}/>;
  }
  act(() => {ReactDOM.render(<View/>, container);});
  return selected;
}
function day(date: Jalali) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${format(date)}"]`)!;
}
function key(button: HTMLElement, key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', {key, shiftKey, bubbles:true, cancelable:true});
  act(() => {button.dispatchEvent(event);});
  return event;
}
function filter(overflow = false, onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>, onClosePopover?: () => void) {
  act(() => {ReactDOM.render(<div onKeyDown={onKeyDown}><DateFilter name="Time" onChange={() => {}} isOverflowingFilterBar={overflow} onClosePopover={onClosePopover}/></div>, container);});
  const trigger = container.querySelector<HTMLButtonElement>('.sj-trigger')!;
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({right:500,bottom:100} as DOMRect);
  act(() => {trigger.click();});
  return document.querySelector<HTMLDivElement>('.sj-popover')!;
}

it('marks Tehran today with a ring even when selected and colours Fridays', () => {
  calendar(1403,7,[1403,7,6]);
  const today = day([1403,7,6]);
  expect(today.getAttribute('aria-current')).toBe('date');
  expect(today.classList.contains('sj-today')).toBe(true);
  expect(today.classList.contains('sj-selected')).toBe(true);
  expect(today.classList.contains('sj-weekend')).toBe(true);
  expect(day([1403,7,5]).classList.contains('sj-weekend')).toBe(false);
  expect(day([1403,7,13]).classList.contains('sj-weekend')).toBe(true);
  expect(container.querySelector('.sj-weekday.sj-weekend')?.textContent).toBe('جمعه');
});

it('roves one tab stop with RTL arrows and selects with Enter and Space', () => {
  const selected = calendar();
  const button = day([1403,7,6]); button.focus();
  expect(container.querySelectorAll('.sj-grid button[tabindex="0"]')).toHaveLength(1);
  expect(button.tabIndex).toBe(0);
  for (const [arrow, date] of [
    ['ArrowLeft',[1403,7,7]], ['ArrowRight',[1403,7,6]],
    ['ArrowDown',[1403,7,13]], ['ArrowUp',[1403,7,6]],
  ] as [string,Jalali][]) {
    key(document.activeElement as HTMLElement, arrow);
    expect(document.activeElement).toBe(day(date));
    expect(day(date).tabIndex).toBe(0);
    expect(container.querySelectorAll('.sj-grid button[tabindex="0"]')).toHaveLength(1);
  }
  key(document.activeElement as HTMLElement, 'Enter');
  key(document.activeElement as HTMLElement, ' ');
  expect(selected).toEqual([[1403,7,6],[1403,7,6]]);
});

it.each([
  [[1403,7,30], 'ArrowLeft', [1403,8,1]],
  [[1403,8,1], 'ArrowRight', [1403,7,30]],
  [[1403,12,30], 'ArrowLeft', [1404,1,1]],
  [[1404,1,1], 'ArrowRight', [1403,12,30]],
  [[1403,12,27], 'ArrowDown', [1404,1,4]],
])('arrows cross month/year boundaries from %j', (from, arrow, to) => {
  calendar(from[0],from[1]); day(from as Jalali).focus();
  key(document.activeElement as HTMLElement, arrow);
  expect(document.activeElement).toBe(day(to as Jalali));
  expect(Number(container.querySelector<HTMLSelectElement>('select[aria-label="ماه"]')!.value)).toBe(to[1]);
  expect(Number(container.querySelector<HTMLSelectElement>('select[aria-label="سال"]')!.value)).toBe(to[0]);
});

it.each([[[1350,1,1], 'ArrowRight'], [[1550,12,29], 'ArrowLeft']])('keeps arrows within supported calendar at %j', (date, arrow) => {
  calendar(date[0],date[1]); const button = day(date as Jalali); button.focus();
  key(button, arrow);
  expect(document.activeElement).toBe(button);
});

it('keeps focus in both date inputs through multiple characters and later renders', () => {
  const panel = filter();
  act(() => {panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();});
  // Consume an arrow focus request before typing to guard against stale requests.
  const button = document.querySelector<HTMLButtonElement>('.sj-grid button[tabindex="0"]')!;
  button.focus(); key(button, 'ArrowLeft');
  for (const input of Array.from(panel.querySelectorAll<HTMLInputElement>('.sj-inputs input'))) {
    input.focus();
    let value = '';
    for (const character of '۱۴۰۳/۰۷/۰۶') {
      value += character;
      act(() => {input.value = value; Simulate.change(input);});
      expect(input.value).toBe(value);
      expect(document.activeElement).toBe(input);
    }
  }
});

it('keeps the today ring visible on selected Friday and weekend range days', () => {
  const panel = filter();
  act(() => {panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();});
  const today = panel.querySelector<HTMLButtonElement>('button[aria-current="date"]')!;
  act(() => {today.click();});
  expect(getComputedStyle(today).boxShadow).toBe('inset 0 0 0 2px #b77713');
  expect(getComputedStyle(today).backgroundColor).toBe('rgb(148, 56, 72)');
  act(() => {panel.querySelector<HTMLButtonElement>('button[aria-label="۱۴۰۳/۰۷/۲۰"]')!.click();});
  const friday = panel.querySelector<HTMLButtonElement>('button[aria-label="۱۴۰۳/۰۷/۱۳"]')!;
  expect(friday.classList.contains('sj-between')).toBe(true);
  expect(getComputedStyle(friday).color).toBe('rgb(173, 36, 49)');
});

it('month controls change the view without moving focus into the day grid', () => {
  calendar();
  const month = container.querySelector<HTMLSelectElement>('select[aria-label="ماه"]')!;
  month.focus();
  act(() => {month.value = '8'; Simulate.change(month);});
  expect(document.activeElement).toBe(month);
  expect(day([1403,8,1])).not.toBeNull();
  expect(container.querySelectorAll('.sj-grid button[tabindex="0"]')).toHaveLength(1);
});

it.each([false,true])('positions the popover for overflow=%s', overflow => {
  const panel = filter(overflow);
  const style = getComputedStyle(panel);
  expect(style.position).toBe('fixed');
  expect(style.maxWidth).toBe('calc(100vw - 16px)');
  expect(style.maxHeight).toBe('calc(100vh - 16px)');
  if (overflow) {
    expect(style.top).toBe('50%'); expect(style.left).toBe('50%');
    expect(style.transform).toBe('translate(-50%, -50%)');
  } else {
    expect(style.top).toBe('106px'); expect(style.left).toBe('120px');
    expect(style.transform).toBe('');
  }
});

it('closes only the popover on Escape without reaching a parent dialog', () => {
  const parent = vi.fn(), onClose = vi.fn();
  const panel = filter(false, parent, onClose);
  act(() => {panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();});
  const input = panel.querySelector<HTMLInputElement>('.sj-inputs input')!;
  input.focus();
  expect(key(input, 'Escape').defaultPrevented).toBe(true);
  expect(document.querySelector('.sj-popover')).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(parent).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(container.querySelector('.sj-trigger'));
});

it.each([false,true])('traps Tab and Shift+Tab without reaching a parent, calendar=%s', calendar => {
  const parent = vi.fn(), panel = filter(false, parent);
  if (calendar) act(() => {panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();});
  const first = panel.querySelector<HTMLButtonElement>('button')!;
  const last = panel.querySelector<HTMLButtonElement>('.sj-primary')!;
  last.focus();
  expect(key(last, 'Tab').defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  expect(key(first, 'Tab', true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
  // Interior Tab keeps native navigation; jsdom has no default Tab action.
  const middle = panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
  middle.focus();
  expect(key(middle, 'Tab').defaultPrevented).toBe(false);
  expect(parent).not.toHaveBeenCalled();
});

it('keeps all calendar arrow keys inside the portal while moving focus', () => {
  const parent = vi.fn(), panel = filter(false, parent);
  act(() => {panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();});
  panel.querySelector<HTMLButtonElement>('.sj-grid button[tabindex="0"]')!.focus();
  for (const [arrow,date] of [
    ['ArrowLeft',[1403,7,7]], ['ArrowRight',[1403,7,6]],
    ['ArrowDown',[1403,7,13]], ['ArrowUp',[1403,7,6]],
  ] as [string,Jalali][]) {
    expect(key(document.activeElement as HTMLElement, arrow).defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(format(date));
  }
  expect(parent).not.toHaveBeenCalled();
});

it.each(['Enter',' '])('keeps button activation key %j inside the portal', activation => {
  const parent = vi.fn(), panel = filter(false, parent);
  const preset = panel.querySelector<HTMLButtonElement>('.sj-presets button')!;
  expect(key(preset, activation).defaultPrevented).toBe(false); // Preserve native button activation.
  act(() => {panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();});
  const day = panel.querySelector<HTMLButtonElement>('.sj-grid button[tabindex="0"]')!;
  expect(key(day, activation).defaultPrevented).toBe(true);
  expect(day.getAttribute('aria-pressed')).toBe('true');
  expect(parent).not.toHaveBeenCalled();
});

it('leaves text-input keys available for editing and still closes on outside mousedown', () => {
  const parent = vi.fn(), onClose = vi.fn(), panel = filter(false, parent, onClose);
  act(() => {panel.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();});
  const input = panel.querySelector<HTMLInputElement>('.sj-inputs input')!;
  input.focus();
  for (const editing of ['ArrowLeft',' ']) expect(key(input, editing).defaultPrevented).toBe(false);
  expect(parent).toHaveBeenCalledTimes(2);
  act(() => {input.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));});
  expect(document.querySelector('.sj-popover')).toBe(panel);
  act(() => {document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));});
  expect(document.querySelector('.sj-popover')).toBeNull();
  expect(onClose).toHaveBeenCalledTimes(1);
});
