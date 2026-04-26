import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Injection token for the shared ioredis singleton. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Provides a single shared ioredis client to all modules.
 * Re-uses the REDIS_URL env var already validated by env.validation.ts.
 */
export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (config: ConfigService): Redis => {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    return new Redis(url, {
      tls: url.startsWith('rediss://') ? {} : undefined,
      // Fail fast on connection error — do not block server startup indefinitely
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  },
  inject: [ConfigService],
};
