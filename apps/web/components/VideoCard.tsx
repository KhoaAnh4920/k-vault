"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { videoApi, type Video } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AlertCircle, Eye, Loader2, MoreVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function StatusBadge({ status }: { status: Video["status"] }) {
  const map: Record<
    Video["status"],
    {
      variant: "secondary" | "default" | "destructive" | "outline";
      dot: string;
      label: string;
      cls: string;
    }
  > = {
    processing: {
      variant: "outline",
      dot: "⏳",
      label: "Processing",
      cls: "border-amber-500/50 bg-amber-500/10 text-amber-500",
    },
    ready: {
      variant: "outline",
      dot: "●",
      label: "Ready",
      cls: "border-green-500/50 bg-green-500/10 text-green-500",
    },
    error: {
      variant: "destructive",
      dot: "✕",
      label: "Error",
      cls: "",
    },
  };
  const { variant, dot, label, cls } = map[status];
  return (
    <Badge
      variant={variant}
      className={cn(
        "gap-1.5 uppercase font-semibold text-[10px] tracking-wider",
        cls,
      )}
    >
      <span>{dot}</span> {label}
    </Badge>
  );
}

function formatDuration(secs: number | null): string | null {
  if (secs === null) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${mm.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoCard({
  video,
  isAdmin,
  onDeleted,
}: {
  video: Video;
  isAdmin: boolean;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);

  const duration = formatDuration(video.durationSeconds);

  useEffect(() => {
    // Read local history to show resume progress bar
    try {
      const historyStr = localStorage.getItem("k-vault-history");
      if (historyStr) {
        const history = JSON.parse(historyStr);
        const entry = history.find((h: any) => h.videoId === video.id);
        if (
          entry &&
          video.durationSeconds &&
          entry.progress < video.durationSeconds - 5
        ) {
          setProgress((entry.progress / video.durationSeconds) * 100);
        }
      }
    } catch {
      // ignore
    }
  }, [video.id, video.durationSeconds]);

  const handleDelete = async () => {
    console.log("Run handleDelete");
    if (deleting) return;
    setDeleting(true);
    try {
      await videoApi.remove(video.id);
      toast.success("Video deleted completely");
      onDeleted();
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error((err as any).response?.data?.message || err.message);
      }
      setDeleting(false);
    }
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col group hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/5 hover:border-border/80 transition-all duration-300 bg-card border-border/40 relative">
      <Link
        href={video.status === "ready" ? `/watch/${video.id}` : "#"}
        className="flex flex-col flex-1"
      >
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
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          )}

          {/* Overlay icon */}
          {video.status === "ready" ? (
            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/40 transition-colors duration-500 rounded-t-xl" />
          ) : video.status === "processing" ? (
            <Loader2 className="animate-spin text-primary w-8 h-8" />
          ) : (
            <AlertCircle className="text-destructive w-8 h-8" />
          )}

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-2 right-2 bg-black/75 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded tracking-wide z-10">
              {duration}
            </div>
          )}

          {/* Progress Bar (Bottom Edge of Thumbnail) */}
          {progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20">
              <div
                className="h-full bg-red-600"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Info */}
        <CardContent className="p-4 flex flex-col flex-1 relative">
          <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 min-h-[2.8em] mb-2 pr-6 group-hover:text-primary transition-colors">
            {video.title}
          </h3>

          <div className="flex flex-col mt-auto gap-2">
            <div className="flex items-center text-[13px] text-muted-foreground font-medium">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              <span>
                {video.views > 0
                  ? new Intl.NumberFormat("en-US", {
                      notation: "compact",
                    }).format(video.views) + " views"
                  : "No views yet"}
              </span>
              <span className="mx-2 text-muted-foreground/30">•</span>
              <span>
                {new Date(video.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div>
              <StatusBadge status={video.status} />
            </div>
          </div>
        </CardContent>
      </Link>

      {/* 3-Dot Menu Config (Admin only for now) */}
      {isAdmin && (
        <div className="absolute top-2 right-2 z-30">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="w-8 h-8 rounded-full bg-black/40 border border-white/10 text-white text-sm flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all hover:bg-black/60 focus:opacity-100" />
              }
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <MoreVertical className="w-4 h-4" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </Card>
  );
}
