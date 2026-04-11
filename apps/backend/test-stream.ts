import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { StreamService } from './src/stream/stream.service';
import { Role } from './src/auth/roles.decorator';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const streamService = app.get(StreamService);
  const user = { userId: 'admin', email: 'admin', roles: [Role.ADMIN] };
  try {
    const p = await streamService.getQualityPlaylist('d470d164-98ab-441e-b5c9-fab521d8f06b', 'SD', user);
    console.log(p);
  } catch (e) {
    console.error(e);
  }
  await app.close();
}
bootstrap();
