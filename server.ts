import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {Readable} from 'stream';
import {GoogleGenAI, ThinkingLevel, Type} from '@google/genai';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({limit: '2mb'}));
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getTtsAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({ok: true, aiReady: hasKey});
});

app.post('/api/morning-message', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: 'سرویس هوش مصنوعی در دسترس نیست. حالت آفلاین فعال است.',
      offlineFallback: true,
    });
    return;
  }

  try {
    const dayPart = typeof req.body?.dayPart === 'string' ? req.body.dayPart : 'morning';
    const mood = typeof req.body?.mood === 'string' ? req.body.mood : 'پرانرژی و امیدوار';
    const goalsSummary = typeof req.body?.goalsSummary === 'string' ? req.body.goalsSummary : '';
    const recipient = typeof req.body?.recipient === 'string' ? req.body.recipient : 'من و زری';

    const prompt = `یک پیام صمیمی، انگیزشی، ادبی و بسیار دلنشین به زبان فارسی روان و امروزی بنویس برای «${recipient}».
زمان روز: ${dayPart === 'morning' ? 'صبح دل‌انگیز' : dayPart === 'midday' ? 'میانه روز و تجدید انرژی' : 'شامگاه و آرامش شکرگذاری'}
حال و هوای فعلی: ${mood}
${goalsSummary ? `برخی اهداف امروز: ${goalsSummary}` : ''}
پیام باید گرم، واقعی، غیرکلیشه‌ای، پر از امید و عشق به زندگی مشترک و پیشرفت هدفمند باشد.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'تو نویسنده و مربی زندگی فارسی‌زبان هستی. پاسخ را فقط با ساختار JSON خواسته‌شده برگردان و از جملات کوتاه، روان و قابل خواندن با صدای بلند استفاده کن.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {type: Type.STRING, description: 'تیتر کوتاه و الهام‌بخش فارسی'},
            message: {type: Type.STRING, description: 'متن پیام صبحگاهی یا انرژی‌بخش در ۲ تا ۳ جمله روان'},
            affirmation: {type: Type.STRING, description: 'یک جمله تاکیدی مثبت و کوتاه برای تکرار امروز'},
            energyTip: {type: Type.STRING, description: 'یک اقدام عملی کوچک برای بالا بردن انرژی امروز'},
          },
          required: ['title', 'message', 'affirmation', 'energyTip'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Morning message generation failed:', err);
    res.status(500).json({
      error: 'خطا در دریافت پیام هوشمند. از پیام‌های کتابخانه آفلاین استفاده می‌شود.',
    });
  }
});

interface CachedAudioEntry {
  base64: string;
  mimeType: 'audio/wav' | 'audio/mpeg';
}

const ttsServerCache = new Map<string, CachedAudioEntry>();
const MAX_SERVER_TTS_CACHE = 160;
const TTS_DISK_CACHE_DIR = '/tmp/rmz_tts_cache';
let tts38CooldownUntil = 0;

try {
  fs.mkdirSync(TTS_DISK_CACHE_DIR, {recursive: true});
} catch {
  // ignore if tmp dir unavailable
}

function getCacheFilePath(cacheKey: string, ext: 'wav' | 'mp3'): string {
  const hash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 32);
  return path.join(TTS_DISK_CACHE_DIR, `${hash}.${ext}`);
}

function readCachedAudio(cacheKey: string): CachedAudioEntry | null {
  const mem = ttsServerCache.get(cacheKey);
  if (mem) return mem;
  try {
    const wavPath = getCacheFilePath(cacheKey, 'wav');
    if (fs.existsSync(wavPath)) {
      const buf = fs.readFileSync(wavPath);
      if (buf.length > 44) {
        const entry: CachedAudioEntry = {base64: buf.toString('base64'), mimeType: 'audio/wav'};
        ttsServerCache.set(cacheKey, entry);
        return entry;
      }
    }
    const mp3Path = getCacheFilePath(cacheKey, 'mp3');
    if (fs.existsSync(mp3Path)) {
      const buf = fs.readFileSync(mp3Path);
      if (buf.length > 100) {
        const entry: CachedAudioEntry = {base64: buf.toString('base64'), mimeType: 'audio/mpeg'};
        ttsServerCache.set(cacheKey, entry);
        return entry;
      }
    }
  } catch {
    // ignore disk read errors
  }
  return null;
}

function writeCachedAudio(cacheKey: string, entry: CachedAudioEntry): void {
  if (ttsServerCache.size >= MAX_SERVER_TTS_CACHE) {
    const oldestKey = ttsServerCache.keys().next().value;
    if (oldestKey) ttsServerCache.delete(oldestKey);
  }
  ttsServerCache.set(cacheKey, entry);
  try {
    const ext = entry.mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
    fs.writeFileSync(getCacheFilePath(cacheKey, ext), Buffer.from(entry.base64, 'base64'));
  } catch {
    // ignore disk write errors
  }
}

function escapeXmlForSsml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FINGLISH_WORD_MAP: Record<string, string> = {
  bahman: 'بَهمن',
  mousaali: 'موساعلی',
  musaali: 'موساعلی',
  mousa: 'موسی',
  musa: 'موسی',
  zari: 'زَری',
  zahra: 'زهرا',
  mehdi: 'مهدی',
  mohammad: 'محمد',
  muhammad: 'محمد',
  ali: 'علی',
  reza: 'رضا',
  hossein: 'حسین',
  hasan: 'حسن',
  sara: 'سارا',
  maryam: 'مریم',
  mina: 'مینا',
  neda: 'ندا',
  amir: 'امیر',
  saeed: 'سعید',
  omid: 'امید',
  navid: 'نوید',
  pouya: 'پویا',
  arash: 'آرش',
  radin: 'رادین',
  negin: 'نگین',
  nasim: 'نسیم',
  mom: 'مامان',
  maman: 'مامان',
  baba: 'بابا',
  dad: 'پدر',
  khanoom: 'خانوم',
  khanom: 'خانم',
  agha: 'آقا',
  jan: 'جان',
  joon: 'جون',
  jun: 'جون',
  salam: 'سَلام',
  slm: 'سَلام',
  salm: 'سَلام',
  khobi: 'خوبی',
  khoobi: 'خوبی',
  khubi: 'خوبی',
  chetori: 'چطوری',
  chetor: 'چطور',
  chetory: 'چطوری',
  merci: 'مِرسی',
  mersi: 'مِرسی',
  mersy: 'مِرسی',
  mamnoon: 'ممنون',
  mamnun: 'ممنون',
  mamnon: 'ممنون',
  fadat: 'فدات',
  fedat: 'فدات',
  azizam: 'عزیزم',
  aziz: 'عزیز',
  eshgham: 'عشقم',
  delam: 'دلم',
  ghorbonet: 'قربونت',
  ghorbunet: 'قربونت',
  khabar: 'خبر',
  chiz: 'چیز',
  chizi: 'چیزی',
  man: 'من',
  to: 'تو',
  shoma: 'شما',
  beman: 'به من',
  behem: 'بهم',
  bezang: 'بزنگ',
  zang: 'زنگ',
  bezan: 'بزن',
  omadam: 'اومدم',
  oomadam: 'اومدم',
  umadam: 'اومدم',
  miram: 'میرم',
  miam: 'میام',
  khone: 'خونه',
  khoone: 'خونه',
  khune: 'خونه',
  kar: 'کار',
  kare: 'کارِ',
  sob: 'صبح',
  sobh: 'صبح',
  shab: 'شب',
  bekheir: 'بخیر',
  bekheyr: 'بخیر',
  khosh: 'خوش',
  are: 'آره',
  bale: 'بله',
  na: 'نه',
  kheili: 'خیلی',
  kheyli: 'خیلی',
  babakhshid: 'ببخشید',
  bebakhshid: 'ببخشید',
  lotfan: 'لطفاً',
  mokhles: 'مخلص',
  dost: 'دوست',
  doost: 'دوست',
  daram: 'دارم',
  dooset: 'دوستت',
  doset: 'دوستت',
  ok: 'اوکِی',
  okay: 'اوکِی',
  hello: 'هلو',
  hi: 'های',
  hey: 'هِی',
  bye: 'بای',
  good: 'گود',
  morning: 'مورنینگ',
  night: 'نایت',
  please: 'پلیز',
  thanks: 'تَنکس',
  thank: 'تَنک',
  sorry: 'ساری',
  love: 'لاو',
  you: 'یو',
  call: 'کال',
  calling: 'کالینگ',
  incoming: 'اینکامینگ',
  from: 'فرام',
  design: 'دیزاین',
  tech: 'تک',
  support: 'ساپورت',
  manager: 'منیجر',
  office: 'آفیس',
  work: 'وُرک',
  home: 'هوم',
  team: 'تیم',
  project: 'پروژه',
  dr: 'دکتر',
  mr: 'آقای',
  mrs: 'خانم',
  ms: 'خانم',
  sms: 'اس‌ام‌اس',
  rcs: 'آر‌سی‌اس',
  vpn: 'وی‌پی‌ان',
  wifi: 'وای‌فای',
};

function transliterateSingleLatinWord(rawWord: string): string {
  const clean = rawWord.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  if (!clean) return rawWord;
  const lower = clean.toLowerCase();
  if (FINGLISH_WORD_MAP[lower]) {
    return FINGLISH_WORD_MAP[lower];
  }

  let s = lower;
  s = s.replace(/tion\b/g, 'شِن');
  s = s.replace(/sion\b/g, 'ژِن');
  s = s.replace(/sh/g, 'ش');
  s = s.replace(/ch/g, 'چ');
  s = s.replace(/kh/g, 'خ');
  s = s.replace(/gh/g, 'ق');
  s = s.replace(/zh/g, 'ژ');
  s = s.replace(/ph/g, 'ف');
  s = s.replace(/th/g, 'ت');
  s = s.replace(/ck/g, 'ک');
  s = s.replace(/qu/g, 'کو');
  s = s.replace(/oo|ou/g, 'او');
  s = s.replace(/ee|ea/g, 'ای');
  s = s.replace(/ai|ay|ey|ei/g, 'اِی');
  s = s.replace(/au|aw/g, 'آ');

  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const isFirst = i === 0;
    const isLast = i === s.length - 1;
    if (/[\u0600-\u06FF]/.test(ch)) {
      out += ch;
      continue;
    }
    switch (ch) {
      case 'a':
        out += isFirst ? 'آ' : isLast ? 'ا' : 'اَ';
        break;
      case 'b':
        out += 'ب';
        break;
      case 'c':
        out += s[i + 1] === 'e' || s[i + 1] === 'i' || s[i + 1] === 'y' ? 'س' : 'ک';
        break;
      case 'd':
        out += 'د';
        break;
      case 'e':
        out += isFirst ? 'اِ' : isLast ? 'ه' : 'ِ';
        break;
      case 'f':
        out += 'ف';
        break;
      case 'g':
        out += 'گ';
        break;
      case 'h':
        out += 'ه';
        break;
      case 'i':
        out += isFirst ? 'ای' : 'ی';
        break;
      case 'j':
        out += 'ج';
        break;
      case 'k':
        out += 'ک';
        break;
      case 'l':
        out += 'ل';
        break;
      case 'm':
        out += 'م';
        break;
      case 'n':
        out += 'ن';
        break;
      case 'o':
        out += isFirst ? 'اُ' : 'و';
        break;
      case 'p':
        out += 'پ';
        break;
      case 'q':
        out += 'ق';
        break;
      case 'r':
        out += 'ر';
        break;
      case 's':
        out += 'س';
        break;
      case 't':
        out += 'ت';
        break;
      case 'u':
        out += isFirst ? 'او' : 'و';
        break;
      case 'v':
        out += 'و';
        break;
      case 'w':
        out += 'و';
        break;
      case 'x':
        out += 'کس';
        break;
      case 'y':
        out += isFirst ? 'ی' : 'ی';
        break;
      case 'z':
        out += 'ز';
        break;
      default:
        break;
    }
  }
  return out || rawWord;
}

function normalizeFinglishAndEnglishToPersian(input: string): string {
  if (!/[A-Za-z]/.test(input)) return input;
  return input.replace(/[A-Za-z]+(?:['’.-][A-Za-z]+)*/g, (token) => {
    const parts = token.split(/(['’.-])/);
    return parts
      .map((part) => (/^[A-Za-z]+$/.test(part) ? transliterateSingleLatinWord(part) : part === '.' ? ' ' : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  });
}

const latinPhoneticCache = new Map<string, string>();

async function transliterateLatinToPersianPhonetic(input: string, ai: GoogleGenAI | null): Promise<string> {
  if (!/[A-Za-z]{2,}/.test(input)) {
    return input;
  }
  const cached = latinPhoneticCache.get(input);
  if (cached) return cached;

  const heuristic = normalizeFinglishAndEnglishToPersian(input);
  if (!ai) {
    return heuristic;
  }

  try {
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2800));
    const genPromise = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `متن زیر ترکیبی از فارسی و نام‌ها یا پیامک‌های فینگلیش/انگلیسی است.
فقط بخش‌های حروف انگلیسی/فینگلیش را به شکل خوانا و دقیق به خط فارسی آوایی (با اعراب کوتاه در صورت نیاز مثل بَهمن موساعلی، سَلام، زَری، دیزاین، کال) بازنویسی کن تا یک گوینده فارسی‌زبان بدون مکث و اشتباه بخواند.
کلمات فارسی موجود، علائم و معنی جمله را هیچ تغییری نده و هیچ توضیح اضافه‌ای ننویس؛ فقط متن آماده خواندن را برگردان:

${input}`,
      config: {
        thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
      },
    });

    const resp = await Promise.race([genPromise, timeoutPromise]);
    const rawOut = resp && typeof resp === 'object' && 'text' in resp ? (resp.text ?? '').trim() : '';
    const cleaned = rawOut
      .replace(/^["«']+|["»']+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned && !/[A-Za-z]{2,}/.test(cleaned) && cleaned.length <= input.length * 4 + 40) {
      if (latinPhoneticCache.size >= 300) {
        const first = latinPhoneticCache.keys().next().value;
        if (first) latinPhoneticCache.delete(first);
      }
      latinPhoneticCache.set(input, cleaned);
      return cleaned;
    }
  } catch {
    // Fall back silently to fast deterministic Finglish transliteration
  }

  return heuristic;
}

async function synthesizeEdgePersianMp3(text: string, voiceName: string): Promise<string | null> {
  const voiceProfiles: Record<string, {edgeVoice: string; rate: string; pitch: string}> = {
    Kore: {edgeVoice: 'fa-IR-DilaraNeural', rate: '+0%', pitch: '+2Hz'},
    Zephyr: {edgeVoice: 'fa-IR-DilaraNeural', rate: '-6%', pitch: '+0Hz'},
    Puck: {edgeVoice: 'fa-IR-FaridNeural', rate: '+6%', pitch: '+12Hz'},
    Charon: {edgeVoice: 'fa-IR-FaridNeural', rate: '-2%', pitch: '-6Hz'},
    Fenrir: {edgeVoice: 'fa-IR-FaridNeural', rate: '+3%', pitch: '+0Hz'},
  };
  const profile = voiceProfiles[voiceName] ?? voiceProfiles.Kore;
  const tts = new MsEdgeTTS({connectionTimeoutMs: 7000, synthesisTimeoutMs: 11000});

  try {
    await tts.setMetadata(profile.edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const {audioStream} = tts.toStream(escapeXmlForSsml(text), {
      rate: profile.rate,
      pitch: profile.pitch,
    });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('edge-tts timeout')), 10000);
      audioStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      audioStream.on('end', () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const buf = Buffer.concat(chunks);
    if (buf.length < 100) return null;
    return buf.toString('base64');
  } catch (err) {
    console.warn('Edge neural Persian TTS fallback error:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    try {
      tts.close();
    } catch {
      // ignore close errors
    }
  }
}

function ensureWavBase64(base64Data: string, mimeType?: string): string {
  const raw = Buffer.from(base64Data, 'base64');
  if (raw.length >= 12 && raw.subarray(0, 4).toString('ascii') === 'RIFF') {
    return base64Data;
  }
  // Parse sample rate if provided (e.g., audio/L16;codec=pcm;rate=24000)
  let sampleRate = 24000;
  const rateMatch = mimeType?.match(/rate=(\d+)/i);
  if (rateMatch) {
    const parsed = Number(rateMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 8000 && parsed <= 48000) {
      sampleRate = parsed;
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + raw.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM format chunk size
  header.writeUInt16LE(1, 20); // PCM linear
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(raw.length, 40);
  return Buffer.concat([header, raw]).toString('base64');
}

let ttsQueueTail: Promise<void> = Promise.resolve();
let lastTtsCallAt = 0;

function runWithTtsPacing<T>(task: () => Promise<T>): Promise<T> {
  const scheduled = ttsQueueTail.then(async () => {
    const gap = Date.now() - lastTtsCallAt;
    if (gap < 650) {
      await new Promise((r) => setTimeout(r, 650 - gap));
    }
    lastTtsCallAt = Date.now();
    return task();
  });
  ttsQueueTail = scheduled.then(
    () => undefined,
    () => undefined
  );
  return scheduled;
}

app.post('/api/tts', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({error: 'متن برای تبدیل به گفتار ارسال نشده است.'});
    return;
  }
  if (text.length > 1500) {
    res.status(400).json({error: 'طول متن نباید بیشتر از ۱۵۰۰ کاراکتر باشد.'});
    return;
  }

  const allowedVoices = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];
  const voiceName = allowedVoices.includes(req.body?.voiceName) ? req.body.voiceName : 'Kore';
  const cacheKey = `v2::${voiceName}::${text}`;
  const cached = readCachedAudio(cacheKey);
  if (cached) {
    res.json({
      audioBase64: cached.base64,
      mimeType: cached.mimeType,
      voiceName,
      cached: true,
    });
    return;
  }

  const ai = getTtsAiClient();
  const baseAi = getAiClient();
  // Convert Latin/Finglish words (e.g. Bahman Mousaali, salam zari) into fluent Persian phonetics
  // so both Gemini TTS and Persian neural fallback pronounce names & SMS smoothly without gibberish.
  const speechText = /[A-Za-z]{2,}/.test(text)
    ? await transliterateLatinToPersianPhonetic(text, baseAi)
    : text;

  const voiceGenderHint: Record<string, string> = {
    Kore: 'Adult female speaker. Warm, natural Tehran Persian female voice.',
    Zephyr: 'Adult female speaker. Calm, gentle Tehran Persian female voice.',
    Puck: 'Youthful energetic speaker. Clear Tehran Persian voice.',
    Charon: 'Adult male speaker. Deep baritone, steady Tehran Persian male voice.',
    Fenrir: 'Adult male speaker. Strong, resonant, confident Tehran Persian male voice.',
  };
  const customStyle = typeof req.body?.style === 'string' && req.body.style.trim() ? req.body.style.trim() : '';
  const style = `${voiceGenderHint[voiceName]} ${customStyle}`.trim();

  try {
    let wavBase64: string | undefined;
    let sawQuotaError = false;

    if (ai) {
      const attemptSynthesis = async (): Promise<{wavBase64?: string; sawQuotaError: boolean}> => {
        const modelsToTry =
          Date.now() < tts38CooldownUntil
            ? ['gemini-2.5-flash-preview-tts']
            : ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];

        let foundWav: string | undefined;
        let hitQuota = false;

        for (const modelName of modelsToTry) {
          try {
            const is25Preview = modelName.startsWith('gemini-2.5');
            const contents = is25Preview
              ? [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `Read aloud ONLY the following transcript verbatim in natural fluent Tehran Persian, matching this speaker persona (${style}). Do not reply or add extra words:\n\n${speechText}`,
                      },
                    ],
                  },
                ]
              : [{role: 'user', parts: [{text: speechText, speechMetadata: {style}}]}];

            const response = await ai.models.generateContent({
              model: modelName,
              contents,
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {voiceName},
                  },
                },
              },
            });
            const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (inline?.data) {
              foundWav = ensureWavBase64(inline.data, inline.mimeType);
              break;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`TTS on ${modelName} (${voiceName}) failed:`, msg.slice(0, 160));
            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
              hitQuota = true;
              if (modelName.startsWith('gemini-3.8')) {
                tts38CooldownUntil = Date.now() + 60 * 1000;
              }
            }
          }
        }
        return {wavBase64: foundWav, sawQuotaError: hitQuota};
      };

      const firstRes = await runWithTtsPacing(attemptSynthesis);
      wavBase64 = firstRes.wavBase64;
      sawQuotaError = firstRes.sawQuotaError;
    }

    if (wavBase64) {
      writeCachedAudio(cacheKey, {base64: wavBase64, mimeType: 'audio/wav'});
      res.json({
        audioBase64: wavBase64,
        mimeType: 'audio/wav',
        voiceName,
        spokenText: speechText,
        provider: 'gemini',
      });
      return;
    }

    // Automatic unlimited neural Persian fallback when Gemini quota is reached
    const edgeMp3 = await synthesizeEdgePersianMp3(speechText, voiceName);
    if (edgeMp3) {
      writeCachedAudio(cacheKey, {base64: edgeMp3, mimeType: 'audio/mpeg'});
      res.json({
        audioBase64: edgeMp3,
        mimeType: 'audio/mpeg',
        voiceName,
        spokenText: speechText,
        provider: 'neural-fallback',
      });
      return;
    }

    res.json({
      fallbackOffline: true,
      spokenText: speechText,
      reason: sawQuotaError ? 'quota' : 'unavailable',
    });
  } catch (err) {
    console.error('TTS route error:', err instanceof Error ? err.message : err);
    const edgeMp3 = await synthesizeEdgePersianMp3(speechText, voiceName);
    if (edgeMp3) {
      res.json({
        audioBase64: edgeMp3,
        mimeType: 'audio/mpeg',
        voiceName,
        spokenText: speechText,
        provider: 'neural-fallback',
      });
      return;
    }
    res.json({
      fallbackOffline: true,
      spokenText: speechText,
      reason: 'error',
    });
  }
});

app.post('/api/caller-pronounce', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({error: 'سرویس آنلاین در دسترس نیست.'});
    return;
  }

  const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const template = typeof req.body?.template === 'string' ? req.body.template.trim() : 'تماس ورودی از طرف {name}';
  if (!rawName) {
    res.status(400).json({error: 'نام مخاطب وارد نشده است.'});
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `نام مخاطب: "${rawName}"
الگوی اعلام تماس: "${template}"
لطفاً متن نهایی اعلام تماس را طوری بنویس که یک گوینده دوزبانه فارسی و انگلیسی آن را کاملاً روان و بدون مکث اشتباه بخواند. اگر نام فینگلیش است، تلفظ طبیعی آن را حفظ کن و یک راهنمای آوایی کوتاه هم بده.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            spokenScript: {type: Type.STRING, description: 'متن دقیق و روان برای خواندن توسط سیستم صوتی'},
            persianPhonetic: {type: Type.STRING, description: 'راهنمای تلفظ فارسی برای حالت آفلاین'},
            detectedLanguage: {type: Type.STRING, description: 'persian یا latin یا bilingual'},
          },
          required: ['spokenScript', 'persianPhonetic', 'detectedLanguage'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Caller pronounce helper failed:', err);
    res.status(500).json({error: 'خطا در تحلیل تلفظ نام مخاطب.'});
  }
});

app.post('/api/special-message', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: 'سرویس آنلاین پیام‌ساز در دسترس نیست؛ از قالب‌های آماده آفلاین استفاده کنید.',
      offlineFallback: true,
    });
    return;
  }

  const occasion = typeof req.body?.occasion === 'string' ? req.body.occasion.trim() : 'پیام مناسبتی';
  const recipient = typeof req.body?.recipient === 'string' ? req.body.recipient.trim() : 'عزیز دلم';
  const senderName = typeof req.body?.senderName === 'string' ? req.body.senderName.trim() : 'بهمن';
  const tone = typeof req.body?.tone === 'string' ? req.body.tone.trim() : 'صمیمی و گرم';
  const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';

  try {
    const prompt = `یک پیام فارسی بسیار خوش‌بیان، ادبی اما صمیمی و غیرکلیشه‌ای بنویس.
مناسبت یا موضوع: ${occasion}
مخاطب پیام (برای چه کسی): ${recipient}
فرستنده: ${senderName}
لحن دلخواه: ${tone}
${details ? `نکات یا خاطرات دلخواه برای اشاره در متن: ${details}` : ''}
پیام باید طوری باشد که هم برای ارسال در پیام‌رسان/پیامک عالی باشد و هم وقتی با صدای بلند خوانده می‌شود بسیار دلنشین و طبیعی به گوش برسد.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'تو نویسنده چیره‌دست فارسی برای متن‌های صمیمی، تبریک تولد، سالگرد، آشتی، قدردانی و دلگرمی هستی. فقط JSON خواسته‌شده را برگردان.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {type: Type.STRING, description: 'عنوان کوتاه و زیبا برای پیام'},
            text: {type: Type.STRING, description: 'متن کامل پیام در ۳ تا ۵ جمله روان و احساسی'},
            shortVersion: {type: Type.STRING, description: 'نسخه کوتاه ۱ یا ۲ جمله‌ای مناسب پیامک'},
            occasion: {type: Type.STRING, description: 'نام مناسبت'},
          },
          required: ['title', 'text', 'shortVersion', 'occasion'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('Special message generation failed:', err);
    res.status(500).json({error: 'خطا در ساخت پیام مناسبتی هوشمند.'});
  }
});

interface ServerMusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  streamUrl: string;
  durationSec?: number;
  isLiveStream?: boolean;
  source: 'audius' | 'archive' | 'radio';
  externalUrl?: string;
}

function buildFallbackMusicQueries(persianMood: string): {
  audiusQuery: string;
  archiveQuery: string;
  radioTag: string;
} {
  const m = persianMood.toLowerCase();
  if (m.includes('شجریان') || m.includes('سنتی') || m.includes('همایون')) {
    return {audiusQuery: 'shajarian', archiveQuery: 'shajarian OR santoor', radioTag: 'persian'};
  }
  if (m.includes('پاپ') || m.includes('عاشقانه') || m.includes('ملایم')) {
    return {audiusQuery: 'persian', archiveQuery: 'persian music', radioTag: 'persian'};
  }
  if (m.includes('پیانو') || m.includes('باران') || m.includes('بی‌کلام') || m.includes('رمانتیک')) {
    return {audiusQuery: 'relaxing piano instrumental', archiveQuery: 'relaxing piano', radioTag: 'ambient'};
  }
  if (m.includes('رادیو')) {
    return {audiusQuery: 'night chill lounge', archiveQuery: 'persian classical', radioTag: 'chillout'};
  }
  return {audiusQuery: 'persian chill', archiveQuery: 'persian traditional', radioTag: 'ambient'};
}

async function fetchArchiveFullTracks(query: string): Promise<ServerMusicTrack[]> {
  try {
    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${query}) AND mediatype:(audio)`)}&fl[]=identifier,title,creator&sort[]=downloads+desc&rows=7&output=json`;
    const searchRes = await fetch(searchUrl, {signal: AbortSignal.timeout(5500)});
    if (!searchRes.ok) return [];
    const searchJson = (await searchRes.json()) as {
      response?: {docs?: {identifier?: string; title?: string; creator?: string | string[]}[]};
    };
    const docs = searchJson?.response?.docs ?? [];
    if (docs.length === 0) return [];

    const metaResults = await Promise.allSettled(
      docs.slice(0, 5).map(async (doc) => {
        if (!doc.identifier) return [];
        const mRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}/files`, {
          signal: AbortSignal.timeout(4500),
        });
        if (!mRes.ok) return [];
        const mJson = (await mRes.json()) as {
          result?: {name?: string; format?: string; title?: string; artist?: string; length?: string}[];
        };
        const files = (mJson.result ?? []).filter((f) => {
          const name = String(f.name || '').toLowerCase();
          const secs = parseFloat(String(f.length || '0'));
          return (name.endsWith('.mp3') || name.endsWith('.ogg')) && (!Number.isFinite(secs) || secs === 0 || secs >= 60);
        });
        const tracksForDoc: ServerMusicTrack[] = [];
        for (const f of files.slice(0, 2)) {
          if (!f.name) continue;
          const secsRaw = parseFloat(String(f.length || '0'));
          const durationSec = Number.isFinite(secsRaw) && secsRaw >= 60 ? Math.round(secsRaw) : undefined;
          const cleanName = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
          const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
          tracksForDoc.push({
            id: `archive_${doc.identifier}_${tracksForDoc.length}`,
            title: String(f.title || doc.title || cleanName),
            artist: String(f.artist || creator || 'آرشیو موسیقی'),
            streamUrl: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
            durationSec,
            source: 'archive',
            externalUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
          });
        }
        return tracksForDoc;
      })
    );

    const out: ServerMusicTrack[] = [];
    for (const r of metaResults) {
      if (r.status === 'fulfilled') out.push(...r.value);
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchPlayableMusicPlaylist(moodOrGenre: string, ai: GoogleGenAI | null): Promise<ServerMusicTrack[]> {
  let {audiusQuery, archiveQuery, radioTag} = buildFallbackMusicQueries(moodOrGenre);

  if (ai && moodOrGenre) {
    try {
      const qRes = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `کاربر این نام خواننده، سبک یا حال‌وهوای موسیقی را جستجو کرده است: "${moodOrGenre}".
سه عبارت جستجوی دقیق (به خط انگلیسی برای سرویس‌های موسیقی رایگان کامل مثل Audius و Internet Archive) برگردان تا قطعات کامل (بالای ۲ دقیقه، نه پیش‌نمایش) پیدا شوند.`,
        config: {
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              audiusQuery: {type: Type.STRING, description: 'English keywords or artist name for Audius full tracks search'},
              archiveQuery: {type: Type.STRING, description: 'English query for Archive.org full audio tracks'},
              radioTag: {type: Type.STRING, description: 'Single English tag such as persian, ambient, chillout, piano, lounge'},
            },
            required: ['audiusQuery', 'archiveQuery', 'radioTag'],
          },
        },
      });
      const parsed = JSON.parse((qRes.text ?? '{}').trim()) as {
        audiusQuery?: string;
        archiveQuery?: string;
        radioTag?: string;
      };
      if (parsed.audiusQuery?.trim()) audiusQuery = parsed.audiusQuery.trim();
      if (parsed.archiveQuery?.trim()) archiveQuery = parsed.archiveQuery.trim();
      if (parsed.radioTag?.trim()) radioTag = parsed.radioTag.trim().toLowerCase().split(/\s+/)[0];
    } catch {
      // Keep smart fallback keywords
    }
  }

  const tracks: ServerMusicTrack[] = [];

  const [audiusRes, archiveTracks, radioRes] = await Promise.allSettled([
    fetch(
      `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(audiusQuery)}&limit=10&app_name=roozhaye`,
      {signal: AbortSignal.timeout(6000)}
    ).then((r) => (r.ok ? r.json() : null)),
    fetchArchiveFullTracks(archiveQuery),
    fetch(
      `https://all.api.radio-browser.info/json/stations/search?limit=5&hidebroken=true&order=votes&reverse=true&tag=${encodeURIComponent(radioTag)}`,
      {signal: AbortSignal.timeout(5500)}
    ).then((r) => (r.ok ? r.json() : null)),
  ]);

  if (audiusRes.status === 'fulfilled' && Array.isArray(audiusRes.value?.data)) {
    for (const item of audiusRes.value.data) {
      if (!item?.id || !item?.title) continue;
      // Enforce full-length tracks only (>= 60 seconds; zero 30s previews)
      const dur = typeof item.duration === 'number' ? item.duration : 0;
      if (dur > 0 && dur < 60) continue;
      tracks.push({
        id: `audius_${item.id}`,
        title: String(item.title),
        artist: String(item.user?.name || item.user?.handle || 'Audius Artist'),
        artworkUrl: item.artwork?.['150x150'] || item.artwork?.['480x480'] || undefined,
        streamUrl: `https://api.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=roozhaye`,
        durationSec: dur >= 60 ? dur : undefined,
        source: 'audius',
        externalUrl: item.permalink ? `https://audius.co${item.permalink}` : undefined,
      });
    }
  }

  if (archiveTracks.status === 'fulfilled' && Array.isArray(archiveTracks.value)) {
    for (const t of archiveTracks.value) {
      tracks.push(t);
    }
  }

  if (radioRes.status === 'fulfilled' && Array.isArray(radioRes.value)) {
    for (const st of radioRes.value) {
      const stream = st?.url_resolved || st?.url;
      const tags = String(st?.tags || '').toLowerCase();
      if (!stream || !String(stream).startsWith('https://')) continue;
      if (tags.includes('news') || tags.includes('talk') || tags.includes('akhbar')) continue;
      tracks.push({
        id: `radio_${st.stationuuid || tracks.length}`,
        title: String(st.name || 'رادیو موسیقی آرامش‌بخش').trim(),
        artist: `پخش زنده پیوسته رادیویی${st.country ? ` · ${st.country}` : ''}`,
        artworkUrl: st.favicon && String(st.favicon).startsWith('https://') ? String(st.favicon) : undefined,
        streamUrl: String(stream),
        isLiveStream: true,
        source: 'radio',
        externalUrl: st.homepage ? String(st.homepage) : undefined,
      });
    }
  }

  return tracks.slice(0, 18);
}

app.get('/api/audio-proxy', async (req, res) => {
  const target = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!target.startsWith('https://')) {
    res.status(400).json({error: 'نشانی صوتی نامعتبر است.'});
    return;
  }
  try {
    const reqHeaders: Record<string, string> = {'User-Agent': 'RoozhayeManOZari/1.0'};
    if (typeof req.headers.range === 'string') {
      reqHeaders.Range = req.headers.range;
    }
    const upstream = await fetch(target, {
      headers: reqHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(16000),
    });
    if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
      res.status(502).json({error: 'پخش جریان صوتی در دسترس نیست.'});
      return;
    }
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=300');
    const nodeStream = Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.pipe(res);
  } catch (err) {
    console.warn('Audio proxy error:', err instanceof Error ? err.message : err);
    if (!res.headersSent) {
      res.status(502).json({error: 'خطا در دریافت جریان صوتی.'});
    }
  }
});

app.post('/api/night-discover', async (req, res) => {
  const ai = getAiClient();
  const betaAi = getTtsAiClient();
  const mode = req.body?.mode === 'music' ? 'music' : 'movies';
  const moodOrGenre = typeof req.body?.moodOrGenre === 'string' ? req.body.moodOrGenre.trim() : '';
  const mediaType = typeof req.body?.mediaType === 'string' ? req.body.mediaType : 'both';

  if (mode === 'music') {
    try {
      const tracks = await fetchPlayableMusicPlaylist(moodOrGenre || 'پیانو و موسیقی آرامش‌بخش ایرانی', ai ?? betaAi);
      const links = tracks
        .filter((t) => t.externalUrl)
        .slice(0, 6)
        .map((t) => ({title: `${t.title} — ${t.artist}`, url: t.externalUrl!}));

      const summaryList = tracks
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ${t.title} اثر ${t.artist}`)
        .join('، ');

      res.json({
        mode: 'music',
        title: `پلی‌لیست آماده پخش: ${moodOrGenre || 'آرامش شبانه'}`,
        markdownText:
          tracks.length > 0
            ? `${tracks.length} قطعه و ایستگاه آماده پخش پیدا شد. روی هر آهنگ بزنید تا مستقیماً پخش شود.`
            : 'قطعه‌ای برای این عبارت پیدا نشد؛ عبارت دیگری (مثل شجریان، پیانو، یا آرامش) را امتحان کنید.',
        spokenSummary: summaryList
          ? `پلی‌لیست امشب شامل ${summaryList}`
          : 'پلی‌لیست موسیقی آماده است.',
        tracks,
        links,
        fetchedAt: Date.now(),
      });
      return;
    } catch (err) {
      console.error('Music playlist discovery failed:', err);
      res.status(500).json({error: 'خطا در جستجوی پلی‌لیست موسیقی.'});
      return;
    }
  }

  if (!ai && !betaAi) {
    res.status(503).json({
      error: 'برای جستجوی آنلاین شبانه به اتصال اینترنت نیاز است.',
      offlineFallback: true,
    });
    return;
  }

  try {
    const prompt = `۴ ${mediaType === 'series' ? 'سریال' : mediaType === 'movie' ? 'فیلم سینمایی' : 'فیلم سینمایی و سریال'} مطرح یا جدید با امتیاز IMDb بالا (ترجیحاً بالای ۷.۵) که **دوبله فارسی** رسمی یا حرفه‌ای آن در پلتفرم‌های معتبر یا سایت‌های فیلم موجود است را پیدا و معرفی کن${moodOrGenre ? ` در ژانر یا حال‌وهوای: ${moodOrGenre}` : ' (مناسب تماشای شبانه دو نفره، جذاب و خوش‌ساخت)'}.
برای هر مورد دقیقاً ذکر کن:
- نام فارسی و نام انگلیسی + سال انتشار
- امتیاز IMDb و وضعیت دوبله فارسی
- خلاصه داستان کوتاه و جذاب (بدون لو دادن پایان) و دلیل پیشنهاد امشب.`;

    let response;
    const groundedClient = betaAi ?? ai!;
    try {
      response = await groundedClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'پاسخ را کاملاً به فارسی روان، منظم و خوانا بنویس. با جستجوی وب فقط موارد واقعی و معتبر را معرفی کن.',
          tools: [{googleSearch: {}}],
        },
      });
    } catch (groundingErr) {
      console.warn(
        'Night discover googleSearch failed, falling back to direct model response:',
        groundingErr instanceof Error ? groundingErr.message : groundingErr,
      );
      const fallbackClient = ai ?? betaAi!;
      response = await fallbackClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'پاسخ را کاملاً به فارسی روان، منظم و خوانا بنویس. فقط آثار واقعی و شناخته‌شده با امتیاز واقعی IMDb و دوبله فارسی معروف را معرفی کن.',
        },
      });
    }

    const markdownText = (response.text ?? '').trim();
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const links: {title: string; url: string}[] = [];
    for (const chunk of rawChunks) {
      const uri = chunk?.web?.uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        links.push({
          title: chunk?.web?.title || uri,
          url: uri,
        });
      }
    }

    const plainLines = markdownText
      .replace(/[#*_`>[\]()]/g, ' ')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const spokenSummary =
      plainLines.length > 520 ? `${plainLines.slice(0, 520)}...` : plainLines;

    res.json({
      mode,
      title: 'پیشنهاد فیلم و سریال دوبله امتیاز بالا برای امشب',
      markdownText,
      spokenSummary,
      links: links.slice(0, 8),
      fetchedAt: Date.now(),
    });
  } catch (err) {
    console.error('Night discover failed:', err);
    res.status(500).json({error: 'خطا در جستجوی آنلاین شبانه.'});
  }
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const patched = result.code.replace(
          /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
          'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });'
        );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(patched);
      } catch (e) {
        next(e);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Roozhaye Man o Zari server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
