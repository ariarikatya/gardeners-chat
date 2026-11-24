'use client';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (sessionStorage.getItem('manual_logout')) {
          if (alive) setChecking(false);
          return;
        }
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          window.location.replace('/chats');
          return;
        }
      } catch (e) {}
      if (alive) setChecking(false);
    })();
    return () => { alive = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = needPassword ? { phone, password } : { phone };
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        sessionStorage.removeItem('manual_logout');
        window.location.replace('/chats');
        return;
      }
      if (data && data.passwordRequired) {
        setNeedPassword(true);
      } else {
        setError(data.error || 'Не удалось войти');
      }
    } catch (err) {
      setError('Ошибка сети');
    }
    setBusy(false);
  };

  if (checking) {
    return <div className="min-h-dvh bg-slate-100 dark:bg-slate-950" />;
  }

  return (
    <div className="min-h-dvh w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 shadow-xl space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">Вход в систему</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {needPassword ? 'Введите пароль' : 'Введите номер телефона'}
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Номер телефона</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="79991234567"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
          />
        </label>
        {needPassword && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500"
            />
          </label>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 py-2.5 font-semibold text-white"
        >
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
