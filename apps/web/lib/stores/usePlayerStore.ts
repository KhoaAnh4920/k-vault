import { create } from "zustand";
import type { Video } from "@/lib/api";

type PlayerState = {
  activeVideo: Video | null;
  playlistUrl: string | null;
  isPlaying: boolean;
  isMiniplayer: boolean;
  autoplay: boolean;
  loop: boolean;
  ambient: boolean;
  placeholderNode: HTMLElement | null;
  actions: {
    playVideo: (video: Video, playlistUrl: string) => void;
    closePlayer: () => void;
    setIsPlaying: (playing: boolean) => void;
    setIsMiniplayer: (mini: boolean) => void;
    setAutoplay: (autoplay: boolean) => void;
    setLoop: (loop: boolean) => void;
    setAmbient: (ambient: boolean) => void;
    setPlaceholderNode: (node: HTMLElement | null) => void;
  };
};

export const usePlayerStore = create<PlayerState>((set) => ({
  activeVideo: null,
  playlistUrl: null,
  isPlaying: false,
  isMiniplayer: false,
  autoplay: true,
  loop: false,
  ambient: true,
  placeholderNode: null,
  actions: {
    playVideo: (video, playlistUrl) => set({ activeVideo: video, playlistUrl }),
    closePlayer: () => set({ activeVideo: null, playlistUrl: null, isPlaying: false, placeholderNode: null }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setIsMiniplayer: (mini) => set({ isMiniplayer: mini }),
    setAutoplay: (autoplay) => set({ autoplay }),
    setLoop: (loop) => set({ loop }),
    setAmbient: (ambient) => set({ ambient }),
    setPlaceholderNode: (node) => set({ placeholderNode: node }),
  },
}));

export const useVideoPlayer = () => usePlayerStore((s) => s);
