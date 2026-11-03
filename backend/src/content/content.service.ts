// src/content/content.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import {
  bookStoppedError,
  CaseResearch,
  formatSourcesSection,
} from './case-research';
import {
  MAX_REMAINING_COPIED_SHARE,
  OriginalityIndex,
} from './originality';

// Printed at the end of the About page of every book
const READER_NOTE = `A Note for Readers

This book is about real events and real people. It covers serious crime and what it did to victims, families and communities, some of whom are still living with it. It is written to describe those events without graphic detail and with respect for the people affected.`;

const MAX_ORIGINALITY_REWRITES = 2;
// A rewrite much shorter than the original lost content, so it isn't kept
const MIN_REWRITE_LENGTH_SHARE = 0.7;
const OTHER_BOOKS_COMPARED = 5;
const MAX_TITLES_TO_AVOID = 60;

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
        'Step 1: Researching the case on the live web',
        'Step 2: Generating detailed book outline',
        'Step 3: Writing introduction',
        'Step 4: Writing the case chapters, each checked for originality',
        'Step 5: Writing the conclusion, case timeline and sources',
        'Step 6: Generating front matter and table of contents',
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

      // STEP 0: Research first: nothing is written without sources
      job.progress = 2;
      await this.jobRepository.save(job);

      const research = await this.geminiService.researchCase(brief);
      brief.dossier = research.dossier;

      const originality = new OriginalityIndex();
      research.pages.forEach((page) => originality.add(page));
      brief.avoidTitles = await this.compareWithOtherBooks(
        projectId,
        generateDto.subject,
        originality,
      );

      // Named here because every chapter below goes through it
      const makeOriginal = (text: string, label: string) =>
        this.ensureOriginal(
          text,
          label,
          originality,
          generateDto.title,
          generateDto.subtitle || '',
          brief,
        );

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
        research: this.researchRecord(research),
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

      await this.saveChapter(
        projectId,
        'About Book',
        2,
        `${await makeOriginal(aboutBook, 'About Book')}\n\n${READER_NOTE}`,
      );

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
        await makeOriginal(introduction, 'Introduction'),
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
          await makeOriginal(content, chapterOutline.chapterTitle),
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
        // The source list follows the check: its titles aren't the book's prose
        `${await makeOriginal(conclusion, 'Conclusion')}\n\n${formatSourcesSection(
          research.sources,
          new Date().toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          }),
        )}`,
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

  /** Kept with the job, so anyone fact-checking the book can see what it used */
  private researchRecord(research: CaseResearch) {
    return {
      dossier: research.dossier,
      sources: research.sources,
      pagesRead: research.pages.length,
    };
  }

  /**
   * Adds other books on this case to the originality check, so two books on
   * one case can't converge, and returns their chapter titles to avoid
   */
  private async compareWithOtherBooks(
    projectId: string,
    subject: string,
    originality: OriginalityIndex,
  ): Promise<string[]> {
    const others = await this.projectRepository
      .createQueryBuilder('project')
      .select('project.id', 'id')
      .where('LOWER(TRIM(project.subject)) = LOWER(TRIM(:subject))', { subject })
      .andWhere('project.id != :projectId', { projectId })
      .orderBy('project.createdAt', 'DESC')
      .limit(OTHER_BOOKS_COMPARED)
      .getRawMany<{ id: string }>();
    if (!others.length) return [];

    const chapters = await this.chapterRepository.find({
      where: { projectId: In(others.map((other) => other.id)) },
    });
    const titles = new Set<string>();
    for (const chapter of chapters) {
      // Front matter is boilerplate that every book shares on purpose
      if (['Copyright', 'About Book', 'Table of Contents'].includes(chapter.title)) {
        continue;
      }
      originality.add(chapter.content);
      titles.add(chapter.title);
    }
    return [...titles].slice(0, MAX_TITLES_TO_AVOID);
  }

  /**
   * Rewrites anything that matches the sources, another book or an earlier
   * chapter word for word. A chapter that can't be fixed stops the book.
   */
  private async ensureOriginal(
    text: string,
    label: string,
    originality: OriginalityIndex,
    title: string,
    subtitle: string,
    brief: CaseBrief,
  ): Promise<string> {
    let current = text;

    for (let attempt = 1; attempt <= MAX_ORIGINALITY_REWRITES; attempt++) {
      const { passages } = originality.check(current);
      if (!passages.length) break;

      this.logger.warn(
        `${label}: ${passages.length} passage(s) match existing text; rewriting (${attempt}/${MAX_ORIGINALITY_REWRITES})`,
      );
      const rewritten = await this.geminiService.rewriteCopiedPassages(
        current,
        passages,
        title,
        subtitle,
        brief,
      );
      if (rewritten.length >= current.length * MIN_REWRITE_LENGTH_SHARE) {
        current = rewritten;
      }
    }

    const { passages, copiedShare } = originality.check(current);
    if (copiedShare > MAX_REMAINING_COPIED_SHARE) {
      throw bookStoppedError(
        `"${label}" still matched existing text after being rewritten, so this book was stopped. Please try creating it again.`,
      );
    }
    if (passages.length) {
      this.logger.warn(
        `${label}: ${passages.length} short matching passage(s) remain, under the limit`,
      );
    }

    originality.add(current);
    return current;
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
