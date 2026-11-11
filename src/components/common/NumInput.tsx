import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Поле для числа без «прилипающего» нуля: пока пишете, можно стереть всё, поставить запятую или точку
 * («1,5»), число применяется сразу, как только оно корректное. При уходе из поля — приводится к min/max.
 */
export function NumInput({ value, onValue, min, max, decimals = true, className, placeholder, title, onClick }: {
  value: number; onValue: (n: number) => void; min?: number; max?: number; decimals?: boolean;
  className?: string; placeholder?: string; title?: string; onClick?: React.MouseEventHandler<HTMLInputElement>;
}) {
  const fmt = (n: number) => (Number.isFinite(n) ? String(n).replace('.', ',') : '');
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmt(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const parse = (t: string) => Number(t.replace(',', '.').replace(/\s/g, ''));
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  return (
    <Input type="text" inputMode={decimals ? 'decimal' : 'numeric'} className={className} placeholder={placeholder} title={title} onClick={onClick}
      value={text}
      onFocus={e => { focused.current = true; e.currentTarget.select(); }}
      onChange={e => {
        let t = e.target.value.replace(/[^\d.,]/g, '');
        if (!decimals) t = t.replace(/[.,]/g, '');
        t = t.replace(/^0+(?=\d)/, '');                        // «05» → «5»
        const sep = t.search(/[.,]/);
        if (sep >= 0) t = t.slice(0, sep + 1) + t.slice(sep + 1).replace(/[.,]/g, ''); // одна запятая
        setText(t);
        const n = parse(t);
        if (t !== '' && !/[.,]$/.test(t) && Number.isFinite(n)) onValue(clamp(n));
      }}
      onBlur={() => {
        focused.current = false;
        const n = parse(text);
        const v = text === '' || !Number.isFinite(n) ? (min ?? 0) : clamp(n);
        onValue(v); setText(fmt(v));
      }} />
  );
}
