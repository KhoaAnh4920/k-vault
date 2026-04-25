import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MediaPlayerInstance } from "@vidstack/react";
import type { Video } from "@/lib/api";

// ── Shared Imperative Player Reference ───────────────────────────────────
// This escapes Zustand and React reactivity entirely. Storing complex DOM
// instances in Zustand corrupts Vidstack's internal proxies. We use this plain
// object to let the watch page imperatively access the player (for seek/duration)
// without breaking the player instance.
export const globalPlayerRef: { current: MediaPlayerInstance | null } = {
  current: null,
};

// ─── Persisted preferences (serializable, user-controlled) ───────────────────
// Only these keys are written to localStorage — never runtime/DOM state.

type PersistedPrefs = {
  autoplay: boolean;
  loop: boolean;
  ambient: boolean;
  /** 0.0 – 1.0, synced from Vidstack's onVolumeChange */
  volume: number;
  /** Needed for the browser autoplay policy workaround in GlobalPlayer */
  muted: boolean;
};

// ─── Full store shape ─────────────────────────────────────────────────────────

type PlayerState = PersistedPrefs & {
  // Runtime state (not persisted)
  activeVideo: Video | null;
  playlistUrl: string | null;
  isPlaying: boolean;
  isMiniplayer: boolean;
  /** DOM reference — excluded from persistence via partialize */
  placeholderNode: HTMLElement | null;

  // ── Page-Scoped Event Callbacks ──────────────────────────────────────────
  // The watch page registers these so GlobalPlayer can wire them to <MediaPlayer>.
  // Both are null when not on the watch page (cleaned up on unmount).
  onTimeUpdateCallback: ((detail: { currentTime: number }) => void) | null;
  onEndedCallback: (() => void) | null;

  actions: {
    playVideo: (video: Video, playlistUrl: string) => void;
    closePlayer: () => void;
    setIsPlaying: (playing: boolean) => void;
    setIsMiniplayer: (mini: boolean) => void;
    setAutoplay: (autoplay: boolean) => void;
    setLoop: (loop: boolean) => void;
    setAmbient: (ambient: boolean) => void;
    setVolume: (volume: number) => void;
    setMuted: (muted: boolean) => void;
    setPlaceholderNode: (node: HTMLElement | null) => void;
    setOnTimeUpdateCallback: (cb: ((detail: { currentTime: number }) => void) | null) => void;
    setOnEndedCallback: (cb: (() => void) | null) => void;
  };
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      // ── Runtime state (not persisted) ──────────────────────────────────────
      activeVideo: null,
      playlistUrl: null,
      isPlaying: false,
      isMiniplayer: false,
      placeholderNode: null,
      onTimeUpdateCallback: null,
      onEndedCallback: null,

      // ── Persisted preferences (defaults) ───────────────────────────────────
      autoplay: true,
      loop: false,
      ambient: true,
      volume: 1,
      muted: false,

      actions: {
        playVideo: (video, playlistUrl) => set({ activeVideo: video, playlistUrl }),
        closePlayer: () =>
          set({
            activeVideo: null,
            playlistUrl: null,
            isPlaying: false,
            placeholderNode: null,
          }),
        setIsPlaying: (playing) => set({ isPlaying: playing }),
        setIsMiniplayer: (mini) => set({ isMiniplayer: mini }),
        setAutoplay: (autoplay) => set({ autoplay }),
        setLoop: (loop) => set({ loop }),
        setAmbient: (ambient) => set({ ambient }),
        setVolume: (volume) => set({ volume }),
        setMuted: (muted) => set({ muted }),
        setPlaceholderNode: (node) => set({ placeholderNode: node }),
        setOnTimeUpdateCallback: (cb) => set({ onTimeUpdateCallback: cb }),
        setOnEndedCallback: (cb) => set({ onEndedCallback: cb }),
      },
    }),
    {
      name: "k-vault-player-prefs",
      storage: createJSONStorage(() => localStorage),

      // Only serialize user preferences — never runtime, callbacks, or DOM state.
      partialize: (state) => ({
        autoplay: state.autoplay,
        loop: state.loop,
        ambient: state.ambient,
        volume: state.volume,
        muted: state.muted,
      }),

      // ── SSR Safety ─────────────────────────────────────────────────────────
      // skipHydration: true prevents Zustand from calling localStorage during
      // the server render, avoiding React hydration mismatches.
      // useHydrateStore (called in Providers.tsx) triggers rehydration after
      // the first client-side render completes.
      skipHydration: true,
    },
  ),
);

export const useVideoPlayer = () => usePlayerStore((s) => s);
