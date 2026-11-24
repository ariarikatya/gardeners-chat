'use client';

import { useEffect, useRef, useState } from 'react';
import apiFetch from '@/lib/apiFetch';
import { normalizePhoneDigits } from '@/lib/phone';

const CLIENT_VERSION = typeof window !== 'undefined' ? window.CLIENT_VERSION : 'v1.0.0-chat';

export default function SettingsDrawer({ open, onClose, user, onUpdateUser }) {
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);
  const [savedToast, setSavedToast] = useState(false);
  const savedToastTimer = useRef(null);
  const showSavedToast = () => {
    setSavedToast(true);
    if (savedToastTimer.current) clearTimeout(savedToastTimer.current);
    savedToastTimer.current = setTimeout(() => setSavedToast(false), 5000);
  };
  const [activeSection, setActiveSection] = useState('profile');
  const [profileData, setProfileData] = useState({ name: '', phone: '' });
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [theme, setTheme] = useState('system');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState('');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [hidePhone, setHidePhone] = useState(user?.hidePhone ?? true);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setActiveSection('profile');
      setProfileData({ name: user?.name || '', phone: user?.phone || '' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setError('');
      setToast('');
      setHidePhone(user?.hidePhone ?? true);
      const savedTheme = localStorage.getItem('chat_theme');
      setTheme(savedTheme || 'system');
      checkPushSubscription();
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      setActiveSection('profile');
      setError('');
      setToast('');
      setDeleteConfirm(false);
      setDeletePassword('');
    }
  }, [open]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const applyTheme = (newTheme) => {
    const root = document.documentElement;
    root.classList.remove('dark');
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.classList.add('dark');
    }
    localStorage.setItem('chat_theme', newTheme);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('chat_theme');
      if (savedTheme) {
        applyTheme(savedTheme);
      } else {
        applyTheme('system');
      }
    }
  }, []);

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const handleProfileSave = async () => {
    setSaving(true);
    setError('');
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    try {
      const body = {
        name: profileData.name.trim(),
        phone: normalizePhoneDigits(profileData.phone),
        hidePhone,
      };
      if (passwordData.currentPassword || passwordData.newPassword || passwordData.confirmPassword) {
        if (!passwordData.currentPassword) {
          throw new Error('Введите текущий пароль');
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
          throw new Error('Новые пароли не совпадают');
        }
        if (passwordData.newPassword.length < 6) {
          throw new Error('Новый пароль должен быть не короче 6 символов');
        }
        body.currentPassword = passwordData.currentPassword;
        body.newPassword = passwordData.newPassword;
      }
      const response = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить профиль');
      setProfileData({ name: data.user.name, phone: data.user.phone });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
      showSavedToast();
      if (onUpdateUser) onUpdateUser(data.user);
    } catch (err) {
      setError(err.message || 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('Очистить весь кэш приложения? Это может замедлить следующую загрузку.')) return;
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('offline_') || key === 'phone_roles_map')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      window.location.reload();
    } catch (err) {
      setError('Не удалось очистить кэш: ' + err.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    if (!deletePassword) {
      setError('Введите пароль для подтверждения');
      return;
    }
    setDeleting(true);
    setError('');
    try {
      const response = await apiFetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось удалить аккаунт');
      try {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('chat_theme');
        sessionStorage.clear();
      } catch (e) {}
      window.location.assign('/login');
    } catch (err) {
      setError(err.message || 'Ошибка при удалении аккаунт');
      setDeleting(false);
    }
  };

  const checkPushSubscription = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const response = await apiFetch('/api/auth/me');
      const data = await response.json();
      if (data.user) {
        const subResponse = await apiFetch('/api/push/subscribe', { method: 'GET' });
        // We can't easily check subscription without a dedicated endpoint, so we'll check via service worker
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushSubscribed(!!subscription);
      }
    } catch (e) {
      console.warn('Failed to check push subscription:', e);
    }
  };

  const handlePushSubscribe = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPushLoading(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Разрешение на уведомления не получено');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const vapidResponse = await fetch('/api/push/vapid-public-key');
      const { key } = await vapidResponse.json();
      if (!key) {
        setError('VAPID ключ не настроен на сервере');
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      await apiFetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))),
        }),
      });
      setPushSubscribed(true);
      setToast('Уведомления включены');
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setToast('');
        toastTimerRef.current = null;
      }, 3000);
    } catch (err) {
      setError(err.message || 'Не удалось включить уведомления');
    } finally {
      setPushLoading(false);
    }
  };

  const handlePushUnsubscribe = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPushLoading(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await apiFetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      setPushSubscribed(false);
      setToast('Уведомления выключены');
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setToast('');
        toastTimerRef.current = null;
      }, 3000);
    } catch (err) {
      setError(err.message || 'Не удалось выключить уведомления');
    } finally {
      setPushLoading(false);
    }
  };

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  if (!open) return null;

  const sections = [
    { id: 'profile', label: 'Профиль', icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    )},
    { id: 'appearance', label: 'Оформление', icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
    )},
    { id: 'about', label: 'Об приложении', icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
    )},
    { id: 'delete', label: 'Удалить аккаунт', icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
    )},
  ];

  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-900 shadow-xl flex flex-col animate-slide-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 id="settings-title" className="font-semibold text-slate-800 dark:text-slate-100">Настройки</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <nav className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto" role="tablist" aria-label="Разделы настроек">
          <div className="flex gap-1 min-w-max">
            {sections.map((section) => (
              <button
                key={section.id}
                role="tab"
                aria-selected={activeSection === section.id}
                onClick={() => { setActiveSection(section.id); setError(''); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === section.id
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {section.icon}
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-sm text-rose-800 dark:text-rose-200 flex items-center justify-between gap-3">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} aria-label="Закрыть">×</button>
            </div>
        )}

          {activeSection === 'profile' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Профиль</h3>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Имя</label>
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Номер телефона</label>
                <input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value.replace(/\D/g, '') })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={hidePhone}
                    onChange={(e) => setHidePhone(e.target.checked)}
                    className="h-4 w-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="font-medium text-slate-800 dark:text-slate-100">Скрывать мой номер телефона</span>
                </label>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                <h4 className="font-medium text-slate-800 dark:text-slate-100 mb-3">Смена пароля</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Текущий пароль</label>
                    <input
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Новый пароль</label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Повторите новый пароль</label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Оставьте поля пустыми, чтобы не менять пароль</p>
                </div>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                <h4 className="font-medium text-slate-800 dark:text-slate-100 mb-3">Уведомления</h4>
                <div className="space-y-3">
                  {typeof window !== 'undefined' && 'Notification' in window ? (
                    Notification.permission === 'default' ? (
                      <button
                        type="button"
                        onClick={handlePushSubscribe}
                        disabled={pushLoading}
                        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pushLoading ? 'Подключение…' : 'Включить уведомления'}
                      </button>
                    ) : Notification.permission === 'granted' ? (
                      pushSubscribed ? (
                        <button
                          type="button"
                          onClick={handlePushUnsubscribe}
                          disabled={pushLoading}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
                        >
                          {pushLoading ? 'Отключение…' : 'Выключить уведомления'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePushSubscribe}
                          disabled={pushLoading}
                          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {pushLoading ? 'Подключение…' : 'Включить уведомления'}
                        </button>
                      )
                    ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-400">Уведомления запрещены в настройках браузера</p>
                    )
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">Уведомления не поддерживаются в этом браузере</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleProfileSave}
                disabled={saving}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Тема оформления</h3>
              <div className="space-y-3">
                {['light', 'dark', 'system'].map((t) => (
                  <label key={t} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <input
                      type="radio"
                      name="theme"
                      value={t}
                      checked={theme === t}
                      onChange={() => handleThemeChange(t)}
                      className="h-4 w-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-100 capitalize">
                      {t === 'light' ? 'Светлая' : t === 'dark' ? 'Тёмная' : 'Системная'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'about' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Об приложении</h3>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500 dark:text-slate-400">Версия</span>
                  <span className="font-mono text-slate-800 dark:text-slate-100">{CLIENT_VERSION}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500 dark:text-slate-400">Платформа</span>
                  <span className="font-mono text-slate-800 dark:text-slate-100">Next.js + React + Prisma + Tailwind</span>
                </div>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Очистка кэша удалит все локальные данные (Service Worker кэш, offline-ключи), но не выйдет из аккаунта.</p>
                <button
                  type="button"
                  onClick={handleClearCache}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Очистить кэш
                </button>
              </div>
            </div>
          )}

          {activeSection === 'delete' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Удалить аккаунт</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Это действие необратимо. Все ваши данные, чаты и сообщения будут удалены навсегда.</p>
              {!deleteConfirm ? (
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="w-full rounded-lg bg-rose-100 border border-rose-300 text-rose-700 px-4 py-2 text-sm font-semibold hover:bg-rose-200"
                >
                  Удалить аккаунт
                </button>
              ) : (
                <div className="space-y-3 p-4 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                  <p className="text-sm text-rose-800 dark:text-rose-200 font-medium">Подтвердите удаление — введите пароль</p>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Ваш пароль"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setDeleteConfirm(false); setDeletePassword(''); }}
                      className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleting ? 'Удаление…' : 'Удалить навсегда'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[310] -translate-x-1/2 flex items-center gap-2 rounded-full bg-slate-900/95 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-slate-800/95">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 10.5 4 4 8-9" /></svg>
          <span>{toast}</span>
        </div>
      )}
      {savedToast && (
        <div className="fixed top-6 left-1/2 z-[300] -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          ✓ Сохранено
        </div>
      )}
    </div>
  );
}