"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { videoApi, type Video } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Film } from "lucide-react";
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

import { Card, CardContent } from "@/components/ui/card";
import { VideoCard } from "@/components/VideoCard";

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
              onDeleted={() => handleDeleted(v.id)}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
