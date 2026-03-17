import { Module } from '@nestjs/common';
import { GoogleDriveAdapter } from './google-drive.adapter';
import { STORAGE_SERVICE } from './storage.interface';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: GoogleDriveAdapter,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
