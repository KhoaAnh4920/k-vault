"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInView } from "react-intersection-observer";
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
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { videoApi, type Video } from "@/lib/api";
import { useVideoPlayer } from "@/lib/stores/usePlayerStore";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Share2,
  Settings,
  Copy,
  Link2,
  Link2Off,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

function ExpandableDescription({
  text,
  onSeek,
  views,
  createdAt,
}: {
  text: string | null;
  onSeek: (secs: number) => void;
  views: number;
  createdAt: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const viewStr =
    new Intl.NumberFormat("en-US", { notation: "compact" }).format(views) +
    " views";
  const dateStr = new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (!text) {
    return (
      <div className="mt-4 bg-accent/30 p-3 rounded-xl border border-border/30">
        <div className="flex items-center gap-2 mb-1 text-sm font-semibold text-foreground">
          <span>{viewStr}</span>
          <span>•</span>
          <span>{dateStr}</span>
        </div>
      </div>
    );
  }

  const regex = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    const timeStr = match[0];
    parts.push(
      <button
        key={match.index}
        onClick={(e) => {
          e.stopPropagation();
          onSeek(totalSeconds);
        }}
        className="text-primary hover:underline font-bold bg-primary/10 px-1 rounded mx-0.5 transition-colors"
      >
        {timeStr}
      </button>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return (
    <div
      className="mt-4 bg-accent/30 hover:bg-accent/50 transition-colors p-3 rounded-xl cursor-pointer border border-border/30"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-foreground">
        <span>{viewStr}</span>
        <span>•</span>
        <span>{dateStr}</span>
      </div>
      <div
        className={cn(
          "text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed",
          !expanded && "line-clamp-2",
        )}
      >
        {parts}
      </div>
      <button className="text-foreground font-semibold text-sm mt-2">
        {expanded ? "Show less" : "show more"}
      </button>
    </div>
  );
}

function RelatedVideoCard({ video }: { video: Video }) {
  // Try to parse out mm:ss from duration, or just use durationSeconds simply
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Link
      href={`/watch/${video.id}`}
      className="group flex flex-col sm:flex-row gap-3 w-full items-start"
    >
      <div className="relative aspect-video w-full sm:w-40 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={videoApi.getThumbnailUrl(video.id)}
          alt={video.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {video.durationSeconds ? (
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            {formatDuration(video.durationSeconds)}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col py-0.5 pr-2">
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {video.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1 font-medium">
          {video.category || "General"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Intl.NumberFormat("en-US", { notation: "compact" }).format(
            video.views,
          )}{" "}
          views •{" "}
          {new Date(video.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
    </Link>
  );
}

function RelatedVideoSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full">
      <Skeleton className="aspect-video w-full sm:w-40 shrink-0 rounded-lg" />
      <div className="flex flex-col py-0.5 gap-2 w-full">
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[60%]" />
        <Skeleton className="h-3 w-[40%] mt-1" />
      </div>
    </div>
  );
}

function UpNextOverlay({
  nextVideo,
  onCancel,
  countdown,
}: {
  nextVideo: Video;
  onCancel: () => void;
  countdown: number;
}) {
  return (
    <div className="absolute bottom-16 right-4 sm:bottom-24 sm:right-8 bg-background/95 backdrop-blur-xl border border-border pb-3 pt-3 pl-3 pr-4 rounded-xl shadow-2xl z-50 flex items-center gap-4 w-72 animate-in slide-in-from-right-8 fade-in duration-300">
      <div className="relative aspect-video w-24 shrink-0 rounded-md overflow-hidden bg-black border border-border/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={videoApi.getThumbnailUrl(nextVideo.id)}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground font-semibold mb-0.5 uppercase tracking-wider">
          Up Next in {countdown}s
        </p>
        <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
          {nextVideo.title}
        </p>
        <div className="flex items-center gap-3 mt-2.5">
          <button
            onClick={onCancel}
            className="text-xs text-muted-foreground font-semibold hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <Link
            href={`/watch/${nextVideo.id}`}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-full font-bold ml-auto shadow-sm hover:opacity-90 transition-opacity"
          >
            Play
          </Link>
        </div>
      </div>
    </div>
  );
}

function AmbientBackground({
  playerRef,
  enabled,
}: {
  playerRef: React.RefObject<MediaPlayerInstance | null>;
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let animationFrameId: number;
    let lastDraw = 0;

    const draw = (now: number) => {
      if (now - lastDraw >= 100) {
        const videoElement = playerRef.current?.el?.querySelector("video");
        const canvas = canvasRef.current;
        if (videoElement && canvas && videoElement.readyState >= 2) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            canvas.width = 64;
            canvas.height = 36;
            try {
              ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            } catch {
              // Ignore cross-origin errors if any
            }
          }
        }
        lastDraw = now;
      }
      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrameId);
  }, [enabled, playerRef]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] object-cover opacity-40 pointer-events-none transition-opacity duration-1000 -z-10"
      style={{ filter: "blur(80px)" }}
      aria-hidden="true"
    />
  );
}

// Removed PlayerSettingsProps and PlayerSettingsMenu since it's hosted in GlobalPlayer.

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const accessToken = session?.access_token ?? null;

  // Always hold the latest token in a ref so xhrSetup never captures a stale value.
  // Update it immediately during render so it's ready for the synchronous onProviderChange and XHR setup.
  const tokenRef = useRef<string | null>(accessToken);
  tokenRef.current = accessToken;

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [startTime, setStartTime] = useState(0);

  const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [fetchingMoreRelated, setFetchingMoreRelated] = useState(false);
  const [relatedPage, setRelatedPage] = useState(1);
  const [hasMoreRelated, setHasMoreRelated] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const { actions, ambient, autoplay, loop } = useVideoPlayer();
  const playerRef = useRef<MediaPlayerInstance>(null);

  // Derived from state — must be after useState declarations
  const currentUserId = session?.user?.id ?? null;
  const isOwner = !!video && !!currentUserId && video.ownerId === currentUserId;

  // Share token state (US3)
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [generatingShare, setGeneratingShare] = useState(false);

  const handleGenerateShareLink = async () => {
    if (!video) return;
    setGeneratingShare(true);
    try {
      const { shareToken: token } = await videoApi.generateShareLink(video.id);
      setShareToken(token);
      const url = `${window.location.origin}/watch/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard!");
    } catch {
      toast.error("Failed to generate share link.");
    } finally {
      setGeneratingShare(false);
    }
  };

  const handleRevokeShareLink = async () => {
    if (!video) return;
    try {
      await videoApi.revokeShareLink(video.id);
      setShareToken(null);
      toast.success("Share link revoked.");
    } catch {
      toast.error("Failed to revoke share link.");
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: video?.title || "K-Vault Video",
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied to clipboard!");
      }
    } catch (err) {
      console.error("Error sharing", err);
    }
  };

  // Fetch video data and read watch history
  useEffect(() => {
    videoApi
      .get(id)
      .then((v) => {
        setVideo(v);
        // Dispatch to Global Player Store
        actions.playVideo(v, videoApi.getPlaylistUrl(id));
        // Sync share token from fetched video (can't do this at useState init time)
        if (v.shareToken) setShareToken(v.shareToken);

        // Update watch history immediately so current video is marked as watched
        let recentHistoryIds = new Set<string>();
        try {
          const historyStr = localStorage.getItem("k-vault-history") || "[]";
          let history = JSON.parse(historyStr);
          
          // Collect recent history IDs for related video sorting
          history.forEach((item: any) => recentHistoryIds.add(item.videoId));
          recentHistoryIds.add(v.id); // Add current video too

          // Move current video to the end (most recent)
          history = history.filter((h: any) => h.videoId !== v.id);
          history.push({
            videoId: v.id,
            progress: 0,
            timestamp: Date.now(),
          });
          if (history.length > 100) history.shift();
          localStorage.setItem("k-vault-history", JSON.stringify(history));
        } catch {
          // Ignore
        }

        // Fetch related videos natively from the smart backend API
        const arrayHistoryIds = Array.from(recentHistoryIds).slice(0, 20);
        videoApi
          .getRelated(v.id, 12, arrayHistoryIds)
          .then((res) => {
            setRelatedVideos(res.data);
            setHasMoreRelated(res.hasMore);
          })
          .catch(console.error)
          .finally(() => setLoadingRelated(false));

        // Restore start time if progress is saved
        try {
          const history = JSON.parse(
            localStorage.getItem("k-vault-history") || "[]",
          );
          const found = history.find(
            (h: { videoId: string; progress: number; timestamp: number }) =>
              h.videoId === v.id,
          );
          // If video isn't finished (leave 5 seconds margin), resume from last position
          if (
            found &&
            found.progress > 0 &&
            v.durationSeconds &&
            found.progress < v.durationSeconds - 5
          ) {
            setStartTime(found.progress);
          }
        } catch {
          // Ignore
        }
      })
      .catch(() => router.push("/"))
      .finally(() => setLoading(false));
  }, [id, router]);

  const { ref: loadMoreRef, inView } = useInView({ threshold: 0.1 });

  const fetchMoreRelated = useCallback(
    async (
      currentId: string,
      currentDisplayedIds: string[],
    ) => {
      setFetchingMoreRelated(true);
      try {
        // Collect history IDs (optional for further exclusion)
        const historyStr = localStorage.getItem("k-vault-history") || "[]";
        let historyIds: string[] = [];
        try {
           const historyObj = JSON.parse(historyStr);
           historyIds = historyObj.map((h: any) => h.videoId);
        } catch {}

        // Combine history and currently displayed to ensure we get 100% fresh videos
        const combinedExclude = Array.from(new Set([...currentDisplayedIds, ...historyIds.slice(-20)]));

        const res = await videoApi.getRelated(currentId, 12, combinedExclude.slice(0, 50));
        setRelatedVideos((prev) => [...prev, ...res.data]);
        setHasMoreRelated(res.hasMore);
      } catch (err) {
        console.error(err);
      } finally {
        setFetchingMoreRelated(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      inView &&
      hasMoreRelated &&
      !loadingRelated &&
      !fetchingMoreRelated &&
      video
    ) {
      const next = relatedPage + 1;
      setRelatedPage(next);
      void fetchMoreRelated(video.id, relatedVideos.map(v => v.id));
    }
  }, [
    inView,
    hasMoreRelated,
    loadingRelated,
    fetchingMoreRelated,
    relatedPage,
    video,
    relatedVideos,
    fetchMoreRelated,
  ]);

  // Provide Auth Token to HLS.js
  // Reads from tokenRef so the closure never goes stale — token always current.
  const handleProviderChange = useCallback(
    (
      provider: Parameters<
        NonNullable<
          React.ComponentProps<typeof MediaPlayer>["onProviderChange"]
        >
      >[0],
    ) => {
      if (isHLSProvider(provider)) {
        provider.config = {
          xhrSetup: (xhr: XMLHttpRequest) => {
            const token = tokenRef.current;
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          },
        };
      }
    },
    [], // no dependency on accessToken — reads from tokenRef
  );

  // Track playback time safely (throttled locally, saved globally)
  const lastSaveRef = useRef<number>(0);

  const handleTimeUpdate = useCallback(
    (detail: { currentTime: number }) => {
      if (!video) return;

      const dur = playerRef.current?.state.duration || 0;
      if (dur > 0) {
        const rem = Math.ceil(dur - detail.currentTime);
        if (rem <= 10 && autoplay && !loop && relatedVideos.length > 0) {
          if (!showUpNext) setShowUpNext(true);
          setCountdown(Math.max(0, rem));
          if (rem <= 0 && relatedVideos[0]) {
             // Auto navigate when reaching exactly 0
             router.push(`/watch/${relatedVideos[0].id}`);
          }
        } else {
          if (showUpNext) setShowUpNext(false);
        }
      }

      const now = Date.now();
      if (now - lastSaveRef.current > 5000) {
        lastSaveRef.current = now;
        try {
          const historyStr = localStorage.getItem("k-vault-history") || "[]";
          let history = JSON.parse(historyStr);
          history = history.filter((h: any) => h.videoId !== video.id);

          // Save current progress
          history.push({
            videoId: video.id,
            progress: detail.currentTime,
            timestamp: now,
          });

          // Keep only last 100 watched videos
          if (history.length > 100) history.shift();

          localStorage.setItem("k-vault-history", JSON.stringify(history));
        } catch {
          // Ignored
        }
      }
    },
    [video, autoplay, loop, relatedVideos, showUpNext, router],
  );

  const handleEnded = useCallback(() => {
    if (loop && playerRef.current) {
      playerRef.current.currentTime = 0;
      playerRef.current.play();
    }
  }, [loop]);

  // Jump to specific time (Timestamps click)
  const handleSeek = (secs: number) => {
    if (playerRef.current) {
      playerRef.current.currentTime = secs;
      playerRef.current.play();
    }
  };

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
    <div className="container mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-20 max-w-[1600px] flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Left Column (Video & Details) */}
      <div className="flex-1 w-full min-w-0 flex flex-col">
        {/* Sticky Mobile Mini Player / Main Player */}
        <div className="sticky top-0 z-40 bg-background pt-2 sm:pt-0 pb-4 sm:pb-0 sm:static">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 sm:mb-6 -ml-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {video.status === "ready" ? (
            <div className="relative mb-4 sm:mb-6">
              {ambient && (
                <AmbientBackground playerRef={playerRef} enabled={ambient} />
              )}

              <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/80 bg-transparent relative z-10 border border-border/10">

                {sessionStatus === "loading" || !accessToken ? (
                  <div className="aspect-video flex items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  </div>
                ) : (
                  <div
                    id="video-placeholder"
                    ref={(node) => {
                       if (node) {
                         // Small delay ensures DOM is settled before registering, avoiding race conditions
                         requestAnimationFrame(() => actions.setPlaceholderNode(node));
                       }
                    }}
                    className="aspect-video w-full rounded-xl bg-transparent"
                  />
                )}

                {playerError && (
                  <div className="p-4 bg-destructive/10 border-t border-destructive/30 text-red-400 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {playerError}
                  </div>
                )}
              </div>

              {/* UpNext Overlay */}
              {showUpNext && relatedVideos.length > 0 && relatedVideos[0] && (
                <UpNextOverlay
                  nextVideo={relatedVideos[0]}
                  countdown={countdown}
                  onCancel={() => {
                    setShowUpNext(false);
                    actions.setAutoplay(false);
                  }}
                />
              )}
            </div>
          ) : (
            <div className="aspect-video bg-card border border-border rounded-xl flex flex-col items-center justify-center mb-8 gap-4 px-4 text-center">
              {video.status === "waiting" ? (
                <>
                  <Clock className="w-10 h-10 text-amber-400" />
                  <div>
                    <p className="m-0 font-semibold text-foreground">Queued for processing</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This video is waiting in the transcode queue. It will start processing soon.
                    </p>
                  </div>
                </>
              ) : video.status === "processing" ? (
                <>
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <div>
                    <p className="m-0 font-semibold text-foreground">Transcoding in progress...</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This may take a few minutes.
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
        </div>

        {/* Video Info Shelf */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {video.title}
          </h1>

          <div className="flex items-center justify-between mt-3 flex-wrap gap-4">
            <div className="flex items-center gap-3" />

            <div className="flex items-center gap-2">
              {/* Owner share-link panel (US3) */}
              {isOwner && (video.visibility === "private" || video.visibility === "unlisted") && (
                <>
                  {shareToken ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-xs h-9 gap-1.5"
                        onClick={async () => {
                          const url = `${window.location.origin}/watch/share/${shareToken}`;
                          await navigator.clipboard.writeText(url);
                          toast.success("Link copied!");
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-xs h-9 gap-1.5 text-destructive hover:text-destructive"
                        onClick={handleRevokeShareLink}
                      >
                        <Link2Off className="w-3.5 h-3.5" /> Revoke
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full text-xs h-9 gap-1.5"
                      onClick={handleGenerateShareLink}
                      disabled={generatingShare}
                    >
                      {generatingShare ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      Get Share Link
                    </Button>
                  )}
                </>
              )}

              <Button onClick={handleShare} variant="secondary" className="rounded-full shadow-sm text-sm font-semibold h-9" size="sm">
                <Share2 className="w-4 h-4 mr-2" /> Share
              </Button>
            </div>
          </div>

          <ExpandableDescription
            text={video.description}
            onSeek={handleSeek}
            views={video.views}
            createdAt={video.createdAt}
          />
        </div>
      </div>

      {/* Right Column (Related Videos) */}
      <div className="w-full lg:w-[400px] xl:w-[420px] shrink-0 flex flex-col gap-4 mt-8 lg:mt-0">
        <h2 className="text-lg font-bold">Related Videos</h2>
        <div className="flex flex-col gap-3">
          {loadingRelated ? (
            Array.from({ length: 8 }).map((_, i) => (
              <RelatedVideoSkeleton key={i} />
            ))
          ) : relatedVideos.length > 0 ? (
            <>
              {relatedVideos.map((rv) => (
                <RelatedVideoCard key={rv.id} video={rv} />
              ))}
              {hasMoreRelated && (
                <div ref={loadMoreRef} className="py-4 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No related videos found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
