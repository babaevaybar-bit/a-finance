import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Mail, KeyRound, Check } from 'lucide-react';

// Supabase sends a recovery link; the URL fragment contains access_token + type=recovery
function useRecoveryToken() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Supabase recovery link puts tokens in the URL hash
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const type = params.get('type');
    const accessToken = params.get('access_token');
    if (type === 'recovery' && accessToken) {
      setToken(accessToken);
    }
  }, []);

  return token;
}

// ─── Step 1: request reset email ──────────────────────────────────────────────
function RequestResetForm() {
  const [username, setUsername] = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (!u) { toast.error('Введите логин'); return; }
    setLoading(true);
    // Our emails are stored as username@aybar.app
    const email = `${u}@aybar.app`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      // Don't reveal whether user exists
      toast.error('Не удалось отправить письмо. Проверьте логин.');
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Check size={22} className="text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Письмо отправлено</h2>
          <p className="text-sm text-muted-foreground">
            Если аккаунт с таким логином существует, на привязанный email
            придёт письмо со ссылкой для сброса пароля.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Не пришло письмо? Обратитесь к администратору — он может сбросить
          пароль вручную через раздел «Сотрудники».
        </p>
        <Link to="/login" className="text-sm text-primary hover:underline block">
          Вернуться к входу
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Введите ваш логин. Мы отправим ссылку для сброса пароля на
          привязанный email.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="username">Логин</Label>
        <Input
          id="username"
          placeholder="Ваш логин"
          value={username}
          onChange={e => setUsername(e.target.value)}
          disabled={loading}
          autoComplete="username"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Отправка...' : (
          <><Mail size={16} className="mr-2" />Отправить ссылку</>
        )}
      </Button>
    </form>
  );
}

// ─── Step 2: set new password (after clicking recovery link) ─────────────────
function SetNewPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [sessionSet, setSessionSet] = useState(false);

  // Exchange recovery token for a session
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const refreshToken = params.get('refresh_token') ?? '';
    supabase.auth.setSession({ access_token: token, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) toast.error('Ссылка недействительна или истекла. Запросите новую.');
        else setSessionSet(true);
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { toast.error('Пароль должен быть не менее 6 символов'); return; }
    if (password !== confirm) { toast.error('Пароли не совпадают'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(`Ошибка: ${error.message}`); return; }
    toast.success('Пароль успешно изменён');
    navigate('/login', { replace: true });
  }

  if (!sessionSet) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">Придумайте новый пароль.</p>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">Новый пароль</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="Минимум 6 символов"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={loading}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Повторите пароль</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          disabled={loading}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Сохранение...' : (
          <><KeyRound size={16} className="mr-2" />Сохранить пароль</>
        )}
      </Button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ResetPasswordPage() {
  const recoveryToken = useRecoveryToken();
  const isRecovery = !!recoveryToken;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="space-y-1">
          {!isRecovery && (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft size={14} />Вернуться к входу
            </Link>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">
            {isRecovery ? 'Новый пароль' : 'Восстановление пароля'}
          </h1>
        </div>

        {/* Admin note */}
        {!isRecovery && (
          <div className="rounded-md border border-border p-3 bg-muted/40 text-sm space-y-1">
            <p className="font-medium text-sm">Также можно обратиться к директору</p>
            <p className="text-xs text-muted-foreground">
              Директор может сбросить пароль напрямую через раздел
              «Сотрудники» → кнопку редактирования.
            </p>
          </div>
        )}

        {isRecovery
          ? <SetNewPasswordForm token={recoveryToken!} />
          : <RequestResetForm />
        }
      </div>
    </div>
  );
}
