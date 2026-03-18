"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { videoApi, type Video } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Loader2, AlertCircle, Film } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
  const map: Record<Video["status"], { variant: "secondary" | "default" | "destructive" | "outline", dot: string; label: string; cls: string }> = {
    processing: { variant: "outline", dot: "⏳", label: "Processing", cls: "border-amber-500/50 bg-amber-500/10 text-amber-500" },
    ready: { variant: "outline", dot: "●", label: "Ready", cls: "border-green-500/50 bg-green-500/10 text-green-500" },
    error: { variant: "destructive", dot: "✕", label: "Error", cls: "" },
  };
  const { variant, dot, label, cls } = map[status];
  return (
    <Badge variant={variant} className={cn("gap-1.5 uppercase font-semibold text-[10px] tracking-wider", cls)}>
      <span>{dot}</span> {label}
    </Badge>
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
  isAdmin,
}: {
  video: Video;
  onDelete: (id: string) => void;
  isAdmin: boolean;
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
    <Link
      href={video.status === "ready" ? `/watch/${video.id}` : "#"}
      className={cn(
        "block transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl h-full",
        deleting && "opacity-50 pointer-events-none scale-95",
        video.status === "ready" ? "cursor-pointer" : "cursor-default group/processing"
      )}
    >
      <Card className="overflow-hidden h-full flex flex-col group hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/5 hover:border-border/80 transition-all duration-300 bg-card border-border/40">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gradient-to-br from-card to-background border-b border-border/40 flex items-center justify-center overflow-hidden">
          {video.status === "ready" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={videoApi.getThumbnailUrl(video.id)}
              alt=""
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Overlay icon */}
          {video.status === "ready" ? (
            <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 rounded-t-xl" />
          ) : video.status === "processing" ? (
            <Loader2 className="animate-spin text-primary w-8 h-8" />
          ) : (
            <AlertCircle className="text-destructive w-8 h-8" />
          )}

           {/* Duration badge */}
           {duration && (
            <div className="absolute bottom-2 right-2 bg-black/75 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded tracking-wide">
              {duration}
            </div>
          )}

          {/* Delete button */}
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete video"
              className={cn(
                "absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 border border-white/10 text-destructive text-sm flex items-center justify-center backdrop-blur-md transition-all opacity-0 group-hover:opacity-100",
                !deleting && "hover:bg-destructive hover:text-white hover:border-destructive hover:scale-110",
                deleting && "cursor-not-allowed opacity-100 bg-destructive/50"
              )}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : "✕"}
            </button>
          )}
        </div>

        {/* Info */}
        <CardContent className="p-5 flex flex-col flex-1">
          <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 min-h-[2.8em] mb-3 group-hover:text-primary transition-colors">
            {video.title}
          </h3>
          <div className="mb-4">
            <StatusBadge status={video.status} />
          </div>
          <p className="text-[13px] font-medium text-muted-foreground mt-auto">
            {new Date(video.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <Card className="overflow-hidden border-border/40">
      <Skeleton className="aspect-video w-full rounded-none" />
      <CardContent className="p-5 flex flex-col gap-3">
        <Skeleton className="h-5 w-[85%] rounded" />
        <Skeleton className="h-4 w-[60%] rounded mt-1" />
        <Skeleton className="h-3 w-1/3 rounded mt-4" />
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles ?? []).includes("admin");

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | undefined>(
    undefined,
  );

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
    const interval = setInterval(
      () => void fetchVideos(activeCategory),
      POLL_INTERVAL,
    );
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasProcessing = videos.some((v) => v.status === "processing");

  return (
    <div className="container mx-auto px-6 max-w-[1400px] pt-16 pb-24">
      {/* Hero */}
      <div className="mb-12 relative">
        <div className="absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_0%_0%,#000_60%,transparent_100%)] opacity-[0.03]"></div>
        <h1 className="text-[clamp(36px,5vw,56px)] font-black tracking-tight mb-4 bg-gradient-to-br from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
          Library
        </h1>
        <p className="text-lg text-muted-foreground m-0 max-w-2xl font-medium">
          {loading
            ? "Loading your collection..."
            : `You have ${videos.length} video${videos.length !== 1 ? "s" : ""} in your vault.${hasProcessing ? " Transcoding is currently in progress." : ""}`}
        </p>
      </div>

      {/* Category filter chips */}
      {(availableCategories.length > 0 || activeCategory) && (
        <div className="flex gap-2.5 flex-wrap mb-10">
          <Button
            variant={!activeCategory ? "default" : "secondary"}
            className={cn("rounded-full text-[13px] h-9 px-5 transition-all shadow-sm", !activeCategory && "shadow-primary/20")}
            onClick={() => handleCategoryChange(undefined)}
          >
            All
          </Button>
          {availableCategories.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "secondary"}
              className={cn("rounded-full text-[13px] h-9 px-5 transition-all shadow-sm", activeCategory === cat && "shadow-primary/20")}
              onClick={() => handleCategoryChange(cat)}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </Button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-5 mb-8 text-red-400">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-24 flex flex-col items-center justify-center max-w-md mx-auto relative mt-12">
          <div className="absolute inset-0 -z-10 bg-primary/5 blur-3xl rounded-full" />
          <div className="w-24 h-24 bg-muted/30 rounded-full flex items-center justify-center mb-6 ring-1 ring-border shadow-inner">
            <Film className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3 tracking-tight">Your vault is empty</h2>
          <p className="text-muted-foreground mb-8 text-center leading-relaxed">
            Upload your first video to start building your personal streaming collection.
          </p>
          {isAdmin && (
            <Link href="/upload" className={cn(buttonVariants({ size: "lg" }), "rounded-full shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all")}>
              Upload New Video
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onDelete={handleDeleted}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
