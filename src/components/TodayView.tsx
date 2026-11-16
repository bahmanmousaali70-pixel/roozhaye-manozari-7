import React, {useEffect, useMemo, useState} from 'react';
import {
  Bell,
  Check,
  Flame,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  formatJalaliFull,
  getDayPart,
  getLastNDaysKeys,
  getTodayKey,
  toPersianDigits,
  VOICE_PERSONAS,
} from '../data/persianLibrary';
import {playSoftChime} from '../services/speechEngine';
import type {
  GoalCategory,
  GoalItem,
  GoalScope,
  HabitItem,
  MorningMessage,
  OwnerRole,
  TimeBlock,
  VoiceName,
} from '../types/app';

interface TodayViewProps {
  goals: GoalItem[];
  habits: HabitItem[];
  morningMessage: MorningMessage;
  isOnline: boolean;
  isSpeaking: boolean;
  speechSourceLabel: string;
  myName: string;
  partnerName: string;
  defaultVoice: VoiceName;
  onChangeDefaultVoice: (voice: VoiceName) => void;
  onAddGoal: (goal: Omit<GoalItem, 'id' | 'createdAt' | 'completed' | 'dateKey'>) => void;
  onToggleGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
  onToggleHabitDate: (habitId: string, dateKey: string) => void;
  onAddHabit: (title: string, owner: OwnerRole) => void;
  onDeleteHabit: (id: string) => void;
  onCycleOfflineMessage: () => void;
  onGenerateAiMessage: () => Promise<void>;
  isGeneratingAi: boolean;
  onSpeakText: (text: string, title: string, category: 'morning' | 'energy') => void;
  onStopSpeech: () => void;
}

const CATEGORY_LABELS: Record<GoalCategory, string> = {
  purpose: 'هدفمندی',
  work: 'کار و پروژه',
  health: 'سلامتی',
  relationship: 'رابطه ما',
  growth: 'رشد فردی',
};

const TIME_BLOCK_LABELS: Record<TimeBlock, string> = {
  morning: 'صبح',
  afternoon: 'ظهر و عصر',
  evening: 'شب',
};

export const TodayView: React.FC<TodayViewProps> = ({
  goals,
  habits,
  morningMessage,
  isOnline,
  isSpeaking,
  speechSourceLabel,
  myName,
  partnerName,
  defaultVoice,
  onChangeDefaultVoice,
  onAddGoal,
  onToggleGoal,
  onDeleteGoal,
  onToggleHabitDate,
  onAddHabit,
  onDeleteHabit,
  onCycleOfflineMessage,
  onGenerateAiMessage,
  isGeneratingAi,
  onSpeakText,
  onStopSpeech,
}) => {
  const todayKey = getTodayKey();
  const jalaliToday = useMemo(() => formatJalaliFull(new Date()), []);
  const dayPart = getDayPart();
  const last7Days = useMemo(() => getLastNDaysKeys(7), []);

  const [ownerFilter, setOwnerFilter] = useState<'all' | OwnerRole>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | GoalScope>('all');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalOwner, setGoalOwner] = useState<OwnerRole>('both');
  const [goalScope, setGoalScope] = useState<GoalScope>('home');
  const [goalCategory, setGoalCategory] = useState<GoalCategory>('purpose');
  const [goalBlock, setGoalBlock] = useState<TimeBlock>('morning');
  const [goalPriority, setGoalPriority] = useState<'high' | 'normal'>('high');
  const [goalReminderTime, setGoalReminderTime] = useState('');

  const [habitTitle, setHabitTitle] = useState('');
  const [habitOwner, setHabitOwner] = useState<OwnerRole>('both');

  // Focus timer (25 min focus / 5 min break)
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          playSoftChime('chime');
          const finishText =
            timerMode === 'focus'
              ? 'آفرین! زمان تمرکز بیست و پنج دقیقه‌ای به پایان رسید. حالا پنج دقیقه استراحت کنید.'
              : 'استراحت تمام شد. با انرژی تازه به سراغ قدم بعدی برویم.';
          onSpeakText(finishText, 'اعلام پایان تایمر', 'energy');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, timerMode, onSpeakText]);

  const switchTimerMode = (mode: 'focus' | 'break') => {
    setTimerRunning(false);
    setTimerMode(mode);
    setSecondsLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const inferScope = (g: GoalItem): GoalScope => g.scope ?? (g.category === 'work' ? 'work' : 'home');

  const todayGoals = useMemo(() => {
    return goals
      .filter((g) => g.dateKey === todayKey)
      .filter((g) => (ownerFilter === 'all' ? true : g.owner === ownerFilter))
      .filter((g) => (scopeFilter === 'all' ? true : inferScope(g) === scopeFilter));
  }, [goals, todayKey, ownerFilter, scopeFilter]);

  const allTodayGoals = useMemo(() => goals.filter((g) => g.dateKey === todayKey), [goals, todayKey]);
  const completedCount = allTodayGoals.filter((g) => g.completed).length;
  const totalCount = allTodayGoals.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const ownerLabel = (owner: OwnerRole) => {
    if (owner === 'man') return myName;
    if (owner === 'zari') return partnerName;
    return `${myName} و ${partnerName}`;
  };

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    onAddGoal({
      title: goalTitle.trim(),
      owner: goalOwner,
      scope: goalScope,
      category: goalCategory,
      timeBlock: goalBlock,
      priority: goalPriority,
      reminderTime: goalReminderTime.trim() || undefined,
      reminderVoice: goalReminderTime.trim() ? defaultVoice : undefined,
    });
    setGoalTitle('');
    setGoalReminderTime('');
  };

  const handleHabitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitTitle.trim()) return;
    onAddHabit(habitTitle.trim(), habitOwner);
    setHabitTitle('');
  };

  const greetingTitle =
    dayPart === 'morning'
      ? `صبح بخیر، ${myName} و ${partnerName}`
      : dayPart === 'midday'
        ? `روز بخیر، ${myName} و ${partnerName}`
        : `شب بخیر، ${myName} و ${partnerName}`;

  const fullMorningAudioText = `${morningMessage.title}. ${morningMessage.message} جمله تاکیدی امروز: ${morningMessage.affirmation}. پیشنهاد انرژی: ${morningMessage.energyTip}`;

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="space-y-8">
      {/* Editorial Hero & Morning Energy Sanctuary */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{jalaliToday}</span>
              <span aria-hidden="true">·</span>
              <span>{isOnline ? 'متصل و آماده هوش مصنوعی' : 'حالت آفلاین کامل'}</span>
              {speechSourceLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">{speechSourceLabel}</span>
                </>
              )}
            </div>

            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight text-balance">
              {greetingTitle}
            </h1>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-emerald-950/60">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                پیام انرژی‌بخش امروز · {morningMessage.title}
              </div>
              <p className="mt-2.5 text-base leading-8 text-slate-700 dark:text-slate-200 max-w-2xl">
                {morningMessage.message}
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-emerald-950/50 text-sm">
                <div>
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">جمله تاکیدی امروز</div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300 leading-7">{morningMessage.affirmation}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">گام کوچک انرژی</div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300 leading-7">{morningMessage.energyTip}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-emerald-950/60 flex flex-wrap items-center gap-3">
            {isSpeaking ? (
              <button
                type="button"
                onClick={onStopSpeech}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>توقف پخش</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSpeakText(fullMorningAudioText, morningMessage.title, 'morning')}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>شنیدن با صدای روان فارسی</span>
              </button>
            )}

            <select
              value={defaultVoice}
              onChange={(e) => onChangeDefaultVoice(e.target.value as VoiceName)}
              aria-label="انتخاب گوینده"
              className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {VOICE_PERSONAS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onCycleOfflineMessage}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>پیام دیگر (آفلاین)</span>
            </button>

            <button
              type="button"
              onClick={onGenerateAiMessage}
              disabled={!isOnline || isGeneratingAi}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGeneratingAi ? 'در حال نگارش...' : 'پیام تازه هوشمند'}</span>
            </button>
          </div>
        </div>

        {/* Right Summary & Pomodoro Column */}
        <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">پیشرفت هدفمند امروز</h2>
              <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {toPersianDigits(progressPct)}٪
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-slate-100 dark:bg-emerald-950 overflow-hidden">
              <div
                className="h-full bg-emerald-700 dark:bg-emerald-500 transition-all duration-300"
                style={{width: `${progressPct}%`}}
              />
            </div>
            <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {toPersianDigits(completedCount)} از {toPersianDigits(totalCount)} برنامه امروز تکمیل شده است
            </p>
          </div>

          <div className="pt-5 border-t border-slate-100 dark:border-emerald-950/60">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">تایمر تمرکز عمیق</h2>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => switchTimerMode('focus')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    timerMode === 'focus'
                      ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  تمرکز ۲۵د
                </button>
                <button
                  type="button"
                  onClick={() => switchTimerMode('break')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    timerMode === 'break'
                      ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  استراحت ۵د
                </button>
              </div>
            </div>

            <div className="mt-4 text-center py-3">
              <div className="font-mono-num text-4xl font-bold tracking-wider text-slate-900 dark:text-white" dir="ltr">
                {toPersianDigits(mins)}:{toPersianDigits(secs)}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTimerRunning((r) => !r)}
                className="flex-1 min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{timerRunning ? 'توقف موقت' : 'شروع تمرکز'}</span>
              </button>
              <button
                type="button"
                onClick={() => switchTimerMode(timerMode)}
                aria-label="بازنشانی تایمر"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-emerald-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-emerald-950/40 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Split: Purposeful Daily Goals & 7-Day Habits */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Goals */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">برنامه‌ها و اهداف امروز</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                تفکیک‌شده برای {myName}، {partnerName} و کارهای مشترک
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl">
                {(
                  [
                    {id: 'all', label: 'همه'},
                    {id: 'both', label: 'مشترک'},
                    {id: 'man', label: myName},
                    {id: 'zari', label: partnerName},
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOwnerFilter(tab.id)}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      ownerFilter === tab.id
                        ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl">
                {(
                  [
                    {id: 'all', label: 'خانه و کار'},
                    {id: 'home', label: 'خانه'},
                    {id: 'work', label: 'کاری'},
                  ] as const
                ).map((sTab) => (
                  <button
                    key={sTab.id}
                    type="button"
                    onClick={() => setScopeFilter(sTab.id)}
                    className={`min-h-[36px] px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      scopeFilter === sTab.id
                        ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {sTab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleGoalSubmit} className="mt-5 space-y-3 pb-5 border-b border-slate-100 dark:border-emerald-950/60">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="هدف یا کار خونه / کاری امروز را بنویسید..."
                className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
              />
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <select
                value={goalOwner}
                onChange={(e) => setGoalOwner(e.target.value as OwnerRole)}
                aria-label="مسئول انجام"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="both">مشترک (هر دو)</option>
                <option value="man">تکی: {myName}</option>
                <option value="zari">تکی: {partnerName}</option>
              </select>

              <select
                value={goalScope}
                onChange={(e) => setGoalScope(e.target.value as GoalScope)}
                aria-label="حوزه کار"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="home">کار خانه</option>
                <option value="work">امور کاری</option>
              </select>

              <select
                value={goalCategory}
                onChange={(e) => setGoalCategory(e.target.value as GoalCategory)}
                aria-label="دسته‌بندی"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              <select
                value={goalBlock}
                onChange={(e) => setGoalBlock(e.target.value as TimeBlock)}
                aria-label="زمان روز"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                {Object.entries(TIME_BLOCK_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              <select
                value={goalPriority}
                onChange={(e) => setGoalPriority(e.target.value as 'high' | 'normal')}
                aria-label="اولویت"
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="high">اولویت بالا</option>
                <option value="normal">عادی</option>
              </select>

              <div className="relative flex items-center" title="ساعت یادآور صوتی این هدف (اختیاری)">
                <Bell className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
                <input
                  type="time"
                  value={goalReminderTime}
                  onChange={(e) => setGoalReminderTime(e.target.value)}
                  aria-label="ساعت یادآور صوتی"
                  className="w-full min-h-[40px] pr-7 pl-2 rounded-lg border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs font-mono-num text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          </form>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-emerald-950/60">
            {todayGoals.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                هنوز برنامه‌ای در این بخش ثبت نشده است. اولین هدف امروزتان را اضافه کنید.
              </div>
            ) : (
              todayGoals.map((goal) => (
                <div key={goal.id} className="py-3.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onToggleGoal(goal.id)}
                    className="flex-1 min-h-[44px] flex items-center gap-3 text-right cursor-pointer group"
                  >
                    <span
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        goal.completed
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'border-slate-300 dark:border-emerald-800 group-hover:border-emerald-600'
                      }`}
                    >
                      {goal.completed && <Check className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium transition-colors ${
                          goal.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {goal.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>{ownerLabel(goal.owner)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{inferScope(goal) === 'work' ? 'کاری' : 'خانه'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{CATEGORY_LABELS[goal.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{TIME_BLOCK_LABELS[goal.timeBlock]}</span>
                        {goal.reminderTime && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
                              یادآور صوتی {toPersianDigits(goal.reminderTime)}
                            </span>
                          </>
                        )}
                        {goal.priority === 'high' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">اولویت بالا</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteGoal(goal.id)}
                    aria-label="حذف هدف"
                    className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 7-Day Habit Streaks */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">ردیاب عادت‌های روزانه</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            تداوم کوچک هر روز، کیفیت زندگی مشترکمان را می‌سازد
          </p>

          <form onSubmit={handleHabitSubmit} className="mt-4 flex flex-col sm:flex-row gap-2 pb-4 border-b border-slate-100 dark:border-emerald-950/60">
            <input
              type="text"
              value={habitTitle}
              onChange={(e) => setHabitTitle(e.target.value)}
              placeholder="عادت جدید (مثلاً ۲۰ دقیقه پیاده‌روی)"
              className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
            />
            <div className="flex gap-2">
              <select
                value={habitOwner}
                onChange={(e) => setHabitOwner(e.target.value as OwnerRole)}
                className="min-h-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="both">مشترک</option>
                <option value="man">{myName}</option>
                <option value="zari">{partnerName}</option>
              </select>
              <button
                type="submit"
                aria-label="افزودن عادت"
                className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-4">
            {habits.map((habit) => {
              const streak = habit.completedDates.length;
              return (
                <div key={habit.id} className="pb-4 border-b last:border-b-0 border-slate-100 dark:border-emerald-950/50">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{habit.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{ownerLabel(habit.owner)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 tabular-nums">
                          <Flame className="w-3.5 h-3.5" />
                          {toPersianDigits(streak)} روز ثبت‌شده
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteHabit(habit.id)}
                      aria-label="حذف عادت"
                      className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-7 gap-1.5">
                    {last7Days.map((day) => {
                      const done = habit.completedDates.includes(day.key);
                      const isToday = day.key === todayKey;
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => onToggleHabitDate(habit.id, day.key)}
                          className={`min-h-[44px] rounded-xl flex flex-col items-center justify-center text-[11px] transition-colors cursor-pointer ${
                            done
                              ? 'bg-emerald-700 text-white font-semibold'
                              : isToday
                                ? 'border border-emerald-600 text-emerald-800 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30'
                                : 'bg-slate-100 dark:bg-emerald-950/40 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <span className="text-[10px] opacity-80">{day.shortDay}</span>
                          <span className="tabular-nums font-medium">{day.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
