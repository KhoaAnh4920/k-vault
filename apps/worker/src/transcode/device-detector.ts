import * as os from 'os';
import * as fs from 'fs';

export interface DeviceInfo {
  platform: NodeJS.Platform;
  arch: string;
  cpuModel: string;
  cores: number;
  isDocker: boolean;
  isAppleSilicon: boolean;
}

export class DeviceDetector {
  private static cachedInfo: DeviceInfo | null = null;

  static getInfo(): DeviceInfo {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const platform = os.platform();
    const arch = os.arch();
    const cpus = os.cpus();
    const cores = cpus.length;
    // Safely get CPU model name
    const cpuModel = cpus.length > 0 ? cpus[0]!.model : 'Unknown CPU';
    
    // Simple docker detection by checking if /.dockerenv exists
    const isDocker = fs.existsSync('/.dockerenv');

    // Apple silicon usually has 'Apple M1', 'Apple M2', etc., and arch is arm64, or darwin + arm64.
    const isAppleSilicon = cpuModel.includes('Apple M') || (platform === 'darwin' && arch === 'arm64');

    this.cachedInfo = {
      platform,
      arch,
      cpuModel,
      cores,
      isDocker,
      isAppleSilicon,
    };

    return this.cachedInfo;
  }
}
