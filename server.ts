import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {GoogleGenAI, Type} from '@google/genai';

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

const ttsServerCache = new Map<string, string>();
const MAX_SERVER_TTS_CACHE = 120;
const TTS_DISK_CACHE_DIR = '/tmp/rmz_tts_cache';
let tts38CooldownUntil = 0;

try {
  fs.mkdirSync(TTS_DISK_CACHE_DIR, {recursive: true});
} catch {
  // ignore if tmp dir unavailable
}

function getCacheFilePath(cacheKey: string): string {
  const hash = crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 32);
  return path.join(TTS_DISK_CACHE_DIR, `${hash}.wav`);
}

function readCachedWavBase64(cacheKey: string): string | null {
  const mem = ttsServerCache.get(cacheKey);
  if (mem) return mem;
  try {
    const filePath = getCacheFilePath(cacheKey);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      if (buf.length > 44) {
        const b64 = buf.toString('base64');
        ttsServerCache.set(cacheKey, b64);
        return b64;
      }
    }
  } catch {
    // ignore disk read errors
  }
  return null;
}

function writeCachedWavBase64(cacheKey: string, wavBase64: string): void {
  if (ttsServerCache.size >= MAX_SERVER_TTS_CACHE) {
    const oldestKey = ttsServerCache.keys().next().value;
    if (oldestKey) ttsServerCache.delete(oldestKey);
  }
  ttsServerCache.set(cacheKey, wavBase64);
  try {
    fs.writeFileSync(getCacheFilePath(cacheKey), Buffer.from(wavBase64, 'base64'));
  } catch {
    // ignore disk write errors
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
  const ai = getTtsAiClient();
  if (!ai) {
    res.json({
      fallbackOffline: true,
      reason: 'no_key',
    });
    return;
  }

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
  const cacheKey = `${voiceName}::${text}`;
  const cachedBase64 = readCachedWavBase64(cacheKey);
  if (cachedBase64) {
    res.json({
      audioBase64: cachedBase64,
      mimeType: 'audio/wav',
      voiceName,
      cached: true,
    });
    return;
  }

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
    const attemptSynthesis = async (): Promise<{wavBase64?: string; sawQuotaError: boolean}> => {
      const modelsToTry =
        Date.now() < tts38CooldownUntil
          ? ['gemini-2.5-flash-preview-tts']
          : ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];

      let wavBase64: string | undefined;
      let sawQuotaError = false;

      for (const modelName of modelsToTry) {
        try {
          const is25Preview = modelName.startsWith('gemini-2.5');
          const contents = is25Preview
            ? [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `Read aloud ONLY the following transcript verbatim in natural fluent Tehran Persian (and crisp English for any Latin words), matching this speaker persona (${style}). Do not reply or add extra words:\n\n${text}`,
                    },
                  ],
                },
              ]
            : [{role: 'user', parts: [{text, speechMetadata: {style}}]}];

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
            wavBase64 = ensureWavBase64(inline.data, inline.mimeType);
            break;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`TTS on ${modelName} (${voiceName}) failed:`, msg.slice(0, 160));
          if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
            sawQuotaError = true;
            if (modelName.startsWith('gemini-3.8')) {
              tts38CooldownUntil = Date.now() + 30 * 1000;
            }
          }
        }
      }
      return {wavBase64, sawQuotaError};
    };

    let {wavBase64, sawQuotaError} = await runWithTtsPacing(attemptSynthesis);
    if (!wavBase64 && sawQuotaError) {
      await new Promise((r) => setTimeout(r, 1350));
      const retryRes = await runWithTtsPacing(attemptSynthesis);
      wavBase64 = retryRes.wavBase64;
      sawQuotaError = retryRes.sawQuotaError;
    }

    if (!wavBase64) {
      res.json({
        fallbackOffline: true,
        reason: sawQuotaError ? 'quota' : 'unavailable',
      });
      return;
    }

    writeCachedWavBase64(cacheKey, wavBase64);

    res.json({
      audioBase64: wavBase64,
      mimeType: 'audio/wav',
      voiceName,
    });
  } catch (err) {
    console.error('Gemini TTS failed:', err instanceof Error ? err.message : err);
    res.json({
      fallbackOffline: true,
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
  const senderName = typeof req.body?.senderName === 'string' ? req.body.senderName.trim() : 'مهدی';
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

app.post('/api/night-discover', async (req, res) => {
  const ai = getAiClient();
  const betaAi = getTtsAiClient();
  if (!ai && !betaAi) {
    res.status(503).json({
      error: 'برای جستجوی آنلاین شبانه به اتصال اینترنت نیاز است.',
      offlineFallback: true,
    });
    return;
  }

  const mode = req.body?.mode === 'music' ? 'music' : 'movies';
  const moodOrGenre = typeof req.body?.moodOrGenre === 'string' ? req.body.moodOrGenre.trim() : '';
  const mediaType = typeof req.body?.mediaType === 'string' ? req.body.mediaType : 'both';

  try {
    const prompt =
      mode === 'music'
        ? `۴ تا ۵ آهنگ یا پلی‌لیست آرامش‌بخش، ملایم و ریلکسیشن شبانه (ترکیبی از موسیقی بی‌کلام پیانو/باران، سنتی آرام و ترانه‌های ملایم فارسی و بین‌المللی) پیشنهاد بده${moodOrGenre ? ` با حال‌وهوای: ${moodOrGenre}` : ''}.
برای هر مورد: نام دقیق اثر و هنرمند، حس‌و‌حال کوتاه، و چرا برای گوش دادن شبانه قبل از خواب مناسب است را به فارسی روان بنویس.`
        : `۴ ${mediaType === 'series' ? 'سریال' : mediaType === 'movie' ? 'فیلم سینمایی' : 'فیلم سینمایی و سریال'} مطرح یا جدید با امتیاز IMDb بالا (ترجیحاً بالای ۷.۵) که **دوبله فارسی** رسمی یا حرفه‌ای آن در پلتفرم‌های معتبر یا سایت‌های فیلم موجود است را پیدا و معرفی کن${moodOrGenre ? ` در ژانر یا حال‌وهوای: ${moodOrGenre}` : ' (مناسب تماشای شبانه دو نفره، جذاب و خوش‌ساخت)'}.
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
      title:
        mode === 'music'
          ? 'پیشنهادهای موسیقی آرامش‌بخش امشب'
          : 'پیشنهاد فیلم و سریال دوبله امتیاز بالا برای امشب',
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
      server: {middlewareMode: true},
      appType: 'spa',
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
