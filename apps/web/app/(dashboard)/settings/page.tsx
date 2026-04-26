"use client";

import { useVideoPlayer } from "@/lib/stores/usePlayerStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Play,
  Repeat,
  Sparkles,
  Volume2,
  Settings as SettingsIcon,
} from "lucide-react";

function ToggleRow({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-4 w-full text-left px-4 py-4 rounded-lg hover:bg-accent/50 transition-colors group"
    >
      <div
        className={cn(
          "flex items-center justify-center h-10 w-10 rounded-lg shrink-0 transition-colors",
          enabled
            ? "bg-rose-500/15 text-rose-400"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {/* Toggle pill */}
      <div
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full shrink-0 transition-colors duration-200",
          enabled ? "bg-rose-500" : "bg-border"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-6" : "translate-x-1"
          )}
        />
      </div>
    </button>
  );
}

export default function SettingsPage() {
  const { autoplay, loop, ambient, volume, muted, actions } =
    useVideoPlayer();

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Preferences are saved automatically to your browser.
          </p>
        </div>
      </div>

      {/* Player Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Player Preferences</CardTitle>
          <CardDescription>
            These settings control the global video player behavior. Changes are
            persisted in localStorage.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2">
          <ToggleRow
            icon={Play}
            title="Autoplay"
            description="Automatically play the next video when the current one ends."
            enabled={autoplay}
            onToggle={() => actions.setAutoplay(!autoplay)}
          />
          <Separator className="mx-4" />
          <ToggleRow
            icon={Repeat}
            title="Loop"
            description="Repeat the current video when it finishes playing."
            enabled={loop}
            onToggle={() => actions.setLoop(!loop)}
          />
          <Separator className="mx-4" />
          <ToggleRow
            icon={Sparkles}
            title="Ambient Mode"
            description="Project soft, blurred colors from the video behind the player."
            enabled={ambient}
            onToggle={() => actions.setAmbient(!ambient)}
          />
          <Separator className="mx-4" />
          <ToggleRow
            icon={Volume2}
            title="Start Unmuted"
            description="Begin playback with audio on. When disabled, videos start muted."
            enabled={!muted}
            onToggle={() => actions.setMuted(!muted)}
          />
        </CardContent>
      </Card>

      {/* Volume */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Volume</CardTitle>
          <CardDescription>
            Default volume level for video playback.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) =>
                actions.setVolume(parseInt(e.target.value, 10) / 100)
              }
              className="flex-1 h-2 bg-border rounded-full appearance-none cursor-pointer accent-primary"
            />
            <span className="text-sm font-mono text-muted-foreground w-10 text-right tabular-nums">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
