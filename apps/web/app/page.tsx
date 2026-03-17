"use client";

import { useEffect, useState } from "react";
import { videoApi, type Video } from "@/lib/api";

const POLL_INTERVAL = 5000;

function StatusBadge({ status }: { status: Video["status"] }) {
  const map: Record<
    Video["status"],
    { cls: string; dot: string; label: string }
  > = {
    processing: { cls: "badge-processing", dot: "⏳", label: "Processing" },
    ready: { cls: "badge-ready", dot: "●", label: "Ready" },
    error: { cls: "badge-error", dot: "✕", label: "Error" },
  };
  const { cls, dot, label } = map[status];
  return (
    <span className={`badge ${cls}`}>
      {dot} {label}
    </span>
  );
}

function VideoCard({
  video,
  onDelete,
}: {
  video: Video;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Delete "${video.title}"? This will remove all files from Google Drive.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await videoApi.remove(video.id);
      onDelete(video.id);
    } catch {
      alert("Failed to delete video. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <a
      href={video.status === "ready" ? `/watch/${video.id}` : "#"}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div
        className="card"
        style={{
          padding: "0",
          overflow: "hidden",
          cursor: video.status === "ready" ? "pointer" : "default",
          opacity: deleting ? 0.5 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {/* Thumbnail placeholder */}
        <div
          style={{
            aspectRatio: "16/9",
            background: "linear-gradient(135deg, #1a1a25 0%, #0f0f1a 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {video.status === "ready" ? (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                color: "#0a0a0f",
                boxShadow: "0 0 32px rgba(245,158,11,0.4)",
              }}
            >
              ▶
            </div>
          ) : video.status === "processing" ? (
            <div className="spinner" />
          ) : (
            <span style={{ fontSize: 28 }}>⚠</span>
          )}

          {/* Delete button — top-right corner of thumbnail */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete video"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fca5a5",
              fontSize: 14,
              cursor: deleting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!deleting)
                e.currentTarget.style.background = "rgba(239,68,68,0.7)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(0,0,0,0.6)";
            }}
          >
            {deleting ? "…" : "✕"}
          </button>
        </div>

        {/* Info */}
        <div style={{ padding: "16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.3,
              }}
            >
              {video.title}
            </h3>
            <StatusBadge status={video.status} />
          </div>
          <p
            style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}
          >
            {new Date(video.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
    </a>
  );
}

function SkeletonCard() {
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="skeleton" style={{ aspectRatio: "16/9" }} />
      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          className="skeleton"
          style={{ height: 16, borderRadius: 6, width: "70%" }}
        />
        <div
          className="skeleton"
          style={{ height: 12, borderRadius: 4, width: "40%" }}
        />
      </div>
    </div>
  );
}

export default function HomePage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = async () => {
    try {
      const data = await videoApi.list();
      setVideos(data);
      setError(null);
    } catch {
      setError("Failed to load videos. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleted = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  useEffect(() => {
    void fetchVideos();
    // Poll every 5s so processing status updates automatically
    const interval = setInterval(() => void fetchVideos(), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const hasProcessing = videos.some((v) => v.status === "processing");

  return (
    <div
      className="container-main"
      style={{ paddingTop: 48, paddingBottom: 80 }}
    >
      {/* Hero */}
      <div style={{ marginBottom: 48 }}>
        <h1
          style={{
            fontSize: "clamp(28px, 4vw, 48px)",
            margin: "0 0 12px",
            background: "linear-gradient(135deg, #f1f5f9, #94a3b8)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Your Library
        </h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 16 }}>
          {loading
            ? "Loading..."
            : `${videos.length} video${videos.length !== 1 ? "s" : ""}${hasProcessing ? " · Transcoding in progress..." : ""}`}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 32,
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="video-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎬</div>
          <h2 style={{ margin: "0 0 8px", color: "var(--text-primary)" }}>
            No videos yet
          </h2>
          <p style={{ margin: "0 0 24px", color: "var(--text-secondary)" }}>
            Upload your first video to get started
          </p>
          <a href="/upload" className="btn-primary">
            Upload Video
          </a>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} onDelete={handleDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
