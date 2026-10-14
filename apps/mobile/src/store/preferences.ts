import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface PreferencesState {
  hydrated: boolean;
  onboardingDone: boolean;
  /** Espejo local de los intereses para respuesta instantánea y modo offline. */
  interests: string[];
  setInterests: (slugs: string[]) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  markHydrated: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboardingDone: false,
      interests: [],
      setInterests: (slugs) => set({ interests: Array.from(new Set(slugs)) }),
      completeOnboarding: () => set({ onboardingDone: true }),
      resetOnboarding: () => set({ onboardingDone: false }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'culturaba.preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ onboardingDone: s.onboardingDone, interests: s.interests }),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);
