"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { uploadFileInChunks, videoApi } from "@/lib/api";
import { generateThumbnails } from "@/lib/video-utils";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Film,
  FolderUp,
  ImageIcon,
  ImagePlus,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

type Stage = "idle" | "waiting" | "uploading" | "saving" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  title: string;
  category: string;
  description: string;
  progress: number;
  stage: Stage;
  errorMsg: string;
  expanded: boolean;
  thumbnails: string[];
  selectedThumbnail: string | null;
  videoId?: string;
  realtimeStatus?: string;
  realtimeProgress?: number;
  realtimeDetail?: string;
  visibility: "public" | "private" | "unlisted" | "role_restricted";
}

const CATEGORIES = [
  "Entertainment",
  "Education",
  "Music",
  "Gaming",
  "Sports",
  "Tech",
  "Other",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const MAX_CONCURRENT_UPLOADS = 2; // Protects network limits

export default function UploadPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user?.roles ?? []).includes("admin");
  const isMember = (session?.user?.roles ?? []).includes("member");
  // Members can only use Private or Unlisted; default to Private
  const defaultVisibility = isMember ? "private" : "public";

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [globalStage, setGlobalStage] = useState<"idle" | "uploading" | "done">(
    "idle",
  );
  const [dragOver, setDragOver] = useState(false);

  const processingRef = useRef<Set<string>>(new Set());
  const uploadsRef = useRef<UploadItem[]>(uploads);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const newItems: UploadItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f) continue;
      if (!f.type.startsWith("video/")) continue;
      if (f.size > MAX_FILE_SIZE) continue;

      const id = crypto.randomUUID();
      newItems.push({
        id,
        file: f,
        title: f.name.replace(/\.[^.]+$/, ""),
        category: (CATEGORIES[0] ?? "Other").toLowerCase(),
        description: "",
        progress: 0,
        stage: "idle",
        errorMsg: "",
        expanded: false,
        thumbnails: [],
        selectedThumbnail: null,
        visibility: defaultVisibility,
      });

      // Extract thumbnails in background
      void generateThumbnails(f, 10)
        .then((thumbs) => {
          setUploads((prev) =>
            prev.map((it) =>
              it.id === id
                ? {
                    ...it,
                    thumbnails: thumbs,
                    selectedThumbnail: thumbs[0] || null,
                  }
                : it,
            ),
          );
        })
        .catch(console.error);
    }

    if (newItems.length > 0) {
      setUploads((prev) => {
        // Automatically expand all newly added items for immediate editing
        const updatedNewItems = newItems.map((it) => ({
          ...it,
          expanded: true,
        }));
        return [...prev, ...updatedNewItems];
      });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const updateItem = useCallback((id: string, data: Partial<UploadItem>) => {
    setUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item)),
    );
  }, []);

  const removeItem = (id: string) => {
    setUploads((prev) => prev.filter((item) => item.id !== id));
  };

  // Real-time Status SSE
  const hasVideoIds = uploads.some((u) => !!u.videoId);

  useEffect(() => {
    if (!session?.user || !hasVideoIds) return;

    const abortCtrl = new AbortController();

    void videoApi.subscribeToEvents((payload) => {
      const { videoId, status, progress, detail } = payload;
      setUploads((prev) =>
        prev.map((item) => {
          if (item.videoId === videoId) {
            return {
              ...item,
              realtimeStatus: status,
              realtimeProgress: progress,
              realtimeDetail: detail,
              stage: status === "ready" ? "done" : item.stage,
            };
          }
          return item;
        }),
      );
    }, abortCtrl.signal);

    return () => abortCtrl.abort();
  }, [session?.user, hasVideoIds]);

  const processUpload = useCallback(
    async (id: string) => {
      const it = uploadsRef.current.find((u) => u.id === id);
      if (!it) return;

      const itemTitle = it.title.trim() || it.file.name;
      const itemDesc = it.description.trim();
      const itemCat = it.category;
      const itemFile = it.file;

      try {
        updateItem(id, { stage: "uploading", progress: 0, errorMsg: "" });
        const { uploadUrl, driveFileId } = await videoApi.initUpload(
          itemFile.name,
        );

        await uploadFileInChunks(uploadUrl, itemFile, (pct) => {
          updateItem(id, { progress: pct });
        });

        updateItem(id, { stage: "saving", progress: 100 });
        const createdVideo = await videoApi.create({
          title: itemTitle,
          description: itemDesc || undefined,
          category: itemCat || undefined,
          rawDriveFileId: driveFileId,
          thumbnailBase64: it.selectedThumbnail || undefined,
          visibility: it.visibility,
        });
        updateItem(id, {
          stage: "done",
          expanded: false,
          videoId: createdVideo.id,
        });
      } catch (err) {
        console.error(err);
        updateItem(id, { stage: "error", errorMsg: "Upload failed." });
      } finally {
        processingRef.current.delete(id);
        // Trigger a re-evaluation of the queue
        setUploads((prev) => [...prev]);
      }
    },
    [updateItem],
  );

  // Queue Manager
  useEffect(() => {
    if (globalStage !== "uploading") return;

    const inProgressCount = uploads.filter(
      (u) => u.stage === "uploading" || u.stage === "saving",
    ).length;

    if (inProgressCount < MAX_CONCURRENT_UPLOADS) {
      const waitlist = uploads.filter((u) => u.stage === "waiting");
      const slotsAvailable = MAX_CONCURRENT_UPLOADS - inProgressCount;
      const toStart = waitlist.slice(0, slotsAvailable);

      toStart.forEach((item) => {
        if (!processingRef.current.has(item.id)) {
          processingRef.current.add(item.id);
          void processUpload(item.id);
        }
      });
    }

    // Check completion
    const allFinished = uploads.every(
      (u) => u.stage === "done" || u.stage === "error",
    );
    if (uploads.length > 0 && allFinished) {
      setGlobalStage("done");
    }
  }, [uploads, globalStage, processUpload]);

  const startUploads = () => {
    setGlobalStage("uploading");
    setUploads((prev) =>
      prev.map((item) =>
        item.stage === "idle" || item.stage === "error"
          ? { ...item, stage: "waiting", expanded: false }
          : item,
      ),
    );
  };

  const getStageDisplay = (item: UploadItem) => {
    // Real-time status from worker (SSE)
    if (item.realtimeStatus === "waiting") {
      return (
        <span className="text-amber-400 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wider bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20">
          <Clock className="w-3.5 h-3.5" /> Queued
        </span>
      );
    }

    if (item.realtimeStatus === "processing") {
      return (
        <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
          {/* <span className="text-primary font-bold text-[11px] flex items-center gap-1.5 uppercase tracking-wider">
            {item.realtimeDetail || "Processing..."}
          </span> */}
          <div className="flex items-center gap-2">
            <Progress
              value={item.realtimeProgress ?? 0}
              className="h-1.5 flex-1"
            />
            <span className="text-[10px] font-mono font-bold text-primary/80">
              {item.realtimeProgress ?? 0}%
            </span>
          </div>
        </div>
      );
    }

    if (item.realtimeStatus === "ready") {
      return (
        <span className="text-green-500 font-bold text-xs flex items-center gap-1.5 uppercase tracking-widest bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
        </span>
      );
    }

    switch (item.stage) {
      case "idle":
        return (
          <span className="text-muted-foreground font-medium text-xs">
            Ready to start
          </span>
        );
      case "waiting":
        return (
          <span className="text-blue-400 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" /> In Queue
          </span>
        );
      case "uploading":
        return (
          <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
            <span className="text-primary font-bold text-[11px] uppercase tracking-wider">
              Uploading file...
            </span>
            <div className="flex items-center gap-2">
              <Progress value={item.progress} className="h-1.5 flex-1" />
              <span className="text-[10px] font-mono font-bold text-primary/80">
                {item.progress}%
              </span>
            </div>
          </div>
        );
      case "saving":
        return (
          <span className="text-primary font-bold text-xs flex items-center gap-1.5 animate-pulse uppercase tracking-wider">
            Finalizing...
          </span>
        );
      case "done":
        return (
          <span className="text-muted-foreground font-bold text-xs flex items-center gap-1.5 uppercase tracking-widest bg-muted px-2.5 py-1 rounded-full">
            Waiting for processor
          </span>
        );
      case "error":
        return (
          <span className="text-destructive font-bold text-xs flex items-center gap-1.5 uppercase tracking-widest bg-destructive/10 px-2.5 py-1 rounded-full border border-destructive/20">
            <AlertCircle className="w-3.5 h-3.5" /> Error
          </span>
        );
      default:
        return null;
    }
  };

  const hasIdleOrError = uploads.some(
    (u) => u.stage === "idle" || u.stage === "error",
  );

  return (
    <div className="container mx-auto px-4 max-w-5xl pt-16 pb-32">
      <div className="mb-12 text-center space-y-3">
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text text-transparent">
          Create Content
        </h1>
        <p className="text-muted-foreground text-lg max-w-lg mx-auto">
          Upload your masterpieces to K-Vault. We&apos;ll handle the transcoding
          while you wait.
        </p>
      </div>

      <div className="space-y-6">
        {/* Drop zone */}
        <Card
          className={cn(
            "relative border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden group",
            dragOver
              ? "border-primary bg-primary/5 ring-4 ring-primary/10"
              : "border-border/60 hover:border-primary/40 hover:bg-muted/30",
            uploads.length > 0 ? "py-8" : "py-24",
          )}
          onClick={() => document.getElementById("file-input")?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardContent className="p-0 flex flex-col items-center justify-center relative z-10">
            <input
              id="file-input"
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {uploads.length === 0 ? (
              <>
                <div className="bg-primary/10 p-5 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300">
                  <FolderUp className="w-10 h-10 text-primary" />
                </div>
                <p className="text-xl font-bold text-foreground mb-1">
                  Select video files to upload
                </p>
                <p className="text-sm text-muted-foreground font-medium">
                  Or drag and drop them anywhere in this box
                </p>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <FolderUp className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Add more videos to queue
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload List */}
        {uploads.length > 0 && (
          <div className="space-y-4">
            {uploads.map((item) => (
              <Card
                key={item.id}
                className={cn(
                  "overflow-hidden transition-all duration-500 border-border/40 group relative hover:border-primary/30",
                  item.realtimeStatus === "processing" && "bg-primary/[0.02]",
                  item.stage === "error" &&
                    "border-destructive/30 bg-destructive/[0.02]",
                  (item.realtimeStatus === "processing" ||
                    item.stage === "uploading") &&
                    "shimmer-card",
                )}
              >
                <div className="p-5 flex flex-col md:flex-row gap-6 items-start md:items-center">
                  {/* Thumbnail / Preview Area */}
                  <div className="relative aspect-video w-full md:w-44 rounded-xl overflow-hidden bg-muted/80 shrink-0 border border-border/60 group-hover:border-primary/40 transition-colors shadow-sm">
                    {item.selectedThumbnail ? (
                      <img
                        src={item.selectedThumbnail}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        alt={item.title}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                        <Film className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    {(item.realtimeStatus === "processing" ||
                      item.stage === "uploading" ||
                      item.stage === "saving") && (
                      <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Main Info Area */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[17px] truncate text-foreground tracking-tight">
                        {item.title || "Untitled Video"}
                      </h3>
                      {item.videoId && (
                        <div className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                          HD+
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="uppercase tracking-widest text-[10px] font-black text-muted-foreground/60">
                          {item.category || "No Category"}
                        </span>
                      </div>
                      <div className="w-1 h-1 rounded-full bg-border" />
                      <span>
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>

                    <div className="pt-1">{getStageDisplay(item)}</div>
                  </div>

                  {/* Contextual Actions */}
                  <div className="flex items-center gap-2 w-full md:w-auto shrink-0 self-end md:self-auto pt-2 md:pt-0">
                    {item.videoId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-2 font-bold text-xs ring-offset-background transition-all hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                        onClick={() => {
                          const url = `${window.location.origin}/video/${item.videoId}`;
                          navigator.clipboard.writeText(url);
                          // toast success? using sonner
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </Button>
                    )}

                    {item.realtimeStatus === "ready" && (
                      <Button
                        size="sm"
                        className="h-9 gap-2 font-bold text-xs shadow-lg shadow-primary/20"
                        onClick={() => router.push(`/video/${item.videoId}`)}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View
                      </Button>
                    )}

                    {(item.stage === "idle" ||
                      item.stage === "error" ||
                      item.realtimeStatus === "ready") && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateItem(item.id, { expanded: !item.expanded })
                          }
                          className={cn(
                            "h-9 w-9 rounded-full transition-all hover:bg-muted",
                            item.expanded &&
                              "bg-primary/10 text-primary hover:bg-primary/20",
                          )}
                        >
                          {item.expanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <Pencil className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                          className="h-9 w-9 rounded-full text-destructive hover:bg-destructive/10 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Edit Form Expansion */}
                {item.expanded &&
                  (item.stage === "idle" ||
                    item.stage === "error" ||
                    item.realtimeStatus === "ready") && (
                    <div className="border-t border-border/40 p-6 bg-muted/10">
                      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                        {/* Left Column: Metadata */}
                        <div className="lg:col-span-3 space-y-5">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                              Title
                            </label>
                            <Input
                              value={item.title}
                              onChange={(e) =>
                                updateItem(item.id, { title: e.target.value })
                              }
                              placeholder="Add a catchy title"
                              className="h-11 bg-background/50 border-border/60 focus:border-primary/50 transition-all font-medium"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                              Category
                            </label>
                            <div className="relative">
                              <select
                                value={item.category}
                                onChange={(e) =>
                                  updateItem(item.id, {
                                    category: e.target.value,
                                  })
                                }
                                className={cn(
                                  "flex h-11 w-full items-center justify-between rounded-md border border-border/60 bg-background/50 px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer",
                                  !item.category && "text-muted-foreground",
                                )}
                              >
                                {CATEGORIES.map((c) => (
                                  <option
                                    key={c}
                                    value={c.toLowerCase()}
                                    className="text-foreground bg-card"
                                  >
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                              Description
                            </label>
                            <Textarea
                              value={item.description}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  description: e.target.value,
                                })
                              }
                              placeholder="Tell viewers about your video"
                              className="h-32 resize-none bg-background/50 border-border/60 focus:border-primary/50 transition-all leading-relaxed"
                            />
                          </div>

                          {/* Visibility Selector */}
                          <div className="space-y-2 pt-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">
                              Visibility
                            </label>
                            {isMember ? (
                              // Members can only choose Private (forced server-side)
                              <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
                                <span className="text-foreground font-semibold">🔒 Private</span>
                                <span>— Your uploads are always private. Use the share button after upload to get a shareable link.</span>
                              </div>
                            ) : (
                              <div className="flex gap-3">
                                {(["public", "private", "role_restricted"] as const).map((v) => (
                                  <button
                                    key={v}
                                    onClick={() =>
                                      updateItem(item.id, { visibility: v })
                                    }
                                    className={cn(
                                      "flex-1 py-2.5 rounded-lg border text-xs font-bold uppercase tracking-widest transition-all",
                                      item.visibility === v
                                        ? "bg-primary text-black border-primary shadow-lg shadow-primary/20"
                                        : "bg-background border-border hover:border-primary/40 text-muted-foreground",
                                    )}
                                  >
                                    {v === "role_restricted" ? "Admin Only" : v}
                                  </button>
                                ))}
                              </div>
                            )}
                            <p className="text-[10px] text-muted-foreground/60 ml-1">
                              {item.visibility === "public"
                                ? "Anyone can find and watch your video."
                                : item.visibility === "role_restricted"
                                ? "Only Admins can see this video."
                                : "Only you can see and play this video."}
                            </p>
                          </div>

                          {/* Save Changes Button (Only show if video is already ready) */}
                          {item.realtimeStatus === "ready" && (
                            <div className="pt-4">
                              <Button
                                size="sm"
                                className="w-full gap-2 font-bold"
                                onClick={async () => {
                                  if (!item.videoId) return;
                                  try {
                                    await videoApi.updateMetadata(
                                      item.videoId,
                                      {
                                        title: item.title,
                                        description: item.description,
                                        category: item.category,
                                        visibility: item.visibility,
                                      },
                                    );
                                    updateItem(item.id, { expanded: false });
                                    // toast.success("Video updated");
                                  } catch (err) {
                                    console.error("Update failed", err);
                                  }
                                }}
                              >
                                Save Changes
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Right Column: Thumbnail Picker */}
                        <div className="lg:col-span-2 space-y-4">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Thumbnail
                            </label>
                            <span className="text-[10px] text-muted-foreground/60 italic">
                              Select a frame or upload
                            </span>
                          </div>

                          {item.thumbnails.length === 0 ? (
                            <div className="aspect-video bg-muted/40 rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center gap-3 animate-pulse">
                              <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin" />
                              <p className="text-xs text-muted-foreground/60">
                                Generating frames...
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {item.thumbnails.map((thumb, idx) => (
                                <button
                                  key={idx}
                                  onClick={() =>
                                    updateItem(item.id, {
                                      selectedThumbnail: thumb,
                                    })
                                  }
                                  className={cn(
                                    "relative aspect-video rounded-lg overflow-hidden border-2 transition-all group",
                                    item.selectedThumbnail === thumb
                                      ? "border-primary shadow-lg shadow-primary/20 scale-[1.02] z-10"
                                      : "border-transparent hover:border-white/20 opacity-70 hover:opacity-100",
                                  )}
                                >
                                  <img
                                    src={thumb}
                                    className="w-full h-full object-cover"
                                    alt={`Frame ${idx}`}
                                  />
                                  {item.selectedThumbnail === thumb && (
                                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                                      <div className="bg-primary text-white p-1 rounded-full">
                                        <CheckCircle2 className="w-3 h-3" />
                                      </div>
                                    </div>
                                  )}
                                </button>
                              ))}

                              {/* Custom Upload Button */}
                              <label className="relative aspect-video rounded-lg overflow-hidden border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 cursor-pointer flex flex-col items-center justify-center gap-1 group transition-all">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = (re) => {
                                        const base64 = re.target
                                          ?.result as string;
                                        updateItem(item.id, {
                                          selectedThumbnail: base64,
                                          thumbnails: [
                                            ...item.thumbnails,
                                            base64,
                                          ].slice(-7), // Keep list clean
                                        });
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                                <div className="bg-muted p-2 rounded-full group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                  <ImagePlus className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-medium text-muted-foreground group-hover:text-primary transition-colors">
                                  Custom
                                </span>
                              </label>
                            </div>
                          )}

                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-3">
                            <ImageIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              Choose an eye-catching thumbnail to help your
                              video stand out in the library.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
              </Card>
            ))}
          </div>
        )}

        {/* Global Controls */}
        {uploads.length > 0 && (
          <div className="flex justify-end pt-4 border-t border-border/40 mt-8 gap-4">
            {globalStage === "done" && (
              <Button
                onClick={() => router.push("/")}
                variant="secondary"
                className="px-6 rounded-full"
              >
                Go to Library
              </Button>
            )}

            {hasIdleOrError && (
              <Button
                onClick={startUploads}
                className="px-8 rounded-full shadow-md shadow-primary/20"
              >
                {uploads.some((u) => u.stage === "idle")
                  ? `Start Upload (${uploads.filter((u) => u.stage === "idle").length})`
                  : "Retry Failed"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
