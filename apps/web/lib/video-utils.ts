/**
 * Extracts a specific number of frames from a video file as data URLs.
 */
export async function generateThumbnails(
  file: File,
  count: number = 10
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (isNaN(duration) || duration === Infinity) {
        URL.revokeObjectURL(url);
        return reject(new Error("Invalid video duration"));
      }

      const thumbnails: string[] = [];
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Set canvas size to video aspect ratio
      // We use a fixed height for performance during generation
      const targetHeight = 180;
      const aspectRatio = video.videoWidth / video.videoHeight;
      canvas.width = targetHeight * aspectRatio;
      canvas.height = targetHeight;

      // Capture frames at even intervals, skipping the first 1% and last 1%
      const interval = (duration * 0.98) / count;
      const startOffset = duration * 0.01;

      for (let i = 0; i < count; i++) {
        const time = startOffset + i * interval;
        video.currentTime = time;

        // Wait for seek to complete
        await new Promise((res) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            res(null);
          };
          video.addEventListener("seeked", onSeeked);
        });

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnails.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      }

      URL.revokeObjectURL(url);
      resolve(thumbnails);
    };

    video.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
  });
}

/**
 * Extracts frames from an HLS playlist URL.
 * Falls back to native HLS support gracefully.
 */
import Hls from "hls.js";

export async function generateThumbnailsFromUrl(
  url: string,
  count: number = 10
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;

    const extract = async () => {
      const duration = video.duration;
      if (isNaN(duration) || duration === Infinity) {
        return reject(new Error("Invalid duration"));
      }

      const thumbnails: string[] = [];
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const targetHeight = 180;
      const aspectRatio = video.videoWidth / video.videoHeight;
      canvas.width = targetHeight * aspectRatio || targetHeight * (16/9);
      canvas.height = targetHeight;

      const interval = (duration * 0.98) / count;
      const startOffset = duration * 0.01;

      for (let i = 0; i < count; i++) {
        const time = startOffset + i * interval;
        video.currentTime = time;

        await new Promise((res) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            res(null);
          };
          video.addEventListener("seeked", onSeeked);
          // Failsafe timeout
          setTimeout(() => {
            video.removeEventListener("seeked", onSeeked);
            res(null);
          }, 5000);
        });

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnails.push(canvas.toDataURL("image/jpeg", 0.7));
        }
      }
      resolve(thumbnails);
    };

    if (Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.onloadedmetadata = extract;
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          reject(new Error("HLS Error"));
          hls.destroy();
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.onloadedmetadata = extract;
    } else {
      reject(new Error("HLS not supported"));
    }
  });
}
