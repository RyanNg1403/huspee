import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(cookieParser());
  app.enableCors({
    origin: [...new Set([cfg.WEB_APP_URL, cfg.SELLER_APP_URL].map((url) => new URL(url).origin))],
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'Idempotency-Key', 'X-Huspee-Surface'],
  });
  app.enableShutdownHooks();
  await app.listen(cfg.PORT);
  Logger.log(`Huspee API listening on ${cfg.PUBLIC_BASE_URL} (port ${cfg.PORT})`, 'Bootstrap');
}

void bootstrap();
