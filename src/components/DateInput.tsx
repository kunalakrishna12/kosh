import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, isoDate, parseDate, today } from '../lib/dates';

/**
 * Kosh's own date field. The browser's date pickers look different in every browser and
 * ignore the app's theme, so every date in Kosh goes through this one instead.
 */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** "Thu, 1 Oct 2026": the same everywhere, whatever the browser's locale quirks. */
export function formatDay(iso: string): string {
  const d = parseDate(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o);
  return `${part({ weekday: 'short' })}, ${d.getDate()} ${part({ month: 'short' })} ${d.getFullYear()}`;
}

function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => isoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

export function DateInput({
  value,
  onChange,
  optional,
  placeholder = 'Pick a date',
  min,
  max,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Allows clearing the date (expiry, last working day…). */
  optional?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`input date-btn ${value ? '' : 'empty'}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${value ? formatDay(value) : 'not set'}` : undefined}
        autoFocus={autoFocus}
      >
        <span>{value ? formatDay(value) : placeholder}</span>
        <CalendarDays size={16} />
      </button>
      {open && (
        <Calendar
          anchor={btn.current!}
          value={value}
          min={min}
          max={max}
          optional={optional}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
            btn.current?.focus();
          }}
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Calendar({
  anchor,
  value,
  min,
  max,
  optional,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  value: string;
  min?: string;
  max?: string;
  optional?: boolean;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const t = today();
  const [focus, setFocus] = useState(value || t);
  const [view, setView] = useState(() => {
    const d = parseDate(value || t);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  // Sit under the field, or above it when there's no room below; stay inside the window.
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = 296;
      const h = panel.current?.offsetHeight ?? 340;
      const below = r.bottom + 6 + h <= window.innerHeight;
      setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h), left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  // Close on outside click; Escape closes only the calendar, not the dialog behind it.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, view]);

  const moveFocus = (iso: string) => {
    setFocus(iso);
    const d = parseDate(iso);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const shiftMonth = (n: number) => {
    const d = new Date(view.y, view.m + n, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    const f = parseDate(focus);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    setFocus(isoDate(new Date(d.getFullYear(), d.getMonth(), Math.min(f.getDate(), last))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDays(focus, step[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      shiftMonth(e.key === 'PageUp' ? -1 : 1);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      moveFocus(addDays(focus, e.key === 'Home' ? -parseDate(focus).getDay() : 6 - parseDate(focus).getDay()));
    }
  };

  const label = new Date(view.y, view.m, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  return createPortal(
    <div
      ref={panel}
      className="cal"
      role="dialog"
      aria-label="Choose a date"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onKeyDown={onKey}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="cal-head">
        <button type="button" className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <b>{label}</b>
        <button type="button" className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-wd">
            {w}
          </span>
        ))}
        {monthGrid(view.y, view.m).map((iso) => {
          const outside = parseDate(iso).getMonth() !== view.m;
          const ok = allowed(iso);
          return (
            <button
              key={iso}
              type="button"
              data-day={iso}
              tabIndex={iso === focus ? 0 : -1}
              className={`cal-day ${outside ? 'out' : ''} ${iso === t ? 'today' : ''} ${iso === value ? 'sel' : ''}`}
              disabled={!ok}
              aria-selected={iso === value}
              aria-label={formatDay(iso)}
              onClick={() => onPick(iso)}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="cal-foot">
        <button type="button" className="btn ghost sm" onClick={() => allowed(t) && onPick(t)} disabled={!allowed(t)}>
          Today
        </button>
        {optional && value && (
          <button type="button" className="btn ghost sm" onClick={() => onPick('')}>
            <X size={13} /> Clear
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
