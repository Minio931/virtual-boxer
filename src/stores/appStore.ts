import { create } from 'zustand';
import type { Stance } from '../core/detect/motionAnalyzer';
import type { EngineSnapshot } from '../core/engine/trainingEngine';
import type { ModelVariant } from '../core/pose/poseEngine';

export interface Settings {
  stance: Stance;
  swapSides: boolean;
  model: ModelVariant;
  /** lustrzany podgląd (jak w lustrze na sali) */
  mirror: boolean;
  showSkeleton: boolean;
}

export interface LinkInfo {
  rttMs: number | null;
  offsetMs: number | null;
}

interface AppState {
  settings: Settings;
  setSettings: (p: Partial<Settings>) => void;
  link: LinkInfo;
  setLink: (p: Partial<LinkInfo>) => void;
  snap: EngineSnapshot | null;
  setSnap: (s: EngineSnapshot | null) => void;
}

const KEY = 'vb.settings.v1';
const DEFAULTS: Settings = { stance: 'orthodox', swapSides: false, model: 'full', mirror: true, showSkeleton: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* tryb prywatny / zablokowane dane */
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: load(),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    save(settings);
    set({ settings });
  },
  link: { rttMs: null, offsetMs: null },
  setLink: (p) => set({ link: { ...get().link, ...p } }),
  snap: null,
  setSnap: (snap) => set({ snap }),
}));
