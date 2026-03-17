"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { videoApi, uploadFileInChunks } from "@/lib/api";

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
    <div
      className="container-main"
      style={{ paddingTop: 48, paddingBottom: 80, maxWidth: 680 }}
    >
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, margin: "0 0 8px" }}>Upload Video</h1>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>
          Upload a raw video file. Transcoding to HLS will begin automatically.
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ display: "flex", flexDirection: "column", gap: 24 }}
      >
        {/* Drop zone */}
        <div
          id="dropzone"
          className={`dropzone${dragOver ? " drag-over" : ""}`}
          onClick={() => document.getElementById("file-input")?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
        >
          <input
            id="file-input"
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {file ? (
            <div>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
              <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{file.name}</p>
              <p
                style={{
                  margin: 0,
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>
                📁
              </div>
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                Drag & drop your video here
              </p>
              <p
                style={{
                  margin: 0,
                  color: "var(--text-secondary)",
                  fontSize: 13,
                }}
              >
                MP4, MOV, MKV supported · Up to 5 GB
              </p>
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter video title"
            required
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontSize: 15,
              outline: "none",
            }}
          />
        </div>

        {/* Category */}
        <div>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Category{" "}
            <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
              (optional)
            </span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: category ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 15,
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">Select a category...</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c.toLowerCase()}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Description{" "}
            <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>
              (optional)
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            rows={3}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontSize: 15,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Progress */}
        {(stage === "uploading" || stage === "saving") && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>
                {stage === "uploading"
                  ? "Uploading..."
                  : "Registering video..."}
              </span>
              <span style={{ fontWeight: 600 }}>{progress}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${stage === "saving" ? 100 : progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Success */}
        {stage === "done" && (
          <div
            style={{
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 8,
              padding: 16,
              color: "#86efac",
            }}
          >
            ✓ Upload complete! Transcoding will begin shortly. Redirecting...
          </div>
        )}

        {/* Error */}
        {(errorMsg || stage === "error") && (
          <div
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8,
              padding: 16,
              color: "#fca5a5",
            }}
          >
            {errorMsg || "An unexpected error occurred."}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          id="upload-submit"
          className="btn-primary"
          disabled={!canSubmit}
          style={{
            alignSelf: "flex-start",
            fontSize: 15,
            padding: "14px 28px",
          }}
        >
          {stage === "uploading" || stage === "saving" ? (
            <>
              <div className="spinner" style={{ width: 16, height: 16 }} />{" "}
              Uploading...
            </>
          ) : (
            "Upload"
          )}
        </button>
      </form>
    </div>
  );
}
