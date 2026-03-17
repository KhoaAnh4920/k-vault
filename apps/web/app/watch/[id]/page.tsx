'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Hls from 'hls.js';
import { videoApi, type Video } from '@/lib/api';

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    videoApi.get(id).then(setVideo).catch(() => router.push('/')).finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    if (!video || video.status !== 'ready' || !videoRef.current) return;

    const videoEl = videoRef.current;
    const playlistUrl = videoApi.getPlaylistUrl(id);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(playlistUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch(() => {/* autoplay blocked, user will tap */});
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setPlayerError(`Playback error: ${data.details}`);
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      videoEl.src = playlistUrl;
    } else {
      setPlayerError('Your browser does not support HLS streaming.');
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [video, id]);

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>
        <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 12 }} />
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ height: 28, width: '50%', borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 16, width: '35%', borderRadius: 4 }} />
        </div>
      </div>
    );
  }

  if (!video) return null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px' }}>
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="btn-ghost"
        style={{ marginBottom: 24, fontSize: 13 }}
      >
        ← Back
      </button>

      {/* Player */}
      {video.status === 'ready' ? (
        <div className="video-wrapper" style={{ marginBottom: 32, boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}>
          <video
            ref={videoRef}
            controls
            playsInline
            id="hls-player"
            style={{ width: '100%', height: '100%', background: '#000' }}
          />
          {playerError && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.8)', color: '#fca5a5', padding: 32, textAlign: 'center',
            }}>
              <div>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                <p>{playerError}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          aspectRatio: '16/9',
          background: 'var(--bg-card)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 32,
          gap: 16,
        }}>
          {video.status === 'processing' ? (
            <>
              <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Transcoding in progress...</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                  This may take a few minutes. Start the local worker on your Mac.
                </p>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 40 }}>⚠️</span>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Transcoding failed</p>
            </>
          )}
        </div>
      )}

      {/* Metadata */}
      <div>
        <h1 style={{ margin: '0 0 8px', fontSize: 'clamp(20px, 3vw, 32px)' }}>{video.title}</h1>
        {video.description && (
          <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {video.description}
          </p>
        )}
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
          Added {new Date(video.createdAt).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>
    </div>
  );
}
