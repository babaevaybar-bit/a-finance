import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import type { PhotoCatalog } from './photos';

let cache: Promise<PhotoCatalog | null> | null = null;
function loadCatalog(): Promise<PhotoCatalog | null> {
  if (!cache) {
    cache = Promise.resolve(supabase.from('door_photo_catalog').select('data').eq('id', 'orange').maybeSingle())
      .then(({ data }) => (data?.data as PhotoCatalog) ?? null)
      .catch(() => null);
  }
  return cache;
}
export default function usePhotoCatalog() {
  const [cat, setCat] = useState<PhotoCatalog | null>(null);
  useEffect(() => { let on = true; loadCatalog().then(c => { if (on) setCat(c); }); return () => { on = false; }; }, []);
  return cat;
}

