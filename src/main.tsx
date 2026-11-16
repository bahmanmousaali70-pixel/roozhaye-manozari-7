import React from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

try {
  registerSW({immediate: true});
} catch {
  // Service worker registration skipped in unsupported WebView environments
}

class AppErrorBoundary extends React.Component<
  {children: React.ReactNode},
  {hasError: boolean; errorMsg: string}
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, errorMsg: ''};
  }

  static getDerivedStateFromError(err: unknown) {
    return {
      hasError: true,
      errorMsg: err instanceof Error ? err.message : 'خطای غیرمنتظره در نمایش صفحه',
    };
  }

  componentDidCatch(err: unknown) {
    console.error('AppErrorBoundary caught:', err);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center bg-[#F6F8F7] dark:bg-[#0B1312] px-4 py-8 text-slate-900 dark:text-slate-100"
      >
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200 dark:border-emerald-900 p-6 space-y-4 text-center shadow-sm">
          <h1 className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300">
            صفحه به شکل امن بازیابی شد
          </h1>
          <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
            تداخلی در وضعیت همگام‌سازی یا نشست موقت مرورگر رخ داد. داده‌های ذخیره‌شده شما محفوظ است.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold cursor-pointer"
            >
              تلاش مجدد و بارگذاری صفحه
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('rmz_settings_v1');
                } catch {
                  // ignore
                }
                window.location.href = '/';
              }}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
            >
              بازنشانی نشست و بازگشت به صفحه اصلی
            </button>
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
