import type {AudioLibraryEntry, VoiceName} from '../types/app';

const DB_NAME = 'roozhaye_man_o_zari_audio_v1';
const DB_VERSION = 1;
const STORE_CLIPS = 'audio_clips';

interface StoredAudioRecord extends AudioLibraryEntry {
  wavData: ArrayBuffer;
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CLIPS)) {
        db.createObjectStore(STORE_CLIPS, {keyPath: 'id'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function hashTextKey(text: string, voiceName: VoiceName): string {
  let hash = 2166136261;
  const input = `${voiceName}::${text.trim()}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `clip_${(hash >>> 0).toString(36)}`;
}

export async function saveAudioClip(
  meta: Omit<AudioLibraryEntry, 'byteSize' | 'cachedAt'>,
  wavBuffer: ArrayBuffer
): Promise<AudioLibraryEntry> {
  const db = await openAudioDb();
  const record: StoredAudioRecord = {
    ...meta,
    cachedAt: Date.now(),
    byteSize: wavBuffer.byteLength,
    wavData: wavBuffer,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIPS, 'readwrite');
    const store = tx.objectStore(STORE_CLIPS);
    const req = store.put(record);
    req.onsuccess = () => {
      const {wavData: _ignored, ...entry} = record;
      resolve(entry);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAudioClipBuffer(id: string): Promise<ArrayBuffer | null> {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIPS, 'readonly');
    const store = tx.objectStore(STORE_CLIPS);
    const req = store.get(id);
    req.onsuccess = () => {
      const rec = req.result as StoredAudioRecord | undefined;
      resolve(rec?.wavData ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listAudioClips(): Promise<AudioLibraryEntry[]> {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIPS, 'readonly');
    const store = tx.objectStore(STORE_CLIPS);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as StoredAudioRecord[]) ?? [];
      const items: AudioLibraryEntry[] = records
        .map(({wavData: _ignored, ...rest}) => rest)
        .sort((a, b) => b.cachedAt - a.cachedAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudioClip(id: string): Promise<void> {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIPS, 'readwrite');
    const store = tx.objectStore(STORE_CLIPS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllAudioClips(): Promise<void> {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CLIPS, 'readwrite');
    const store = tx.objectStore(STORE_CLIPS);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates a warm chime + optional spoken WAV combined into a single
 * 24kHz mono 16-bit PCM WAV Blob ready to set as a custom contact ringtone on Android/MIUI.
 */
export async function buildCallerRingtoneWav(
  spokenWavBuffer: ArrayBuffer | null,
  chimeStyle: 'gentle' | 'classic' | 'chime',
  repeatCount: 1 | 2
): Promise<Blob> {
  const sampleRate = 24000;
  const chimeDurationSec = chimeStyle === 'classic' ? 0.9 : 0.75;
  const chimeSamples = Math.floor(sampleRate * chimeDurationSec);
  const pauseSamples = Math.floor(sampleRate * 0.35);

  const chimePcm = new Int16Array(chimeSamples);
  const notes =
    chimeStyle === 'chime'
      ? [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
      : chimeStyle === 'gentle'
        ? [440, 554.37, 659.25] // A4 C#5 E5
        : [587.33, 880, 587.33, 880]; // Classic D5 A5

  const noteLen = Math.floor(chimeSamples / notes.length);
  for (let i = 0; i < chimeSamples; i++) {
    const noteIdx = Math.min(notes.length - 1, Math.floor(i / noteLen));
    const localI = i - noteIdx * noteLen;
    const freq = notes[noteIdx];
    const t = localI / sampleRate;
    const env = Math.min(1, localI / 300) * Math.exp((-3.8 * localI) / noteLen);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.45 * env + Math.sin(4 * Math.PI * freq * t) * 0.1 * env;
    chimePcm[i] = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
  }

  let speechPcm = new Int16Array(0);
  if (spokenWavBuffer && spokenWavBuffer.byteLength > 44) {
    // Gemini unary TTS returns 24kHz mono 16-bit WAV with 44-byte RIFF header (or variable header)
    const view = new DataView(spokenWavBuffer);
    let dataOffset = 44;
    let dataLength = spokenWavBuffer.byteLength - 44;
    // Scan chunks safely for "data"
    let offset = 12;
    while (offset + 8 <= spokenWavBuffer.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataLength = Math.min(chunkSize, spokenWavBuffer.byteLength - dataOffset);
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    const sampleCount = Math.floor(dataLength / 2);
    speechPcm = new Int16Array(spokenWavBuffer, dataOffset, sampleCount);
  }

  const parts: Int16Array[] = [chimePcm, new Int16Array(pauseSamples)];
  if (speechPcm.length > 0) {
    parts.push(speechPcm);
    if (repeatCount === 2) {
      parts.push(new Int16Array(Math.floor(sampleRate * 0.55)));
      parts.push(speechPcm);
    }
  }
  parts.push(new Int16Array(Math.floor(sampleRate * 0.4)));

  const totalSamples = parts.reduce((acc, p) => acc + p.length, 0);
  const wavBytes = new ArrayBuffer(44 + totalSamples * 2);
  const outView = new DataView(wavBytes);

  const writeString = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      outView.setUint8(pos + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  outView.setUint32(4, 36 + totalSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  outView.setUint32(16, 16, true); // PCM chunk size
  outView.setUint16(20, 1, true); // PCM format
  outView.setUint16(22, 1, true); // Mono
  outView.setUint32(24, sampleRate, true);
  outView.setUint32(28, sampleRate * 2, true); // Byte rate
  outView.setUint16(32, 2, true); // Block align
  outView.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  outView.setUint32(40, totalSamples * 2, true);

  let writePos = 44;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      outView.setInt16(writePos, part[i], true);
      writePos += 2;
    }
  }

  return new Blob([wavBytes], {type: 'audio/wav'});
}
