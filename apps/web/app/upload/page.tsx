"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { videoApi, uploadFileInChunks } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Film, FolderUp, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "idle" | "uploading" | "saving" | "done" | "error";

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

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith("video/")) {
        setErrorMsg("Please select a video file (.mp4, .mov, etc.)");
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        setErrorMsg("File is too large. Maximum size is 5 GB.");
        return;
      }
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      setErrorMsg("");
    },
    [title],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    try {
      // Step 1: Get resumable upload session URL from backend
      setStage("uploading");
      setProgress(0);
      const { uploadUrl, driveFileId } = await videoApi.initUpload(file.name);

      // Step 2: Upload directly to Google Drive in 20 MB chunks
      await uploadFileInChunks(uploadUrl, file, setProgress);

      // Step 3: Register video with backend (triggers transcoding queue)
      setStage("saving");
      const video = await videoApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        rawDriveFileId: driveFileId,
      });

      setStage("done");
      setTimeout(() => router.push(`/?new=${video.id}`), 1500);
    } catch (err) {
      console.error(err);
      setStage("error");
      setErrorMsg("Upload failed. Please try again.");
    }
  };

  const canSubmit = file && title.trim() && stage === "idle";

  return (
    <div className="container mx-auto px-4 max-w-2xl pt-12 pb-20">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold mb-2">Upload Video</h1>
        <p className="text-muted-foreground">
          Upload a raw video file. Transcoding to HLS will begin automatically.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        {/* Drop zone */}
        <Card
          id="dropzone"
          className={cn(
            "border-2 border-dashed transition-colors cursor-pointer text-center",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            file ? "py-10" : "py-16"
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
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <div className="flex flex-col items-center">
                <Film className="w-12 h-12 text-primary mb-3" />
                <p className="font-semibold text-foreground mb-1">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <FolderUp className="w-14 h-14 text-muted-foreground/50 mb-4" />
                <p className="font-semibold text-foreground mb-2">
                  Drag & drop your video here
                </p>
                <p className="text-sm text-muted-foreground">
                  MP4, MOV, MKV supported · Up to 5 GB
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Title */}
        <div className="space-y-2">
          <label className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Title <span className="text-destructive">*</span>
          </label>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter video title"
            required
            className="text-[15px] h-11"
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex gap-1">
            Category <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={cn(
               "flex h-11 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-[15px] ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
               !category && "text-muted-foreground"
            )}
            style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none' }}
          >
            <option value="">Select a category...</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c.toLowerCase()} className="text-foreground">
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex gap-1">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            rows={4}
            className="text-[15px] resize-y"
          />
        </div>

        {/* Progress */}
        {(stage === "uploading" || stage === "saving") && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {stage === "uploading"
                  ? "Uploading..."
                  : "Registering video..."}
              </span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <Progress value={stage === "saving" ? 100 : progress} className="h-1.5" />
          </div>
        )}

        {/* Success */}
        {stage === "done" && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-green-500 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">Upload complete! Transcoding will begin shortly. Redirecting...</p>
          </div>
        )}

        {/* Error */}
        {(errorMsg || stage === "error") && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-red-500 flex items-center gap-3">
             <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{errorMsg || "An unexpected error occurred."}</p>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          id="upload-submit"
          disabled={!canSubmit}
          className="text-[15px] px-8 h-11"
        >
          {stage === "uploading" || stage === "saving" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            "Upload Video"
          )}
        </Button>
      </form>
    </div>
  );
}
