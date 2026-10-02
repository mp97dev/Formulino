import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());

  // In the deployed container every request reaches Nest from 127.0.0.1 via
  // nginx, so without this ThrottlerGuard buckets ALL clients into one
  // counter — the 5/min limit on /forms/create would behave as a single
  // global budget instead of a per-client one. `1` (not `true`) is correct
  // because there is exactly one hop we control (deploy/nginx sets
  // X-Forwarded-For, see deploy/nginx/default.conf.template).
  app.set('trust proxy', 1);

  const corsOrigin = process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://localhost:4200';
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN && !process.env.FRONTEND_URL) {
    // Not fatal — throwing here would take down a deploy on a config typo —
    // but silently falling back to localhost in production would either
    // break the real frontend or, worse, mask a misconfiguration that should
    // have been caught before shipping.
    Logger.warn(
      'CORS_ORIGIN and FRONTEND_URL are both unset in production; falling back to http://localhost:4200',
      'bootstrap',
    );
  }
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Formulino API')
      .setDescription('Valida e crea Google Form da un DSL JSON — Formulino')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Usa sempre BACKEND_PORT (default 3000), ignora process.env.PORT per evitare conflitto con nginx/Railway
  const port = Number(process.env.BACKEND_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
