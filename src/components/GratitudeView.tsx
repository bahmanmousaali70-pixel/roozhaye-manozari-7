import React, {useMemo, useState} from 'react';
import {Heart, Plus, Search, Square, Trash2, Volume2} from 'lucide-react';
import {
  formatJalaliFull,
  getTodayKey,
  INSTANT_ENERGY_BOOSTERS,
  toPersianDigits,
} from '../data/persianLibrary';
import type {GratitudeEntry, MoodType, OwnerRole} from '../types/app';

interface GratitudeViewProps {
  entries: GratitudeEntry[];
  myName: string;
  partnerName: string;
  isSpeaking: boolean;
  onAddEntry: (entry: Omit<GratitudeEntry, 'id' | 'createdAt' | 'dateKey' | 'jalaliDate'>) => void;
  onDeleteEntry: (id: string) => void;
  onSpeakText: (text: string, title: string, category: 'gratitude' | 'energy') => void;
  onStopSpeech: () => void;
}

const MOOD_OPTIONS: {id: MoodType; label: string}[] = [
  {id: 'grateful', label: 'سپاسگزار'},
  {id: 'energetic', label: 'پرانرژی'},
  {id: 'calm', label: 'آرام'},
  {id: 'focused', label: 'متمرکز'},
  {id: 'needs_boost', label: 'نیازمند انگیزه'},
];

export const GratitudeView: React.FC<GratitudeViewProps> = ({
  entries,
  myName,
  partnerName,
  isSpeaking,
  onAddEntry,
  onDeleteEntry,
  onSpeakText,
  onStopSpeech,
}) => {
  const [author, setAuthor] = useState<OwnerRole>('both');
  const [mood, setMood] = useState<MoodType>('grateful');
  const [item1, setItem1] = useState('');
  const [item2, setItem2] = useState('');
  const [item3, setItem3] = useState('');
  const [loveNote, setLoveNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [boosterCategory, setBoosterCategory] = useState<string>('همه');

  const todayJalali = useMemo(() => formatJalaliFull(new Date()), []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item1.trim() && !item2.trim() && !item3.trim() && !loveNote.trim()) return;
    onAddEntry({
      author,
      mood,
      items: [
        item1.trim() || 'سلامتی و نفس تازه امروز',
        item2.trim() || 'همراهی و مهر بین من و زری',
        item3.trim() || 'فرصت ساختن روزی هدفمند',
      ],
      loveNote: loveNote.trim(),
    });
    setItem1('');
    setItem2('');
    setItem3('');
    setLoveNote('');
  };

  const authorText = (role: OwnerRole) => {
    if (role === 'man') return myName;
    if (role === 'zari') return partnerName;
    return `${myName} و ${partnerName}`;
  };

  const moodText = (m: MoodType) => MOOD_OPTIONS.find((x) => x.id === m)?.label ?? 'سپاسگزار';

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (entry) =>
        entry.items.some((i) => i.toLowerCase().includes(q)) ||
        entry.loveNote.toLowerCase().includes(q) ||
        entry.jalaliDate.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const boosterCategories = ['همه', ...Array.from(new Set(INSTANT_ENERGY_BOOSTERS.map((b) => b.category)))];
  const visibleBoosters = INSTANT_ENERGY_BOOSTERS.filter((b) =>
    boosterCategory === 'همه' ? true : b.category === boosterCategory
  );

  const todayCount = entries.filter((e) => e.dateKey === getTodayKey()).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Composer */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {todayJalali} · ثبت‌شده امروز: {toPersianDigits(todayCount)} مورد
              </div>
              <h1 className="mt-1.5 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                دفتر شکرگذاری و قدردانی من و زری
              </h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  نویسنده یادداشت
                </label>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl">
                  {(
                    [
                      {id: 'both', label: 'مشترک'},
                      {id: 'man', label: myName},
                      {id: 'zari', label: partnerName},
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAuthor(opt.id)}
                      className={`flex-1 min-h-[38px] text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                        author === opt.id
                          ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  حال و هوای الان
                </label>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value as MoodType)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-800 dark:text-slate-100"
                >
                  {MOOD_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                سه نعمت یا اتفاق خوب که امروز بابت آن سپاسگزارید
              </label>
              <input
                type="text"
                value={item1}
                onChange={(e) => setItem1(e.target.value)}
                placeholder="۱. مثلاً: آرامش صبح و نوشیدن چای کنار زری..."
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
              />
              <input
                type="text"
                value={item2}
                onChange={(e) => setItem2(e.target.value)}
                placeholder="۲. مثلاً: سلامتی جسم و ذهن و پیشرفت کار امروز..."
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
              />
              <input
                type="text"
                value={item3}
                onChange={(e) => setItem3(e.target.value)}
                placeholder="۳. مثلاً: یک خبر خوب یا لحظه دلگرم‌کننده..."
                className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-700 dark:text-rose-400 mb-2">
                یادداشت قدردانی ویژه به {partnerName} یا {myName} (اختیاری)
              </label>
              <textarea
                rows={2}
                value={loveNote}
                onChange={(e) => setLoveNote(e.target.value)}
                placeholder="یک جمله محبت‌آمیز که هر زمان بشنوید انرژی بگیرید..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600"
              />
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ثبت در دفتر شکرگذاری</span>
            </button>
          </form>
        </section>

        {/* Instant Energy Boosters */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">بانک انرژی‌بخش فوری</h2>
            {isSpeaking && (
              <button
                type="button"
                onClick={onStopSpeech}
                className="min-h-[36px] px-3 rounded-lg bg-rose-600 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>توقف</span>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            جملات آماده با پشتیبانی کامل آفلاین و پخش صوتی فارسی
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {boosterCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setBoosterCategory(cat)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  boosterCategory === cat
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 dark:bg-emerald-950/60 text-slate-600 dark:text-slate-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {visibleBoosters.map((booster) => (
              <div
                key={booster.id}
                className="p-4 rounded-xl bg-slate-50/80 dark:bg-[#0E1816] border border-slate-200/60 dark:border-emerald-950/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      {booster.category} · {booster.title}
                    </div>
                    <p className="mt-1.5 text-sm leading-7 text-slate-700 dark:text-slate-200">{booster.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSpeakText(booster.text, booster.title, 'energy')}
                    aria-label={`پخش ${booster.title}`}
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-white dark:bg-[#162623] border border-slate-200 dark:border-emerald-900 flex items-center justify-center text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Gratitude Timeline Archive */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-emerald-950/60">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">آرشیو لحظه‌های سپاسگزاری</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              مجموع یادداشت‌های ثبت‌شده: {toPersianDigits(entries.length)} مورد
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در شکرگذاری‌ها..."
              className="w-full min-h-[44px] pr-10 pl-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEntries.length === 0 ? (
            <div className="col-span-full py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              موردی یافت نشد.
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const spokenSummary = `شکرگذاری ${entry.jalaliDate}. ${entry.items.join('، ')}. ${entry.loveNote ? `یادداشت قدردانی: ${entry.loveNote}` : ''}`;
              return (
                <article
                  key={entry.id}
                  className="p-5 rounded-xl bg-slate-50/60 dark:bg-[#0E1816] border border-slate-200/60 dark:border-emerald-950/60 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {entry.jalaliDate} · {authorText(entry.author)} · {moodText(entry.mood)}
                      </span>
                    </div>

                    <ul className="mt-3 space-y-2 text-sm text-slate-800 dark:text-slate-200 leading-7">
                      {entry.items.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                            {toPersianDigits(idx + 1)}.
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>

                    {entry.loveNote && (
                      <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-emerald-950/60 flex items-start gap-2 text-sm text-rose-800 dark:text-rose-300">
                        <Heart className="w-4 h-4 shrink-0 mt-1" />
                        <p className="leading-7">{entry.loveNote}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-200/60 dark:border-emerald-950/60">
                    <button
                      type="button"
                      onClick={() => onSpeakText(spokenSummary, `شکرگذاری ${entry.jalaliDate}`, 'gratitude')}
                      className="min-h-[40px] px-3 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>شنیدن با صدای فارسی</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      aria-label="حذف یادداشت"
                      className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
