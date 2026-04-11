export interface QualityPreset {
  name: string;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const ALL_QUALITY_PRESETS: QualityPreset[] = [
  { name: 'HD', height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
  { name: 'SD', height: 480,  videoBitrate: '1400k', audioBitrate: '128k' },
];

export function selectQualities(info: {
  width: number;
  height: number;
}): QualityPreset[] {
  const maxDim = Math.max(info.width, info.height);
  const tiers: QualityPreset[] = [
    ALL_QUALITY_PRESETS.find((q) => q.name === 'SD')!,
  ];

  if (maxDim >= 720) {
    const hdHeight  = maxDim >= 1080 ? 1080 : 720;
    const hdBitrate = hdHeight  === 1080 ? '5000k' : '2800k';
    tiers.unshift({ name: 'HD', height: hdHeight, videoBitrate: hdBitrate, audioBitrate: '192k' });
  }

  return tiers;
}
