import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TextAlign = "left" | "center" | "right";

export interface OverlaySettings {
  backgroundColor: string;
  backgroundOpacity: number;
  textColor: string;
  textOpacity: number;
  fontSize: number;
  textAlign: TextAlign;
  blur: number;
  glow: number;
  lineSpacing: number;
  showPrevious: boolean;
  showNext: boolean;
  secondaryOpacity: number;
  clickThrough: boolean;
}

export interface OverlayPosition {
  x: number;
  y: number;
}

interface SettingsState extends OverlaySettings {
  setSetting: <K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) => void;
  applySettings: (settings: Partial<OverlaySettings>) => void;
  resetDefaults: () => void;
}

interface PositionState extends OverlayPosition {
  setPosition: (x: number, y: number) => void;
  resetPosition: () => void;
}

export const DEFAULTS: OverlaySettings = {
  backgroundColor: "#000000",
  backgroundOpacity: 0.30,
  textColor: "#ffffff",
  textOpacity: 0.96,
  fontSize: 24,
  textAlign: "center",
  blur: 8,
  glow: 12,
  lineSpacing: 2,
  showPrevious: true,
  showNext: true,
  secondaryOpacity: 0.34,
  clickThrough: false,
};

export const DEFAULT_POSITION: OverlayPosition = {
  x: 50,
  y: 88,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSetting: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      applySettings: (settings) => set(settings),
      resetDefaults: () => set(DEFAULTS),
    }),
    {
      name: "lyricly.settings",
      version: 2,
      migrate: (persistedState) => ({
        ...DEFAULTS,
        ...(persistedState as Partial<OverlaySettings>),
      }),
    }
  )
);

export const usePositionStore = create<PositionState>()(
  persist(
    (set) => ({
      ...DEFAULT_POSITION,
      setPosition: (x, y) => set({ x, y }),
      resetPosition: () => set(DEFAULT_POSITION),
    }),
    {
      name: "lyricly.position",
      version: 1,
      migrate: () => DEFAULT_POSITION,
    }
  )
);
