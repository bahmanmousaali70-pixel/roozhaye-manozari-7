export type AppTab = 'today' | 'gratitude' | 'night' | 'voice' | 'caller' | 'sync';

export type OwnerRole = 'man' | 'zari' | 'both';

export type GoalCategory = 'purpose' | 'health' | 'relationship' | 'work' | 'growth';

export type GoalScope = 'home' | 'work';

export type TimeBlock = 'morning' | 'afternoon' | 'evening';

export interface GoalItem {
  id: string;
  title: string;
  owner: OwnerRole;
  scope?: GoalScope;
  category: GoalCategory;
  timeBlock: TimeBlock;
  priority: 'high' | 'normal';
  completed: boolean;
  dateKey: string;
  createdAt: number;
  reminderTime?: string;
  reminderVoice?: VoiceName;
}

export interface HabitItem {
  id: string;
  title: string;
  owner: OwnerRole;
  completedDates: string[];
}

export type MoodType = 'energetic' | 'grateful' | 'calm' | 'focused' | 'needs_boost';

export interface GratitudeEntry {
  id: string;
  dateKey: string;
  jalaliDate: string;
  author: OwnerRole;
  mood: MoodType;
  items: [string, string, string];
  loveNote: string;
  createdAt: number;
}

export interface MorningMessage {
  id: string;
  title: string;
  message: string;
  affirmation: string;
  energyTip: string;
  dayPart: 'morning' | 'midday' | 'evening';
  isAiGenerated?: boolean;
}

export type VoiceName = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

export interface AudioLibraryEntry {
  id: string;
  title: string;
  text: string;
  category: 'morning' | 'gratitude' | 'energy' | 'caller' | 'custom';
  voiceName: VoiceName;
  style: string;
  cachedAt: number;
  byteSize: number;
  source: 'gemini' | 'offline';
}

export interface CallerContact {
  id: string;
  name: string;
  latinAlias?: string;
  persianPhonetic?: string;
  relation: string;
  template: string;
  repeatCount: 1 | 2;
  chimeStyle: 'gentle' | 'classic' | 'chime';
  voiceName: VoiceName;
  favorite: boolean;
}

export type ScheduleTopic = 'morning' | 'goals' | 'gratitude' | 'energy' | 'night_movies' | 'custom';

export interface ScheduledAnnouncement {
  id: string;
  title: string;
  topic: ScheduleTopic;
  time: string; // HH:MM 24h
  enabled: boolean;
  voiceName: VoiceName;
  customText?: string;
  days: 'daily' | 'weekdays' | 'weekends';
  lastTriggeredDate?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  defaultVoice: VoiceName;
  speechRate: number;
  myName: string;
  partnerName: string;
  backgroundKeepAlive: boolean;
  announceCalls: boolean;
  announceSms: boolean;
  autoOpenMorning: boolean;
  nightMovieAutoCheck: boolean;
  nightMovieTime: string;
}

export interface SpecialMessageResult {
  title: string;
  text: string;
  shortVersion: string;
  occasion: string;
}

export interface GroundingLink {
  title: string;
  url: string;
}

export interface SyncedPhoneContact {
  name: string;
  phone: string;
  persianPhonetic: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  streamUrl: string;
  durationSec?: number;
  isLiveStream?: boolean;
  country?: string;
  tags?: string;
  source: 'audius' | 'archive' | 'radio';
  externalUrl?: string;
}

export interface NightDiscoveryResponse {
  mode: 'music' | 'movies';
  title: string;
  markdownText: string;
  spokenSummary: string;
  links: GroundingLink[];
  tracks?: MusicTrack[];
  fetchedAt: number;
}
