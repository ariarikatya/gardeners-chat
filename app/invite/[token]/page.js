'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import apiFetch from '@/lib/apiFetch';
import { compressImage } from '@/lib/imageCompress';

export default function InvitePage({ params }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = params;

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '', password: '', confirmPassword: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadInvite() {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/invites/${token}`, { bypassOfflineCache: true, cache: 'no-store' });
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error || 'Не удалось загрузить приглашение');
        setInvite(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Приглашение не найдено');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInvite();

    const checkAuth = async () => {
      try {
        const data = await apiFetch('/api/auth/me', { bypassOfflineCache: true, cache: 'no-store' });
        if (data.user) setUser(data.user);
      } catch (e) {}
    };
    checkAuth();

    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (invite && !invite.expired && !invite.used && user && (user.phone === invite.phone || ['ADMIN', 'LEADER'].includes(user.role))) {
      acceptInvite();
    }
  }, [invite, user]);

  const acceptInvite = async () => {
    try {
      setSubmitting(true);
      const data = await apiFetch(`/api/invites/${token}/accept`, {
        method: 'POST',
        bypassOfflineCache: true,
        cache: 'no-store',
      });
      if (!data.ok) throw new Error(data.error || 'Не удалось принять приглашение');
      router.push(`/chats?chat=${data.chatId}`);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Не удалось присоединиться');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!formData.name.trim()) { setError('Введите имя'); return; }
    if (formData.password && formData.password.length < 6) { setError('Пароль должен быть не короче 6 символов'); return; }
    if (formData.password !== formData.confirmPassword) { setError('Пароли не совпадают'); return; }

    try {
      setSubmitting(true);
      setError('');

      let avatarDataUrl = null;
      if (avatarFile) {
        try {
          const compressed = await compressImage(avatarFile);
          const reader = new FileReader();
          avatarDataUrl = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(compressed);
          });
        } catch (e) {
          console.warn('Avatar compression failed:', e);
        }
      }

      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, inviteToken: token, avatarDataUrl }),
        bypassOfflineCache: true,
        cache: 'no-store',
      });
      if (!data.ok) throw new Error(data.error || 'Не удалось зарегистрироваться');
      router.push(`/chats?chat=${data.chatId}`);
      router.refresh();
    } catch (err) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginClick = () => {
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="text-center max-w-md">
          <svg viewBox="0 0 24 24" className="mx-auto h-16 w-16 text-rose-500" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">Приглашение недействительно</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">{error}</p>
          <button onClick={handleLoginClick} className="mt-6 rounded-lg bg-emerald-700 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Войти в аккаунт</button>
        </div>
      </div>
    );
  }

  if (invite?.expired || invite?.used) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="text-center max-w-md">
          <svg viewBox="0 0 24 24" className="mx-auto h-16 w-16 text-amber-500" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">Приглашение недействительно</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {invite.expired ? 'Срок действия приглашения истёк (7 дней).' : 'Это приглашение уже было использовано.'}
          </p>
          <button onClick={handleLoginClick} className="mt-6 rounded-lg bg-emerald-700 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Войти в аккаунт</button>
        </div>
      </div>
    );
  }

  if (user && user.phone !== invite.phone && !['ADMIN', 'LEADER'].includes(user.role)) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="text-center max-w-md">
          <svg viewBox="0 0 24 24" className="mx-auto h-16 w-16 text-amber-500" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">Приглашение для другого номера</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Это приглашение предназначено для номера <strong>{invite.phone}</strong>.</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Выйдите из аккаунта и перейдите по ссылке снова, чтобы присоединиться.</p>
          <button onClick={handleLoginClick} className="mt-6 rounded-lg bg-emerald-700 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-600">Выйти и войти по номеру приглашения</button>
        </div>
      </div>
    );
  }

  if (user && (user.phone === invite.phone || ['ADMIN', 'LEADER'].includes(user.role))) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="text-center max-w-md">
          <svg viewBox="0 0 24 24" className="mx-auto h-16 w-16 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">Приглашение в личный чат</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">{invite.inviterName} приглашает вас в личный чат</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Нажмите кнопку ниже, чтобы присоединиться.</p>
          <button onClick={acceptInvite} disabled={submitting} className="mt-6 rounded-lg bg-emerald-700 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
            {submitting ? 'Присоединяем…' : 'Присоединиться'}
          </button>
          {error && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="text-center mb-6">
          <svg viewBox="0 0 24 24" className="mx-auto h-12 w-12 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">Приглашение в личный чат</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">{invite?.inviterName} приглашает вас в личный чат</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="flex justify-center mb-4">
            <label className="relative cursor-pointer group">
              <div className="w-20 h-20 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center transition-colors group-hover:border-emerald-500">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Аватар" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-10 h-10 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      setAvatarFile(file);
                      const reader = new FileReader();
                      reader.onload = (event) => setAvatarPreview(event.target.result);
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Загрузить аватарку"
                />
                {!avatarPreview && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-800/80 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    Добавить фото
                  </span>
                )}
              </div>
            </label>
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Имя</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              autoComplete="name"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Номер телефона</label>
            <input
              id="phone"
              type="tel"
              value={formData.phone || invite?.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
              required
              autoComplete="tel"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Пароль (необязательно)</label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Оставьте пустым — вход будет только по номеру"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Минимум 6 символов, если заполняете</p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Повторите пароль</label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Оставьте пустым, если пароль не нужен"
            />
          </div>
          {error && <p className="text-sm text-rose-600 dark:text-rose-400 text-center">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {submitting ? 'Регистрация…' : 'Зарегистрироваться и присоединиться'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Уже есть аккаунт?{' '}
          <button onClick={handleLoginClick} className="font-semibold text-emerald-700 dark:text-emerald-300 hover:underline">Войти</button>
        </p>
      </div>
    </div>
  );
}