"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { videoApi, WatchHistoryEntry } from "@/lib/api";
import { ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function ProgressBar({ progress, duration }: { progress: number; duration: number }) {
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  return (
    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-rose-500 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function HistoryCard({ entry }: { entry: WatchHistoryEntry }) {
  const { video, progress, duration } = entry;
  const remaining = Math.max(0, Math.round(duration - progress));
  const pct = duration > 0 ? Math.round((progress / duration) * 100) : 0;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m left` : `${s}s left`;
  };

  return (
    <Link
      href={`/watch/${video.id}`}
      className={cn(
        "group relative flex-shrink-0 w-52 sm:w-60 rounded-xl overflow-hidden",
        "bg-card border border-border/50",
        "hover:border-rose-500/40 hover:shadow-lg hover:shadow-rose-500/10",
        "transition-all duration-200 hover:-translate-y-0.5",
        "snap-start",
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        <img
          src={videoApi.getThumbnailUrl(video.id)}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        {/* Progress percentage badge */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-semibold text-white">
          {pct}%
        </div>
      </div>

      {/* Progress bar flush to thumbnail bottom */}
      <ProgressBar progress={progress} duration={duration} />

      {/* Info */}
      <div className="px-3 py-2.5">
        <p
          className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-1.5 group-hover:text-rose-400 transition-colors"
          title={video.title}
        >
          {video.title}
        </p>
        {remaining > 0 && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatTime(remaining)}
          </p>
        )}
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-52 sm:w-60 rounded-xl overflow-hidden bg-card border border-border/40 animate-pulse snap-start">
      <div className="aspect-video bg-muted" />
      <div className="h-1 bg-muted" />
      <div className="px-3 py-2.5 space-y-2">
        <div className="h-3.5 bg-muted rounded w-4/5" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}

export function ContinueWatchingRow() {
  const { data: session, status } = useSession();
  const [entries, setEntries] = useState<WatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setLoading(false);
      return;
    }

    videoApi
      .getWatchHistory(20)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  // Don't render anything for guests or when there's nothing in progress
  if (!loading && (status === "unauthenticated" || entries.length === 0)) {
    return null;
  }

  return (
    <section className="mb-8" aria-label="Continue Watching">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500/15">
            <Clock className="w-3.5 h-3.5 text-rose-400" />
          </span>
          Continue Watching
        </h2>
        <Link
          href="/watch"
          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-rose-400 transition-colors"
        >
          See all
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Horizontal scroll container */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-3 overflow-x-auto pb-2",
          "snap-x snap-mandatory scroll-smooth",
          // Hide scrollbar on all browsers but keep functionality
          "[&::-webkit-scrollbar]:h-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full",
        )}
      >
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          : entries.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} />
            ))}
      </div>
    </section>
  );
}
