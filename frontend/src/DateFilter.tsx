import { React, ReactDOM, DateFilterControlProps } from './shims';
import { Calendar } from './Calendar';
import { format, g2j, j2g, Jalali, parseJalali } from './jalali';
import { emit, label, parse, Preset, presets, tehranToday } from './timeRange';

const css = `
.sj-trigger{width:100%;min-height:32px;border:1px solid #b7c2cb;border-radius:4px;background:#fff;color:#253746;padding:5px 10px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit;cursor:pointer}
.sj-popover{position:fixed;z-index:1100;width:380px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;background:#fff;color:#253746;border:1px solid #d4dce2;border-radius:8px;box-shadow:0 8px 32px #15293530;font:14px/1.6 Tahoma,Arial,sans-serif;padding:16px;box-sizing:border-box}
.sj-popover *{box-sizing:border-box}.sj-popover button,.sj-popover input,.sj-popover select{font:inherit}.sj-popover button{cursor:pointer;border:1px solid #d4dce2;background:white;color:inherit;border-radius:4px;padding:5px 9px}.sj-popover button:disabled{opacity:.4;cursor:default}
.sj-popover button:hover{background:#eef5f7}.sj-popover button:focus-visible,.sj-popover input:focus-visible,.sj-popover select:focus-visible{outline:2px solid #167c99;outline-offset:2px}.sj-popover input,.sj-popover select{border:1px solid #b7c2cb;border-radius:4px;padding:5px;background:white;color:inherit;min-width:0}
.sj-tabs{display:flex;gap:6px;border-bottom:1px solid #e4e9ed;padding-bottom:12px;margin-bottom:12px}.sj-popover .sj-active,.sj-popover .sj-primary{background:#136c87;color:white;border-color:#136c87}.sj-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sj-inputs{display:flex;gap:12px;margin:12px 0}.sj-inputs label{flex:1;min-width:0}.sj-inputs input{width:100%;text-align:center;direction:ltr}
.sj-nav{display:flex;gap:6px;justify-content:space-between;margin:12px 0}.sj-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center}.sj-grid button{border:0;padding:6px 0}.sj-weekday{font-size:10px;color:#526573;white-space:nowrap;padding:4px 0}.sj-grid .sj-selected{background:#136c87;color:#fff}.sj-grid .sj-between{background:#e2f0f4;color:#136c87}.sj-footer{display:flex;gap:7px;margin-top:16px;padding-top:12px;border-top:1px solid #e4e9ed}.sj-footer .sj-clear{margin-left:auto}.sj-error{color:#ad2431;margin-top:8px}.sj-hint{color:#526573;font-size:12px;margin:8px 0}.sj-raw{width:100%;direction:ltr;text-align:left}
.sj-grid .sj-weekend{color:#ad2431}.sj-grid .sj-selected.sj-weekend{color:#fff;background:#943848}.sj-grid .sj-today{box-shadow:inset 0 0 0 2px #b77713}
`;
function styleOnce() {
  if (!document.getElementById('sj-style')) {
    const style = document.createElement('style'); style.id = 'sj-style'; style.textContent = css;
    // Use a CSP nonce already provided by the host, when available.
    const host = document.querySelector<HTMLStyleElement | HTMLScriptElement>('style[nonce],script[nonce]');
    if (host?.nonce) style.nonce = host.nonce;
    document.head.appendChild(style);
  }
}
export function DateFilter(props: DateFilterControlProps) {
  const {value, name, onChange, onOpenPopover, onClosePopover, isOverflowingFilterBar} = props;
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'presets'|'calendar'|'advanced'>('presets');
  const [options, setOptions] = React.useState<Preset[]>([]);
  const [draft, setDraft] = React.useState(value || 'No filter');
  const [from, setFrom] = React.useState(''), [to, setTo] = React.useState('');
  const [start, setStart] = React.useState<Jalali>(), [end, setEnd] = React.useState<Jalali>();
  const [view, setView] = React.useState<[number,number]>(() => {const [y,m] = g2j(tehranToday()); return [y,m];});
  const [error, setError] = React.useState('');
  const [position, setPosition] = React.useState({top:0, left:0});
  const trigger = React.useRef<HTMLButtonElement>(null), popover = React.useRef<HTMLDivElement>(null);
  const overflow = React.useRef(isOverflowingFilterBar); overflow.current = isOverflowingFilterBar;
  const callbacks = React.useRef({onOpenPopover, onClosePopover});
  callbacks.current = {onOpenPopover, onClosePopover};
  React.useEffect(() => {styleOnce();}, []);
  // Pair host callbacks with the actual lifetime, including unmount while open.
  React.useEffect(() => {
    if (!open) return;
    callbacks.current.onOpenPopover?.();
    const positionPanel = () => {
      if (overflow.current) return;
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const height = popover.current?.offsetHeight || 440;
      setPosition({left:Math.max(8, Math.min(anchor.right - 380, window.innerWidth - 388)), top:Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - height - 8))});
    };
    const close = () => {setOpen(false); trigger.current?.focus();};
    const outside = (e: MouseEvent) => {
      if (!popover.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) close();
    };
    positionPanel();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(positionPanel);
    if (popover.current) observer?.observe(popover.current);
    popover.current?.querySelector<HTMLElement>('button')?.focus();
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', positionPanel); window.addEventListener('scroll', positionPanel, true);
    return () => {
      observer?.disconnect();
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', positionPanel); window.removeEventListener('scroll', positionPanel, true);
      callbacks.current.onClosePopover?.();
    };
  }, [open]);
  const close = () => {setOpen(false); trigger.current?.focus();};
  // Portals bubble through the React tree: contain handled keys before parent dialogs.
  const key = (e: import('react').KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {e.preventDefault(); e.stopPropagation(); close(); return;}
    if (e.key === 'Tab') {
      e.stopPropagation();
      const elements = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]),input,select');
      if (!elements.length) return;
      const first = elements[0], last = elements[elements.length-1];
      if (e.shiftKey && document.activeElement === first) {e.preventDefault(); last.focus();}
      else if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first.focus();}
      return;
    }
    // Calendar handles arrows/selection; other buttons keep their native activation.
    if (e.defaultPrevented || ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest('button'))) e.stopPropagation();
  };
  const show = () => {
    if (open) {close(); return;}
    const next = presets(); setOptions(next);
    const current = parse(value, next);
    setDraft(value || 'No filter'); setError('');
    const range = current.kind === 'range' ? current : current.kind === 'preset' ? parse(current.preset.value, []) : undefined;
    if (range?.kind === 'range') {
      setStart(range.start); setEnd(range.end); setFrom(format(range.start)); setTo(format(range.end)); setView([range.start[0],range.start[1]]);
    } else {setStart(undefined); setEnd(undefined); setFrom(''); setTo('');}
    setTab(current.kind === 'raw' ? 'advanced' : current.kind === 'range' ? 'calendar' : 'presets');
    setOpen(true);
  };
  const select = (date: Jalali) => {
    setError('');
    if (!start || end) {setStart(date); setEnd(undefined); setFrom(format(date)); setTo('');}
    else {
      const a = j2g(...date) < j2g(...start) ? date : start;
      const b = j2g(...date) < j2g(...start) ? start : date;
      setStart(a); setEnd(b); setFrom(format(a)); setTo(format(b));
      setDraft(emit(a, b));
    }
  };
  const switchTab = (next: typeof tab) => {
    if (next === tab) return;
    if (tab === 'calendar' && (from || to)) {
      try {setDraft(emit(parseJalali(from), parseJalali(to)));}
      catch (err) {setError((err as Error).message); return;}
    }
    if (next === 'calendar') {
      const range = parse(draft, []);
      if (range.kind === 'range') {
        setStart(range.start); setEnd(range.end);
        setFrom(format(range.start)); setTo(format(range.end));
        setView([range.start[0], range.start[1]]);
      } else {setStart(undefined); setEnd(undefined); setFrom(''); setTo('');}
    }
    setTab(next); setError('');
  };
  const apply = () => {
    try {
      const result = tab === 'calendar' ? emit(parseJalali(from), parseJalali(to)) : draft.trim();
      if (!result) throw new Error('بازهٔ زمانی را وارد کنید');
      onChange(result); close();
    } catch (err) {setError((err as Error).message);}
  };
  return <>
    <button ref={trigger} type="button" className="sj-trigger" dir="rtl" title={label(value)} aria-label={name || 'بازهٔ زمانی'} aria-haspopup="dialog" aria-expanded={open} onClick={show}>{label(value)} ▾</button>
    {open && ReactDOM.createPortal(<div ref={popover} className="sj-popover" dir="rtl" role="dialog" aria-modal="true" aria-label="انتخاب بازهٔ زمانی جلالی" onKeyDown={key} style={isOverflowingFilterBar ? {top:'50%',left:'50%',transform:'translate(-50%, -50%)'} : position}>
      <div className="sj-tabs" role="tablist" aria-label="روش انتخاب بازه">
        {([['presets','بازه‌های آماده'],['calendar','تقویم'],['advanced','پیشرفته']] as const).map(([id, title]) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'sj-active' : ''} onClick={() => switchTab(id)}>{title}</button>)}
      </div>
      {tab === 'presets' && <div className="sj-presets">{options.map(p => <button key={p.id} type="button" aria-pressed={draft === p.value} className={draft === p.value ? 'sj-active' : ''} onClick={() => setDraft(p.value)}>{p.label}</button>)}</div>}
      {tab === 'calendar' && <>
        <p className="sj-hint">روز آغاز و سپس روز پایان را انتخاب کنید.</p>
        <Calendar start={start} end={end} year={view[0]} month={view[1]} onNavigate={(y,m) => setView([y,m])} onSelect={select}/>
        <div className="sj-inputs">
          <label>از<input aria-label="تاریخ آغاز" placeholder="۱۴۰۳/۰۷/۰۱" value={from} onChange={e => {setFrom(e.target.value); try {setStart(parseJalali(e.target.value));} catch {setStart(undefined);}}}/></label>
          <label>تا<input aria-label="تاریخ پایان" placeholder="۱۴۰۳/۰۷/۳۰" value={to} onChange={e => {setTo(e.target.value); try {setEnd(parseJalali(e.target.value));} catch {setEnd(undefined);}}}/></label>
        </div>
      </>}
      {tab === 'advanced' && <label>عبارت زمانی Superset<input className="sj-raw" value={draft} onChange={e => setDraft(e.target.value)}/></label>}
      {error && <div className="sj-error" role="alert">{error}</div>}
      <div className="sj-footer">
        <button type="button" className="sj-clear" onClick={() => {onChange('No filter'); close();}}>بدون فیلتر</button>
        <button type="button" onClick={close}>انصراف</button>
        <button type="button" className="sj-primary" onClick={apply}>اعمال</button>
      </div>
    </div>, document.body)}
  </>;
}
