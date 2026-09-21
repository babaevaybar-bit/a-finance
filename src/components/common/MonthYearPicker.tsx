import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { monthYearToLabel } from '@/lib/utils';

const MONTH_LABELS = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

interface Props {
  value: string; // "YYYY-MM"
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Переключатель месяц+год: стрелки листают год целиком, внутри — сетка из 12 месяцев.
 * Заменяет собой плоский выпадающий список месяцев с ограниченным диапазоном —
 * здесь можно уйти в любой год вперёд или назад без ограничений.
 */
export default function MonthYearPicker({ value, onChange, className }: Props) {
  const [year, month] = value.split('-').map(Number);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setViewYear(year); // при открытии всегда показываем год текущего выбора
  }

  function pick(m: number) {
    onChange(`${viewYear}-${String(m).padStart(2, '0')}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`w-52 justify-start font-normal ${className || ''}`}>
          <CalendarDays size={15} className="mr-2 text-muted-foreground" />
          {monthYearToLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear(y => y - 1)}>
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium">{viewYear}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewYear(y => y + 1)}>
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_LABELS.map((label, i) => {
            const m = i + 1;
            const isSelected = viewYear === year && m === month;
            return (
              <button
                key={label}
                type="button"
                onClick={() => pick(m)}
                className={`text-sm rounded-md py-1.5 transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
