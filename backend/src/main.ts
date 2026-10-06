import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Fix: Explicitly type the variable so it can be an object or undefined
  let httpsOptions: { key: Buffer; cert: Buffer } | undefined = undefined;

  // On active le HTTPS local seulement si les fichiers existent (Mode Dev)
  if (fs.existsSync('./ssl/key.pem') && fs.existsSync('./ssl/cert.pem')) {
    httpsOptions = {
      key: fs.readFileSync('./ssl/key.pem'),
      cert: fs.readFileSync('./ssl/cert.pem'),
    };
    logger.log('🔒 SSL certificates found - Starting in HTTPS mode');
  } else {
    logger.log('🌐 No SSL certificates - Starting in HTTP mode');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    httpsOptions, // Sera 'undefined' en prod -> NestJS démarrera en HTTP simple
  });
  // Limite explicite (défaut Express : 100 Ko) : un plan de vente importé depuis
  // l'interface passe en entier dans le corps GraphQL et en fait déjà ~55 Ko.
  app.useBodyParser('json', { limit: '1mb' });
  const allowedOrigins = process.env.VITE_FRONTEND_URL?.split(',') || [
    'https://localhost:5173',
    'https://192.168.1.107:5173',
  ];
  // Configuration CORS pour permettre les requêtes du front
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
