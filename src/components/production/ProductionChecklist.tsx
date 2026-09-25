import React, { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, ListChecks } from 'lucide-react';
import {
  getProductionChecklist, addProductionChecklistItem,
  toggleProductionChecklistItem, deleteProductionChecklistItem,
} from '@/lib/api';
import type { ProductionChecklistItem } from '@/lib/api';

const DEFAULT_ITEMS = ['Замер', 'Договор подписан', 'Оплата получена', 'Установка выполнена'];

/**
 * Свой чек-лист по карточке производства — живёт только у нас, не зависит
 * от Trello вообще. Удобно для внутренних пунктов, которых нет на доске.
 */
export default function ProductionChecklist({ trelloCardId }: { trelloCardId: string }) {
  const [items, setItems] = useState<ProductionChecklistItem[] | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    try { setItems(await getProductionChecklist(trelloCardId)); }
    catch { setItems([]); }
  }

  useEffect(() => { load(); }, [trelloCardId]);

  async function handleToggle(item: ProductionChecklistItem) {
    setItems(prev => prev?.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i) ?? prev);
    try { await toggleProductionChecklistItem(item.id, !item.checked); }
    catch { await load(); }
  }

  async function handleAdd(label: string) {
    if (!label.trim() || !items) return;
    setAdding(true);
    try {
      await addProductionChecklistItem(trelloCardId, label.trim(), items.length);
      setNewLabel('');
      await load();
    } finally { setAdding(false); }
  }

  async function handleAddDefaults() {
    if (!items) return;
    setAdding(true);
    try {
      for (let i = 0; i < DEFAULT_ITEMS.length; i++) {
        await addProductionChecklistItem(trelloCardId, DEFAULT_ITEMS[i], items.length + i);
      }
      await load();
    } finally { setAdding(false); }
  }

  async function handleDelete(id: string) {
    setItems(prev => prev?.filter(i => i.id !== id) ?? prev);
    try { await deleteProductionChecklistItem(id); } catch { await load(); }
  }

  if (items === null) return <p className="text-xs text-muted-foreground">Загрузка...</p>;

  const doneCount = items.filter(i => i.checked).length;

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddDefaults} disabled={adding}>
          <ListChecks size={12} className="mr-1.5" />Добавить стандартный чек-лист
        </Button>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{doneCount} из {items.length}</p>
          <div className="space-y-1.5">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-2 group">
                <Checkbox checked={item.checked} onCheckedChange={() => handleToggle(item)} />
                <span className={`text-sm flex-1 ${item.checked ? 'line-through text-muted-foreground' : ''}`}>{item.label}</span>
                <button onClick={() => handleDelete(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flex gap-1.5 pt-1">
        <Input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(newLabel); }}
          placeholder="Добавить пункт..."
          className="h-7 text-xs"
        />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => handleAdd(newLabel)} disabled={adding || !newLabel.trim()}>
          <Plus size={13} />
        </Button>
      </div>
    </div>
  );
}
