import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  const config = new DocumentBuilder()
    .setTitle('K-Vault API')
    .setDescription('The K-Vault backend API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port, '0.0.0.0');

  const isProd = process.env.NODE_ENV === 'production';
  const baseUrl = isProd
    ? process.env.APP_URL ||
      `http://${process.env.HOST || 'YOUR_DOMAIN_OR_IP'}:${port}`
    : `http://localhost:${port}`;

  console.log(`🚀 Backend running on ${baseUrl}/${apiPrefix}`);
  console.log(`📚 Swagger docs available at ${baseUrl}/${apiPrefix}/docs`);
}

bootstrap();
