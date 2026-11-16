import {Capacitor} from '@capacitor/core';

const SERVER_URL_KEY = 'rmz_cloud_api_base_v1';
const DEFAULT_NATIVE_API_BASE = 'https://roozhaye-manozari-7.ai.studio';

export function getCloudApiBaseUrl(): string {
  if (!Capacitor.isNativePlatform()) {
    return '';
  }
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY)?.trim();
    if (saved) return saved.replace(/\/+$/, '');
  } catch {
    // ignore storage errors
  }
  return DEFAULT_NATIVE_API_BASE;
}

export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function setCloudApiBaseUrl(url: string): string {
  const cleaned = normalizeServerUrl(url);
  try {
    if (cleaned) {
      localStorage.setItem(SERVER_URL_KEY, cleaned);
    } else {
      localStorage.removeItem(SERVER_URL_KEY);
    }
  } catch {
    // ignore
  }
  return cleaned;
}

export function apiUrl(path: string): string {
  const base = getCloudApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
