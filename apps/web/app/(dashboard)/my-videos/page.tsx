"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { videoApi, type Video, type PaginatedVideos } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Film, Search, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useInView } from "react-intersection-observer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryPills } from "@/components/CategoryPills";
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

export default function MyVideosPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles ?? []).includes("admin");
  const isMember = (session?.user?.roles ?? []).includes("member");
  const isAuthenticated = !!session?.user;

  const [videos, setVideos] = useState<Video[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeCategory, setActiveCategory] = useState<string | undefined>(
    undefined,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest"); // 'newest', 'oldest', 'views'

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const { ref, inView } = useInView({ threshold: 0.1 });

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Main fetch function
  const fetchVideos = useCallback(
    async (
      pageNum: number,
      cat: string | undefined,
      search: string,
      sort: string,
      isInitial: boolean,
      isPullToRefresh = false,
    ) => {
      if (isPullToRefresh) {
      } else if (isInitial) {
        setLoading(true);
      } else {
        setFetchingMore(true);
      }

      try {
        const res: PaginatedVideos = await videoApi.list({
          page: pageNum,
          limit: 12,
          category: cat,
          search: search || undefined,
          sort: sort,
          ownerOnly: true,
        });

        if (isInitial) {
          setVideos(res.data);
        } else {
          setVideos((prev) => {
            // Deduplicate to avoid React keys clashing
            const existingIds = new Set(prev.map((v) => v.id));
            const newVideos = res.data.filter((v) => !existingIds.has(v.id));
            return [...prev, ...newVideos];
          });
        }
        setTotalCount(res.total);
        setHasMore(res.hasMore);
        setError(null);
      } catch {
        setError("Failed to load videos. Is the backend running?");
      } finally {
        if (isInitial) setLoading(false);
        setFetchingMore(false);
      }
    },
    [],
  );

  // Reset pagination on filter changes
  useEffect(() => {
    setPage(1);
    void fetchVideos(1, activeCategory, debouncedSearch, sortBy, true);
  }, [activeCategory, debouncedSearch, sortBy, fetchVideos]);

  // Trigger next page on scroll
  useEffect(() => {
    if (inView && hasMore && !loading && !fetchingMore) {
      const next = page + 1;
      setPage(next);
      void fetchVideos(next, activeCategory, debouncedSearch, sortBy, false);
    }
  }, [
    inView,
    hasMore,
    loading,
    fetchingMore,
    page,
    activeCategory,
    debouncedSearch,
    sortBy,
    fetchVideos,
  ]);

  // Real-time Video Status SSE
  useEffect(() => {
    const abortCtrl = new AbortController();

    void videoApi
      .subscribeToEvents((data) => {
        setVideos((prev) =>
          prev.map((v) =>
            v.id === data.videoId ? { ...v, status: data.status } : v,
          ),
        );
      }, abortCtrl.signal)
      .catch(console.error);

    return () => abortCtrl.abort();
  }, []);

  const handleDeleted = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
    setTotalCount((c) => c - 1);
  };

  const hasProcessing = videos.some(
    (v) => v.status === "processing" || v.status === "waiting",
  );

  // --- Pull to Refresh Logic ---
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);

  useEffect(() => {
    document.body.style.overscrollBehaviorY = "none";
    return () => {
      document.body.style.overscrollBehaviorY = "auto";
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      setStartY(e.touches[0]?.clientY || 0);
    } else {
      setStartY(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === 0) return;
    const y = e.touches[0]?.clientY || 0;
    const delta = y - startY;

    if (delta > 0 && window.scrollY <= 0) {
      const distance = Math.min(delta * 0.4, 80);
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 55 && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(55); // Hold at target

      setPage(1);
      await fetchVideos(1, activeCategory, debouncedSearch, sortBy, true, true);

      setIsRefreshing(false);
    }
    setPullDistance(0);
    setStartY(0);
  };

  return (
    <div
      className="min-h-screen relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to Refresh Indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-center items-center overflow-hidden z-50 pointer-events-none"
        style={{
          height: `${pullDistance}px`,
          transition:
            isRefreshing || pullDistance === 0
              ? "height 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
              : "none",
        }}
      >
        <div
          className="bg-card shadow-lg rounded-full w-10 h-10 flex items-center justify-center border border-border/50 transition-all duration-300"
          style={{
            transform: `rotate(${pullDistance * 5}deg)`,
            opacity: pullDistance > 10 ? pullDistance / 50 : 0,
          }}
        >
          <Loader2
            className={cn(
              "w-5 h-5 text-primary",
              isRefreshing && "animate-spin",
            )}
          />
        </div>
      </div>

      <div
        className="container mx-auto px-4 sm:px-6 max-w-[1400px] pt-0 md:pt-8 pb-24 overflow-x-hidden"
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition:
            isRefreshing || pullDistance === 0
              ? "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
              : "none",
        }}
      >
        <div className="mb-6 md:mb-12 relative">
          <div className="absolute inset-0 -z-10 h-full w-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_0%_0%,#000_60%,transparent_100%)] opacity-[0.03]"></div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 bg-gradient-to-br from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
            My Vault
          </h1>
          <p className="text-base md:text-lg text-muted-foreground m-0 max-w-2xl font-medium">
            {loading
              ? "Loading collection..."
              : `${totalCount} video${totalCount !== 1 ? "s" : ""} available.${hasProcessing ? " Transcoding in progress." : ""}`}
          </p>
        </div>

        {/* Category filter chips */}
        <CategoryPills 
          activeCategory={activeCategory ?? ""} 
          onCategoryChange={setActiveCategory} 
        />

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-5 mb-8 text-red-400">
            {error}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
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
            <h2 className="text-2xl font-bold text-foreground mb-3 tracking-tight">
              {searchQuery ? "No matches found" : "Your vault is empty"}
            </h2>
            <p className="text-muted-foreground mb-8 text-center leading-relaxed">
              {searchQuery
                ? `Try adjusting your search or filters to find what you're looking for.`
                : `Upload your first video to start building your personal streaming collection.`}
            </p>
            {isAdmin && !searchQuery && (
              <Link
                href="/upload"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "rounded-full shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all",
                )}
              >
                Upload New Video
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 w-full max-w-full">
              {videos.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  onDeleted={() => handleDeleted(v.id)}
                  isAdmin={isAdmin}
                  currentUserId={session?.user?.id}
                />
              ))}
            </div>

            {/* Infinite Scroll Trigger & Spinner */}
            {(hasMore || fetchingMore) && (
              <div ref={ref} className="mt-12 py-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
