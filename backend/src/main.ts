import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import {
  corsOrigin,
  databaseWarnings,
  describeDatabase,
} from './config/connections';

// A stray rejected promise (e.g. a fire-and-forget DB call during a long
// generation) would otherwise exit the API with status 1. Log it loudly and
// keep serving; the job it belonged to fails on its own.
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection (process kept alive):', reason);
});

async function bootstrap() {
  // const app = await NestFactory.create(AppModule);

  console.log('=== Node.js Configuration ===');
  console.log(`Node Version: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Architecture: ${process.arch}`);
  console.log(`Garbage Collection Exposed: ${!!global.gc}`);

  if (!global.gc) {
    console.warn('⚠️  WARNING: Garbage collection not exposed!');
    console.warn('⚠️  Run with: node --expose-gc dist/main.js');
    console.warn('⚠️  Or update package.json start script');
  }

  const memUsage = process.memoryUsage();
  console.log('=== Initial Memory Usage ===');
  console.log(`Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
  console.log(`Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
  console.log(`RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
  console.log('===============================\n');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  // CORS: any origin unless CORS_ORIGINS restricts it (see config/connections)
  app.enableCors({
    origin: corsOrigin(),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('True Crime Generator API')
    .setDescription(
      'API for generating English true crime books with AI-written content, formatted as EPUB and PDF for Google Play Books',
    )
    .setVersion('1.0')
    .addTag('projects', 'Book project management')
    .addTag('content', 'Content generation')
    .addTag('documents', 'EPUB and PDF generation for Google Play Books')
    .addTag('images', 'Image upload and management')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'True Crime Generator API Docs',
    customCss: `
      .topbar-wrapper img { content: url('https://via.placeholder.com/150x50?text=True+Crime'); }
      .swagger-ui .topbar { background-color: #2c3e50; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Hosts like Render inject PORT and need the server on all interfaces
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, process.env.HOST || '0.0.0.0');

  console.log(
    `🚀 True Crime Generator API is running on: http://localhost:${port}`,
  );
  console.log(
    `📚 API Documentation available at: http://localhost:${port}/api/docs`,
  );
  console.log(
    `🗄️  Database: ${describeDatabase()}`,
  );
  databaseWarnings().forEach((warning) => console.warn(`⚠️  ${warning}`));

  await startEmbeddedDocumentWorker();
}

/**
 * The EPUB/PDF builder normally runs as its own process (start:worker). On a
 * single-service deploy there is none, so run it inside the API unless
 * DOCUMENT_WORKER=external says a separate worker service exists.
 */
async function startEmbeddedDocumentWorker() {
  if ((process.env.DOCUMENT_WORKER || '').toLowerCase() === 'external') {
    console.log('📄 Document worker: external service (DOCUMENT_WORKER=external)');
    return;
  }

  // The worker exits the process without these; keep the API up instead
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    console.error(
      '❌ Document worker NOT started: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY missing. Books will fail at the EPUB/PDF step.',
    );
    return;
  }

  console.log('📄 Document worker: starting inside the API process');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./workers/document-worker');
}

bootstrap();
