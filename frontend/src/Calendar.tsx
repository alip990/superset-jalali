import { React } from './shims';
import { epoch, fa, format, j2g, Jalali, monthLength, months, weekdays } from './jalali';

interface Props {
  start?: Jalali; end?: Jalali; year: number; month: number;
  onNavigate: (year: number, month: number) => void;
  onSelect: (date: Jalali) => void;
}
export function Calendar({start, end, year, month, onNavigate, onSelect}: Props) {
  const count = monthLength(year, month);
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
    <div className="sj-grid">
      {weekdays.map(day => <span className="sj-weekday" key={day} title={day}>{day}</span>)}
      {Array.from({length:offset}, (_, i) => <span key={'space'+i}/>)}
      {Array.from({length:count}, (_, i) => i+1).map(day => {
        const date: Jalali = [year, month, day];
        const iso = j2g(...date), selected = iso === a || iso === b;
        return <button type="button" key={day} aria-label={format(date)} aria-pressed={selected} className={(selected ? 'sj-selected' : '') + (a && b && iso > a && iso < b ? ' sj-between' : '')} onClick={() => onSelect(date)}>{fa(day)}</button>;
      })}
    </div>
  </div>;
}
