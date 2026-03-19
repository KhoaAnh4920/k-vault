"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { videoApi, uploadFileInChunks } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Film,
  FolderUp,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const router = useRouter();
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

      newItems.push({
        id: crypto.randomUUID(),
        file: f,
        title: f.name.replace(/\.[^.]+$/, ""),
        category: "",
        description: "",
        progress: 0,
        stage: "idle",
        errorMsg: "",
        expanded: false,
      });
    }

    if (newItems.length > 0) {
      setUploads((prev) => {
        // Automatically expand the first item if list was empty
        if (prev.length === 0 && newItems.length > 0 && newItems[0]) {
          newItems[0].expanded = true;
        }
        return [...prev, ...newItems];
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
        await videoApi.create({
          title: itemTitle,
          description: itemDesc || undefined,
          category: itemCat || undefined,
          rawDriveFileId: driveFileId,
        });
        updateItem(id, { stage: "done", expanded: false });
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
    switch (item.stage) {
      case "idle":
        return <span className="text-muted-foreground">Ready</span>;
      case "waiting":
        return <span className="text-blue-400">Waiting in queue...</span>;
      case "uploading":
        return <span className="text-primary">Uploading {item.progress}%</span>;
      case "saving":
        return <span className="text-primary">Registering...</span>;
      case "done":
        return (
          <span className="text-green-500 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Done
          </span>
        );
      case "error":
        return (
          <span className="text-destructive flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> Failed
          </span>
        );
    }
  };

  const hasIdleOrError = uploads.some(
    (u) => u.stage === "idle" || u.stage === "error",
  );

  return (
    <div className="container mx-auto px-4 max-w-4xl pt-12 pb-24">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold mb-2">Upload Videos</h1>
        <p className="text-muted-foreground">
          Bulk upload supported. Transcoding to HLS begins automatically.
        </p>
      </div>

      <div className="space-y-6">
        {/* Drop zone */}
        {(uploads.length === 0 || globalStage === "idle") && (
          <Card
            className={cn(
              "border-2 border-dashed transition-colors cursor-pointer text-center",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50",
              uploads.length > 0 ? "py-8" : "py-16",
            )}
            onClick={() => document.getElementById("file-input")?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
          >
            <CardContent className="p-0 flex flex-col items-center justify-center">
              <input
                id="file-input"
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                  e.target.value = ""; // Reset to allow picking same files again
                }}
              />
              <FolderUp className="w-14 h-14 text-muted-foreground/50 mb-4" />
              <p className="font-semibold text-foreground mb-2">
                Drag & drop your videos here
              </p>
              <p className="text-sm text-muted-foreground">
                MP4, MOV, MKV supported · Up to 5 GB per file
              </p>
            </CardContent>
          </Card>
        )}

        {/* Upload List */}
        {uploads.length > 0 && (
          <div className="space-y-4">
            {uploads.map((item) => (
              <Card
                key={item.id}
                className={cn(
                  "overflow-hidden transition-colors border-border/50",
                  item.stage === "error" &&
                    "border-destructive/50 bg-destructive/5",
                )}
              >
                <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-center">
                  <div className="flex items-center gap-3 w-full md:w-auto md:flex-1 min-w-0">
                    <div className="bg-muted w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                      <Film className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[15px] truncate text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs font-medium mt-0.5">
                        {getStageDisplay(item)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto shrink-0 self-end md:self-auto">
                    {item.stage === "uploading" && (
                      <Progress
                        value={item.progress}
                        className="h-2 w-32 md:w-48"
                      />
                    )}

                    {globalStage === "idle" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            updateItem(item.id, { expanded: !item.expanded })
                          }
                          className="h-8 w-8 text-muted-foreground"
                          title="Edit Details"
                        >
                          {item.expanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Edit Form Expansion */}
                {item.expanded && globalStage === "idle" && (
                  <div className="border-t border-border/40 p-4 bg-muted/20 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Title
                      </label>
                      <Input
                        value={item.title}
                        onChange={(e) =>
                          updateItem(item.id, { title: e.target.value })
                        }
                        className="h-9 bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Category
                      </label>
                      <select
                        value={item.category}
                        onChange={(e) =>
                          updateItem(item.id, { category: e.target.value })
                        }
                        className={cn(
                          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                          !item.category && "text-muted-foreground",
                        )}
                        style={{
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                          appearance: "none",
                        }}
                      >
                        <option value="">Select a category...</option>
                        {CATEGORIES.map((c) => (
                          <option
                            key={c}
                            value={c.toLowerCase()}
                            className="text-foreground"
                          >
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Description
                      </label>
                      <Textarea
                        value={item.description}
                        onChange={(e) =>
                          updateItem(item.id, { description: e.target.value })
                        }
                        className="h-20 resize-y bg-background"
                      />
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
                {globalStage === "idle"
                  ? `Start Upload (${uploads.length})`
                  : "Retry Failed"}
              </Button>
            )}
          </div>
        )}

        {globalStage === "done" && uploads.some((u) => u.stage === "done") && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 text-green-500 flex items-center justify-center gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="font-medium">
              All uploads processed! Transcoding has begun in the background.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
