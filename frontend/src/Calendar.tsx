import { React } from './shims';
import { addDays, epoch, fa, format, g2j, j2g, Jalali, monthLength, months, weekdays } from './jalali';
import { tehranToday } from './timeRange';

interface Props {
  start?: Jalali; end?: Jalali; year: number; month: number;
  onNavigate: (year: number, month: number) => void;
  onSelect: (date: Jalali) => void;
}
export function Calendar({start, end, year, month, onNavigate, onSelect}: Props) {
  const count = monthLength(year, month);
  const today = tehranToday(), first = j2g(year, month, 1), last = j2g(year, month, count);
  const [active, setActive] = React.useState(() => start ? j2g(...start) : today);
  const [pendingFocus, setPendingFocus] = React.useState<string>();
  const grid = React.useRef<HTMLDivElement>(null);
  const tabStop = active >= first && active <= last ? active : today >= first && today <= last ? today : first;
  // Only arrow keys request focus. Input edits and month controls never do.
  React.useEffect(() => {
    if (!pendingFocus) return;
    const button = grid.current?.querySelector<HTMLButtonElement>(`button[data-date="${pendingFocus}"]`);
    if (button) {setPendingFocus(undefined); button.focus();}
  }, [pendingFocus, year, month]);
  const key = (event: import('react').KeyboardEvent<HTMLButtonElement>, date: Jalali) => {
    if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); onSelect(date); return;}
    const delta = {ArrowLeft:1, ArrowRight:-1, ArrowUp:-7, ArrowDown:7}[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const iso = addDays(j2g(...date), delta);
    let next: Jalali;
    try {next = g2j(iso);} catch {return;} // Keep navigation inside the supported table.
    setActive(iso); setPendingFocus(iso);
    if (next[0] !== year || next[1] !== month) onNavigate(next[0], next[1]);
  };
  const offset = (new Date(epoch(j2g(year, month, 1))).getUTCDay() + 1) % 7;
  const move = (delta: number) => {
    const index = year * 12 + month - 1 + delta;
    const nextY = Math.floor(index / 12), nextM = index % 12 + 1;
    if (nextY >= 1350 && nextY <= 1550) onNavigate(nextY, nextM);
  };
  const a = start && j2g(...start), b = end && j2g(...end);
  return <div className="sj-calendar">
    <div className="sj-nav">
      <button type="button" aria-label="ماه قبل" onClick={() => move(-1)} disabled={year === 1350 && month === 1}>‹</button>
      <select aria-label="ماه" value={month} onChange={e => onNavigate(year, Number(e.target.value))}>{months.map((name, i) => <option key={name} value={i+1}>{name}</option>)}</select>
      <select aria-label="سال" value={year} onChange={e => onNavigate(Number(e.target.value), month)}>{Array.from({length:201}, (_, i) => 1350+i).map(y => <option key={y} value={y}>{fa(y)}</option>)}</select>
      <button type="button" aria-label="ماه بعد" onClick={() => move(1)} disabled={year === 1550 && month === 12}>›</button>
    </div>
    <div className="sj-grid" ref={grid}>
      {weekdays.map((day, i) => <span className={'sj-weekday' + (i === 6 ? ' sj-weekend' : '')} key={day} title={day}>{day}</span>)}
      {Array.from({length:offset}, (_, i) => <span key={'space'+i}/>)}
      {Array.from({length:count}, (_, i) => i+1).map(day => {
        const date: Jalali = [year, month, day];
        const iso = j2g(...date), selected = iso === a || iso === b;
        const weekend = (offset + day - 1) % 7 === 6;
        return <button type="button" key={iso} data-date={iso} tabIndex={iso === tabStop ? 0 : -1} aria-label={format(date)} aria-pressed={selected} aria-current={iso === today ? 'date' : undefined} className={(weekend ? 'sj-weekend' : '') + (selected ? ' sj-selected' : '') + (a && b && iso > a && iso < b ? ' sj-between' : '') + (iso === today ? ' sj-today' : '')} onFocus={() => setActive(iso)} onKeyDown={event => key(event,date)} onClick={() => onSelect(date)}>{fa(day)}</button>;
      })}
    </div>
  </div>;
}
