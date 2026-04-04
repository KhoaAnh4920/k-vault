import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleDriveAdapter } from './google-drive.adapter';
import { S3StorageAdapter } from './s3.adapter';
import { STORAGE_SERVICE } from './storage.interface';

@Module({
  providers: [
    GoogleDriveAdapter,
    S3StorageAdapter,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService, GoogleDriveAdapter, S3StorageAdapter],
      useFactory: (
        config: ConfigService,
        driveAdapter: GoogleDriveAdapter,
        s3Adapter: S3StorageAdapter,
      ) => {
        const type = config.get<string>('STORAGE_TYPE');
        if (type === 'S3') {
          console.log('🛠  Backend Storage initialized: S3/MinIO');
          return s3Adapter;
        }
        console.log('🛠  Backend Storage initialized: Google Drive');
        return driveAdapter;
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
