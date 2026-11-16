import React, {useMemo, useState} from 'react';
import {
  CheckCircle2,
  CloudDownload,
  Download,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  PERSIAN_VOICE_PACK_ITEMS,
  toPersianDigits,
  VOICE_PERSONAS,
} from '../data/persianLibrary';
import {
  clearAllAudioClips,
  deleteAudioClip,
  getAudioClipBuffer,
  hashTextKey,
} from '../services/audioLibraryDb';
import {
  generateAndCacheGeminiWav,
  playCachedClipById,
  speakOfflineBilingual,
  unlockAudioPlayback,
} from '../services/speechEngine';
import type {AudioLibraryEntry, VoiceName} from '../types/app';

interface VoiceLibraryViewProps {
  clips: AudioLibraryEntry[];
  isOnline: boolean;
  isSpeaking: boolean;
  defaultVoice: VoiceName;
  speechRate: number;
  onRefreshClips: () => Promise<void>;
  onStopSpeech: () => void;
  onUpdateRate: (rate: number) => void;
  onStatusToast: (msg: string) => void;
}

const STYLE_PRESETS = [
  {
    id: 'warm',
    label: 'گرم و صبحگاهی',
    prompt: 'Warm, cheerful, fluent Tehran Persian speaker with natural cadence.',
  },
  {
    id: 'calm',
    label: 'آرام و دلنشین (شکرگذاری)',
    prompt: 'Calm, gentle, heartfelt Persian voice for gratitude and relaxation.',
  },
  {
    id: 'bilingual',
    label: 'شفاف و دوزبانه (فارسی + لاتین)',
    prompt: 'Crisp bilingual Persian and English announcer. Pronounce Persian naturally and English words clearly.',
  },
];

export const VoiceLibraryView: React.FC<VoiceLibraryViewProps> = ({
  clips,
  isOnline,
  isSpeaking,
  defaultVoice,
  speechRate,
  onRefreshClips,
  onStopSpeech,
  onUpdateRate,
  onStatusToast,
}) => {
  const [customTitle, setCustomTitle] = useState('');
  const [customText, setCustomText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(defaultVoice);
  const [selectedStyleId, setSelectedStyleId] = useState('warm');
  const [isBuildingCustom, setIsBuildingCustom] = useState(false);

  const [packProgress, setPackProgress] = useState<{current: number; total: number} | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const cachedIds = useMemo(() => new Set(clips.map((c) => c.id)), [clips]);
  const totalBytes = useMemo(() => clips.reduce((acc, c) => acc + c.byteSize, 0), [clips]);
  const totalSizeLabel =
    totalBytes > 1024 * 1024
      ? `${toPersianDigits((totalBytes / (1024 * 1024)).toFixed(1))} مگابایت`
      : `${toPersianDigits(Math.round(totalBytes / 1024))} کیلوبایت`;

  const uncachedPackItems = useMemo(
    () => PERSIAN_VOICE_PACK_ITEMS.filter((item) => !cachedIds.has(item.id)),
    [cachedIds]
  );

  const handleBuildPack = async () => {
    if (!isOnline) {
      onStatusToast('برای ساخت فایل‌های جدید کتابخانه صوتی روان، اتصال اینترنت لازم است؛ پس از ساخت، همیشه آفلاین پخش می‌شوند.');
      return;
    }
    const targets = PERSIAN_VOICE_PACK_ITEMS.filter(
      (item) => !cachedIds.has(`${item.id}__${selectedVoice}`)
    );
    const listToBuild = targets.length > 0 ? targets : PERSIAN_VOICE_PACK_ITEMS;
    setPackProgress({current: 0, total: listToBuild.length});

    let successCount = 0;
    let quotaHit = false;
    let lastError = '';
    for (let i = 0; i < listToBuild.length; i++) {
      const item = listToBuild[i];
      try {
        const res = await generateAndCacheGeminiWav({
          clipId: `${item.id}__${selectedVoice}`,
          text: item.text,
          title: `${item.title} (${VOICE_PERSONAS.find((v) => v.id === selectedVoice)?.label.split(' ')[0] ?? ''})`,
          category: item.pack,
          voiceName: selectedVoice,
          style: item.style,
        });
        if ('buffer' in res) {
          successCount++;
        } else {
          quotaHit = true;
          break;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error('Pack item synthesis error:', err);
      }
      setPackProgress({current: i + 1, total: listToBuild.length});
      if (i < listToBuild.length - 1) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    await onRefreshClips();
    setPackProgress(null);
    if (quotaHit && successCount === 0) {
      onStatusToast('در حال حاضر سرور صدا پاسخ نداد؛ اتصال اینترنت و فیلترشکن را بررسی کنید.');
    } else if (successCount === 0 && lastError) {
      onStatusToast(`۰ فایل ذخیره شد — علت: ${lastError}`);
    } else {
      onStatusToast(`${toPersianDigits(successCount)} فایل صوتی روان فارسی در حافظه آفلاین ذخیره شد.`);
    }
  };

  const handleClearCache = async () => {
    await clearAllAudioClips();
    await onRefreshClips();
    onStatusToast('کش صوتی پاک شد. فایل‌ها با صدای انتخابی جدید دوباره ساخته می‌شوند.');
  };

  const handleGenerateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    unlockAudioPlayback();
    const title = customTitle.trim() || customText.trim().slice(0, 32);
    const styleObj = STYLE_PRESETS.find((s) => s.id === selectedStyleId) ?? STYLE_PRESETS[0];
    const persona = VOICE_PERSONAS.find((v) => v.id === selectedVoice);

    if (!isOnline) {
      const ok = await speakOfflineBilingual(customText.trim(), speechRate, persona?.gender ?? 'female');
      onStatusToast(
        ok
          ? 'در حالت آفلاین با موتور دوزبانه دستگاه پخش شد.'
          : 'صدای آفلاین فارسی روی مرورگر این دستگاه نصب نیست.'
      );
      return;
    }

    setIsBuildingCustom(true);
    try {
      const clipId = hashTextKey(customText.trim(), selectedVoice);
      const res = await generateAndCacheGeminiWav({
        clipId,
        text: customText.trim(),
        title,
        category: 'custom',
        voiceName: selectedVoice,
        style: styleObj.prompt,
      });
      await onRefreshClips();
      if ('buffer' in res) {
        setCustomTitle('');
        setCustomText('');
        onStatusToast('فایل صوتی روان ساخته و برای استفاده آفلاین ذخیره شد.');
        setPlayingId(clipId);
        await playCachedClipById(clipId, speechRate);
        setPlayingId(null);
      } else {
        onStatusToast('پخش با صدای گفتاری دستگاه انجام شد (سهمیه ذخیره ابری امروز تکمیل شده است).');
        await speakOfflineBilingual(customText.trim(), speechRate, persona?.gender ?? 'female');
      }
    } catch (err) {
      await speakOfflineBilingual(customText.trim(), speechRate, persona?.gender ?? 'female');
      onStatusToast(err instanceof Error ? err.message : 'پخش با صدای دستگاه انجام شد.');
    } finally {
      setIsBuildingCustom(false);
    }
  };

  const handlePlayPackItem = async (item: (typeof PERSIAN_VOICE_PACK_ITEMS)[number]) => {
    unlockAudioPlayback();
    const activeVoice = selectedVoice;
    const voiceClipId = `${item.id}__${activeVoice}`;
    const persona = VOICE_PERSONAS.find((v) => v.id === activeVoice);
    setPlayingId(item.id);
    try {
      if (cachedIds.has(voiceClipId)) {
        await playCachedClipById(voiceClipId, speechRate);
      } else if (isOnline) {
        const res = await generateAndCacheGeminiWav({
          clipId: voiceClipId,
          text: item.text,
          title: `${item.title} (${persona?.label.split(' ')[0] ?? ''})`,
          category: item.pack,
          voiceName: activeVoice,
          style: item.style,
        });
        await onRefreshClips();
        if ('buffer' in res) {
          await playCachedClipById(voiceClipId, speechRate);
        } else {
          await speakOfflineBilingual(item.text, speechRate, persona?.gender ?? 'female');
        }
      } else {
        const ok = await speakOfflineBilingual(item.text, speechRate, persona?.gender ?? 'female');
        if (!ok) onStatusToast('صدای آفلاین فارسی روی این دستگاه نصب نیست.');
      }
    } catch {
      await speakOfflineBilingual(item.text, speechRate, persona?.gender ?? 'female');
    } finally {
      setPlayingId(null);
    }
  };

  const handlePlaySavedClip = async (clip: AudioLibraryEntry) => {
    unlockAudioPlayback();
    setPlayingId(clip.id);
    try {
      await playCachedClipById(clip.id, speechRate);
    } finally {
      setPlayingId(null);
    }
  };

  const handleDownloadWav = async (clip: AudioLibraryEntry) => {
    const buf = await getAudioClipBuffer(clip.id);
    if (!buf) return;
    const head = new Uint8Array(buf.slice(0, 4));
    const isWav = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    const blob = new Blob([buf], {type: isWav ? 'audio/wav' : 'audio/mpeg'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clip.title.replace(/[^\u0600-\u06FF\w-]+/g, '_')}.${isWav ? 'wav' : 'mp3'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteClip = async (id: string) => {
    await deleteAudioClip(id);
    await onRefreshClips();
  };

  return (
    <div className="space-y-8">
      {/* Header & Offline Cache Manager */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {toPersianDigits(clips.length)} فایل صوتی کش‌شده · حجم آفلاین: {totalSizeLabel} · سرعت پخش:{' '}
              {toPersianDigits(speechRate)}x
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
              کتابخانه صوتی روان فارسی (آفلاین و آنلاین)
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300 max-w-2xl">
              هر پیام یا جمله‌ای که در حالت آنلاین تولید شود به‌صورت خودکار با کیفیت استودیویی WAV در حافظه داخلی دستگاه ذخیره می‌شود تا بدون اینترنت و کاملاً روان پخش شود.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleBuildPack}
              disabled={Boolean(packProgress)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              {packProgress ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="tabular-nums">
                    در حال ساخت ({toPersianDigits(packProgress.current)} از {toPersianDigits(packProgress.total)})
                  </span>
                </>
              ) : (
                <>
                  <CloudDownload className="w-4 h-4" />
                  <span>
                    {uncachedPackItems.length > 0
                      ? `دانلود ${toPersianDigits(uncachedPackItems.length)} فایل بسته آفلاین`
                      : 'به‌روزرسانی بسته صوتی آفلاین'}
                  </span>
                </>
              )}
            </button>

            {(isSpeaking || playingId) && (
              <button
                type="button"
                onClick={() => {
                  onStopSpeech();
                  setPlayingId(null);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>توقف</span>
              </button>
            )}
          </div>
        </div>

        {/* Speed Control */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-emerald-950/60 flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">سرعت خواندن:</span>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl">
            {[0.85, 0.95, 1, 1.1, 1.2].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onUpdateRate(r)}
                className={`min-h-[36px] px-3 text-xs font-medium rounded-lg tabular-nums transition-colors cursor-pointer ${
                  speechRate === r
                    ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {toPersianDigits(r)}x
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Custom Studio */}
        <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">استودیو ساخت صوت فارسی و دوزبانه</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            متن فارسی یا ترکیبی فارسی و انگلیسی بنویسید تا با صدای روان ذخیره شود
          </p>

          <form onSubmit={handleGenerateCustom} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                عنوان کوتاه فایل
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="مثلاً: پیام صبح بخیر ویژه زری"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                متن گفتار (فارسی یا فارسی + Latin)
              </label>
              <textarea
                rows={4}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="متن دلخواه خود را بنویسید. مثلاً: زری جان صبح بخیر! جلسه امروز ساعت ده با تیم Project Alpha برگزار می‌شود."
                className="w-full px-3.5 py-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm leading-7 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  گوینده
                </label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value as VoiceName)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-100"
                >
                  {VOICE_PERSONAS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  لحن بیان
                </label>
                <select
                  value={selectedStyleId}
                  onChange={(e) => setSelectedStyleId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-100"
                >
                  {STYLE_PRESETS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isBuildingCustom || !customText.trim()}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isBuildingCustom ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال تولید صوت روان...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>{isOnline ? 'تولید و ذخیره در کتابخانه آفلاین' : 'پخش با موتور آفلاین'}</span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* Built-in Offline Packs & Saved Clips */}
        <section className="lg:col-span-7 space-y-6">
          {/* Curated Voice Packs */}
          <div className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">بسته‌های صوتی آماده</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              عبارات کلیدی روزمره برای شنیدن سریع در حالت آفلاین و آنلاین
            </p>

            <div className="mt-4 divide-y divide-slate-100 dark:divide-emerald-950/60">
              {PERSIAN_VOICE_PACK_ITEMS.map((item) => {
                const isCached = cachedIds.has(`${item.id}__${selectedVoice}`);
                const isPlayingThis = playingId === item.id;
                return (
                  <div key={item.id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <span className="truncate">{item.title}</span>
                        {isCached && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            آفلاین آماده
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-6">
                        {item.text}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePlayPackItem(item)}
                      aria-label={`پخش ${item.title}`}
                      className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      {isPlayingThis ? <Volume2 className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Saved Offline Clips in IndexedDB */}
          <div className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">فایل‌های صوتی ذخیره‌شده من (آفلاین)</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  این فایل‌ها حتی با قطع کامل اینترنت روی گوشی شما بدون تاخیر پخش می‌شوند
                </p>
              </div>
              {clips.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCache}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer shrink-0"
                >
                  پاکسازی کش
                </button>
              )}
            </div>

            {clips.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                هنوز فایل صوتی در حافظه آفلاین ذخیره نشده است. روی «دانلود بسته آفلاین» کلیک کنید.
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 dark:divide-emerald-950/60">
                {clips.map((clip) => (
                  <div key={clip.id} className="py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {clip.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {clip.voiceName} · {toPersianDigits(Math.round(clip.byteSize / 1024))} کیلوبایت
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePlaySavedClip(clip)}
                        aria-label="پخش فایل"
                        className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-700/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-700/20 flex items-center justify-center cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadWav(clip)}
                        aria-label="دانلود فایل WAV"
                        className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-emerald-950/40 flex items-center justify-center cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClip(clip.id)}
                        aria-label="حذف فایل"
                        className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
