// src/modules/document/book-formatter.base.ts
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { Language } from 'src/DB/entities/translation.entity';
import { RedisCacheService } from 'src/queues/cache/redis-cache.service';

/**
 * Shared content cleanup, chapter classification and image loading used by
 * every book renderer (PDF, EPUB) so each output format reads the same
 * chapters the same way.
 */
export abstract class BookFormatterBase {
  protected readonly logger: Logger;

  protected constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * BCP 47 tag used for ebook/PDF language metadata (Google Play reads it
   * to pick the store language).
   */
  protected getLanguageCode(language: Language): string {
    const codes: Record<Language, string> = {
      [Language.ENGLISH]: 'en',
      [Language.GERMAN]: 'de',
      [Language.FRENCH]: 'fr',
      [Language.SPANISH]: 'es',
      [Language.ITALIAN]: 'it',
    };
    return codes[language] || 'en';
  }

  /**
   * Get image from Redis cache, falling back to a direct download
   */
  protected async loadImage(
    url: string,
    redisCache: RedisCacheService,
  ): Promise<Buffer> {
    const cached = await redisCache.getImage(url);
    if (cached) {
      this.logger.debug(
        `✓ Retrieved from Redis: ${url.substring(url.lastIndexOf('/') + 1)}`,
      );
      return cached;
    }

    this.logger.warn(
      `⚠ Image not in Redis, downloading: ${url.substring(url.lastIndexOf('/') + 1)}`,
    );
    return await this.downloadImageWithRetry(url);
  }

  protected isCopyrightChapter(title: string): boolean {
    const copyrightKeywords = [
      'copyright',
      'urheberrecht',
      "droit d'auteur",
      "diritto d'autore",
      'derechos de autor',
      'derechos',
    ];
    const lowerTitle = title.toLowerCase();
    return copyrightKeywords.some((keyword) => lowerTitle.includes(keyword));
  }

  protected isAboutChapter(title: string): boolean {
    const aboutKeywords = [
      'about book',
      'about the',
      'über das buch',
      'über dieses buch',
      'à propos',
      'informazioni su book',
      'sul libro',
      'sobre el libro',
      'acerca del libro',
    ];
    const lowerTitle = title.toLowerCase();
    return aboutKeywords.some((keyword) => lowerTitle.includes(keyword));
  }

  protected isTableOfContentsChapter(title: string): boolean {
    const tocKeywords = [
      'table of contents',
      'inhaltsverzeichnis',
      'table des matières',
      'sommaire',
      'tabella dei contenuti',
      'índice',
      'tabla de contenidos',
      'cuadro de contenidos',
    ];
    const lowerTitle = title.toLowerCase();
    return tocKeywords.some((keyword) => lowerTitle.includes(keyword));
  }

  // ✅ NEW: Helper to identify front matter
  protected isFrontMatterChapter(title: string): boolean {
    const frontMatterTitles = [
      // English
      'title page',
      'copyright',
      'about book',
      'table of contents',
      // German
      'titelseite',
      'urheberrecht',
      'über das buch',
      'inhaltsverzeichnis',
      // French
      'titre page',
      'page de titre',
      "droit d'auteur",
      'à propos',
      'sommaire',
      'table des matières',
      // Italian
      'pagina titolo',
      "diritto d'autore",
      'informazioni su book',
      'tabella dei contenuti',
      'sommario',
      // Spanish (if needed)
      'página de título',
      'derechos de autor',
      'sobre el libro',
      'índice',
      'tabla de contenidos',
      'cuadro de contenidos',
      'acerca del libro',
      'derechos',
    ];

    const lowerTitle = title.toLowerCase();
    return frontMatterTitles.some((fm) => lowerTitle.includes(fm));
  }

  // 5. NEW helper method - should skip section?
  protected shouldSkipSection(
    trimmed: string,
    // lowerTrimmed: string,
    bookTitle?: string,
    bookSubtitle?: string,
  ): boolean {
    if (this.isRedundantLine(trimmed)) return true;

    if (/^(Chapter|Kapitel|Chapitre|Capitolo|Capítulo)\s+\d+$/i.test(trimmed))
      return true;

    if (
      /^(Chapter|Kapitel|Chapitre|Capitolo|Capítulo)\s+\d+\s*[:\-]/i.test(
        trimmed,
      ) &&
      trimmed.split(' ').length <= 15
    )
      return true;

    // Normalize helper: strip punctuation, collapse spaces, lowercase
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizedTrimmed = normalize(trimmed);

    if (bookTitle) {
      const normalizedTitle = normalize(bookTitle);
      // Exact normalized match OR the line IS contained in the title or vice versa
      if (
        normalizedTrimmed === normalizedTitle ||
        (normalizedTitle.length > 10 &&
          normalizedTrimmed.includes(normalizedTitle)) ||
        (normalizedTrimmed.length > 10 &&
          normalizedTitle.includes(normalizedTrimmed))
      )
        return true;
    }

    if (bookSubtitle) {
      const normalizedSubtitle = normalize(bookSubtitle);
      if (
        normalizedTrimmed === normalizedSubtitle ||
        (normalizedSubtitle.length > 10 &&
          normalizedTrimmed.includes(normalizedSubtitle)) ||
        (normalizedTrimmed.length > 10 &&
          normalizedSubtitle.includes(normalizedTrimmed))
      )
        return true;
    }

    return false;
  }

  // 6. NEW helper method - is header section?
  protected isHeaderSection(trimmed: string): boolean {
    const wordCount = trimmed.split(' ').length;
    // A header: short, no mid-sentence period, ends with nothing or : or ?
    return (
      wordCount <= 12 &&
      wordCount > 0 &&
      !/[.!]$/.test(trimmed) && // don't treat sentences as headers
      !/\.\s+[A-Za-z]/.test(trimmed) // no mid-text period (body paragraph)
    );
  }

  protected createContentSections(
    paragraphs: string[],
    imageCount: number,
  ): Array<{ paragraphs: string[]; imageIndex?: number }> {
    const sections: Array<{ paragraphs: string[]; imageIndex?: number }> = [];

    if (imageCount === 0) {
      sections.push({ paragraphs });
      return sections;
    }

    const minParagraphsBeforeImage = 1;
    const minParagraphsAfterImage = 1;
    const usableSpace = paragraphs.length - minParagraphsAfterImage;

    if (usableSpace < minParagraphsBeforeImage) {
      sections.push({ paragraphs });
      return sections;
    }

    const spacing = Math.floor(usableSpace / (imageCount + 1));
    const placements: number[] = [];

    for (let i = 0; i < imageCount; i++) {
      const position = Math.min(
        minParagraphsBeforeImage + spacing * (i + 1),
        paragraphs.length - minParagraphsAfterImage - (imageCount - i - 1),
      );
      placements.push(position);
    }

    let lastIndex = 0;

    placements.forEach((position, idx) => {
      const sectionParagraphs = paragraphs.slice(lastIndex, position);

      sections.push({
        paragraphs: sectionParagraphs,
        imageIndex: idx,
      });

      lastIndex = position;
    });

    if (lastIndex < paragraphs.length) {
      sections.push({
        paragraphs: paragraphs.slice(lastIndex),
      });
    }

    return sections;
  }

  protected sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  protected logMemory(label: string): void {
    const used = process.memoryUsage();
    this.logger.log(
      `[${label}] Heap: ${Math.round(used.heapUsed / 1024 / 1024)} MB | RSS: ${Math.round(used.rss / 1024 / 1024)} MB`,
    );
  }

  protected cleanText(text: string): string {
    if (!text) return '';

    let cleaned = text;

    // ==========================================
    // STEP 1: Remove ALL Markdown Syntax
    // ==========================================

    // Bold: **text** or __text__
    cleaned = cleaned.replace(/\*\*\*(.+?)\*\*\*/g, '$1'); // Triple asterisk (bold+italic)
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1'); // Double asterisk (bold)
    cleaned = cleaned.replace(/___(.+?)___/g, '$1'); // Triple underscore
    cleaned = cleaned.replace(/__(.+?)__/g, '$1'); // Double underscore (bold)

    // Italic: *text* or _text_
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1'); // Single asterisk (italic)
    cleaned = cleaned.replace(/_(.+?)_/g, '$1'); // Single underscore (italic)

    // Strikethrough: ~~text~~
    cleaned = cleaned.replace(/~~(.+?)~~/g, '$1');

    // Code: `text` or ```text```
    cleaned = cleaned.replace(/```[\s\S]*?```/g, ''); // Code blocks
    cleaned = cleaned.replace(/`(.+?)`/g, '$1'); // Inline code

    // Headers: # ## ### #### ##### ######
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

    // Links: [text](url) or [text][ref]
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // [text](url)
    cleaned = cleaned.replace(/\[([^\]]+)\]\[[^\]]+\]/g, '$1'); // [text][ref]

    // Images: ![alt](url)
    cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

    // Horizontal rules: --- or *** or ___
    cleaned = cleaned.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, '');

    // Blockquotes: > text
    cleaned = cleaned.replace(/^>\s+/gm, '');

    // Lists: - item or * item or + item or 1. item
    // cleaned = cleaned.replace(/^[\*\-\+]\s+/gm, ''); // Unordered lists
    // cleaned = cleaned.replace(/^\d+\.\s+/gm, ''); // Ordered lists

    // ==========================================
    // STEP 2: Remove Special Characters & Symbols
    // ==========================================

    // Remove leftover asterisks (not caught by regex)
    cleaned = cleaned.replace(/\*+/g, '');

    // Remove leftover underscores (not caught by regex)
    cleaned = cleaned.replace(/_{2,}/g, '');

    // Remove HTML tags if any
    cleaned = cleaned.replace(/<[^>]*>/g, '');

    // Remove bullet points and special list markers
    cleaned = cleaned.replace(/[•●○◦■□▪▫]/g, '');

    // Replace smart quotes with regular quotes
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");

    // Remove ellipsis character
    cleaned = cleaned.replace(/…/g, '...');

    // Remove zero-width spaces and other invisible characters
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Keep real em/en dashes (the book fonts have them); a typed "--"
    // becomes an em dash rather than a hyphen that glues words together
    cleaned = cleaned.replace(/-{2,}/g, '—');

    // ==========================================
    // STEP 3: Clean Up Whitespace
    // ==========================================

    // Replace multiple spaces with single space
    cleaned = cleaned.replace(/  +/g, ' ');

    // Replace multiple newlines with single newline
    cleaned = cleaned.replace(/\n\n+/g, '\n\n');

    // Remove spaces at start/end of lines
    cleaned = cleaned.replace(/^[ \t]+|[ \t]+$/gm, '');

    // Final trim
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * AGGRESSIVE cleanContent - cleans entire content blocks
   * Use this to replace the existing cleanContent method
   */
  protected cleanContent(content: string): string {
    if (!content) return '';

    // First pass - aggressive cleaning
    let cleaned = content;

    // ==========================================
    // REMOVE ALL MARKDOWN FORMATTING
    // ==========================================

    // Bold variations
    cleaned = cleaned.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/___(.+?)___/g, '$1');
    cleaned = cleaned.replace(/__(.+?)__/g, '$1');

    // Italic variations
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/_(.+?)_/g, '$1');

    // Other markdown
    cleaned = cleaned.replace(/~~(.+?)~~/g, '$1'); // Strikethrough
    cleaned = cleaned.replace(/`(.+?)`/g, '$1'); // Inline code
    cleaned = cleaned.replace(/```[\s\S]*?```/g, ''); // Code blocks
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, ''); // Headers
    // cleaned = cleaned.replace(/^[\*\-\+]\s+/gm, ''); // List items
    // cleaned = cleaned.replace(/^\d+\.\s+/gm, ''); // Numbered lists
    cleaned = cleaned.replace(/^>\s+/gm, ''); // Blockquotes

    // Links and images
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

    // ==========================================
    // REMOVE LEFTOVER SYMBOLS
    // ==========================================

    // Remove any remaining asterisks
    cleaned = cleaned.replace(/\*+/g, '');

    // Remove any remaining underscores (but keep single underscores in words)
    cleaned = cleaned.replace(/_{2,}/g, '');
    cleaned = cleaned.replace(/\s_\s/g, ' ');
    cleaned = cleaned.replace(/^_|_$/gm, '');

    // Remove bullets and special characters
    cleaned = cleaned.replace(/[•●○◦■□▪▫◆◇]/g, '');

    // Replace smart quotes
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");

    // Keep real em/en dashes; turn a typed "--" into an em dash
    cleaned = cleaned.replace(/-{2,}/g, '—');

    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, '');

    // ==========================================
    // CLEAN UP CHAPTER REFERENCES
    // ==========================================

    cleaned = this.removeRedundantChapterReferences(cleaned);

    // ==========================================
    // PROCESS PARAGRAPHS
    // ==========================================

    const paragraphs = cleaned.split('\n\n');
    const cleanedParagraphs = paragraphs
      .map((para) => {
        // Clean each paragraph individually
        let cleanPara = this.cleanText(para);

        // Additional aggressive cleaning for persistent symbols
        cleanPara = cleanPara.replace(/[*_~`#]/g, ''); // Remove any remaining markdown chars
        cleanPara = cleanPara.replace(/\[|\]/g, ''); // Remove brackets
        cleanPara = cleanPara.replace(/\{|\}/g, ''); // Remove braces

        return cleanPara;
      })
      .filter((para) => {
        // Filter out empty or redundant paragraphs
        const trimmed = para.trim();
        if (!trimmed) return false;
        if (trimmed.length < 3) return false;
        if (this.isRedundantLine(trimmed)) return false;
        return true;
      });

    return cleanedParagraphs.join('\n\n');
  }

  // 2. NEW method to remove redundant chapter references
  protected removeRedundantChapterReferences(content: string): string {
    // Remove lines that are just chapter headings repeated in content
    const lines = content.split('\n');
    const filtered = lines.filter((line, index) => {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) return true;

      // Remove standalone "Chapter X" lines
      if (/^Chapter\s+\d+$/i.test(trimmed)) return false;
      if (/^Kapitel\s+\d+$/i.test(trimmed)) return false; // German
      if (/^Chapitre\s+\d+$/i.test(trimmed)) return false; // French
      if (/^Capitolo\s+\d+$/i.test(trimmed)) return false; // Italian
      if (/^Capítulo\s+\d+$/i.test(trimmed)) return false; // Spanish

      // Remove lines like "Chapter 1 Introduction: Title"
      if (
        /^Chapter\s+\d+\s+[A-Z]/i.test(trimmed) &&
        trimmed.split(' ').length <= 10
      ) {
        return false;
      }

      // Remove lines that look like repeated chapter titles at start of content
      // if (
      //   index < 5 &&
      //   trimmed.length < 100 &&
      //   !trimmed.includes('.') &&
      //   trimmed.split(' ').length <= 15
      // ) {
      //   // Likely a repeated title
      //   return false;
      // }

      if (
        /^(Chapter|Kapitel|Chapitre|Capitolo|Capítulo)\s+\d+\s*:/i.test(trimmed)
      ) {
        return false;
      }

      return true;
    });

    return filtered.join('\n');
  }

  // 3. NEW method to identify redundant lines
  protected isRedundantLine(text: string): boolean {
    const trimmed = text.trim();

    // Empty or very short
    if (trimmed.length < 3) return true;

    // Just punctuation
    if (/^[^\w\s]+$/.test(trimmed)) return true;

    // Repeated markdown syntax leftovers
    if (/^[\*_#`~-]+$/.test(trimmed)) return true;

    // Lines with only numbers
    if (/^\d+$/.test(trimmed)) return true;

    // Common redundant phrases in multiple languages
    const redundantPhrases = [
      // English
      'chapter',
      'table of contents',
      'introduction',
      // German
      'kapitel',
      'inhaltsverzeichnis',
      'einführung',
      // French
      'chapitre',
      'sommaire',
      'table des matières',
      // Italian
      'capitolo',
      'sommario',
      'introduzione',
      // Spanish
      'capítulo',
      'índice',
      'introducción',
    ];

    const lower = trimmed.toLowerCase();

    // If it's ONLY a redundant phrase (nothing else)
    if (redundantPhrases.some((phrase) => lower === phrase)) {
      return true;
    }

    return false;
  }

  protected cleanFrontMatterContent(content: string): string {
    const cleaned = this.cleanContent(content);
    const paragraphs = cleaned.split('\n\n').filter((p) => p.trim());

    return paragraphs
      .filter((para) => {
        const trimmed = para.trim();
        const lower = trimmed.toLowerCase();

        // Skip the heading itself if it appears in content
        const frontMatterHeadings = [
          'about this book',
          'about book',
          'about the',
          'über dieses buch',
          'über das buch',
          'à propos du livre',
          'à propos',
          'informazioni su',
          'sul libro',
          'copyright',
          'urheberrecht',
          "droit d'auteur",
          "diritto d'autore",
        ];

        if (
          frontMatterHeadings.some((heading) => lower.includes(heading)) &&
          trimmed.length < 50
        ) {
          return false;
        }

        // Keep everything else
        return trimmed.length > 0;
      })
      .join('\n\n');
  }

  protected cleanTableOfContents(content: string): string {
    if (!content) return '';

    // Strip markdown only — never call cleanContent() or removeRedundantChapterReferences()
    // here. Those methods are designed for chapter body text and will destroy TOC entries
    // (the index < 5 blunt filter treats every short TOC line as a "repeated title").
    let cleaned = content;
    cleaned = cleaned.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/___(.+?)___/g, '$1');
    cleaned = cleaned.replace(/__(.+?)__/g, '$1');
    cleaned = cleaned.replace(/_(.+?)_/g, '$1');
    cleaned = cleaned.replace(/~~(.+?)~~/g, '$1');
    cleaned = cleaned.replace(/`(.+?)`/g, '$1');
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
    cleaned = cleaned.replace(/^>\s+/gm, '');
    cleaned = cleaned.replace(/\*+/g, '');
    cleaned = cleaned.replace(/[•●○◦■□▪▫◆◇]/g, '');
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    cleaned = cleaned.replace(/  +/g, ' ');
    cleaned = cleaned.replace(/^[ \t]+|[ \t]+$/gm, '');

    // Remove only the TOC heading itself if it appears in the content body
    // (we render it separately as a styled title above the entries)
    const tocHeadings = [
      'table of contents',
      'inhaltsverzeichnis',
      'table des matières',
      'sommaire',
      'tabella dei contenuti',
      'índice',
      'tabla de contenidos',
      'cuadro de contenidos',
      'indice',
    ];

    return cleaned
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        const lower = trimmed.toLowerCase();
        if (tocHeadings.some((h) => lower === h) && trimmed.length < 50)
          return false;
        return true;
      })
      .join('\n');
  }

  // 4. NEW helper - is redundant TOC line?
  protected isRedundantTOCLine(line: string): boolean {
    const lower = line.toLowerCase();

    // Redundant TOC headings
    const headings = [
      'table of contents',
      'inhaltsverzeichnis',
      'table des matières',
      'sommaire',
      'tabella dei contenuti',
      'índice',
    ];

    if (headings.some((h) => lower.includes(h)) && line.length < 50) {
      return true;
    }

    // Other redundant patterns
    if (line.length < 2) return true;
    if (/^[^\w\s]+$/.test(line)) return true;
    if (/^\d+$/.test(line)) return true;

    return false;
  }

  // 5. NEW helper - is chapter heading?
  protected isChapterHeading(line: string): boolean {
    // Match "Chapter 1", "Kapitel 1", "Chapitre 1", "Capitolo 1", "Capítulo 1"
    return /^(Chapter|Kapitel|Chapitre|Capitolo|Capítulo)\s+\d+$/i.test(line);
  }

  /**
   * Headings the renderers add around the generated text. Books are
   * English-only.
   */
  protected getBookHeadings(): {
    chapter: string;
    about: string;
    toc: string;
  } {
    return {
      chapter: 'Chapter',
      about: 'About This Book',
      toc: 'Table of Contents',
    };
  }

  protected async downloadImageWithRetry(
    url: string,
    maxRetries: number = 4,
    timeoutMs: number = 60000,
  ): Promise<Buffer> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `[Attempt ${attempt}/${maxRetries}] Downloading image: ${url}`,
        );

        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: timeoutMs,
          maxContentLength: 10 * 1024 * 1024,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TravelGuideGenerator/1.0)',
          },
          family: 4,
        });

        this.logger.log(`✓ Image downloaded successfully: ${url}`);
        return Buffer.from(response.data, 'binary');
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error)) {
          const code = error.code || error.response?.status;
          this.logger.warn(
            `[Attempt ${attempt}/${maxRetries}] Failed to download image: ${code}`,
          );

          if (
            error.response?.status === 404 ||
            error.response?.status === 403
          ) {
            this.logger.error(`Image not found or forbidden: ${url}`);
            throw new Error(`Image not accessible: ${url}`);
          }
        }

        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          this.logger.log(`Waiting ${waitTime}ms before retry...`);
          await this.delay(waitTime);
        }
      }
    }

    this.logger.error(
      `Failed to download image after ${maxRetries} attempts: ${url}`,
    );
    throw lastError;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
