// src/content/content.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Project, ProjectStatus } from 'src/DB/entities/project.entity';
import { Job, JobType, JobStatus } from 'src/DB/entities/job.entity';
import { CaseBrief, GeminiService } from './gemini.service';
import { buildStyleProfile, describeStyleProfile } from './true-crime-style';
import { GenerateTrueCrimeDto } from './dto/generate-true-crime.dto';
import { Chapter } from 'src/DB/entities/chapter.entity';
import { buildCopyrightPage } from './copyright';
import { buildTableOfContents } from './table-of-contents';
import { resolveFontSettings } from './book-fonts';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly API_CALL_COOLDOWN_MS = 6000; // 6s between light calls
  private readonly CHAPTER_COOLDOWN_MS = 5000; // 5s between heavy chapter calls

  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepository: Repository<Chapter>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly geminiService: GeminiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async cooldown(ms?: number): Promise<void> {
    const delay = ms || this.API_CALL_COOLDOWN_MS;
    this.logger.debug(`Cooling down for ${delay}ms before next API call...`);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  async generateTrueCrimeBook(
    projectId: string,
    generateDto: GenerateTrueCrimeDto,
  ) {
    let project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      this.logger.warn(
        `Project ${projectId} not found, waiting 1s and retrying...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      project = await this.projectRepository.findOne({
        where: { id: projectId },
      });
    }

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    // Create job for tracking
    const job = this.jobRepository.create({
      projectId,
      type: JobType.CONTENT_GENERATION,
      status: JobStatus.PENDING,
      progress: 0,
      data: generateDto,
    });
    await this.jobRepository.save(job);

    // Update project
    project.status = ProjectStatus.GENERATING_CONTENT;
    project.numberOfChapters = generateDto.numberOfChapters || 12;
    await this.projectRepository.save(project);

    // Start generation in background. Nothing awaits it, so an error that
    // escapes it must be caught here or Node exits the whole API.
    this.generateTrueCrimeBackground(projectId, generateDto, job.id).catch(
      (error) =>
        this.logger.error(
          `Background generation crashed for project ${projectId}:`,
          error,
        ),
    );

    return {
      message: 'Book generation started',
      jobId: job.id,
      projectId,
      steps: [
        'Step 1: Generating detailed book outline',
        'Step 2: Writing introduction',
        'Step 3: Writing the case chapters',
        'Step 4: Writing the conclusion and case timeline',
        'Step 5: Generating front matter and table of contents',
      ],
    };
  }

  private async generateTrueCrimeBackground(
    projectId: string,
    generateDto: GenerateTrueCrimeDto,
    jobId: string,
  ) {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.error(`Job with ID ${jobId} not found`);
      return;
    }

    try {
      job.status = JobStatus.IN_PROGRESS;
      job.startedAt = new Date();
      await this.jobRepository.save(job);

      const year = new Date().getFullYear();
      const numberOfChapters = generateDto.numberOfChapters || 12;
      const brief: CaseBrief = {
        subject: generateDto.subject,
        notes: generateDto.notes,
        // One style per book: books with the same title still read differently
        seed: projectId,
      };

      // The writing style (persona, tone, structure, chapter formats) this
      // book gets, recorded for reference
      const bookStyle = describeStyleProfile(buildStyleProfile(projectId));
      this.logger.log(`Book "${generateDto.title}" style: ${bookStyle}`);

      // STEP 1: Generate detailed outline (5% progress)
      this.logger.log(
        `Step 1: Generating book outline for ${generateDto.title} with ${numberOfChapters} chapters...`,
      );
      job.progress = 5;
      await this.jobRepository.save(job);

      const outline = await this.geminiService.generateBookOutline(
        generateDto.title,
        generateDto.subtitle || '',
        numberOfChapters,
        brief,
      );

      outline.author = generateDto.author;

      // VALIDATE: Ensure outline has correct number of chapters
      if (outline.chapters.length !== numberOfChapters) {
        throw new Error(
          `Expected ${numberOfChapters} chapters but got ${outline.chapters.length}`,
        );
      }

      this.logger.log(
        `Outline generated with ${outline.chapters.length} chapters`,
      );

      job.progress = 10;
      job.result = {
        outline,
        bookStyle, // Store style in job result for reference
      };
      await this.jobRepository.save(job);

      // ── Cooldown after outline generation ───────────────────
      await this.cooldown();

      // Each account has its own copyright page: its saved details plus
      // wording chosen for that account
      const owner = await this.projectRepository.findOne({
        where: { id: projectId },
        relations: ['user'],
      });
      const copyright = buildCopyrightPage({
        seed: owner?.userId || projectId,
        author: generateDto.author,
        subject: generateDto.subject,
        year,
        settings: owner?.user?.copyright,
      });

      await this.saveChapter(projectId, 'Copyright', 1, copyright);

      // The book keeps the account's fonts as they are now
      await this.projectRepository.update(projectId, {
        fonts: resolveFontSettings(
          owner?.userId || projectId,
          owner?.user?.fonts,
        ),
      });

      const aboutBook = await this.geminiService.generateAboutBook(
        generateDto.title,
        generateDto.subtitle || '',
        brief,
      );

      await this.saveChapter(projectId, 'About Book', 2, aboutBook);

      // ── Cooldown after about book generation ───────────────────
      await this.cooldown();

      // In the account's chosen format (see table-of-contents.ts)
      const tableOfContents = buildTableOfContents({
        seed: owner?.userId || projectId,
        chapters: outline.chapters,
        settings: owner?.user?.tableOfContents,
      });
      await this.saveChapter(
        projectId,
        'Table of Contents',
        3,
        tableOfContents,
      );

      job.progress = 15;
      await this.jobRepository.save(job);

      // ── Cooldown after table of contents generation ───────────────────
      await this.cooldown();

      // STEP 3: Generate Introduction (25% progress)
      this.logger.log('Step 3: Writing introduction...');

      const introduction = await this.geminiService.generateIntroduction(
        generateDto.title,
        generateDto.subtitle || '',
        outline,
        brief,
      );

      await this.saveChapter(
        projectId,
        outline.chapters[0].chapterTitle,
        4,
        introduction,
      );

      job.progress = 25;
      await this.jobRepository.save(job);

      // STEP 4: Generate the case chapters (25% - 85% progress)
      this.logger.log(
        `Step 4: Writing ${outline.chapters.length - 2} case chapters...`,
      );

      const mainChapters = outline.chapters.slice(1, -1);
      const progressPerChapter = 60 / mainChapters.length;

      for (let i = 0; i < mainChapters.length; i++) {
        // ── Cooldown before each chapter ──────────────────────
        await this.cooldown(this.CHAPTER_COOLDOWN_MS);

        const chapterOutline = mainChapters[i];
        this.logger.log(
          `Writing Chapter ${chapterOutline.chapterNumber}: ${chapterOutline.chapterTitle} (${i + 1}/${mainChapters.length})`,
        );

        // ═══════════════════════════════════════════════════════════════
        // PASS BOOK FORMAT TO CHAPTER GENERATION
        // ═══════════════════════════════════════════════════════════════
        const content = await this.geminiService.generateChapterContent(
          chapterOutline,
          generateDto.title,
          generateDto.subtitle || '',
          brief,
          outline,
        );

        await this.saveChapter(
          projectId,
          chapterOutline.chapterTitle,
          4 + i + 1,
          content,
        );

        job.progress = 25 + Math.round((i + 1) * progressPerChapter);
        await this.jobRepository.save(job);

        this.eventEmitter.emit('content.chapter.generated', {
          projectId,
          chapterNumber: chapterOutline.chapterNumber,
          totalChapters: outline.chapters.length,
          style: bookStyle,
        });
      }

      // ── Cooldown before conclusion ──────────────────────────
      await this.cooldown(this.CHAPTER_COOLDOWN_MS);

      // STEP 5: Generate the conclusion (95% progress)
      this.logger.log('Step 5: Writing conclusion...');

      const conclusionChapter = outline.chapters[outline.chapters.length - 1];
      const conclusion = await this.geminiService.generateConclusion(
        generateDto.title,
        generateDto.subtitle || '',
        outline,
        brief,
      );

      await this.saveChapter(
        projectId,
        conclusionChapter.chapterTitle,
        4 + mainChapters.length + 1,
        conclusion,
      );

      job.progress = 95;
      await this.jobRepository.save(job);

      // VALIDATE: Check we saved the correct number of chapters
      const savedChapters = await this.chapterRepository.count({
        where: { projectId },
      });

      // We should have: 3 front matter + numberOfChapters content chapters
      const expectedTotal = 3 + numberOfChapters;

      this.logger.log(
        `Saved ${savedChapters} chapters (expected ${expectedTotal})`,
      );

      if (savedChapters < expectedTotal) {
        this.logger.warn(
          `Warning: Expected ${expectedTotal} chapters but only saved ${savedChapters}`,
        );
      }

      // Mark job as completed
      job.status = JobStatus.COMPLETED;
      job.progress = 100;
      job.completedAt = new Date();
      job.result = {
        ...job.result,
        totalChapters: savedChapters,
        bookStyle, // Include style in final result
        message: 'Book content generation completed successfully',
      };
      await this.jobRepository.save(job);

      // Update project
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });
      if (!project) {
        this.logger.error(
          `Project with ID ${projectId} not found during generation update`,
        );
        return;
      }

      project.status = ProjectStatus.COMPLETED;
      await this.projectRepository.save(project);

      this.eventEmitter.emit('content.generation.completed', {
        projectId,
        bookStyle,
      });
      this.logger.log(
        `Book generation completed for project ${projectId} (${bookStyle})`,
      );
    } catch (error) {
      this.logger.error(
        `Book generation failed for project ${projectId}:`,
        error,
      );

      // Recording the failure can fail too (e.g. a dropped DB connection);
      // that must not hide the original error or skip the event below
      try {
        job.status = JobStatus.FAILED;
        job.error = error.message;
        job.completedAt = new Date();
        await this.jobRepository.save(job);

        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });
        if (project) {
          project.status = ProjectStatus.FAILED;
          await this.projectRepository.save(project);
        }
      } catch (saveError) {
        this.logger.error(
          `Could not mark project ${projectId} as failed:`,
          saveError,
        );
      }

      this.eventEmitter.emit('content.generation.failed', {
        projectId,
        error: error.message,
      });
    }
  }

  // FIXED: Ensure projectId is always set
  private async saveChapter(
    projectId: string,
    title: string,
    order: number,
    content: string,
  ) {
    // Validate projectId exists
    if (!projectId) {
      throw new Error('Cannot save chapter: projectId is required');
    }

    const chapter = this.chapterRepository.create({
      projectId,
      title,
      order,
      content,
    });

    const savedChapter = await this.chapterRepository.save(chapter);

    this.logger.debug(
      `Saved chapter: ${title} (order: ${order}) for project: ${projectId}`,
    );

    return savedChapter;
  }

  async getGenerationStatus(jobId: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId },
      relations: ['project'],
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    return {
      jobId: job.id,
      projectId: job.projectId,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      result: job.result,
    };
  }
}
