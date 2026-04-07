import { setupBinaries } from './transcode/binary';

// Configure binaries before any transcode/probe modules are invoked
setupBinaries();

export { VideoInfo, getVideoInfo } from './transcode/probe';
export { QualityPreset, ALL_QUALITY_PRESETS, selectQualities } from './transcode/quality';
export { TranscodeResult, transcodeToHls } from './transcode/transcoder';
export { extractThumbnail } from './transcode/thumbnail';
export { parsePlaylistDurations } from './transcode/playlist-parser';
