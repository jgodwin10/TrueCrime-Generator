// src/book-generator/book-generator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from 'src/DB/entities/project.entity';
import { JobStatus } from 'src/DB/entities/job.entity';
import { ProjectService } from 'src/project/project.service';
import { DocumentService } from 'src/documents/document.service';

// One English EPUB + one English PDF per book
const EXPECTED_DOCUMENTS = 2;

/**
 * Status and download lookups for generated books. Generation itself
 * runs in the queue (see BookGenerationProcessor).
 */
@Injectable()
export class BookGeneratorService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly projectService: ProjectService,
    private readonly documentService: DocumentService,
  ) {}

  async getBookStatus(projectId: string) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['jobs'],
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const stats = await this.projectService.getProjectStats(projectId);

    const jobs = project.jobs || [];
    const activeJobs = jobs.filter(
      (j) =>
        j.status === JobStatus.IN_PROGRESS || j.status === JobStatus.PENDING,
    );
    const completedJobs = jobs.filter((j) => j.status === JobStatus.COMPLETED);
    const failedJobs = jobs.filter((j) => j.status === JobStatus.FAILED);

    // Content is half the work; each finished file is a quarter. Photos
    // are optional, so they don't count towards completion.
    const completedDocuments = Math.min(
      stats.stats.completedDocuments,
      EXPECTED_DOCUMENTS,
    );
    const overallProgress =
      (stats.stats.totalChapters > 0 ? 50 : 0) +
      Math.round((completedDocuments / EXPECTED_DOCUMENTS) * 50);

    const isComplete = completedDocuments === EXPECTED_DOCUMENTS;
    const hasFailed = failedJobs.length > 0;

    return {
      projectId: project.id,
      title: project.title,
      author: project.author,
      status: project.status,
      numberOfChapters: project.numberOfChapters,
      progress: overallProgress,
      isComplete,
      hasFailed,
      stats: {
        chapters: stats.stats.totalChapters,
        images: stats.stats.totalImages,
        documents: `${completedDocuments}/${EXPECTED_DOCUMENTS}`,
        activeJobs: activeJobs.length,
        completedJobs: completedJobs.length,
        failedJobs: failedJobs.length,
      },
      createdAt: project.createdAt,
      estimatedCompletion: this.estimateCompletion(overallProgress),
    };
  }

  private estimateCompletion(progress: number): string {
    const remainingProgress = 100 - progress;
    const minutesPerPercent = 0.15;
    const remainingMinutes = Math.ceil(remainingProgress * minutesPerPercent);

    if (remainingMinutes < 1) return 'Less than 1 minute';
    if (remainingMinutes === 1) return '1 minute';
    return `${remainingMinutes} minutes`;
  }

  async getDownloadLinks(projectId: string) {
    const documents = await this.documentService.findAll(projectId);

    if (documents.length === 0) {
      return {
        message:
          'No documents available yet. Generation may still be in progress.',
        projectId,
        totalDocuments: 0,
        documents: [],
      };
    }

    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: ['id', 'title'],
    });

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const downloadLinks = documents.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      type: doc.type,
      language: doc.language,
      size: this.formatFileSize(doc.size),
      url: doc.url,
      cloudinaryPublicId: doc.storageKey,
      createdAt: doc.createdAt,
    }));

    return {
      projectId,
      title: project.title,
      totalDocuments: documents.length,
      documents: downloadLinks,
    };
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}
