import * as path from 'path';
import * as fs from 'fs';

export function parsePlaylistDurations(
  playlistPath: string,
): Map<string, number> {
  const lines = fs
    .readFileSync(playlistPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const durations = new Map<string, number>();

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!;
    if (!line.startsWith('#EXTINF:')) continue;

    const commaIdx = line.indexOf(',');
    const duration = parseFloat(line.slice('#EXTINF:'.length, commaIdx));
    const filename = path.basename(lines[i + 1]!);

    if (!filename.startsWith('#') && filename.endsWith('.ts')) {
      durations.set(filename, duration);
    }
  }

  return durations;
}
