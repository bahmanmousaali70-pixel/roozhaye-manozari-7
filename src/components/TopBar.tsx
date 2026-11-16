import React, {useState} from 'react';
import {
  AudioLines,
  Download,
  HeartHandshake,
  MoonStar,
  PhoneCall,
  RefreshCw,
  Sun,
  Volume2,
} from 'lucide-react';
import type {AppTab} from '../types/app';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface TopBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onQuickPlayMorning: () => void;
}

const NAV_ITEMS: {id: AppTab; label: string; mobileLabel: string; icon: React.FC<{className?: string}>}[] = [
  {id: 'today', label: 'امروزِ ما', mobileLabel: 'امروز', icon: Sun},
  {id: 'gratitude', label: 'شکرگذاری', mobileLabel: 'شکرگذاری', icon: HeartHandshake},
  {id: 'night', label: 'شبانه و پیام‌ساز', mobileLabel: 'شبانه', icon: MoonStar},
  {id: 'voice', label: 'کتابخانه صوتی', mobileLabel: 'صوت', icon: AudioLines},
  {id: 'caller', label: 'تماس و پیامک', mobileLabel: 'تماس‌ها', icon: PhoneCall},
  {id: 'sync', label: 'زمان‌بند و نصب', mobileLabel: 'نصب/مچ', icon: RefreshCw},
];

export const TopBar: React.FC<TopBarProps> = ({activeTab, onSelectTab, onQuickPlayMorning}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-emerald-950/70 bg-white/90 dark:bg-[#0E1816]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-13 md:h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => onSelectTab('today')}
            className="text-base md:text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-md px-1"
          >
            روزهای من و زری
          </button>

          <nav className="hidden md:flex items-center gap-6" aria-label="ناوبری اصلی">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                    active
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-emerald-700 dark:bg-emerald-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            {!isInstalled && isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نصب برنامه</span>
              </button>
            ) : !isInstalled && isIOS ? (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>نصب آیفون</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onQuickPlayMorning}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Volume2 className="w-4 h-4 shrink-0" />
                <span>پخش پیام امروز</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0E1816]/95 backdrop-blur-md border-t border-slate-200 dark:border-emerald-950/70 pb-safe"
        aria-label="ناوبری موبایل"
      >
        <div className="grid grid-cols-6 items-center h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] leading-none whitespace-nowrap">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#121E1C] p-6 border border-slate-200 dark:border-emerald-950/80 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">نصب روی آیفون و آیپد</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              ۱. دکمه <strong>اشتراک‌گذاری (Share)</strong> را در نوار پایین مرورگر Safari بزنید.
              <br />
              ۲. گزینه <strong>Add to Home Screen</strong> را انتخاب کنید.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
};
