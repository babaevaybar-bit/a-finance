import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupMode, setSignupMode] = useState(false);
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { toast.error('Введите логин и пароль'); return; }
    setLoading(true);
    const { error } = await signIn(username, password);
    setLoading(false);
    if (error) { toast.error(error); return; }
    navigate('/', { replace: true });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    if (!u) { toast.error('Введите логин'); return; }
    if (signupPassword.length < 6) { toast.error('Пароль не менее 6 символов'); return; }
    if (signupPassword !== signupConfirm) { toast.error('Пароли не совпадают'); return; }
    setLoading(true);
    const email = u.includes('@') ? u : `${u}@aybar.app`;
    // eslint-disable-next-line no-console
    console.debug('Auth: signUp attempt', { email });
    const { data, error } = await supabase.auth.signUp({ email, password: signupPassword });
    setLoading(false);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Auth: signUp error', error);
      toast.error(error.message || 'Не удалось создать аккаунт');
      return;
    }
    toast.success('Письмо подтверждения отправлено (если требуется). Попробуйте войти.');
    setSignupMode(false);
    setSignupPassword('');
    setSignupConfirm('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Aybar Finance</h1>
          <p className="text-sm text-muted-foreground">Войдите в свой аккаунт</p>
        </div>
        <div className="text-center">
          <button
            type="button"
            onClick={() => setSignupMode(true)}
            className="text-sm text-primary hover:underline"
          >
            Создать аккаунт
          </button>
        </div>

        <form onSubmit={signupMode ? handleSignup : handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Логин</Label>
            <Input
              id="username"
              autoComplete="username"
              placeholder="Ваш логин"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          {signupMode ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password">Пароль</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="Минимум 6 символов"
                  value={signupPassword}
                  onChange={e => setSignupPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-confirm">Повторите пароль</Label>
                <Input
                  id="signup-confirm"
                  type="password"
                  placeholder="Повторите пароль"
                  value={signupConfirm}
                  onChange={e => setSignupConfirm(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Создание...' : 'Создать аккаунт'}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                <button type="button" className="underline" onClick={() => setSignupMode(false)}>Отмена</button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Пароль</Label>
                  <Link
                    to="/reset-password"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Забыли пароль?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Вход...' : (
                  <><LogIn size={16} className="mr-2" />Войти</>
                )}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Нет аккаунта? <button type="button" className="underline" onClick={() => setSignupMode(true)}>Создать</button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
