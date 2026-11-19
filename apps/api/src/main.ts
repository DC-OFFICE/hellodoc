import 'reflect-metadata';
import 'dotenv/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { assertProductionConfig } from './common/production-config.js';

async function bootstrap() {
  const problems = assertProductionConfig();
  if (problems.length > 0) {
    console.error('Refusing to start with an unsafe production configuration:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  // Render (and similar hosts) terminate TLS at the proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((v) => v.trim()),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`HelloDoc API listening on 0.0.0.0:${port} (health /api/health/live)`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
