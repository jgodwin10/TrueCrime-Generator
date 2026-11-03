// src/book-generator/book.controller.ts - FIXED VERSION
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  Request,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { BookGenerationQueue } from '../queues/book-generation.queue';
import { BookGeneratorService } from './book-generator.service';
import { DocumentService } from '../documents/document.service';
import { EpubService } from '../documents/epub.service';
import { CreateBookDto } from './create-book.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectService } from '../project/project.service';
import { RedisCacheService } from 'src/queues/queues.module';
import { Project, ProjectStatus } from '../DB/entities/project.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@ApiTags('books')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('books')
export class BookController {
  private readonly logger = new Logger(BookController.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly dataSource: DataSource,
    private readonly bookGenerationQueue: BookGenerationQueue,
    private readonly bookGeneratorService: BookGeneratorService,
    private readonly projectService: ProjectService,
    private readonly documentService: DocumentService,
    private readonly epubService: EpubService,
    private readonly redisCache: RedisCacheService,
  ) {}

  @Post('generate')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 20 },
    ]),
  )
  @ApiOperation({
    summary: 'Generate a complete English true crime book (Queue-based)',
  })
  async generateBook(
    @Body() createBookDto: CreateBookDto,
    @Request() req,
    @UploadedFiles()
    files: {
      images?: Express.Multer.File[];
    },
  ) {
    const userId = req.user.sub;

    // CRITICAL FIX: Use explicit transaction control
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let project: Project;

    try {
      // Create project entity
      const projectData = {
        title: createBookDto.title,
        subtitle: createBookDto.subtitle,
        author: createBookDto.author,
        subject: createBookDto.subject,
        description: createBookDto.notes,
        numberOfChapters: createBookDto.numberOfChapters ?? 12,
        userId: createBookDto.userId || userId,
        status: ProjectStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const newProject = queryRunner.manager.create(Project, projectData);

      // Save within transaction
      project = await queryRunner.manager.save(Project, newProject);
      this.logger.log(`Project created: ${project.id}`);

      // CRITICAL: Commit transaction BEFORE queuing
      await queryRunner.commitTransaction();

      // CRITICAL: Small delay to ensure DB write is visible
      await this.delay(200);

      // CRITICAL: Verify project exists before queuing
      const verifiedProject = await this.projectRepository.findOne({
        where: { id: project.id },
      });

      if (!verifiedProject) {
        throw new Error(
          `Project ${project.id} not found after commit - possible database issue`,
        );
      }

      // Serialize buffers to JSON format for Redis
      const serializedFiles = {
        images: files.images?.map((f) => ({
          buffer: f.buffer.toJSON(),
          originalname: f.originalname,
          mimetype: f.mimetype,
        })),
      };

      // NOW it's safe to queue the job
      const jobId = await this.bookGenerationQueue.addBookGenerationJob({
        projectId: project.id,
        createBookDto,
        files: serializedFiles,
      });

      this.logger.log(
        `Book generation job queued: ${jobId} for project ${project.id}`,
      );

      return {
        message:
          'Book generation queued successfully! Processing in background.',
        projectId: project.id,
        jobId,
        estimatedTime: '10-15 minutes',
        steps: [
          '1. Writing the book (12 chapters)',
          '2. Placing your photos',
          '3. Creating the English EPUB + PDF for Google Play Books',
        ],
        statusEndpoint: `/api/books/status/${project.id}`,
        jobStatusEndpoint: `/api/books/job/${jobId}`,
        downloadEndpoint: `/api/books/download/${project.id}`,
      };
    } catch (error) {
      this.logger.error('Error during book generation setup:', error);

      // Rollback transaction if it's still active
      if (queryRunner.isTransactionActive) {
        this.logger.log('Rolling back transaction...');
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      // Always release the query runner
      await queryRunner.release();
    }
  }

  /**
   * Helper method to create delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  @Get('job/:jobId')
  @ApiOperation({ summary: 'Get queue job status' })
  async getJobStatus(@Param('jobId') jobId: string) {
    return await this.bookGenerationQueue.getJobStatus(jobId);
  }

  @Get('queue/metrics')
  @ApiOperation({ summary: 'Get queue metrics' })
  async getQueueMetrics() {
    return await this.bookGenerationQueue.getQueueMetrics();
  }

  @Get('status/:projectId')
  @ApiOperation({ summary: 'Check book generation status and progress' })
  async getStatus(@Param('projectId') projectId: string) {
    return await this.bookGeneratorService.getBookStatus(projectId);
  }

  @Get('preview/:projectId')
  @ApiOperation({ summary: 'Get the book content for reading on the web' })
  async getPreview(@Param('projectId') projectId: string, @Request() req) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['chapters', 'images'],
    });

    // Only the owner can read a book before it's published
    if (!project || project.userId !== req.user.id) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return {
      projectId,
      status: project.status,
      ...(await this.epubService.renderWebPreview(
        project.title,
        project.subtitle || '',
        project.author,
        project.chapters || [],
        project.images || [],
      )),
    };
  }

  @Get('download/:projectId')
  @ApiOperation({ summary: 'Get all download links for generated books' })
  async getDownloads(@Param('projectId') projectId: string) {
    return await this.bookGeneratorService.getDownloadLinks(projectId);
  }

  @Get('download/:projectId/:documentId')
  @ApiOperation({ summary: 'Get document download URL' })
  async getDocumentDownloadUrl(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    const document = await this.documentService.findOne(documentId);

    if (document.projectId !== projectId) {
      throw new Error('Document not found in this project');
    }

    return {
      id: document.id,
      filename: document.filename,
      type: document.type,
      language: document.language,
      size: document.size,
      url: document.url,
      cloudinaryPublicId: document.storageKey,
      createdAt: document.createdAt,
    };
  }
}
