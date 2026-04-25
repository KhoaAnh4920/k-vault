"use client";

import { useState, useRef, useEffect } from "react";
import { Settings } from "lucide-react";

export interface PlayerSettingsProps {
  autoplay: boolean;
  setAutoplay: (val: boolean) => void;
  loop: boolean;
  setLoop: (val: boolean) => void;
  ambient: boolean;
  setAmbient: (val: boolean) => void;
}

export function PlayerSettingsMenu({
  autoplay,
  setAutoplay,
  loop,
  setLoop,
  ambient,
  setAmbient,
}: PlayerSettingsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div
      className="absolute top-4 right-4 z-[70] pointer-events-auto"
      ref={menuRef}
    >
      <button
        onClick={() => setOpen(!open)}
        className="bg-black/40 hover:bg-black/60 text-white p-2 flex rounded-full backdrop-blur-md transition-all h-9 w-9 items-center justify-center shadow-lg border border-white/10"
      >
        <Settings
          className={`w-5 h-5 transition-transform duration-300 ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-3 w-56 bg-black/85 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl p-2 animate-in fade-in zoom-in duration-200 origin-top-right">
          <label className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-white/10 rounded-lg cursor-pointer group transition-colors">
            <span className="text-white text-sm font-medium">Autoplay</span>
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => setAutoplay(e.target.checked)}
              className="accent-primary w-4 h-4 scale-110"
            />
          </label>
          <label className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-white/10 rounded-lg cursor-pointer group transition-colors">
            <span className="text-white text-sm font-medium">Loop</span>
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="accent-primary w-4 h-4 scale-110"
            />
          </label>
          <label className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-white/10 rounded-lg cursor-pointer group transition-colors">
            <span className="text-white text-sm font-medium">Ambient Mode</span>
            <input
              type="checkbox"
              checked={ambient}
              onChange={(e) => setAmbient(e.target.checked)}
              className="accent-primary w-4 h-4 scale-110"
            />
          </label>
        </div>
      )}
    </div>
  );
}
