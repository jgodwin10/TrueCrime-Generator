// src/workers/document-worker.ts - COMPLETELY REWRITTEN
// CRITICAL: Load environment variables first
import * as dotenv from 'dotenv';
dotenv.config();

import { UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

// CRITICAL: Remove .js extensions - let TypeScript/Node handle resolution
import {
  Project,
  Chapter,
  Translation,
  Document,
  Job,
  Image,
  User,
  DocumentType,
  Language,
  DocumentStatus,
  documentJobType,
  JobStatus,
} from '../DB/entities/index';

import { PdfService } from '../documents/pdf.service';
import { DocxService } from '../documents/docx.service';
import { EpubService } from '../documents/epub.service';
import { CloudinaryDocumentService } from '../documents/cloudinary-document.service';
import { RedisCacheService } from '../queues/cache/redis-cache.service';
import { bookFonts } from '../content/book-fonts';
import {
  databaseConnection,
  databaseWarnings,
  describeDatabase,
  describeRedis,
  redisOptions,
} from '../config/connections';
import { ConfigService } from '@nestjs/config';

// Simple logger
const log = {
  log: (msg: string) => console.log(`[${new Date().toISOString()}] LOG ${msg}`),
  error: (msg: string, err?: any) =>
    console.error(`[${new Date().toISOString()}] ERROR ${msg}`, err),
  warn: (msg: string) =>
    console.warn(`[${new Date().toISOString()}] WARN ${msg}`),
};

// Keep the worker alive on a stray rejected promise instead of exiting with
// status 1 mid-document; BullMQ fails and retries the job itself
process.on('unhandledRejection', (reason) => {
  log.error('❌ Unhandled promise rejection (process kept alive):', reason);
});

log.log('🚀 Starting Document Worker...');
log.log(`Redis: ${describeRedis()}`);
log.log(`Database: ${describeDatabase()}`);
databaseWarnings().forEach((warning) => log.warn(warning));

// Verify Cloudinary credentials
const cloudinaryName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryKey = process.env.CLOUDINARY_API_KEY;
if (!cloudinaryName || !cloudinaryKey) {
  log.error('❌ Missing Cloudinary credentials!');
  log.error(`CLOUDINARY_CLOUD_NAME: ${cloudinaryName ? 'SET' : 'MISSING'}`);
  log.error(`CLOUDINARY_API_KEY: ${cloudinaryKey ? 'SET' : 'MISSING'}`);
  process.exit(1);
}
log.log('✅ Cloudinary credentials loaded');

// Redis connection for BullMQ
const connection = new Redis({
  ...redisOptions(),
  maxRetriesPerRequest: null,
});

connection.on('connect', () => log.log('✅ Redis connected'));
connection.on('error', (err) => log.error('❌ Redis error:', err));

// Database connection
let dataSource: DataSource | null = null;

async function initializeDatabase() {
  if (dataSource?.isInitialized) return dataSource;

  dataSource = new DataSource({
    type: 'postgres',
    ...databaseConnection(),
    entities: [User, Project, Chapter, Translation, Document, Job, Image],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  log.log('✅ Database connected');
  return dataSource;
}

// Initialize services once
// CRITICAL: ConfigService needs the environment object to work properly
const configService = new ConfigService(process.env);
const pdfService = new PdfService(configService);
const docxService = new DocxService(configService);
const epubService = new EpubService(configService);
const cloudinaryService = new CloudinaryDocumentService(configService);
const redisCache = new RedisCacheService(configService);

log.log('✅ Services initialized');

// Worker processor
const worker = new Worker(
  'document-generation',
  async (job) => {
    const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
    const { type, language } = job.data;

    log.log(
      `[START] ${type}-${language} | Job ID: ${job.id} | Heap: ${Math.round(startMem)}MB`,
    );

    try {
      // Initialize database
      const db = await initializeDatabase();

      const projectRepo = db.getRepository(Project);
      const chapterRepo = db.getRepository(Chapter);
      const translationRepo = db.getRepository(Translation);
      const documentRepo = db.getRepository(Document);
      const jobRepo = db.getRepository(Job);

      const { projectId, title, subtitle, author, includeImages } = job.data;

      log.log(`Processing ${type} for project ${projectId} in ${language}`);

      // Get project data first: the job record below references it, and a
      // deleted project (e.g. a stale queued job) can never succeed, so
      // don't let BullMQ retry it
      const project = await projectRepo.findOne({
        where: { id: projectId },
        relations: ['chapters', 'images'],
      });

      if (!project) {
        throw new UnrecoverableError(
          `Project ${projectId} not found (deleted?) — dropping ${type} job`,
        );
      }

      // Create job record
      const jobRecord = jobRepo.create({
        projectId,
        type: documentJobType(type),
        status: JobStatus.IN_PROGRESS,
        progress: 0,
        startedAt: new Date(),
      });
      await jobRepo.save(jobRecord);

      log.log(
        `Found project with ${project.chapters.length} chapters and ${project.images.length} images`,
      );

      // Get content
      let chapters = [...project.chapters].sort((a, b) => a.order - b.order);
      let finalTitle = title || project.title;
      let finalSubtitle = subtitle || project.subtitle;

      if (language !== Language.ENGLISH) {
        const translation = await translationRepo.findOne({
          where: { projectId, language },
        });

        if (translation) {
          log.log(`Using ${language} translation`);
          finalTitle = translation.title;
          finalSubtitle = translation.subtitle;
          const translatedChapters = translation.content as any[];
          chapters = chapters.map((ch, index) => ({
            ...ch,
            content: translatedChapters[index]?.content || ch.content,
            title: translatedChapters[index]?.title || ch.title,
          }));
        } else {
          log.warn(`No ${language} translation found, using English`);
        }
      }

      await job.updateProgress(20);

      // Generate document
      log.log(`Generating ${type} document...`);

      let result: { buffer: Buffer; filename: string };

      if (type === DocumentType.EPUB) {
        result = await epubService.generateEPUBBuffer(
          finalTitle,
          finalSubtitle,
          author,
          chapters,
          includeImages ? project.images : [],
          redisCache,
          language,
          bookFonts(project.fonts),
        );
      } else if (type === DocumentType.PDF) {
        result = await pdfService.generatePDFBuffer(
          finalTitle,
          finalSubtitle,
          author,
          chapters,
          includeImages ? project.images : [],
          redisCache,
          language,
          bookFonts(project.fonts),
        );
      } else {
        result = await docxService.generateDOCXBuffer(
          finalTitle,
          finalSubtitle,
          author,
          chapters,
          includeImages ? project.images : [],
          redisCache,
          bookFonts(project.fonts),
        );
      }

      log.log(
        `Document generated: ${result.filename} (${Math.round(result.buffer.length / 1024)}KB)`,
      );

      await job.updateProgress(60);

      // Upload to Cloudinary
      log.log(`Uploading to Cloudinary...`);
      const cloudinaryResult = await cloudinaryService.uploadDocument(
        result.buffer,
        result.filename,
      );

      log.log(`Uploaded: ${cloudinaryResult.url}`);

      await job.updateProgress(80);

      // Save document record
      const document = documentRepo.create({
        projectId,
        type,
        language,
        filename: result.filename,
        url: cloudinaryResult.url,
        storageKey: cloudinaryResult.publicId,
        size: cloudinaryResult.size,
        status: DocumentStatus.COMPLETED,
      });
      await documentRepo.save(document);

      // Complete job
      jobRecord.status = JobStatus.COMPLETED;
      jobRecord.progress = 100;
      jobRecord.completedAt = new Date();
      jobRecord.result = {
        documentId: document.id,
        filename: result.filename,
        url: cloudinaryResult.url,
      };
      await jobRepo.save(jobRecord);

      await job.updateProgress(100);

      const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
      log.log(
        `[COMPLETE] ${type}-${language} | Heap: ${Math.round(endMem)}MB | Δ: ${Math.round(endMem - startMem)}MB`,
      );

      // Force GC
      if (global.gc) {
        global.gc();
        const afterGC = process.memoryUsage().heapUsed / 1024 / 1024;
        log.log(`[GC] Heap after cleanup: ${Math.round(afterGC)}MB`);
      }

      return {
        documentId: document.id,
        filename: result.filename,
        url: cloudinaryResult.url,
      };
    } catch (error) {
      log.error(`Job failed:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 2000,
    },
  },
);

worker.on('completed', (job) => {
  log.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  log.error(`❌ Job ${job?.id} failed:`, err);
});

worker.on('active', (job) => {
  log.log(`🔄 Job ${job.id} active: ${job.data.type}-${job.data.language}`);
});

log.log('📄 Document Worker ready and listening for jobs');

// Graceful shutdown
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.log(`${signal} received, closing worker...`);

  try {
    await worker.close();
    log.log('Worker closed');
  } catch (err) {
    log.error('Error closing worker:', err);
  }

  try {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
      log.log('Database connection closed');
    }
  } catch (err) {
    log.error('Error closing database:', err);
  }

  try {
    await connection.quit();
    log.log('Redis connection closed');
  } catch (err) {
    log.error('Error closing Redis:', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
