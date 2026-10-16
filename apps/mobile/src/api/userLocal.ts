import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserAction, UserActionRecord, UserApi } from './types';

const needsServer = async (): Promise<never> => {
  throw new Error('Esto necesita conexión. Revisá tu internet e intentá de nuevo.');
};

const INTERESTS_KEY = 'culturaba.local.interests';
const ACTIONS_KEY = 'culturaba.local.actions';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // almacenamiento no disponible (modo privado, etc.): la UI sigue funcionando en memoria
  }
}

/**
 * Preferencias y acciones guardadas solo en el dispositivo. Se usa cuando no hay
 * sesión (sin red al primer arranque, o Supabase no configurado). Idempotente.
 */
export function createLocalUserApi(): UserApi {
  return {
    kind: 'local',
    id: 'local',
    getInterests: () => readJson<string[]>(INTERESTS_KEY, []),
    async setInterests(slugs) {
      await writeJson(INTERESTS_KEY, Array.from(new Set(slugs)));
    },
    listActions: () => readJson<UserActionRecord[]>(ACTIONS_KEY, []),
    async addAction(eventId, action: UserAction) {
      const all = await readJson<UserActionRecord[]>(ACTIONS_KEY, []);
      if (all.some((a) => a.eventId === eventId && a.action === action)) return;
      all.push({ eventId, action, createdAt: new Date().toISOString() });
      await writeJson(ACTIONS_KEY, all);
    },
    async removeAction(eventId, action) {
      const all = await readJson<UserActionRecord[]>(ACTIONS_KEY, []);
      await writeJson(
        ACTIONS_KEY,
        all.filter((a) => !(a.eventId === eventId && a.action === action)),
      );
    },
    listDiary: async () => [],
    addDiaryEntry: needsServer,
    updateDiaryEntry: needsServer,
    deleteDiaryEntry: needsServer,
    checkIn: needsServer,
    getPoints: async () => ({ balance: 0, moves: [] }),
    listRewards: async () => [],
    redeemReward: needsServer,
    listRedemptions: async () => [],
    getUsername: async () => null,
    setUsername: needsServer,
    listFriends: async () => [],
    sendFriendRequest: needsServer,
    respondFriendRequest: needsServer,
    removeFriend: needsServer,
    leaderboard: async () => [],
  };
}
