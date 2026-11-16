import {Capacitor, registerPlugin} from '@capacitor/core';
import {VOICE_PERSONAS} from '../data/persianLibrary';
import type {CallerContact, ScheduledAnnouncement} from '../types/app';

export interface NativeCapabilities {
  isNative: boolean;
  phoneState: boolean;
  callLog: boolean;
  contacts: boolean;
  sms: boolean;
  notificationListener: boolean;
  notifications: boolean;
  batteryIgnored: boolean;
  overlay: boolean;
  keepAliveRunning: boolean;
  exactAlarm: boolean;
}

interface NativeSchedulePayload {
  id: string;
  title: string;
  time: string;
  enabled: boolean;
  days: 'daily' | 'weekdays' | 'weekends';
  voiceGender: 'male' | 'female';
  spokenText: string;
  autoOpen: boolean;
}

interface NativeCallerPayload {
  id: string;
  name: string;
  latinAlias: string;
  persianPhonetic: string;
  template: string;
  repeatCount: number;
  voiceGender: 'male' | 'female';
  voiceName: string;
}

interface RoozhayeNativePlugin {
  getNativeCapabilities(): Promise<NativeCapabilities>;
  requestPermissionsAndMiuiSetup(): Promise<NativeCapabilities>;
  openNotificationListenerSettings(): Promise<{ok: boolean}>;
  openAppInfoSettings(): Promise<{ok: boolean}>;
  setKeepAliveService(options: {enabled: boolean}): Promise<{running: boolean}>;
  setServerBaseUrl(options: {url: string}): Promise<{ok: boolean}>;
  precacheNativeAudio(options: {text: string; voiceName: string; audioBase64: string}): Promise<{ok: boolean}>;
  setAnnounceToggles(options: {
    announceCalls: boolean;
    announceSms: boolean;
    autoOpenMorning: boolean;
    defaultGender: 'male' | 'female';
    defaultVoice: string;
  }): Promise<{ok: boolean}>;
  syncCallers(options: {callersJson: string}): Promise<{count: number}>;
  syncSchedules(options: {schedulesJson: string}): Promise<{count: number}>;
  speakNativeBilingual(options: {text: string; gender: 'male' | 'female'; rate: number}): Promise<{ok: boolean}>;
  testNativeCallAnnouncement(options: {name: string; script: string; gender: 'male' | 'female'; voiceName?: string}): Promise<{ok: boolean}>;
  testNativeSmsAnnouncement(options: {sender: string; body: string; gender: 'male' | 'female'; voiceName?: string}): Promise<{ok: boolean}>;
}

const RoozhayeNative = registerPlugin<RoozhayeNativePlugin>('RoozhayeNative');

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function getVoiceGender(voiceName: string): 'male' | 'female' {
  const persona = VOICE_PERSONAS.find((v) => v.id === voiceName);
  return persona?.gender ?? 'female';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function getNativeCapabilities(): Promise<NativeCapabilities> {
  if (!isNativeAndroid()) {
    return {
      isNative: false,
      phoneState: false,
      callLog: false,
      contacts: false,
      sms: false,
      notificationListener: false,
      notifications: typeof Notification !== 'undefined' && Notification.permission === 'granted',
      batteryIgnored: false,
      overlay: false,
      keepAliveRunning: false,
      exactAlarm: false,
    };
  }
  try {
    const caps = await RoozhayeNative.getNativeCapabilities();
    return {
      ...caps,
      notificationListener: Boolean(caps.notificationListener),
    };
  } catch {
    return {
      isNative: true,
      phoneState: false,
      callLog: false,
      contacts: false,
      sms: false,
      notificationListener: false,
      notifications: false,
      batteryIgnored: false,
      overlay: false,
      keepAliveRunning: false,
      exactAlarm: false,
    };
  }
}

export async function requestNativePermissionsAndMiuiSetup(): Promise<NativeCapabilities | null> {
  if (!isNativeAndroid()) return null;
  try {
    return await RoozhayeNative.requestPermissionsAndMiuiSetup();
  } catch {
    return null;
  }
}

export async function openNotificationListenerSettings(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await RoozhayeNative.openNotificationListenerSettings();
    return res.ok;
  } catch {
    return false;
  }
}

export async function openAppInfoSettings(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await RoozhayeNative.openAppInfoSettings();
    return res.ok;
  } catch {
    return false;
  }
}

export async function setNativeKeepAliveService(enabled: boolean): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await RoozhayeNative.setKeepAliveService({enabled});
    return res.running;
  } catch {
    return false;
  }
}

export async function syncServerBaseUrlToNative(url: string): Promise<void> {
  if (!isNativeAndroid() || !url.trim()) return;
  try {
    await RoozhayeNative.setServerBaseUrl({url: url.trim()});
  } catch {
    // ignore
  }
}

export async function precacheNativeWav(text: string, voiceName: string, buffer: ArrayBuffer): Promise<boolean> {
  if (!isNativeAndroid() || !text.trim() || buffer.byteLength <= 44) return false;
  try {
    const res = await RoozhayeNative.precacheNativeAudio({
      text: text.trim(),
      voiceName,
      audioBase64: arrayBufferToBase64(buffer),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncAnnounceTogglesToNative(options: {
  announceCalls: boolean;
  announceSms: boolean;
  autoOpenMorning: boolean;
  defaultVoice: string;
}): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await RoozhayeNative.setAnnounceToggles({
      announceCalls: options.announceCalls,
      announceSms: options.announceSms,
      autoOpenMorning: options.autoOpenMorning,
      defaultGender: getVoiceGender(options.defaultVoice),
      defaultVoice: options.defaultVoice,
    });
  } catch {
    // ignore
  }
}

export async function syncCallersToNative(callers: CallerContact[]): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    const payload: NativeCallerPayload[] = callers.map((c) => ({
      id: c.id,
      name: c.name,
      latinAlias: c.latinAlias ?? '',
      persianPhonetic: c.persianPhonetic ?? '',
      template: c.template,
      repeatCount: c.repeatCount,
      voiceGender: getVoiceGender(c.voiceName),
      voiceName: c.voiceName,
    }));
    await RoozhayeNative.syncCallers({callersJson: JSON.stringify(payload)});
  } catch {
    // ignore if running in web or plugin unavailable
  }
}

export async function syncSchedulesToNative(
  schedules: ScheduledAnnouncement[],
  resolveText: (s: ScheduledAnnouncement) => string,
  autoOpenMorning = true
): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    const payload: NativeSchedulePayload[] = schedules.map((s) => ({
      id: s.id,
      title: s.title,
      time: s.time,
      enabled: s.enabled,
      days: s.days,
      voiceGender: getVoiceGender(s.voiceName),
      spokenText: resolveText(s),
      autoOpen: autoOpenMorning && s.topic === 'morning',
    }));
    await RoozhayeNative.syncSchedules({schedulesJson: JSON.stringify(payload)});
  } catch {
    // ignore
  }
}

export async function speakNativeBilingual(
  text: string,
  gender: 'male' | 'female',
  rate = 1
): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await RoozhayeNative.speakNativeBilingual({text, gender, rate});
    return res.ok;
  } catch {
    return false;
  }
}

export async function testNativeCallAnnouncement(
  name: string,
  script: string,
  gender: 'male' | 'female',
  voiceName?: string
): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await RoozhayeNative.testNativeCallAnnouncement({name, script, gender, voiceName});
    return res.ok;
  } catch {
    return false;
  }
}

export async function testNativeSmsAnnouncement(
  sender: string,
  body: string,
  gender: 'male' | 'female',
  voiceName?: string
): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  try {
    const res = await RoozhayeNative.testNativeSmsAnnouncement({sender, body, gender, voiceName});
    return res.ok;
  } catch {
    return false;
  }
}
