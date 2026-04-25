"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVideoPlayer } from "@/lib/stores/usePlayerStore";
import {
  MediaPlayer,
  MediaProvider,
  isHLSProvider,
  MediaPlayerInstance,
  Gesture,
} from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";
import { videoApi } from "@/lib/api";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { X, Maximize2 } from "lucide-react";
import Link from "next/link";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { PlayerSettingsMenu } from "@/components/PlayerSettingsMenu";

export function GlobalPlayer() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const accessToken = session?.access_token as string | undefined;

  const playerStore = useVideoPlayer();
  const { activeVideo, playlistUrl, autoplay, loop, ambient, placeholderNode, actions } = playerStore;

  const playerRef = useRef<MediaPlayerInstance>(null);
  const tokenRef = useRef<string | undefined>(accessToken);

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  const isWatchPage = pathname.startsWith("/watch/");

  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const [isPiP, setIsPiP] = useState(false);

  useEffect(() => {
    if (!isWatchPage || !placeholderNode) return;

    const updatePos = () => {
      const rect = placeholderNode.getBoundingClientRect();
      setPos({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    };

    updatePos();
    
    // Track resizing of the element itself
    const observer = new ResizeObserver(() => updatePos());
    observer.observe(placeholderNode);

    window.addEventListener("resize", updatePos);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePos);
    };
  }, [isWatchPage, placeholderNode, activeVideo?.id]); // re-run if video changes

  const handleProviderChange = useCallback(
    (provider: any) => {
      if (isHLSProvider(provider)) {
        provider.config = {
          xhrSetup: (xhr: XMLHttpRequest) => {
            const token = tokenRef.current;
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          },
        };
      }
    },
    []
  );

  if (!activeVideo || !playlistUrl) return null;

  const isHiddenPip = !isWatchPage && isPiP;

  return (
    <div
      className={cn(
        "z-[60] overflow-hidden bg-black shadow-2xl transition-all duration-300 group",
        isWatchPage
          ? "absolute rounded-xl"
          : "fixed bottom-6 right-6 w-80 aspect-video rounded-lg",
        isHiddenPip && "opacity-0 pointer-events-none translate-y-full"
      )}
      style={
        isWatchPage && pos.width > 0
          ? {
              top: pos.top,
              left: pos.left,
              width: pos.width,
              height: pos.height,
            }
          : {}
      }
    >
      {isWatchPage && (
        <div className="absolute top-4 right-4 z-[70] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
           <PlayerSettingsMenu
             autoplay={autoplay}
             setAutoplay={actions.setAutoplay}
             loop={loop}
             setLoop={actions.setLoop}
             ambient={ambient}
             setAmbient={actions.setAmbient}
           />
        </div>
      )}

      {!isWatchPage && (
        <div className="absolute top-2 right-2 z-50 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            href={`/watch/${activeVideo.id}`}
            className="p-1.5 bg-black/60 rounded-md hover:bg-white/20 text-white backdrop-blur"
          >
            <Maximize2 className="w-4 h-4" />
          </Link>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              actions.closePlayer();
            }}
            className="p-1.5 bg-black/60 rounded-md hover:bg-white/20 text-white backdrop-blur"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <MediaPlayer
        ref={playerRef}
        title={activeVideo.title}
        src={{
          src: playlistUrl,
          type: "application/x-mpegurl",
        }}
        poster={videoApi.getThumbnailUrl(activeVideo.id)}
        autoplay={autoplay}
        loop={loop}
        playsInline
        onProviderChange={handleProviderChange}
        onPictureInPictureChange={(active) => {
          setIsPiP(active);
          
          if (!active && !isWatchPage) {
            // User exited PIP while NOT on the watch page.
            // Check if they clicked 'Back to tab' (video is still playing) vs 'X' (video paused).
            if (playerRef.current && !playerRef.current.state.paused) {
              router.push(`/watch/${activeVideo.id}`);
            }
          }
        }}
      >
        <MediaProvider />
        {isWatchPage && (
          <>
            <Gesture className="vds-gesture" event="pointerup" action="toggle:paused" />
            <Gesture className="vds-gesture" event="pointerup" action="toggle:controls" />
            <Gesture className="vds-gesture" event="dblpointerup" action="seek:-10" />
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </>
        )}
        {!isWatchPage && (
           <DefaultVideoLayout icons={defaultLayoutIcons} />
        )}
      </MediaPlayer>
    </div>
  );
}
