import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import BuildVersionWatcher from '@/components/BuildVersionWatcher';
import SessionActivityTracker from '@/components/SessionActivityTracker';
import { CLIENT_VERSION } from '@/lib/pwa-env';

export const metadata = {
  title: 'Анемон Агро',
  description: 'Система управления заказами садовников',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#065f46',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://anemonagro.ru" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.CLIENT_VERSION = ${JSON.stringify(CLIENT_VERSION)};`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('chat_theme') || 'system';
                  var root = document.documentElement;
                  root.classList.remove('dark');
                  if (theme === 'dark') {
                    root.classList.add('dark');
                  } else if (theme === 'system') {
                    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                    if (prefersDark) root.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <meta name="theme-color" content="#020617" />
        <script src={`/emergency.js?v=${CLIENT_VERSION}`} defer></script>
      </head>
      <body>
        {children}
        <SessionActivityTracker />
        <BuildVersionWatcher />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
