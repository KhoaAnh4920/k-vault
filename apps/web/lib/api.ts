import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE) {
  throw new Error("NEXT_PUBLIC_API_URL is not defined");
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 200000,
});

export interface Video {
  id: string;
  title: string;
  description: string | null;
  status: "processing" | "ready" | "error";
  createdAt: string;
  updatedAt: string;
}

export interface InitUploadResponse {
  uploadUrl: string;
  driveFileId: string;
}

export const videoApi = {
  list: () => api.get<Video[]>("/videos").then((r) => r.data),

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
    rawDriveFileId: string;
  }) => api.post<Video>("/videos", payload).then((r) => r.data),

  remove: (id: string) => api.delete(`/videos/${id}`),

  getPlaylistUrl: (videoId: string) => `${API_BASE}/stream/${videoId}/playlist`,
};

export default api;
