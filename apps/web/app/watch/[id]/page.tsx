"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { MediaPlayer, MediaProvider, isHLSProvider } from "@vidstack/react";
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

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const accessToken = session?.access_token ?? null;
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    videoApi
      .get(id)
      .then(setVideo)
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  /**
   * Configure hls.js to send the Bearer token with every request
   * (master playlist, quality playlists, and all .ts segments).
   */
  const handleProviderChange = useCallback(
    (
      provider: Parameters<
        NonNullable<
          React.ComponentProps<typeof MediaPlayer>["onProviderChange"]
        >
      >[0],
    ) => {
      if (isHLSProvider(provider) && accessToken) {
        provider.config = {
          xhrSetup: (xhr: XMLHttpRequest) => {
            xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
          },
        };
      }
    },
    [accessToken],
  );

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
          <MediaPlayer
            title={video.title}
            src={{
              src: videoApi.getPlaylistUrl(id),
              type: "application/x-mpegurl",
            }}
            poster={videoApi.getThumbnailUrl(id)}
            playsInline
            onProviderChange={handleProviderChange}
            onError={() =>
              setPlayerError("Playback failed. Please try reloading the page.")
            }
          >
            <MediaProvider />
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </MediaPlayer>
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
                  This may take a few minutes. Start the local worker on your Mac.
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
        <h1 className="text-[clamp(20px,3vw,32px)] font-bold mb-2 text-foreground">
          {video.title}
        </h1>
        {video.description && (
          <p className="mb-4 text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {video.description}
          </p>
        )}
        <p className="m-0 text-sm text-muted-foreground">
          Added{" "}
          {new Date(video.createdAt).toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
