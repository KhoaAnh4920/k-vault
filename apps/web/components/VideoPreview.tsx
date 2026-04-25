"use client";

import { useEffect, useRef, useState } from "react";
import { getSession } from "next-auth/react";

interface VideoPreviewProps {
  /** Full HLS playlist URL for this video */
  playlistUrl: string;
  /** Signals the component to begin loading and playing */
  isActive: boolean;
}

export function VideoPreview({ playlistUrl, isActive }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<InstanceType<typeof import("hls.js").default> | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isActive) {
      // Gracefully deactivate: fade out then destroy
      setVisible(false);

      // Brief delay matches the CSS fade-out transition (300ms)
      const teardownTimeout = setTimeout(() => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.src = "";
          videoRef.current.load();
        }
      }, 300);

      return () => clearTimeout(teardownTimeout);
    }

    let destroyed = false;

    const init = async () => {
      // Constraint 2: Lazy-import hls.js — never included in initial page bundle
      const HlsModule = await import("hls.js");
      const Hls = HlsModule.default;

      if (destroyed || !videoRef.current) return;

      const video = videoRef.current;

      // Fetch auth token for the HLS XHR requests
      let authToken: string | null = null;
      try {
        const session = await getSession();
        authToken = session?.access_token ?? null;
      } catch {
        // Best-effort — public videos work without a token
      }

      if (destroyed) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          // Bandwidth constraints — SD quality only, minimal buffering
          startLevel: 0,
          maxBufferLength: 5,
          maxMaxBufferLength: 10,
          // Inject auth header for every XHR segment/playlist request
          xhrSetup: (xhr) => {
            if (authToken) {
              xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
            }
          },
          // Suppress non-fatal console noise during preview
          debug: false,
        });

        hlsRef.current = hls;

        hls.loadSource(playlistUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (destroyed) return;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          // On fatal errors, silently destroy — preview is non-critical
          if (data.fatal) {
            hls.destroy();
            hlsRef.current = null;
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS — no hls.js needed
        video.src = playlistUrl;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
      } else {
        // Browser does not support HLS — skip preview silently
        return;
      }

      // Wait for enough data to play without stutter
      const handleCanPlay = async () => {
        if (destroyed) return;

        setVisible(true);

        // Constraint 1: Catch play() promise to handle AbortError
        // when the user unhovers before the promise resolves.
        try {
          await video.play();
        } catch (err) {
          // DOMException: AbortError — user left before playback started.
          // Any other error — video unavailable or autoplay blocked; fail silently.
          if (process.env.NODE_ENV === "development") {
            console.debug("[VideoPreview] play() aborted:", err);
          }
        }
      };

      video.addEventListener("canplay", handleCanPlay, { once: true });
    };

    void init();

    return () => {
      destroyed = true;
      setVisible(false);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.src = "";
        videoRef.current.load();
      }
    };
  }, [isActive, playlistUrl]);

  return (
    <video
      ref={videoRef}
      muted
      loop
      playsInline
      aria-hidden="true"
      className="video-preview-overlay"
      style={{ opacity: visible ? 1 : 0 }}
    />
  );
}
