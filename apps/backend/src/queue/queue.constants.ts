export const TRANSCODE_QUEUE_LOCAL = 'transcode-local';
export const TRANSCODE_QUEUE_PROD = 'transcode-prod';

// Resolved at runtime based on NODE_ENV
export const TRANSCODE_QUEUE =
  process.env.NODE_ENV === 'production'
    ? TRANSCODE_QUEUE_PROD
    : TRANSCODE_QUEUE_LOCAL;
