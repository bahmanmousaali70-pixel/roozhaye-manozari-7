import React, {useEffect, useRef, useState} from 'react';
import {
  BellRing,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Film,
  Loader2,
  MessageSquareHeart,
  Moon,
  Music2,
  Pause,
  Play,
  Search,
  Sparkles,
  Square,
  Volume2,
  Waves,
} from 'lucide-react';
import {toPersianDigits, VOICE_PERSONAS} from '../data/persianLibrary';
import {apiUrl} from '../services/apiConfig';
import type {
  AppSettings,
  NightDiscoveryResponse,
  SpecialMessageResult,
  VoiceName,
} from '../types/app';

interface NightAndMessagesViewProps {
  settings: AppSettings;
  isOnline: boolean;
  isSpeaking: boolean;
  nightMoviesResult: NightDiscoveryResponse | null;
  nightMusicResult: NightDiscoveryResponse | null;
  onSaveNightResult: (result: NightDiscoveryResponse) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSpeakText: (text: string, title: string, category: 'custom' | 'morning' | 'energy' | 'gratitude') => void;
  onStopSpeech: () => void;
  onStatusToast: (msg: string) => void;
}

type OccasionId = 'birthday' | 'anniversary' | 'apology' | 'thanks' | 'encouragement' | 'custom';

const OCCASIONS: {id: OccasionId; label: string; offlineTemplate: (recipient: string, sender: string) => SpecialMessageResult}[] = [
  {
    id: 'birthday',
    label: 'تبریک تولد',
    offlineTemplate: (recipient, sender) => ({
      title: `تبریک تولد صمیمی برای ${recipient}`,
      text: `${recipient} عزیز، تولدت مبارک! آرزو می‌کنم سال جدید عمرت سرشار از سلامتی، دل آرام، موفقیت‌های درخشان و لحظه‌های پر از لبخند باشد. حضور تو در زندگی ما نعمت بزرگی است و همیشه برایت بهترین‌ها را می‌خواهم. با عشق، ${sender}.`,
      shortVersion: `${recipient} جان تولدت مبارک! همیشه سلامت، شاد و درخشان باشی. از طرف ${sender}`,
      occasion: 'تبریک تولد',
    }),
  },
  {
    id: 'anniversary',
    label: 'سالگرد و عشق',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام سالگرد و همراهی برای ${recipient}`,
      text: `${recipient} مهربانم، با هر روزی که در کنار هم می‌گذرانیم بیشتر قدر همدلی، آرامش و عشق میانمان را می‌دانم. ممنونم که شریک لحظه‌های سخت و شیرین زندگی هستی. امیدوارم سال‌های پیش رو برایمان پر از خاطرات زیبا و پیشرفت مشترک باشد. دوستت دارم، ${sender}.`,
      shortVersion: `${recipient} عزیزم، کنار تو هر روز زندگی معنای زیباتری دارد. ممنون که هستی. ${sender}`,
      occasion: 'سالگرد و عشق',
    }),
  },
  {
    id: 'apology',
    label: 'آشتی و دلجویی',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام دلجویی صمیمی برای ${recipient}`,
      text: `${recipient} عزیز، اگر باعث رنجش و دلخوری‌ات شدم صمیمانه عذرخواهی می‌کنم. آرامش و لبخند تو برای من از هر بحث و سوءتفاهمی مهم‌تر است. دلم می‌خواهد دوباره با دل صاف و لبخند کنار هم باشیم. از طرف ${sender}.`,
      shortVersion: `${recipient} جان، بابت کدورت پیش‌آمده معذرت می‌خواهم. حالِ خوب و لبخندت برایم مهم‌ترین چیز است. ${sender}`,
      occasion: 'آشتی و دلجویی',
    }),
  },
  {
    id: 'thanks',
    label: 'تشکر و قدردانی',
    offlineTemplate: (recipient, sender) => ({
      title: `سپاسگزاری از ${recipient}`,
      text: `${recipient} گرامی و مهربان، از صمیم قلب بابت همراهی، محبت و زحمتی که کشیدید سپاسگزارم. بزرگواری شما هیچ‌وقت فراموش نمی‌شود و باعث دلگرمی فراوان بود. همیشه سلامت و سربلند باشید. با احترام، ${sender}.`,
      shortVersion: `${recipient} عزیز، بابت تمام لطف و همراهی‌تان از صمیم قلب ممنونم. ${sender}`,
      occasion: 'تشکر و قدردانی',
    }),
  },
  {
    id: 'encouragement',
    label: 'دلگرمی و موفقیت',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام دلگرمی برای ${recipient}`,
      text: `${recipient} جان، مطمئنم با پشتکار، هوش و اراده‌ای که داری این مسیر را هم با سربلندی پشت سر می‌گذاری. روزهای سخت موقتی هستند و تلاش امروزت فردایی درخشان می‌سازد. روی حمایت و دعای من همیشه حساب کن. ${sender}.`,
      shortVersion: `${recipient} عزیز، من به توانایی تو ایمان دارم و همیشه کنارت هستم. موفق باشی! ${sender}`,
      occasion: 'دلگرمی و موفقیت',
    }),
  },
  {
    id: 'custom',
    label: 'موضوع دلخواه',
    offlineTemplate: (recipient, sender) => ({
      title: `پیام اختصاصی برای ${recipient}`,
      text: `سلام ${recipient} عزیز، امیدوارم امروزتان پر از آرامش، حال خوب و خبرهای خوش باشد. همیشه به یادتان هستم و بهترین‌ها را برایتان آرزو می‌کنم. با احترام و محبت، ${sender}.`,
      shortVersion: `سلام ${recipient} جان، همیشه سلامت و دلشاد باشید. از طرف ${sender}`,
      occasion: 'پیام دلخواه',
    }),
  },
];

const TONES = ['صمیمی و گرم', 'عاشقانه و احساسی', 'محترمانه و ادبی', 'شاد و پرانرژی'];

type SoundscapeKind = 'rain' | 'ocean' | 'calm432';

const SOUNDSCAPES: {id: SoundscapeKind; label: string; desc: string}[] = [
  {id: 'rain', label: 'باران شبانه', desc: 'صدای نرم و پیوسته باران (کاملاً آفلاین)'},
  {id: 'ocean', label: 'امواج آرام دریا', desc: 'موج‌های ریتمیک ملایم برای رهایی ذهن'},
  {id: 'calm432', label: 'فرکانس آرامش ۴۳۲ هرتز', desc: 'تون ممتد مدیتیشن و خواب عمیق'},
];

export const NightAndMessagesView: React.FC<NightAndMessagesViewProps> = ({
  settings,
  isOnline,
  isSpeaking,
  nightMoviesResult,
  nightMusicResult,
  onSaveNightResult,
  onUpdateSettings,
  onSpeakText,
  onStopSpeech,
  onStatusToast,
}) => {
  // Special Message Builder state
  const [occasion, setOccasion] = useState<OccasionId>('birthday');
  const [customOccasionText, setCustomOccasionText] = useState('');
  const [recipient, setRecipient] = useState(settings.partnerName || 'زری جان');
  const [tone, setTone] = useState(TONES[0]);
  const [details, setDetails] = useState('');
  const [msgResult, setMsgResult] = useState<SpecialMessageResult | null>(() =>
    OCCASIONS[0].offlineTemplate(settings.partnerName || 'زری جان', settings.myName || 'مهدی')
  );
  const [msgBusy, setMsgBusy] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [msgVoice, setMsgVoice] = useState<VoiceName>(settings.defaultVoice);

  // Offline Ambient Synthesizer state
  const [activeSound, setActiveSound] = useState<SoundscapeKind | null>(null);
  const [sleepMinutes, setSleepMinutes] = useState<number>(30);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // Night Online Search state
  const [musicMood, setMusicMood] = useState('پیانو و باران ملایم، سنتی آرام و لالایی شبانه');
  const [musicBusy, setMusicBusy] = useState(false);

  const [movieMediaType, setMovieMediaType] = useState<'both' | 'movie' | 'series'>('both');
  const [movieGenre, setMovieGenre] = useState('درام، معمایی یا خانوادگی خوش‌ساخت با امتیاز بالای ۷.۵');
  const [movieBusy, setMovieBusy] = useState(false);

  const stopAmbientSound = () => {
    try {
      if (masterGainRef.current && audioCtxRef.current) {
        const now = audioCtxRef.current.currentTime;
        masterGainRef.current.gain.linearRampToValueAtTime(0.0001, now + 0.3);
      }
      window.setTimeout(() => {
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        masterGainRef.current = null;
      }, 350);
    } catch {
      audioCtxRef.current = null;
    }
    setActiveSound(null);
    setSleepRemainingSec(null);
  };

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (sleepRemainingSec === null) return;
    if (sleepRemainingSec <= 0) {
      stopAmbientSound();
      return;
    }
    const t = window.setTimeout(() => {
      setSleepRemainingSec((s) => (s !== null ? s - 1 : null));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [sleepRemainingSec]);

  const startAmbientSound = (kind: SoundscapeKind) => {
    if (activeSound === kind) {
      stopAmbientSound();
      return;
    }
    audioCtxRef.current?.close().catch(() => {});
    const AudioCtx = window.AudioContext || (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.001, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 1.2);
    master.connect(ctx.destination);

    if (kind === 'rain' || kind === 'ocean') {
      // Synthesize smooth brown/pink noise buffer
      const bufferSize = ctx.sampleRate * 4;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= kind === 'rain' ? 2.4 : 3.2;
      }

      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = kind === 'rain' ? 1100 : 420;

      if (kind === 'ocean') {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.11; // Slow ocean wave swell ~9s period
        lfoGain.gain.value = 280;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
      }

      source.connect(filter);
      filter.connect(master);
      source.start();
    } else {
      // 432Hz + 216Hz + 648Hz soothing harmonic pad
      const freqs = [216, 432, 648];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        g.gain.value = idx === 1 ? 0.18 : 0.07;
        osc.connect(g);
        g.connect(master);
        osc.start();
      });
    }

    audioCtxRef.current = ctx;
    masterGainRef.current = master;
    setActiveSound(kind);
    setSleepRemainingSec(sleepMinutes > 0 ? sleepMinutes * 60 : null);
  };

  const handleGenerateSpecialMessage = async () => {
    const chosenOccasion =
      occasion === 'custom'
        ? customOccasionText.trim() || 'پیام محبت‌آمیز و خاص'
        : OCCASIONS.find((o) => o.id === occasion)?.label ?? 'پیام مناسبتی';
    const targetPerson = recipient.trim() || 'عزیز دلم';
    const sender = settings.myName || 'مهدی';

    if (!isOnline) {
      const tmpl = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];
      setMsgResult(tmpl.offlineTemplate(targetPerson, sender));
      onStatusToast('در حالت آفلاین هستید؛ متن آماده اختصاصی ساخته شد.');
      return;
    }

    setMsgBusy(true);
    try {
      const res = await fetch(apiUrl('/api/special-message'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          occasion: chosenOccasion,
          recipient: targetPerson,
          senderName: sender,
          tone,
          details: details.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطا در ساخت پیام');
      setMsgResult(data as SpecialMessageResult);
      onStatusToast('پیام مناسبتی آماده شد؛ می‌توانید کپی یا با صدای گوینده پخش کنید.');
    } catch {
      const tmpl = OCCASIONS.find((o) => o.id === occasion) ?? OCCASIONS[0];
      setMsgResult(tmpl.offlineTemplate(targetPerson, sender));
      onStatusToast('از قالب آماده آفلاین استفاده شد.');
    } finally {
      setMsgBusy(false);
    }
  };

  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(true);
      onStatusToast('متن پیام کپی شد.');
      window.setTimeout(() => setCopiedMsg(false), 2000);
    } catch {
      onStatusToast('کپی خودکار انجام نشد.');
    }
  };

  const handleDiscoverNight = async (mode: 'music' | 'movies') => {
    if (!isOnline) {
      onStatusToast(
        mode === 'music'
          ? 'جستجوی آهنگ جدید نیاز به اینترنت دارد؛ از صداهای آرامش‌بخش آفلاین همین صفحه استفاده کنید.'
          : 'برای جستجوی فیلم و سریال‌های جدید دوبله به اینترنت نیاز است.'
      );
      return;
    }

    if (mode === 'music') setMusicBusy(true);
    else setMovieBusy(true);

    try {
      const res = await fetch(apiUrl('/api/night-discover'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          mode,
          moodOrGenre: mode === 'music' ? musicMood : movieGenre,
          mediaType: movieMediaType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطا در جستجو');
      onSaveNightResult(data as NightDiscoveryResponse);
      onStatusToast(
        mode === 'music'
          ? 'لیست آهنگ‌های آرامش‌بخش شبانه پیدا شد.'
          : 'پیشنهادهای فیلم و سریال دوبله با امتیاز بالا آماده شد.'
      );
    } catch (err) {
      onStatusToast(err instanceof Error ? err.message : 'خطا در جستجوی شبانه.');
    } finally {
      if (mode === 'music') setMusicBusy(false);
      else setMovieBusy(false);
    }
  };

  const sleepClock =
    sleepRemainingSec !== null
      ? `${toPersianDigits(String(Math.floor(sleepRemainingSec / 60)).padStart(2, '0'))}:${toPersianDigits(
          String(sleepRemainingSec % 60).padStart(2, '0')
        )}`
      : null;

  return (
    <div className="space-y-8">
      {/* Section 1: Special Occasion Message Builder */}
      <section className="rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <MessageSquareHeart className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>ساخت متن و پیام صوتی مناسبتی (آنلاین و آفلاین)</span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white text-balance">
              پیام‌ساز مناسبتی و متن‌های خاص
            </h1>
            <p className="mt-1.5 text-sm leading-7 text-slate-600 dark:text-slate-300 max-w-3xl">
              برای تبریک تولد، سالگرد، تشکر، دلجویی یا هر مناسبت دلخواه متن صمیمی و زیبا بسازید، کپی کنید یا با صدای گوینده خانم/آقا گوش دهید.
            </p>
          </div>
        </div>

        {/* Occasion Buttons */}
        <div className="flex flex-wrap gap-2">
          {OCCASIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setOccasion(item.id)}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                occasion === item.id
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 dark:bg-[#0B1312] text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-emerald-950/50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3.5">
            {occasion === 'custom' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  موضوع یا مناسبت دلخواه
                </label>
                <input
                  type="text"
                  value={customOccasionText}
                  onChange={(e) => setCustomOccasionText(e.target.value)}
                  placeholder="مثلاً: تبریک خانه نو، عید نوروز، قبولی آزمون..."
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  برای چه کسی؟
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="مثلاً: زری جان، مادرم، علی آقا"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  لحن متن
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#0B1312] text-xs sm:text-sm text-slate-800 dark:text-slate-100"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                نکته یا اشاره خاص (اختیاری)
              </label>
              <textarea
                rows={2}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="مثلاً: یادآوری سفر شمال یا تشکر بابت صبوری‌های امسال..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerateSpecialMessage}
              disabled={msgBusy}
              className="w-full min-h-[46px] rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {msgBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isOnline ? 'تولید پیام خاص هوشمند' : 'ساخت پیام با قالب آماده آفلاین'}</span>
            </button>
          </div>

          <div className="lg:col-span-7 rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-5 flex flex-col justify-between gap-4">
            {msgResult ? (
              <>
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {msgResult.occasion} · {msgResult.title}
                  </div>
                  <p className="text-sm sm:text-base leading-8 text-slate-800 dark:text-slate-100">
                    {msgResult.text}
                  </p>
                  <div className="pt-3 border-t border-slate-200/70 dark:border-emerald-950/60">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      نسخه کوتاه برای پیامک:
                    </div>
                    <p className="mt-1 text-xs sm:text-sm leading-7 text-slate-700 dark:text-slate-300">
                      {msgResult.shortVersion}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  {isSpeaking ? (
                    <button
                      type="button"
                      onClick={onStopSpeech}
                      className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Square className="w-4 h-4" />
                      <span>توقف پخش</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSpeakText(msgResult.text, msgResult.title, 'custom')}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-700 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>شنیدن پیام با صدای گوینده</span>
                    </button>
                  )}

                  <select
                    value={msgVoice}
                    onChange={(e) => {
                      const v = e.target.value as VoiceName;
                      setMsgVoice(v);
                      onUpdateSettings({defaultVoice: v});
                    }}
                    aria-label="گوینده پیام مناسبتی"
                    className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs text-slate-700 dark:text-slate-200"
                  >
                    {VOICE_PERSONAS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msgResult.text)}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-2 cursor-pointer"
                  >
                    {copiedMsg ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>کپی متن کامل</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                مناسبت و نام مخاطب را انتخاب کنید تا متن اختصاصی آماده شود.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 2 & 3: Nighttime Relaxation Music + High-Rated Dubbed Movies/Series */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Relaxation Audio (Offline Synthesizer + Online Discovery) */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Music2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>آرامش شبانه و خواب راحت</span>
            </div>
            <h2 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
              آهنگ و صدای ریلکسیشن شبانه
            </h2>
            <p className="mt-1 text-xs leading-6 text-slate-600 dark:text-slate-300">
              صدای طبیعت آفلاین بدون نیاز به اینترنت و جستجوی آنلاین آهنگ‌های آرامش‌بخش شبانه
            </p>
          </div>

          {/* Offline Sleep Soundscapes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                پخش‌کننده صدای آرامش (آفلاین)
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={sleepMinutes}
                  onChange={(e) => setSleepMinutes(Number(e.target.value))}
                  aria-label="تایمر خواب"
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-emerald-900 bg-slate-50 dark:bg-[#0B1312] text-xs"
                >
                  <option value={15}>۱۵ دقیقه</option>
                  <option value={30}>۳۰ دقیقه</option>
                  <option value={45}>۴۵ دقیقه</option>
                  <option value={0}>پیوسته</option>
                </select>
                {sleepClock && (
                  <span className="font-mono-num text-emerald-700 dark:text-emerald-400 font-semibold">
                    {sleepClock}
                  </span>
                )}
              </div>
            </div>

            {SOUNDSCAPES.map((s) => {
              const playing = activeSound === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => startAmbientSound(s.id)}
                  className={`w-full min-h-[54px] px-4 py-3 rounded-xl border text-right flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    playing
                      ? 'bg-emerald-700 border-emerald-700 text-white'
                      : 'bg-slate-50/70 dark:bg-[#0B1312] border-slate-200/80 dark:border-emerald-900/70 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-emerald-950/40'
                  }`}
                >
                  <div>
                    <div className="text-sm font-bold flex items-center gap-2">
                      <Waves className="w-4 h-4 shrink-0" />
                      <span>{s.label}</span>
                    </div>
                    <div className={`text-[11px] mt-0.5 ${playing ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {s.desc}
                    </div>
                  </div>
                  <span className="min-w-[36px] min-h-[36px] rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Online Music Finder */}
          <div className="pt-4 border-t border-slate-100 dark:border-emerald-950/60 space-y-3">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              جستجوی آنلاین آهنگ‌ها و پلی‌لیست‌های ریلکس
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={musicMood}
                onChange={(e) => setMusicMood(e.target.value)}
                placeholder="سبک موسیقی شبانه (مثلاً پیانو ملایم، سنتی آرام)"
                className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-xs sm:text-sm text-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={musicBusy}
                onClick={() => handleDiscoverNight('music')}
                className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
              >
                {musicBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>جستجو</span>
              </button>
            </div>

            {nightMusicResult && (
              <div className="rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {nightMusicResult.title}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onSpeakText(nightMusicResult.spokenSummary, nightMusicResult.title, 'custom')
                    }
                    className="min-h-[34px] px-2.5 rounded-lg bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>خواندن با صدا</span>
                  </button>
                </div>
                <div className="text-xs leading-6 text-slate-700 dark:text-slate-200 whitespace-pre-line">
                  {nightMusicResult.markdownText}
                </div>
                {nightMusicResult.links.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-emerald-950/60 space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      لینک‌های شنیدن و منابع آنلاین:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {nightMusicResult.links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[200px]">{l.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* High-Rated Persian-Dubbed Movies & Series Discovery + Auto Night Notification */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#121E1C] border border-slate-200/80 dark:border-emerald-950/70 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Film className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>پیشنهادگر هوشمند فیلم و سریال دوبله فارسی (امتیاز بالای IMDb)</span>
              </div>
              <h2 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white">
                فیلم و سریال‌های دوبله و باکیفیت امشب
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-emerald-950/70 rounded-xl shrink-0">
              {(
                [
                  {id: 'both', label: 'فیلم و سریال'},
                  {id: 'movie', label: 'سینمایی'},
                  {id: 'series', label: 'سریال'},
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMovieMediaType(m.id)}
                  className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    movieMediaType === m.id
                      ? 'bg-white dark:bg-[#172724] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Automatic Nightly Check Bar */}
          <div className="rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <BellRing className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  اطلاع‌رسانی خودکار شبانه فیلم و سریال دوبله
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  هر شب در ساعت انتخابی، جدیدترین و باامتیازترین آثار دوبله فارسی را خودکار پیدا کرده و خبر می‌دهد
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="time"
                value={settings.nightMovieTime || '22:00'}
                onChange={(e) => onUpdateSettings({nightMovieTime: e.target.value})}
                className="min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-emerald-900 bg-white dark:bg-[#121E1C] text-xs font-mono-num text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => onUpdateSettings({nightMovieAutoCheck: !settings.nightMovieAutoCheck})}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  settings.nightMovieAutoCheck
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-200 dark:bg-emerald-950 text-slate-700 dark:text-slate-300'
                }`}
              >
                {settings.nightMovieAutoCheck ? 'خبر خودکار فعال' : 'خاموش'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={movieGenre}
              onChange={(e) => setMovieGenre(e.target.value)}
              placeholder="ژانر یا حال‌وهوای امشب (مثلاً معمایی، کمدی خانوادگی، علمی‌تخیلی)..."
              className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-emerald-900 bg-slate-50/70 dark:bg-[#0B1312] text-sm text-slate-900 dark:text-white"
            />
            <button
              type="button"
              disabled={movieBusy}
              onClick={() => handleDiscoverNight('movies')}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-60"
            >
              {movieBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>پیدا کن با دوبله فارسی</span>
            </button>
          </div>

          {nightMoviesResult ? (
            <div className="rounded-xl bg-slate-50/80 dark:bg-[#0B1312] border border-slate-200/80 dark:border-emerald-900/70 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Moon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>{nightMoviesResult.title}</span>
                </div>
                {isSpeaking ? (
                  <button
                    type="button"
                    onClick={onStopSpeech}
                    className="min-h-[38px] px-3 rounded-xl bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>توقف</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onSpeakText(nightMoviesResult.spokenSummary, nightMoviesResult.title, 'custom')
                    }
                    className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>خواندن پیشنهادها با گوینده</span>
                  </button>
                )}
              </div>

              <div className="text-xs sm:text-sm leading-7 text-slate-700 dark:text-slate-200 whitespace-pre-line">
                {nightMoviesResult.markdownText}
              </div>

              {nightMoviesResult.links.length > 0 && (
                <div className="pt-3 border-t border-slate-200/70 dark:border-emerald-950/60 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    منابع معتبر معرفی و جزئیات امتیاز:
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {nightMoviesResult.links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[260px]">{l.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-emerald-900/70 py-10 px-4 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              روی «پیدا کن با دوبله فارسی» بزنید تا جدیدترین فیلم‌ها و سریال‌های دوبله با امتیاز بالای IMDb جستجو و خلاصه شوند.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
