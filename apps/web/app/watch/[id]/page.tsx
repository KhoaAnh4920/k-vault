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
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>
        <div
          className="skeleton"
          style={{ aspectRatio: "16/9", borderRadius: 12 }}
        />
        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            className="skeleton"
            style={{ height: 28, width: "50%", borderRadius: 6 }}
          />
          <div
            className="skeleton"
            style={{ height: 16, width: "35%", borderRadius: 4 }}
          />
        </div>
      </div>
    );
  }

  if (!video) return null;

  return (
    <div
      style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 80px" }}
    >
      <button
        onClick={() => router.back()}
        className="btn-ghost"
        style={{ marginBottom: 24, fontSize: 13 }}
      >
        ← Back
      </button>

      {video.status === "ready" ? (
        <div
          style={{
            marginBottom: 32,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 8px 48px rgba(0,0,0,0.8)",
          }}
        >
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
            {/*
              DefaultVideoLayout automatically shows a "Quality" submenu in the
              settings gear when the master playlist has multiple renditions.
              No manual switcher needed.
            */}
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </MediaPlayer>
          {playerError && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#fca5a5",
                fontSize: 13,
              }}
            >
              ⚠️ {playerError}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            aspectRatio: "16/9",
            background: "var(--bg-card)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
            gap: 16,
          }}
        >
          {video.status === "processing" ? (
            <>
              <div
                className="spinner"
                style={{ width: 40, height: 40, borderWidth: 3 }}
              />
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  Transcoding in progress...
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                  }}
                >
                  This may take a few minutes. Start the local worker on your
                  Mac.
                </p>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 40 }}>⚠️</span>
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                Transcoding failed
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(20px, 3vw, 32px)" }}>
          {video.title}
        </h1>
        {video.description && (
          <p
            style={{
              margin: "0 0 16px",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {video.description}
          </p>
        )}
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>
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
