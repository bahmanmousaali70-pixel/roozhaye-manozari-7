import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AppSettings,
  CallerContact,
  GoalItem,
  GratitudeEntry,
  HabitItem,
  ScheduledAnnouncement,
} from '../types/app';
import {auth, db, handleFirestoreError, OperationType, type User} from './firebaseClient';

export interface CoupleSpaceInfo {
  spaceId: string;
  title: string;
  ownerUid: string;
  ownerEmail: string;
  partnerEmail: string;
  role: 'owner' | 'partner';
}

function clampStr(val: string | undefined, max: number, fallback = ''): string {
  const s = (val ?? fallback).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

export async function ensureUserAndDiscoverSpace(user: User): Promise<CoupleSpaceInfo> {
  const uid = sanitizeId(user.uid);
  const email = (user.email ?? '').trim();
  const lowerEmail = email.toLowerCase();
  const displayName = clampStr(user.displayName || lowerEmail.split('@')[0], 100, 'همراه');
  const userPath = `users/${uid}`;

  // 1. Ensure user profile exists
  let activeSpaceId = '';
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      activeSpaceId = typeof data.activeSpaceId === 'string' ? data.activeSpaceId : '';
      await updateDoc(userRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  // 2. Check if activeSpaceId is already valid
  if (activeSpaceId) {
    try {
      const spaceSnap = await getDoc(doc(db, 'spaces', activeSpaceId));
      if (spaceSnap.exists()) {
        const sdata = spaceSnap.data();
        const role: 'owner' | 'partner' = sdata.ownerUid === uid ? 'owner' : 'partner';
        await ensureMembership(activeSpaceId, uid, email, displayName, role);
        return {
          spaceId: activeSpaceId,
          title: sdata.title ?? 'فضای مشترک من و زری',
          ownerUid: sdata.ownerUid,
          ownerEmail: sdata.ownerEmail,
          partnerEmail: sdata.partnerEmail ?? '',
          role,
        };
      }
    } catch {
      // fall through to discovery
    }
  }

  // 3. Auto-discover if partnerEmail matches Zari's Gmail!
  if (email) {
    try {
      const partnerQ = query(collection(db, 'spaces'), where('partnerEmail', '==', email));
      const partnerSnaps = await getDocs(partnerQ);
      if (!partnerSnaps.empty) {
        const docSnap = partnerSnaps.docs[0];
        const sdata = docSnap.data();
        const foundId = docSnap.id;
        await ensureMembership(foundId, uid, email, displayName, 'partner');
        await updateDoc(doc(db, 'users', uid), {
          activeSpaceId: foundId,
          updatedAt: serverTimestamp(),
        });
        return {
          spaceId: foundId,
          title: sdata.title ?? 'فضای مشترک من و زری',
          ownerUid: sdata.ownerUid,
          ownerEmail: sdata.ownerEmail,
          partnerEmail: sdata.partnerEmail ?? '',
          role: 'partner',
        };
      }
    } catch (err) {
      console.warn('Partner discovery skipped:', err);
    }
  }

  // 4. Discover own space or create default space
  try {
    const ownerQ = query(collection(db, 'spaces'), where('ownerUid', '==', uid));
    const ownerSnaps = await getDocs(ownerQ);
    if (!ownerSnaps.empty) {
      const docSnap = ownerSnaps.docs[0];
      const sdata = docSnap.data();
      const foundId = docSnap.id;
      await ensureMembership(foundId, uid, email, displayName, 'owner');
      await updateDoc(doc(db, 'users', uid), {
        activeSpaceId: foundId,
        updatedAt: serverTimestamp(),
      });
      return {
        spaceId: foundId,
        title: sdata.title ?? 'فضای مشترک من و زری',
        ownerUid: sdata.ownerUid,
        ownerEmail: sdata.ownerEmail,
        partnerEmail: sdata.partnerEmail ?? '',
        role: 'owner',
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'spaces');
  }

  // 5. Create fresh CoupleSpace owned by this user
  const newSpaceId = sanitizeId(`space_${uid}`);
  try {
    await setDoc(doc(db, 'spaces', newSpaceId), {
      ownerUid: uid,
      ownerEmail: email,
      title: 'فضای مشترک روزهای من و زری',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await ensureMembership(newSpaceId, uid, email, displayName, 'owner');
    await updateDoc(doc(db, 'users', uid), {
      activeSpaceId: newSpaceId,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `spaces/${newSpaceId}`);
  }

  return {
    spaceId: newSpaceId,
    title: 'فضای مشترک روزهای من و زری',
    ownerUid: uid,
    ownerEmail: email,
    partnerEmail: '',
    role: 'owner',
  };
}

async function ensureMembership(
  spaceId: string,
  uid: string,
  email: string,
  displayName: string,
  role: 'owner' | 'partner'
): Promise<void> {
  const memberPath = `spaces/${spaceId}/members/${uid}`;
  try {
    const ref = doc(db, 'spaces', spaceId, 'members', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        email,
        displayName,
        role,
        joinedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, memberPath);
  }
}

export async function invitePartnerEmail(spaceId: string, partnerEmail: string): Promise<void> {
  const cleaned = partnerEmail.trim().toLowerCase();
  const path = `spaces/${spaceId}`;
  try {
    await updateDoc(doc(db, 'spaces', spaceId), {
      partnerEmail: clampStr(cleaned, 254),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function joinSpaceByCode(spaceIdRaw: string, user: User): Promise<CoupleSpaceInfo> {
  const spaceId = sanitizeId(spaceIdRaw.trim());
  const uid = sanitizeId(user.uid);
  const email = (user.email ?? '').trim();
  const displayName = clampStr(user.displayName || email.split('@')[0], 100, 'زری');
  const path = `spaces/${spaceId}`;

  try {
    const snap = await getDoc(doc(db, 'spaces', spaceId));
    if (!snap.exists()) {
      throw new Error('کد فضای مشترک پیدا نشد.');
    }
    const sdata = snap.data();
    const role: 'owner' | 'partner' = sdata.ownerUid === uid ? 'owner' : 'partner';
    await ensureMembership(spaceId, uid, email, displayName, role);
    await updateDoc(doc(db, 'users', uid), {
      activeSpaceId: spaceId,
      updatedAt: serverTimestamp(),
    });
    return {
      spaceId,
      title: sdata.title ?? 'فضای مشترک من و زری',
      ownerUid: sdata.ownerUid,
      ownerEmail: sdata.ownerEmail,
      partnerEmail: sdata.partnerEmail ?? '',
      role,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeToCoupleSpace(
  spaceId: string,
  callbacks: {
    onSpaceMeta: (partnerEmail: string) => void;
    onGoals: (items: GoalItem[]) => void;
    onHabits: (items: HabitItem[]) => void;
    onGratitudes: (items: GratitudeEntry[]) => void;
    onCallers: (items: CallerContact[]) => void;
    onSchedules: (items: ScheduledAnnouncement[]) => void;
    onSettings: (settings: AppSettings) => void;
    onError: (msg: string) => void;
  }
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  const reportListenerError = (label: string, err: Error) => {
    console.warn(`Firestore ${label} listener error:`, err);
    callbacks.onError(err.message || label);
  };

  unsubs.push(
    onSnapshot(
      doc(db, 'spaces', spaceId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          callbacks.onSpaceMeta(typeof data.partnerEmail === 'string' ? data.partnerEmail : '');
        }
      },
      (err) => reportListenerError('spaceMeta', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'goals'),
      (snap) => {
        if (snap.empty) return;
        const items: GoalItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.title !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: data.title,
              owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
              scope: data.scope === 'work' || data.scope === 'home' ? data.scope : undefined,
              category: data.category ?? 'purpose',
              timeBlock: data.timeBlock ?? 'morning',
              priority: data.priority === 'high' ? 'high' : 'normal',
              completed: Boolean(data.completed),
              dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
              reminderTime: typeof data.reminderTime === 'string' && data.reminderTime ? data.reminderTime : undefined,
              reminderVoice: typeof data.reminderVoice === 'string' ? data.reminderVoice : undefined,
              createdAt: Number(data.clientCreatedAt ?? Date.now()),
            } as GoalItem;
          })
          .filter((item): item is GoalItem => item !== null)
          .sort((a, b) => b.createdAt - a.createdAt);
        if (items.length > 0) callbacks.onGoals(items);
      },
      (err) => reportListenerError('goals', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'habits'),
      (snap) => {
        if (snap.empty) return;
        const items: HabitItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.title !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: data.title,
              owner: data.owner === 'man' || data.owner === 'zari' || data.owner === 'both' ? data.owner : 'both',
              completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
            } as HabitItem;
          })
          .filter((item): item is HabitItem => item !== null);
        if (items.length > 0) callbacks.onHabits(items);
      },
      (err) => reportListenerError('habits', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'gratitudes'),
      (snap) => {
        if (snap.empty) return;
        const items: GratitudeEntry[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data) return null;
            const arr = Array.isArray(data.items) ? data.items : ['', '', ''];
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              dateKey: typeof data.dateKey === 'string' ? data.dateKey : '',
              jalaliDate: typeof data.jalaliDate === 'string' ? data.jalaliDate : 'امروز',
              author: data.author === 'man' || data.author === 'zari' || data.author === 'both' ? data.author : 'both',
              mood: data.mood ?? 'grateful',
              items: [arr[0] ?? '', arr[1] ?? '', arr[2] ?? ''] as [string, string, string],
              loveNote: typeof data.loveNote === 'string' ? data.loveNote : '',
              createdAt: Number(data.clientCreatedAt ?? Date.now()),
            } as GratitudeEntry;
          })
          .filter((item): item is GratitudeEntry => item !== null)
          .sort((a, b) => b.createdAt - a.createdAt);
        if (items.length > 0) callbacks.onGratitudes(items);
      },
      (err) => reportListenerError('gratitudes', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'callers'),
      (snap) => {
        if (snap.empty) return;
        const items: CallerContact[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.name !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              name: data.name,
              latinAlias: typeof data.latinAlias === 'string' ? data.latinAlias : undefined,
              persianPhonetic: typeof data.persianPhonetic === 'string' ? data.persianPhonetic : undefined,
              relation: typeof data.relation === 'string' ? data.relation : '',
              template: typeof data.template === 'string' ? data.template : 'تماس ورودی از طرف {name}',
              repeatCount: data.repeatCount === 2 ? 2 : 1,
              chimeStyle: data.chimeStyle ?? 'gentle',
              voiceName: data.voiceName ?? 'Kore',
              favorite: Boolean(data.favorite),
            } as CallerContact;
          })
          .filter((item): item is CallerContact => item !== null);
        if (items.length > 0) callbacks.onCallers(items);
      },
      (err) => reportListenerError('callers', err)
    )
  );

  unsubs.push(
    onSnapshot(
      collection(db, 'spaces', spaceId, 'schedules'),
      (snap) => {
        if (snap.empty) return;
        const items: ScheduledAnnouncement[] = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data || typeof data.title !== 'string') return null;
            return {
              id: typeof data.id === 'string' ? data.id : d.id,
              title: data.title,
              topic: data.topic ?? 'morning',
              time: typeof data.time === 'string' ? data.time : '08:00',
              enabled: Boolean(data.enabled),
              voiceName: data.voiceName ?? 'Kore',
              customText: typeof data.customText === 'string' ? data.customText : undefined,
              days: data.days ?? 'daily',
              lastTriggeredDate: typeof data.lastTriggeredDate === 'string' ? data.lastTriggeredDate : undefined,
            } as ScheduledAnnouncement;
          })
          .filter((item): item is ScheduledAnnouncement => item !== null);
        if (items.length > 0) callbacks.onSchedules(items);
      },
      (err) => reportListenerError('schedules', err)
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'spaces', spaceId, 'config', 'settings'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const rawMyName = typeof data.myName === 'string' && data.myName.trim() ? data.myName.trim() : 'بهمن';
        callbacks.onSettings({
          theme: data.theme === 'dark' ? 'dark' : 'light',
          defaultVoice: data.defaultVoice ?? 'Kore',
          speechRate: Number(data.speechRate ?? 1),
          myName: rawMyName === 'مهدی' ? 'بهمن' : rawMyName,
          partnerName: typeof data.partnerName === 'string' && data.partnerName.trim() ? data.partnerName : 'زری',
          backgroundKeepAlive: Boolean(data.backgroundKeepAlive),
          announceCalls: data.announceCalls !== undefined ? Boolean(data.announceCalls) : true,
          announceSms: data.announceSms !== undefined ? Boolean(data.announceSms) : true,
          autoOpenMorning: data.autoOpenMorning !== undefined ? Boolean(data.autoOpenMorning) : true,
          nightMovieAutoCheck: data.nightMovieAutoCheck !== undefined ? Boolean(data.nightMovieAutoCheck) : true,
          nightMovieTime: typeof data.nightMovieTime === 'string' && /^\d{2}:\d{2}$/.test(data.nightMovieTime) ? data.nightMovieTime : '22:00',
        });
      },
      (err) => reportListenerError('settings', err)
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

function getUidOrNull(): string | null {
  return auth.currentUser?.uid ? sanitizeId(auth.currentUser.uid) : null;
}

export async function pushGoalToCloud(spaceId: string, goal: GoalItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(goal.id);
  const path = `spaces/${spaceId}/goals/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'goals', id);
  const fields: Record<string, unknown> = {
    title: clampStr(goal.title, 300, 'هدف'),
    owner: goal.owner,
    category: goal.category,
    timeBlock: goal.timeBlock,
    priority: goal.priority,
    completed: Boolean(goal.completed),
    dateKey: clampStr(goal.dateKey, 20),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (goal.scope === 'home' || goal.scope === 'work') {
    fields.scope = goal.scope;
  }
  if (goal.reminderTime && /^\d{2}:\d{2}$/.test(goal.reminderTime)) {
    fields.reminderTime = goal.reminderTime;
  }
  if (goal.reminderVoice) {
    fields.reminderVoice = goal.reminderVoice;
  }

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        clientCreatedAt: Number(goal.createdAt || Date.now()),
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteGoalFromCloud(spaceId: string, goalId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(goalId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'goals', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/goals/${id}`);
  }
}

export async function pushHabitToCloud(spaceId: string, habit: HabitItem): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(habit.id);
  const path = `spaces/${spaceId}/habits/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'habits', id);
  const dates = (habit.completedDates ?? []).slice(-365).map((d) => clampStr(d, 20));
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        title: clampStr(habit.title, 200, 'عادت'),
        owner: habit.owner,
        completedDates: dates,
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id,
        title: clampStr(habit.title, 200, 'عادت'),
        owner: habit.owner,
        completedDates: dates,
        authorUid: uid,
        updatedByUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteHabitFromCloud(spaceId: string, habitId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(habitId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'habits', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/habits/${id}`);
  }
}

export async function pushGratitudeToCloud(spaceId: string, entry: GratitudeEntry): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(entry.id);
  const path = `spaces/${spaceId}/gratitudes/${id}`;
  try {
    await setDoc(doc(db, 'spaces', spaceId, 'gratitudes', id), {
      id,
      dateKey: clampStr(entry.dateKey, 20),
      jalaliDate: clampStr(entry.jalaliDate, 80, 'امروز'),
      author: entry.author,
      mood: entry.mood,
      items: [
        clampStr(entry.items[0], 300),
        clampStr(entry.items[1], 300),
        clampStr(entry.items[2], 300),
      ],
      loveNote: clampStr(entry.loveNote, 600),
      clientCreatedAt: Number(entry.createdAt || Date.now()),
      authorUid: uid,
      updatedByUid: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteGratitudeFromCloud(spaceId: string, entryId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(entryId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'gratitudes', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/gratitudes/${id}`);
  }
}

export async function pushCallerToCloud(spaceId: string, caller: CallerContact): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(caller.id);
  const path = `spaces/${spaceId}/callers/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'callers', id);
  const baseFields: Record<string, unknown> = {
    name: clampStr(caller.name, 120, 'مخاطب'),
    relation: clampStr(caller.relation, 80),
    template: clampStr(caller.template, 240, 'تماس از طرف {name}'),
    repeatCount: caller.repeatCount === 2 ? 2 : 1,
    chimeStyle: caller.chimeStyle,
    voiceName: caller.voiceName,
    favorite: Boolean(caller.favorite),
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (caller.latinAlias) baseFields.latinAlias = clampStr(caller.latinAlias, 120);
  if (caller.persianPhonetic) baseFields.persianPhonetic = clampStr(caller.persianPhonetic, 120);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, baseFields);
    } else {
      await setDoc(ref, {
        ...baseFields,
        id,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCallerFromCloud(spaceId: string, callerId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(callerId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'callers', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/callers/${id}`);
  }
}

export async function pushScheduleToCloud(
  spaceId: string,
  schedule: ScheduledAnnouncement
): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const id = sanitizeId(schedule.id);
  const path = `spaces/${spaceId}/schedules/${id}`;
  const ref = doc(db, 'spaces', spaceId, 'schedules', id);
  const fields: Record<string, unknown> = {
    title: clampStr(schedule.title, 140, 'یادآور'),
    topic: schedule.topic,
    time: /^\d{2}:\d{2}$/.test(schedule.time) ? schedule.time : '08:00',
    enabled: Boolean(schedule.enabled),
    voiceName: schedule.voiceName,
    days: schedule.days,
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  if (schedule.customText) fields.customText = clampStr(schedule.customText, 600);
  if (schedule.lastTriggeredDate) {
    fields.lastTriggeredDate = clampStr(schedule.lastTriggeredDate, 20);
  }

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ...fields,
        id,
        authorUid: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteScheduleFromCloud(spaceId: string, scheduleId: string): Promise<void> {
  if (!getUidOrNull()) return;
  const id = sanitizeId(scheduleId);
  try {
    await deleteDoc(doc(db, 'spaces', spaceId, 'schedules', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `spaces/${spaceId}/schedules/${id}`);
  }
}

export async function pushSettingsToCloud(spaceId: string, settings: AppSettings): Promise<void> {
  const uid = getUidOrNull();
  if (!uid) return;
  const path = `spaces/${spaceId}/config/settings`;
  const ref = doc(db, 'spaces', spaceId, 'config', 'settings');
  const payload = {
    theme: settings.theme === 'dark' ? 'dark' : 'light',
    defaultVoice: settings.defaultVoice,
    speechRate: Math.max(0.5, Math.min(2, Number(settings.speechRate || 1))),
    myName: clampStr(settings.myName, 60, 'بهمن'),
    partnerName: clampStr(settings.partnerName, 60, 'زری'),
    backgroundKeepAlive: Boolean(settings.backgroundKeepAlive),
    announceCalls: Boolean(settings.announceCalls ?? true),
    announceSms: Boolean(settings.announceSms ?? true),
    autoOpenMorning: Boolean(settings.autoOpenMorning ?? true),
    nightMovieAutoCheck: Boolean(settings.nightMovieAutoCheck ?? true),
    nightMovieTime: /^\d{2}:\d{2}$/.test(settings.nightMovieTime || '') ? settings.nightMovieTime : '22:00',
    updatedByUid: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function uploadLocalBundleToSpace(
  spaceId: string,
  bundle: {
    goals: GoalItem[];
    habits: HabitItem[];
    gratitudes: GratitudeEntry[];
    callers: CallerContact[];
    schedules: ScheduledAnnouncement[];
    settings: AppSettings;
  }
): Promise<void> {
  await pushSettingsToCloud(spaceId, bundle.settings);
  await Promise.all([
    ...bundle.goals.map((g) => pushGoalToCloud(spaceId, g)),
    ...bundle.habits.map((h) => pushHabitToCloud(spaceId, h)),
    ...bundle.gratitudes.map((gr) => pushGratitudeToCloud(spaceId, gr)),
    ...bundle.callers.map((c) => pushCallerToCloud(spaceId, c)),
    ...bundle.schedules.map((s) => pushScheduleToCloud(spaceId, s)),
  ]);
}
