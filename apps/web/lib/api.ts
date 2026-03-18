import axios from "axios";
import { getSession } from "next-auth/react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000,
});

api.interceptors.request.use(async (config) => {
  try {
    const session = await getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    /* unauthenticated — backend returns 401 */
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const { signOut } = await import("next-auth/react");
      await signOut({
        callbackUrl: `/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`,
      });
    }
    return Promise.reject(error);
  },
);

export interface Video {
  id: string;
  title: string;
  description: string | null;
  status: "processing" | "ready" | "error";
  category: string | null;
  durationSeconds: number | null;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export interface InitUploadResponse {
  uploadUrl: string;
  driveFileId: string;
}

/** Upload a file to a Google Drive resumable session URL in 20 MB chunks. */
const CHUNK_SIZE = 20 * 1024 * 1024; // 20 MB

export async function uploadFileInChunks(
  sessionUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  let offset = 0;
  while (offset < file.size) {
    const chunkEnd = Math.min(offset + CHUNK_SIZE, file.size) - 1;
    const chunk = file.slice(offset, chunkEnd + 1);

    const res = await axios.put(sessionUrl, chunk, {
      headers: {
        "Content-Type": file.type || "video/mp4",
        "Content-Range": `bytes ${offset}-${chunkEnd}/${file.size}`,
      },
      // Allow 308 Resume Incomplete alongside 200/201
      validateStatus: (s) => s === 200 || s === 201 || s === 308,
      onUploadProgress: (event) => {
        const sent = offset + (event.loaded ?? 0);
        onProgress(Math.min(99, Math.round((sent / file.size) * 100)));
      },
    });

    if (res.status === 308) {
      // Server tells us how many bytes it actually received
      const rangeHeader = res.headers["range"] as string | undefined;
      if (rangeHeader) {
        const m = /bytes=0-(\d+)/.exec(rangeHeader);
        offset = m?.[1] ? parseInt(m[1], 10) + 1 : chunkEnd + 1;
      } else {
        offset = chunkEnd + 1;
      }
    } else {
      // 200 or 201 — upload complete
      offset = file.size;
    }
  }
  onProgress(100);
}

export const videoApi = {
  list: (category?: string) =>
    api
      .get<Video[]>("/videos", { params: category ? { category } : undefined })
      .then((r) => r.data),

  get: (id: string) => api.get<Video>(`/videos/${id}`).then((r) => r.data),

  initUpload: (fileName: string) =>
    api
      .post<InitUploadResponse>("/videos/upload-init", {
        fileName,
        mimeType: "video/mp4",
      })
      .then((r) => r.data),

  create: (payload: {
    title: string;
    description?: string;
    category?: string;
    rawDriveFileId: string;
  }) => api.post<Video>("/videos", payload).then((r) => r.data),

  remove: (id: string) => api.delete(`/videos/${id}`),

  getPlaylistUrl: (videoId: string) => `${API_BASE}/stream/${videoId}/playlist`,

  /**
   * Thumbnail is proxied through the Next.js server route so the browser
   * automatically carries the session cookie — no custom headers needed
   * for <img> tags.
   */
  getThumbnailUrl: (videoId: string) => `/api/thumbnail/${videoId}`,
};

export default api;
