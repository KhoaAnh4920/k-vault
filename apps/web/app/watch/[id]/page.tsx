"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  MediaPlayer,
  MediaProvider,
  isHLSProvider,
  MediaPlayerInstance,
} from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { videoApi, type Video } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";

function DescriptionWithTimestamps({
  text,
  onSeek,
}: {
  text: string;
  onSeek: (secs: number) => void;
}) {
  if (!text) return null;
  const regex = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const timeStr = match[0];
    parts.push(
      <button
        key={match.index}
        onClick={() => onSeek(totalSeconds)}
        className="text-primary hover:underline font-bold bg-primary/10 px-1 rounded mx-0.5 transition-colors"
      >
        {timeStr}
      </button>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return (
    <p className="mb-4 text-muted-foreground leading-relaxed whitespace-pre-wrap">
      {parts}
    </p>
  );
}

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const accessToken = session?.access_token ?? null;

  // Always hold the latest token in a ref so xhrSetup never captures a stale value
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(0);

  const playerRef = useRef<MediaPlayerInstance>(null);

  // Fetch video data and read watch history
  useEffect(() => {
    videoApi
      .get(id)
      .then((v) => {
        setVideo(v);
        // Load history progress
        try {
          const history = JSON.parse(
            localStorage.getItem("k-vault-history") || "[]",
          );
          const found = history.find((h: any) => h.videoId === v.id);
          // If video isn't finished (leave 5 seconds margin), resume from last position
          if (
            found &&
            v.durationSeconds &&
            found.progress < v.durationSeconds - 5
          ) {
            setStartTime(found.progress);
          }
        } catch {
          // Ignore
        }
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  // Provide Auth Token to HLS.js
  // Reads from tokenRef so the closure never goes stale — token always current.
  const handleProviderChange = useCallback(
    (
      provider: Parameters<
        NonNullable<
          React.ComponentProps<typeof MediaPlayer>["onProviderChange"]
        >
      >[0],
    ) => {
      if (isHLSProvider(provider)) {
        provider.config = {
          xhrSetup: (xhr: XMLHttpRequest) => {
            const token = tokenRef.current;
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          },
        };
      }
    },
    [], // no dependency on accessToken — reads from tokenRef
  );

  // Track playback time safely (throttled locally, saved globally)
  const handleTimeUpdate = useCallback(
    (detail: { currentTime: number }) => {
      if (!video) return;
      try {
        const historyStr = localStorage.getItem("k-vault-history") || "[]";
        let history = JSON.parse(historyStr);
        history = history.filter((h: any) => h.videoId !== video.id);

        // Save current progress
        history.push({
          videoId: video.id,
          progress: detail.currentTime,
          timestamp: Date.now(),
        });

        // Keep only last 100 watched videos
        if (history.length > 100) history.shift();

        localStorage.setItem("k-vault-history", JSON.stringify(history));
      } catch {
        // Ignored
      }
    },
    [video],
  );

  // Jump to specific time (Timestamps click)
  const handleSeek = (secs: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = secs;
      playerRef.current.play();
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <div className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    );
  }

  if (!video) return null;

  return (
    <div className="container mx-auto px-6 pt-12 pb-20 max-w-5xl">
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="mb-6 -ml-4 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      {video.status === "ready" ? (
        <div className="mb-8 rounded-xl overflow-hidden shadow-2xl shadow-black/80 bg-black">
          {/* Wait for session to be resolved before mounting HLS player.
              If the player mounts while accessToken is null, HLS.js fires
              onProviderChange before the token is available and all segment
              requests go out without Authorization → 401 → buffer holes. */}
          {sessionStatus === "loading" || !accessToken ? (
            <div className="aspect-video flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : (
            <MediaPlayer
              ref={playerRef}
              title={video.title}
              src={{
                src: videoApi.getPlaylistUrl(id),
                type: "application/x-mpegurl",
              }}
              poster={videoApi.getThumbnailUrl(id)}
              currentTime={startTime}
              onTimeUpdate={handleTimeUpdate}
              playsInline
              onProviderChange={handleProviderChange}
              onError={() =>
                setPlayerError(
                  "Playback failed. Please try reloading the page.",
                )
              }
            >
              <MediaProvider />
              {/* Vidstack DefaultLayout automatically converts to Mobile Layout on narrow screens
                supporting Double Tap, Gestures, Swipes intuitively */}
              <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>
          )}

          {playerError && (
            <div className="p-4 bg-destructive/10 border-t border-destructive/30 text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {playerError}
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-video bg-card border border-border rounded-xl flex flex-col items-center justify-center mb-8 gap-4 px-4 text-center">
          {video.status === "processing" ? (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <div>
                <p className="m-0 font-semibold text-foreground">
                  Transcoding in progress...
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This may take a few minutes. Start the local worker on your
                  Mac.
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="w-12 h-12 text-destructive mb-2" />
              <p className="m-0 text-muted-foreground">Transcoding failed</p>
            </>
          )}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold mb-2 text-foreground">
          {video.title}
        </h1>
        {video.description && (
          <DescriptionWithTimestamps
            text={video.description}
            onSeek={handleSeek}
          />
        )}
        <div className="flex items-center gap-2 m-0 text-sm text-muted-foreground font-medium">
          <span>
            {new Intl.NumberFormat("en-US", { notation: "compact" }).format(
              video.views,
            )}{" "}
            views
          </span>
          <span>•</span>
          <span>
            {new Date(video.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
