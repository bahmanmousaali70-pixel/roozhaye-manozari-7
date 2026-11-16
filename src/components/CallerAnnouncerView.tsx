import React, {useState} from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  MessageSquare,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Smartphone,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import {toPersianDigits, VOICE_PERSONAS} from '../data/persianLibrary';
import {apiUrl} from '../services/apiConfig';
import {
  buildCallerRingtoneWav,
  getAudioClipBuffer,
  hashTextKey,
} from '../services/audioLibraryDb';
import {
  getVoiceGender,
  isNativeAndroid,
  precacheNativeWav,
  testNativeCallAnnouncement,
  testNativeSmsAnnouncement,
} from '../services/nativeAndroidBridge';
import {
  generateAndCacheGeminiWav,
  playSoftChime,
  speakFluentPersian,
  stopAllSpeech,
  unlockAudioPlayback,
} from '../services/speechEngine';
import type {AppSettings, CallerContact, VoiceName} from '../types/app';

interface CallerAnnouncerViewProps {
  callers: CallerContact[];
  isOnline: boolean;
  defaultVoice: VoiceName;
  speechRate: number;
  announceCalls: boolean;
  announceSms: boolean;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onAddCaller: (caller: Omit<CallerContact, 'id'>) => void;
  onDeleteCaller: (id: string) => void;
  onRefreshClips: () => Promise<void>;
  onStatusToast: (msg: string) => void;
}

const TEMPLATES = [
  'تماس ورودی از طرف {name}',
  '{name} زنگ می‌زند، لطفاً پاسخ دهید',
  'توجه: تماس مهم از طرف {name}',
  'Incoming call from {name}',
  'تماس از طرف {name}. Incoming call from {name}.',
];

export const CallerAnnouncerView: React.FC<CallerAnnouncerViewProps> = ({
  callers,
  isOnline,
  defaultVoice,
  speechRate,
  announceCalls,
  announceSms,
  onUpdateSettings,
  onAddCaller,
  onDeleteCaller,
  onRefreshClips,
  onStatusToast,
}) => {
  // Quick Bilingual Tester
  const [testName, setTestName] = useState('Zari جان · مدیر پروژه');
  const [testTemplate, setTestTemplate] = useState(TEMPLATES[0]);
  const [testVoice, setTestVoice] = useState<VoiceName>(defaultVoice);
  const [phoneticPreview, setPhoneticPreview] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);

  // SMS Announcer Simulator
  const [smsSender, setSmsSender] = useState('زری جان');
  const [smsBody, setSmsBody] = useState('سلام عزیزم، سر راهم نون و میوه گرفتم.');
  const [smsTesting, setSmsTesting] = useState(false);

  // Add Contact Form
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [persianPhonetic, setPersianPhonetic] = useState('');
  const [template, setTemplate] = useState(TEMPLATES[0]);
  const [repeatCount, setRepeatCount] = useState<1 | 2>(2);
  const [chimeStyle, setChimeStyle] = useState<'gentle' | 'classic' | 'chime'>('chime');
  const [voiceName, setVoiceName] = useState<VoiceName>(defaultVoice);

  // Active Incoming Call Simulator Modal
  const [simulatingCaller, setSimulatingCaller] = useState<CallerContact | null>(null);
  const [busyCallerId, setBusyCallerId] = useState<string | null>(null);
  const [precacheBusy, setPrecacheBusy] = useState(false);

  const handleTestSms = async () => {
    const sender = smsSender.trim() || 'مخاطب';
    const body = smsBody.trim() || 'پیام جدید دارید.';
    unlockAudioPlayback();
    setSmsTesting(true);
    try {
      const script = `پیامک جدید از طرف ${sender}. متن پیام: ${body}`;
      await playSoftChime('gentle');
      let hadError = false;
      const src = await speakFluentPersian({
        text: script,
        title: `پیامک از ${sender}`,
        category: 'caller',
        voiceName: testVoice,
        rate: speechRate,
        style:
          'Clear, natural bilingual Persian and English SMS reader. Pronounce Persian text smoothly and Latin sender names clearly.',
        onError: (msg) => {
          hadError = true;
          onStatusToast(msg);
        },
      });
      if (hadError && isNativeAndroid()) {
        await testNativeSmsAnnouncement(sender, body, getVoiceGender(testVoice), testVoice);
      } else if (!hadError && src === 'gemini') {
        onStatusToast('پیامک با صدای روان خوانده شد و در حافظه ذخیره گردید.');
      }
      await onRefreshClips();
    } finally {
      setSmsTesting(false);
    }
  };

  const handlePrecacheAllCallers = async () => {
    if (callers.length === 0) return;
    if (!isOnline) {
      onStatusToast('برای پیش‌ذخیره صدای مخاطبین، اتصال اینترنت لازم است.');
      return;
    }
    setPrecacheBusy(true);
    let readyCount = 0;
    try {
      for (const caller of callers) {
        const singleScript = buildSpokenScript(caller.name, caller.template);
        const clipId = hashTextKey(singleScript, caller.voiceName);
        let buffer = await getAudioClipBuffer(clipId);
        if (!buffer) {
          const res = await generateAndCacheGeminiWav({
            clipId,
            text: singleScript,
            title: `تماس: ${caller.name}`,
            category: 'caller',
            voiceName: caller.voiceName,
            style: 'Clear fluent Tehran Persian and crisp English pronunciation announcer.',
          });
          if ('buffer' in res) {
            buffer = res.buffer;
          }
          await new Promise((r) => setTimeout(r, 900));
        }
        if (buffer) {
          if (isNativeAndroid()) {
            await precacheNativeWav(singleScript, caller.voiceName, buffer);
          }
          readyCount++;
        }
      }
      await onRefreshClips();
      onStatusToast(
        `${toPersianDigits(readyCount)} مخاطب برای اعلام فوری و آفلاین تماس ورودی آماده شدند.`
      );
    } finally {
      setPrecacheBusy(false);
    }
  };

  const buildSpokenScript = (callerName: string, tmpl: string) => {
    return tmpl.replace('{name}', callerName);
  };

  const handleQuickTest = async () => {
    if (!testName.trim()) return;
    unlockAudioPlayback();
    setIsTesting(true);
    try {
      const script = buildSpokenScript(testName.trim(), testTemplate);
      await playSoftChime('chime');
      await speakFluentPersian({
        text: script,
        title: `تست تماس: ${testName.trim()}`,
        category: 'caller',
        voiceName: testVoice,
        rate: speechRate,
        style:
          'Clear, articulate bilingual Persian and English caller ID announcer. Pronounce Persian words in natural Tehran Persian and Latin names in crisp standard English.',
        onError: (msg) => onStatusToast(msg),
      });
      await onRefreshClips();
    } finally {
      setIsTesting(false);
    }
  };

  const handleSmartAnalyze = async () => {
    if (!testName.trim() || !isOnline) {
      onStatusToast('تحلیل هوشمند تلفظ نیازمند اتصال اینترنت است.');
      return;
    }
    setIsTesting(true);
    try {
      const res = await fetch(apiUrl('/api/caller-pronounce'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: testName.trim(), template: testTemplate}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhoneticPreview(
        `اسکریپت پیشنهادی: «${data.spokenScript}» · تلفظ آوایی آفلاین: «${data.persianPhonetic}»`
      );
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'خطا در تحلیل نام');
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddCaller({
      name: name.trim(),
      persianPhonetic: persianPhonetic.trim() || undefined,
      relation: relation.trim() || 'مخاطب',
      template,
      repeatCount,
      chimeStyle,
      voiceName,
      favorite: false,
    });
    setName('');
    setRelation('');
    setPersianPhonetic('');
    onStatusToast('مخاطب به دفترچه اعلام تماس اضافه شد.');
  };

  const handleSimulateCall = async (caller: CallerContact) => {
    unlockAudioPlayback();
    setSimulatingCaller(caller);
    const script = buildSpokenScript(caller.name, caller.template);
    const fullText = caller.repeatCount === 2 ? `${script}. ${script}` : script;
    const clipId = hashTextKey(fullText, caller.voiceName);

    await playSoftChime(caller.chimeStyle);
    await speakFluentPersian({
      clipId,
      text: fullText,
      title: `تماس: ${caller.name}`,
      category: 'caller',
      voiceName: caller.voiceName,
      rate: speechRate,
      style:
        'Clear, pleasant bilingual Persian and English caller ID announcer. Pronounce Persian naturally and English/Latin names clearly.',
      onError: (msg) => onStatusToast(msg),
    });
    await onRefreshClips();
  };

  const handleEndSimulation = () => {
    stopAllSpeech();
    setSimulatingCaller(null);
  };

  const handleDownloadRingtone = async (caller: CallerContact) => {
    setBusyCallerId(caller.id);
    try {
      const singleScript = buildSpokenScript(caller.name, caller.template);
      const clipId = hashTextKey(singleScript, caller.voiceName);
      let buffer = await getAudioClipBuffer(clipId);

      if (!buffer && isOnline) {
        const res = await generateAndCacheGeminiWav({
          clipId,
          text: singleScript,
          title: `نام تماس‌گیرنده: ${caller.name}`,
          category: 'caller',
          voiceName: caller.voiceName,
          style:
            'Clear, pleasant bilingual Persian and English caller ID announcer. Pronounce Persian naturally and Latin words crisply.',
        });
        if ('buffer' in res) {
          buffer = res.buffer;
          await onRefreshClips();
        }
      }

      if (!buffer) {
        onStatusToast(
          isOnline
            ? 'سهمیه موقت ساخت فایل صوتی WAV تکمیل شده است؛ پخش زنده نام مخاطب همچنان بدون مشکل فعال است.'
            : 'برای ساخت فایل WAV زنگ اختصاصی این مخاطب، یک‌بار در حالت آنلاین دکمه دانلود را بزنید تا صدای فارسی/لاتین در فایل زنگ ترکیب شود.'
        );
        return;
      }

      const ringtoneBlob = await buildCallerRingtoneWav(buffer, caller.chimeStyle, caller.repeatCount);
      const url = URL.createObjectURL(ringtoneBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ringtone_${caller.name.replace(/[^\u0600-\u06FF\w-]+/g, '_')}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onStatusToast(`فایل زنگ اختصاصی «${caller.name}» آماده شد. در مخاطبین Mi 10T Pro به‌عنوان آهنگ زنگ تنظیم کنید.`);
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'خطا در ساخت فایل زنگ تماس');
    } finally {
      setBusyCallerId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Automatic Call & SMS Toggles + SMS Simulator */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            تنظیمات سرویس بومی در فایل APK اندروید
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            کنترل خودکار اعلام تماس و پیامک (SMS)
          </h2>
          <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">
            وقتی نسخه APK روی گوشی نصب باشد، با رسیدن تماس یا پیامک، نام مخاطب (حتی اگر لاتین باشد) و متن پیامک به‌صورت خودکار با صدای فارسی/دوزبانه خوانده می‌شود.
          </p>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => onUpdateSettings({announceCalls: !announceCalls})}
              className={`w-full min-h-[48px] px-4 rounded-xl border text-right flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                announceCalls
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-slate-50 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-950 text-slate-600 dark:text-slate-400'
              }`}
            >
              <span className="text-xs sm:text-sm font-semibold">اعلام خودکار نام تماس‌گیرنده</span>
              <span className="text-xs font-bold">{announceCalls ? 'روشن' : 'خاموش'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({announceSms: !announceSms})}
              className={`w-full min-h-[48px] px-4 rounded-xl border text-right flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                announceSms
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-slate-50 dark:bg-[#0B1312] border-slate-200 dark:border-emerald-950 text-slate-600 dark:text-slate-400'
              }`}
            >
              <span className="text-xs sm:text-sm font-semibold">خواندن فرستنده و متن پیامک ورودی (SMS)</span>
              <span className="text-xs font-bold">{announceSms ? 'روشن' : 'خاموش'}</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <MessageSquare className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>پیش‌نمایش خواندن پیامک ورودی (نام فارسی یا Latin + متن پیام)</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            تست سخنگوی پیامک ورودی
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                نام فرستنده یا شماره (فارسی / Latin)
              </label>
              <input
                type="text"
                value={smsSender}
                onChange={(e) => setSmsSender(e.target.value)}
                placeholder="مثلاً: زری جان یا Ali Tech"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                متن پیامک نمونه
              </label>
              <input
                type="text"
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                placeholder="متن پیامک ورودی..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={smsTesting}
            onClick={handleTestSms}
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {smsTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            <span>خواندن فرستنده و متن پیامک الان</span>
          </button>
        </div>
      </section>

      {/* Quick Bilingual Tester + MIUI 14 Device Bridge */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            پشتیبانی هم‌زمان خط فارسی، انگلیسی و فینگلیش · قابل ذخیره آفلاین
          </div>
          <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
            اعلام صوتی نام تماس‌گیرنده (فارسی و لاتین)
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
            نام تماس‌گیرنده را به فارسی، لاتین یا ترکیبی وارد کنید تا برنامه با تلفظ صحیح و روان بخواند و زنگ اختصاصی قابل نصب روی گوشی برای آن بسازد.
          </p>

          <div className="mt-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  نام تماس‌گیرنده (فارسی / Latin)
                </label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="مثلاً: زری جان یا Sara Design"
                  className="w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                  صدای گوینده
                </label>
                <select
                  value={testVoice}
                  onChange={(e) => setTestVoice(e.target.value as VoiceName)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-100"
                >
                  {VOICE_PERSONAS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                الگوی خواندن نام
              </label>
              <select
                value={testTemplate}
                onChange={(e) => setTestTemplate(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-sm text-slate-800 dark:text-slate-100"
              >
                {TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('{name}', testName || 'نام مخاطب')}
                  </option>
                ))}
              </select>
            </div>

            {phoneticPreview && (
              <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900 text-xs leading-6 text-emerald-900 dark:text-emerald-200">
                {phoneticPreview}
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleQuickTest}
                disabled={isTesting}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                <span>تست زنگ و خواندن نام</span>
              </button>

              <button
                type="button"
                onClick={handleSmartAnalyze}
                disabled={isTesting || !isOnline}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 text-sm font-medium flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>بهینه‌سازی تلفظ دوزبانه</span>
              </button>
            </div>
          </div>
        </div>

        {/* Xiaomi Mi 10T Pro / MIUI 14 Practical Guide */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Smartphone className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                راه‌اندازی روی Xiaomi Mi 10T Pro (MIUI 14)
              </h2>
            </div>
            <p className="mt-2.5 text-xs leading-6 text-slate-600 dark:text-slate-300">
              مرورگر وب به‌طور مستقیم اجازه شنود تماس‌های مخابراتی گوشی را ندارد؛ اما با دو روش کاربردی زیر می‌توانید روی گوشی <strong>Mi 10T Pro (Android 12 / MIUI 14)</strong> دقیقاً همین صدای روان فارسی و لاتین را هنگام زنگ خوردن بشنوید:
            </p>

            <ol className="mt-4 space-y-3 text-xs leading-6 text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>روش ۱ (۱۰۰٪ آفلاین با زنگ اختصاصی):</strong> دکمه <em>«دانلود زنگ WAV»</em> کنار هر مخاطب را بزنید. فایل ترکیبی زنگ + صدای روان فارسی/لاتین ذخیره می‌شود. سپس در برنامه <strong>Contacts (مخاطبین)</strong> شیائومی روی مخاطب بزنید و آن فایل را به عنوان <strong>آهنگ زنگ اختصاصی</strong> انتخاب کنید.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>روش ۲ (اعلام خودکار همه شماره‌ها در MIUI 14):</strong> در گوشی به مسیر{' '}
                  <span className="font-medium text-slate-900 dark:text-white">
                    تنظیمات ← تنظیمات بیشتر ← زبان و ورودی ← خروجی تبدیل متن به گفتار
                  </span>{' '}
                  بروید، <em>Speech Services by Google</em> را انتخاب و زبان فارسی را دانلود کنید؛ سپس در برنامه تلفن (Phone) گزینه <em>اعلام شناسه تماس‌گیرنده</em> را روشن کنید.
                </span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Add Caller + Directory */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">افزودن مخاطب صوتی جدید</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            مخاطبین فارسی، انگلیسی یا فینگلیش خود را برای ساخت زنگ و تست آماده کنید
          </p>

          <form onSubmit={handleAddSubmit} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                نام مخاطب (فارسی یا لاتین)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: زری جان یا David Manager"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  نسبت / عنوان
                </label>
                <input
                  type="text"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  placeholder="مثلاً: خانواده، همکار"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  تلفظ کمکی (اختیاری)
                </label>
                <input
                  type="text"
                  value={persianPhonetic}
                  onChange={(e) => setPersianPhonetic(e.target.value)}
                  placeholder="مثلاً: دِیوید مَنیجِر"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                جمله اعلام تماس
              </label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs text-slate-800 dark:text-slate-100"
              >
                {TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  تکرار نام
                </label>
                <select
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Number(e.target.value) as 1 | 2)}
                  className="w-full min-h-[42px] px-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs"
                >
                  <option value={1}>۱ بار</option>
                  <option value={2}>۲ بار</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  آهنگ زنگ
                </label>
                <select
                  value={chimeStyle}
                  onChange={(e) => setChimeStyle(e.target.value as 'gentle' | 'classic' | 'chime')}
                  className="w-full min-h-[42px] px-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs"
                >
                  <option value="chime">ملودی گرم</option>
                  <option value="gentle">آرام</option>
                  <option value="classic">کلاسیک</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  گوینده
                </label>
                <select
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value as VoiceName)}
                  className="w-full min-h-[42px] px-2 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs"
                >
                  {VOICE_PERSONAS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن به دفترچه تماس صوتی</span>
            </button>
          </form>
        </div>

        {/* Contacts List */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">مخاطبین صوتی فارسی و لاتین</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {toPersianDigits(callers.length)} مخاطب آماده شبیه‌سازی و دانلود زنگ اختصاصی
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={precacheBusy || callers.length === 0}
                onClick={handlePrecacheAllCallers}
                className="min-h-[40px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {precacheBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{precacheBusy ? 'در حال ذخیره...' : 'ذخیره صدای همه برای تماس آفلاین'}</span>
              </button>
              {isNativeAndroid() && (
                <button
                  type="button"
                  onClick={() =>
                    testNativeCallAnnouncement(
                      'زری جان',
                      'تماس ورودی از طرف زری جان',
                      getVoiceGender(defaultVoice),
                      defaultVoice
                    )
                  }
                  className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>تست سرویس پس‌زمینه تماس</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-emerald-950/60">
            {callers.map((caller) => (
              <div key={caller.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-bold text-slate-900 dark:text-white font-latin">
                    {caller.name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                    <span>{caller.relation}</span>
                    <span aria-hidden="true">·</span>
                    <span>تکرار {toPersianDigits(caller.repeatCount)} بار</span>
                    {caller.persianPhonetic && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>تلفظ: {caller.persianPhonetic}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSimulateCall(caller)}
                    className="min-h-[42px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <PhoneIncoming className="w-3.5 h-3.5" />
                    <span>شبیه‌سازی تماس</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadRingtone(caller)}
                    disabled={busyCallerId === caller.id}
                    className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-emerald-950/40 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    {busyCallerId === caller.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>زنگ WAV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteCaller(caller.id)}
                    aria-label={`حذف ${caller.name}`}
                    className="min-h-[42px] min-w-[42px] rounded-xl text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Incoming Call Simulator Overlay */}
      {simulatingCaller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#0E1B18] border border-emerald-900/60 p-8 text-center text-white shadow-2xl">
            <div className="text-xs text-emerald-300">تماس ورودی شبیه‌سازی‌شده</div>
            <div className="mt-6 w-20 h-20 mx-auto rounded-full bg-emerald-700/30 border border-emerald-500/50 flex items-center justify-center">
              <Phone className="w-9 h-9 text-emerald-300" />
            </div>
            <h3 className="mt-5 text-2xl font-extrabold font-latin">{simulatingCaller.name}</h3>
            <p className="mt-1 text-sm text-slate-300">{simulatingCaller.relation}</p>
            <p className="mt-4 text-xs text-emerald-200/80 leading-6">
              {buildSpokenScript(simulatingCaller.name, simulatingCaller.template)}
            </p>

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={handleEndSimulation}
                className="min-h-[48px] px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                <span>پایان شبیه‌سازی</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
