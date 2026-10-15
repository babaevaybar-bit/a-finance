import React, { useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/layouts/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { UserAvatar, ROLE_LABELS } from '@/components/common/UserAvatar';
import { Camera, Loader2, Mail, ShieldCheck, KeyRound, Home, Trash2, Cake, Phone, MapPin } from 'lucide-react';

/** «Мой профиль»: информация о себе и личные настройки — у каждого сотрудника своя. */
export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', birthday: '', city: '', about: '', avatar_url: '', start_page: '/' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name && !profile.name.includes('@') && profile.name !== 'admin' ? profile.name : '',
      phone: profile.phone ?? '', birthday: profile.birthday ?? '', city: profile.city ?? '',
      about: profile.about ?? '', avatar_url: profile.avatar_url ?? '', start_page: profile.start_page || '/',
    });
  }, [profile]);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const dirty = !!profile && (
    form.name !== (profile.name ?? '') || form.phone !== (profile.phone ?? '') || form.birthday !== (profile.birthday ?? '') ||
    form.city !== (profile.city ?? '') || form.about !== (profile.about ?? '') || form.avatar_url !== (profile.avatar_url ?? '') ||
    form.start_page !== (profile.start_page || '/')
  );

  async function save(next = form) {
    if (!next.name.trim()) { toast.error('Укажите имя'); return false; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_my_profile', {
        p_name: next.name, p_phone: next.phone, p_birthday: next.birthday || null, p_city: next.city,
        p_about: next.about, p_avatar_url: next.avatar_url, p_start_page: next.start_page,
      });
      if (error) throw error;
      await refreshProfile();
      toast.success('Профиль сохранён');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить');
      return false;
    } finally { setSaving(false); }
  }

  async function uploadAvatar(file: File) {
    if (!user) return;
    if (!file.type.startsWith('image/')) { toast.error('Выберите изображение'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Фото больше 5 МБ'); return; }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const next = { ...form, avatar_url: url };
      setForm(next);
      await save(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось загрузить фото');
    } finally { setUploading(false); }
  }

  async function changePassword() {
    if (pw.a.length < 6) { toast.error('Пароль — минимум 6 символов'); return; }
    if (pw.a !== pw.b) { toast.error('Пароли не совпадают'); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setPwSaving(false);
    if (error) { toast.error(error.message); return; }
    setPw({ a: '', b: '' });
    toast.success('Пароль изменён');
  }

  if (!profile) return <AppLayout><div className="text-muted-foreground">Загрузка…</div></AppLayout>;
  const shownName = form.name || profile.email?.split('@')[0] || 'Сотрудник';

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Шапка профиля */}
        <section className="relative overflow-hidden rounded-3xl text-white px-6 py-7 md:px-8"
          style={{ background: 'radial-gradient(90% 140% at 90% 30%, #2b4a3f 0%, #172b24 50%, #0e1c17 100%)' }}>
          <div aria-hidden className="absolute right-8 -top-10 w-56 h-56 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative w-fit">
              <UserAvatar name={shownName} url={form.avatar_url} size={96} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-white text-[#14231e] flex items-center justify-center shadow-lg hover:bg-amber-50"
                title="Загрузить фото">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-semibold truncate">{shownName}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><ShieldCheck size={12} />{ROLE_LABELS[profile.role] ?? profile.role}</span>
                {(profile.email || user?.email) && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><Mail size={12} />{profile.email || user?.email}</span>}
                {profile.phone && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><Phone size={12} />{profile.phone}</span>}
                {profile.city && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><MapPin size={12} />{profile.city}</span>}
                {profile.birthday && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><Cake size={12} />{new Date(`${profile.birthday}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>}
              </div>
              {form.avatar_url && (
                <button type="button" className="mt-2 text-[11px] text-white/60 hover:text-white inline-flex items-center gap-1"
                  onClick={() => { const next = { ...form, avatar_url: '' }; setForm(next); save(next); }}>
                  <Trash2 size={11} />Убрать фото
                </button>
              )}
            </div>
          </div>
        </section>

        {/* О себе */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Информация о себе</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Имя и фамилия</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Например: Айбар Бабаев" autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+7 7__ ___ __ __" inputMode="tel" autoComplete="tel" />
              </div>
              <div className="space-y-1.5">
                <Label>День рождения</Label>
                <Input type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Город</Label>
                <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Шымкент" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>О себе</Label>
              <Textarea rows={4} value={form.about} onChange={e => set('about', e.target.value)} maxLength={1000}
                placeholder="Чем занимаетесь в компании, опыт, в чём можете помочь коллегам…" />
              <p className="text-[11px] text-muted-foreground text-right">{form.about.length}/1000</p>
            </div>
            <p className="text-xs text-muted-foreground">Должность и доступ к разделам назначает директор в «Сотрудниках» и «Доступе».</p>
          </CardContent>
        </Card>

        {/* Настройки */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Настройки</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Home size={14} />Какую страницу открывать при входе</Label>
              <div className="grid grid-cols-2 gap-2 max-w-md">
                {([['/', 'Дашборд'], ['/welcome', 'Приветствие']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set('start_page', v)}
                    className={`rounded-xl border px-3 py-2.5 text-sm text-left transition-colors ${form.start_page === v ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:bg-muted/40'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-3 z-10 flex justify-end">
          <Button onClick={() => save()} disabled={!dirty || saving} className="shadow-lg">
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Сохранить изменения
          </Button>
        </div>

        {/* Пароль */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-1.5"><KeyRound size={16} />Сменить пароль</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end" onSubmit={e => { e.preventDefault(); changePassword(); }}>
              <input type="text" name="username" autoComplete="username" value={profile.email || user?.email || ''} readOnly hidden />
              <div className="space-y-1.5"><Label>Новый пароль</Label>
                <Input type="password" autoComplete="new-password" value={pw.a} onChange={e => setPw(p => ({ ...p, a: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Повторите пароль</Label>
                <Input type="password" autoComplete="new-password" value={pw.b} onChange={e => setPw(p => ({ ...p, b: e.target.value }))} /></div>
              <Button type="submit" variant="outline" disabled={pwSaving || !pw.a}>{pwSaving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Сменить</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
