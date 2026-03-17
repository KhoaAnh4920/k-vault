"use client";

import { useEffect, useState } from "react";
import { videoApi, type Video } from "@/lib/api";

const POLL_INTERVAL = 5000;

const CATEGORY_LABELS: Record<string, string> = {
  entertainment: "Entertainment",
  education: "Education",
  music: "Music",
  gaming: "Gaming",
  sports: "Sports",
  tech: "Tech",
  other: "Other",
};

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

function formatDuration(secs: number | null): string | null {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

  const duration = formatDuration(video.durationSeconds);

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
        {/* Thumbnail */}
        <div
          style={{
            aspectRatio: "16/9",
            background: "linear-gradient(135deg, #1a1a25 0%, #0f0f1a 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Thumbnail image — hidden on error (video still processing or no thumbnail) */}
          {video.status === "ready" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={videoApi.getThumbnailUrl(video.id)}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          )}

          {/* Overlay icon */}
          {video.status === "ready" ? (
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(4px)",
                border: "2px solid rgba(255,255,255,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                color: "#fff",
                position: "relative",
              }}
            >
              ▶
            </div>
          ) : video.status === "processing" ? (
            <div className="spinner" />
          ) : (
            <span style={{ fontSize: 28 }}>⚠</span>
          )}

          {/* Duration badge */}
          {duration && (
            <span
              style={{
                position: "absolute",
                bottom: 8,
                right: 8,
                background: "rgba(0,0,0,0.75)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                letterSpacing: "0.02em",
              }}
            >
              {duration}
            </span>
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
          <h3
            style={{
              margin: "0 0 8px",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.8em",
            }}
          >
            {video.title}
          </h3>
          <div style={{ marginBottom: 8 }}>
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
  const [activeCategory, setActiveCategory] = useState<string | undefined>(
    undefined,
  );

  // Collect all categories present in the loaded video list
  const availableCategories = Array.from(
    new Set(videos.map((v) => v.category).filter(Boolean)),
  ) as string[];

  const fetchVideos = async (category?: string) => {
    try {
      const data = await videoApi.list(category);
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

  const handleCategoryChange = (cat: string | undefined) => {
    setActiveCategory(cat);
    setLoading(true);
    void fetchVideos(cat);
  };

  useEffect(() => {
    void fetchVideos();
    // Poll every 5s so processing status updates automatically
    const interval = setInterval(
      () => void fetchVideos(activeCategory),
      POLL_INTERVAL,
    );
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasProcessing = videos.some((v) => v.status === "processing");

  return (
    <div
      className="container-main"
      style={{ paddingTop: 48, paddingBottom: 80 }}
    >
      {/* Hero */}
      <div style={{ marginBottom: 32 }}>
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

      {/* Category filter chips */}
      {(availableCategories.length > 0 || activeCategory) && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 32,
          }}
        >
          <button
            onClick={() => handleCategoryChange(undefined)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: !activeCategory ? "var(--accent)" : "var(--bg-card)",
              color: !activeCategory ? "#0a0a0f" : "var(--text-secondary)",
              fontWeight: !activeCategory ? 600 : 400,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            All
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "1px solid var(--border)",
                background:
                  activeCategory === cat ? "var(--accent)" : "var(--bg-card)",
                color:
                  activeCategory === cat ? "#0a0a0f" : "var(--text-secondary)",
                fontWeight: activeCategory === cat ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      )}

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
