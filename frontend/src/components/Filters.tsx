// The pieces every filter panel is made of, so the three browse screens look
// and behave alike.

import { useEffect, useState, type ReactNode } from 'react';
import { inrShort } from '../lib/corrections';

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export type Option = string | { value: string; label: string };

export function SelectField({
  id, label, value, onChange, options, any = 'Any',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  /** the empty option's label; null for a select that always has a value */
  any?: string | null;
}) {
  return (
    <Field id={id} label={label}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {any !== null && <option value="">{any}</option>}
        {options.map((o) =>
          typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>,
        )}
      </select>
    </Field>
  );
}

/**
 * A price typed in lakh, kept in rupees. Nobody types 7500000 correctly, and
 * lakh is how every price in this city is quoted - 1 crore is 100.
 */
export function LakhField({
  id, label, rupees, onChange, placeholder,
}: {
  id: string;
  label: string;
  rupees: string;
  onChange: (rupees: string) => void;
  placeholder?: string;
}) {
  const toText = (r: string) => (r ? String(Number(r) / 1e5) : '');
  const [text, setText] = useState(() => toText(rupees));

  // Follow the URL when it changes from outside - a chip cleared, Back pressed -
  // but not while the typed text already means the same amount ("1." is 1).
  useEffect(() => {
    const typed = text.trim() === '' ? '' : String(Math.round(Number(text) * 1e5));
    if (typed !== rupees) setText(toText(rupees));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rupees]);

  return (
    <Field id={id} label={label}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '');
          setText(t);
          if (t === '' || t === '.') onChange('');
          else if (Number.isFinite(Number(t))) onChange(String(Math.round(Number(t) * 1e5)));
        }}
      />
    </Field>
  );
}

export type Chip = { key: string; label: string };

/**
 * The result count, then one removable chip per active filter. The count stays
 * a direct child of <main> - the UI smoke test reads it there.
 */
export function ResultBar({
  count, chips, onRemove, onClearAll, warning,
}: {
  count: ReactNode;
  chips: Chip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  warning?: string | null;
}) {
  return (
    <>
      <p className="muted resultcount">{count}</p>
      {(chips.length > 0 || warning) && (
        <div className="chips">
          {chips.map((c) => (
            <button key={c.key} className="chip" onClick={() => onRemove(c.key)} aria-label={`Remove filter: ${c.label}`}>
              {c.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          {chips.length > 1 && <button className="linkish" onClick={onClearAll}>Clear all</button>}
          {warning && <span className="bad-text">{warning}</span>}
        </div>
      )}
    </>
  );
}

/** "₹60.00 L", "₹1.20 Cr" for a rupee string. */
export const priceLabel = (rupees: string) => inrShort(Number(rupees));
