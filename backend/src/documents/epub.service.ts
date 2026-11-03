// src/modules/document/epub.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { Language } from 'src/DB/entities/translation.entity';
import { RedisCacheService } from 'src/queues/cache/redis-cache.service';
import { BookFormatterBase } from './book-formatter.base';
import { parseTableOfContents } from 'src/content/table-of-contents';
import { BookFonts } from 'src/content/book-fonts';

interface EpubPage {
  id: string;
  href: string;
  title: string;
  xhtml: string;
  inToc: boolean;
}

interface EpubFont {
  href: string;
  family: string;
  weight: 400 | 700;
  style: 'normal' | 'italic';
  file: string;
}

interface EpubImage {
  id: string;
  href: string;
  buffer: Buffer;
}

export interface WebPreviewSection {
  id: string;
  kind: 'copyright' | 'about' | 'chapter';
  label?: string;
  title: string;
  html: string;
}

export interface WebPreview {
  title: string;
  subtitle: string;
  author: string;
  sections: WebPreviewSection[];
}

/**
 * Reflowable EPUB 3 for Google Play Books (the format Play prefers over PDF).
 * Includes an EPUB 2 NCX so older reading systems still get a TOC.
 */
@Injectable()
export class EpubService extends BookFormatterBase {
  // Long edge sizes recommended for e-reader screens; keeps the file small
  private readonly IMAGE_MAX_WIDTH = 1600;
  private readonly IMAGE_QUALITY = 80;

  private readonly STYLES = `
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { font-family: "Palatino Linotype", Palatino, Georgia, serif; line-height: 1.25; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.6em; text-align: center; margin: 1.5em 0 1em; }
h2 { font-size: 1.2em; margin: 1.5em 0 0.5em; }
p { margin: 0 0 0.8em; text-align: left; }
ul, ol { margin: 0 0 0.8em 1.2em; padding: 0; }
li { margin-bottom: 0.3em; }
.chapter-label { text-align: center; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.9em; margin: 3em 0 0; }
.title-page { text-align: center; margin-top: 20%; }
.title-page h1 { font-size: 2em; text-transform: uppercase; margin-bottom: 0.5em; }
.title-page .subtitle { font-style: italic; text-align: center; margin-bottom: 3em; }
.title-page .author { font-size: 1.2em; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; }
.copyright p { font-size: 0.85em; }
nav ol, .contents ol { list-style: none; margin-left: 0; }
.contents li { margin-bottom: 0.6em; }
.contents li ol { margin: 0.3em 0 0 1.2em; }
.contents li li { margin-bottom: 0.2em; font-size: 0.9em; }
.contents .toc-level-2 { margin-left: 1.2em; font-size: 0.85em; }
.contents a, nav a { text-decoration: none; }
figure { margin: 1.2em 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }
figure img { max-width: 100%; height: auto; }
`.trim();

  constructor(private configService: ConfigService) {
    super(EpubService.name);
  }

  async generateEPUBBuffer(
    title: string,
    subtitle: string,
    author: string,
    chapters: any[],
    images: any[] = [],
    redisCache: RedisCacheService,
    language: Language = Language.ENGLISH,
    fonts?: BookFonts,
  ): Promise<{ buffer: Buffer; filename: string }> {
    this.logMemory('EPUB Start');

    const filename = `${this.sanitizeFilename(title)}_${Date.now()}.epub`;
    const lang = this.getLanguageCode(language);
    const headings = this.getBookHeadings();
    const pages: EpubPage[] = [];
    const epubImages: EpubImage[] = [];

    // FRONT MATTER
    pages.push({
      id: 'title-page',
      href: 'title.xhtml',
      title,
      inToc: false,
      xhtml: this.renderTitlePage(title, subtitle, author, lang),
    });

    const copyrightChapter = chapters.find((c) =>
      this.isCopyrightChapter(c.title),
    );
    if (copyrightChapter) {
      const copyrightTitle = this.cleanText(copyrightChapter.title);
      pages.push({
        id: 'copyright',
        href: 'copyright.xhtml',
        title: copyrightTitle,
        inToc: true,
        xhtml: this.wrapXhtml(
          copyrightTitle,
          lang,
          `<section class="copyright" epub:type="copyright-page">${this.renderPlainParagraphs(copyrightChapter.content)}</section>`,
        ),
      });
    }

    const aboutChapter = chapters.find((c) => this.isAboutChapter(c.title));
    if (aboutChapter) {
      pages.push({
        id: 'about',
        href: 'about.xhtml',
        title: headings.about,
        inToc: true,
        xhtml: this.wrapXhtml(
          headings.about,
          lang,
          `<section epub:type="preface"><h1>${this.escapeXml(headings.about)}</h1>${this.renderPlainParagraphs(this.cleanFrontMatterContent(aboutChapter.content))}</section>`,
        ),
      });
    }

    // MAIN CONTENT
    const mainChapters = chapters
      .filter((c) => !this.isFrontMatterChapter(c.title))
      .sort((a, b) => a.order - b.order);

    const chapterPages: EpubPage[] = [];

    for (let i = 0; i < mainChapters.length; i++) {
      const chapter = mainChapters[i];
      const chapterNumber = i + 1;
      const chapterTitle = this.cleanText(chapter.title);
      const label = `${headings.chapter} ${chapterNumber}`;

      const chapterImages = images
        .filter((img) => img.chapterNumber === chapterNumber && !img.isMap)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      const body = await this.renderChapterBody(
        chapter.content,
        chapterImages,
        title,
        subtitle,
        (image) =>
          this.renderFigure(
            image,
            redisCache,
            epubImages,
            this.IMAGE_MAX_WIDTH,
          ),
      );

      chapterPages.push({
        id: `chapter-${chapterNumber}`,
        href: `chapter-${String(chapterNumber).padStart(2, '0')}.xhtml`,
        title: `${label}: ${chapterTitle}`,
        inToc: true,
        xhtml: this.wrapXhtml(
          chapterTitle,
          lang,
          `<section epub:type="chapter"><p class="chapter-label">${this.escapeXml(label)}</p><h1>${this.escapeXml(chapterTitle)}</h1>${body}</section>`,
        ),
      });

      if (global.gc && i % 2 === 0) {
        global.gc();
      }
    }

    // Visible, tappable table of contents (front matter, before chapter 1),
    // in the account's chosen format when the book has one
    const tocChapter = chapters.find((c) =>
      this.isTableOfContentsChapter(c.title),
    );
    const toc = tocChapter ? parseTableOfContents(tocChapter.content) : null;
    const tocHeading = toc ? this.cleanText(toc.heading) : headings.toc;
    const tocItems = toc
      ? toc.entries
          .filter((entry) => chapterPages[entry.chapterNumber - 1])
          .map((entry) => {
            const href = chapterPages[entry.chapterNumber - 1].href;
            const children = entry.children
              .map(
                (child) =>
                  `<li class="toc-level-${child.level}"><a href="${href}">${this.escapeXml(child.text)}</a></li>`,
              )
              .join('');
            return `<li><a href="${href}">${this.escapeXml(entry.text)}</a>${children ? `<ol>${children}</ol>` : ''}</li>`;
          })
      : chapterPages.map(
          (p) => `<li><a href="${p.href}">${this.escapeXml(p.title)}</a></li>`,
        );
    pages.push({
      id: 'contents',
      href: 'contents.xhtml',
      title: tocHeading,
      inToc: true,
      xhtml: this.wrapXhtml(
        tocHeading,
        lang,
        `<section class="contents" epub:type="toc"><h1>${this.escapeXml(tocHeading)}</h1><ol>${tocItems.join('')}</ol></section>`,
      ),
    });

    pages.push(...chapterPages);

    const buffer = await this.packageEpub({
      title,
      subtitle,
      author,
      lang,
      description: aboutChapter
        ? this.buildDescription(aboutChapter.content)
        : subtitle,
      pages,
      images: epubImages,
      tocTitle: headings.toc,
      firstChapterHref: chapterPages[0]?.href,
      fonts,
    });

    this.logger.log(`EPUB generated: ${filename} (${buffer.length} bytes)`);
    this.logMemory('EPUB Complete');

    return { buffer, filename };
  }

  /**
   * The same front matter and chapters as the EPUB, as HTML fragments for
   * reading in the browser. Photos link to their stored originals instead
   * of being re-encoded.
   */
  async renderWebPreview(
    title: string,
    subtitle: string,
    author: string,
    chapters: any[],
    images: any[] = [],
  ): Promise<WebPreview> {
    const headings = this.getBookHeadings();
    const sections: WebPreviewSection[] = [];

    const copyrightChapter = chapters.find((c) =>
      this.isCopyrightChapter(c.title),
    );
    if (copyrightChapter) {
      sections.push({
        id: 'copyright',
        kind: 'copyright',
        title: this.cleanText(copyrightChapter.title),
        html: this.renderPlainParagraphs(copyrightChapter.content),
      });
    }

    const aboutChapter = chapters.find((c) => this.isAboutChapter(c.title));
    if (aboutChapter) {
      sections.push({
        id: 'about',
        kind: 'about',
        title: headings.about,
        html: this.renderPlainParagraphs(
          this.cleanFrontMatterContent(aboutChapter.content),
        ),
      });
    }

    const mainChapters = chapters
      .filter((c) => !this.isFrontMatterChapter(c.title))
      .sort((a, b) => a.order - b.order);

    for (let i = 0; i < mainChapters.length; i++) {
      const chapterNumber = i + 1;
      const chapterImages = images
        .filter((img) => img.chapterNumber === chapterNumber && !img.isMap)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      sections.push({
        id: `chapter-${chapterNumber}`,
        kind: 'chapter',
        label: `${headings.chapter} ${chapterNumber}`,
        title: this.cleanText(mainChapters[i].title),
        html: await this.renderChapterBody(
          mainChapters[i].content,
          chapterImages,
          title,
          subtitle,
          (image) =>
            Promise.resolve(
              `<figure><img src="${this.escapeXml(image.url)}" alt="${this.escapeXml(image.caption || '')}" loading="lazy"/></figure>`,
            ),
        ),
      });
    }

    return { title, subtitle, author, sections };
  }

  private renderTitlePage(
    title: string,
    subtitle: string,
    author: string,
    lang: string,
  ): string {
    return this.wrapXhtml(
      title,
      lang,
      `<section class="title-page" epub:type="titlepage"><h1>${this.escapeXml(title)}</h1>${
        subtitle
          ? `<p class="subtitle">${this.escapeXml(subtitle)}</p>`
          : ''
      }<p class="author">${this.escapeXml(author)}</p></section>`,
    );
  }

  /**
   * Front matter keeps every line (copyright notices rely on line breaks)
   */
  private renderPlainParagraphs(content: string): string {
    return this.cleanText(content)
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map(
        (p) =>
          `<p>${p
            .split('\n')
            .map((line) => this.escapeXml(line.trim()))
            .join('<br/>')}</p>`,
      )
      .join('\n');
  }

  /**
   * Same paragraph/heading/image placement rules as the PDF so both
   * formats of a book carry identical content
   */
  private async renderChapterBody(
    content: string,
    chapterImages: any[],
    bookTitle: string,
    bookSubtitle: string,
    renderFigure: (image: any) => Promise<string | null>,
  ): Promise<string> {
    if (chapterImages.length === 0) {
      return this.renderFormattedContent(content, bookTitle, bookSubtitle);
    }

    const paragraphs = content.split('\n\n').filter((p) => p.trim());
    const sections = this.createContentSections(
      paragraphs,
      chapterImages.length,
    );

    const parts: string[] = [];

    for (const section of sections) {
      if (section.paragraphs.length > 0) {
        parts.push(
          this.renderFormattedContent(
            section.paragraphs.join('\n\n'),
            bookTitle,
            bookSubtitle,
          ),
        );
      }

      if (
        section.imageIndex !== undefined &&
        chapterImages[section.imageIndex]
      ) {
        const figure = await renderFigure(chapterImages[section.imageIndex]);
        if (figure) parts.push(figure);
      }
    }

    return parts.join('\n');
  }

  private renderFormattedContent(
    content: string,
    bookTitle?: string,
    bookSubtitle?: string,
  ): string {
    const sections = this.cleanContent(content)
      .split('\n\n')
      .filter((p) => p.trim());

    const html: string[] = [];

    for (const section of sections) {
      let trimmed = section.trim();
      trimmed = trimmed.replace(/[*_~`#\[\]{}|^]/g, '');
      trimmed = trimmed.replace(/  +/g, ' ');
      trimmed = trimmed.trim();

      if (this.shouldSkipSection(trimmed, bookTitle, bookSubtitle)) {
        continue;
      }

      const list = this.renderList(trimmed);
      if (list) {
        html.push(list);
      } else if (this.isHeaderSection(trimmed) && !trimmed.includes('\n')) {
        html.push(`<h2>${this.escapeXml(trimmed)}</h2>`);
      } else {
        html.push(
          `<p>${trimmed
            .split('\n')
            .map((line) => this.escapeXml(line.trim()))
            .join('<br/>')}</p>`,
        );
      }
    }

    return html.join('\n');
  }

  /**
   * Reflowable text should use real lists so readers can restyle them
   */
  private renderList(block: string): string | null {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;

    const bullet = /^[-+]\s+/;
    const numbered = /^\d+[.)]\s+/;

    const pattern = lines.every((l) => bullet.test(l))
      ? bullet
      : lines.every((l) => numbered.test(l))
        ? numbered
        : null;
    if (!pattern) return null;

    const tag = pattern === bullet ? 'ul' : 'ol';
    return `<${tag}>${lines
      .map((l) => `<li>${this.escapeXml(l.replace(pattern, ''))}</li>`)
      .join('')}</${tag}>`;
  }

  private async renderFigure(
    image: any,
    redisCache: RedisCacheService,
    epubImages: EpubImage[],
    maxWidth: number,
  ): Promise<string | null> {
    try {
      const source = await this.loadImage(image.url, redisCache);
      const buffer = await sharp(source)
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: this.IMAGE_QUALITY, mozjpeg: true })
        .toBuffer();

      const index = epubImages.length + 1;
      const href = `images/image-${String(index).padStart(3, '0')}.jpg`;
      epubImages.push({ id: `image-${index}`, href, buffer });

      const alt = this.escapeXml(image.caption || '');
      return `<figure><img src="${href}" alt="${alt}"/></figure>`;
    } catch (error) {
      this.logger.error(`Failed to insert image ${image.filename}:`, error);
      return null;
    }
  }

  private buildDescription(aboutContent: string): string {
    const text = this.cleanFrontMatterContent(aboutContent)
      .split('\n\n')
      .slice(0, 2)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
  }

  /**
   * The faces to embed for a book's chosen fonts. Books without chosen fonts
   * embed none and keep the reading system's serif.
   */
  private epubFonts(fonts?: BookFonts): EpubFont[] {
    if (!fonts) return [];
    const faces: Omit<EpubFont, 'href'>[] = [
      { family: fonts.body.family, weight: 400, style: 'normal', file: fonts.body.regular },
      { family: fonts.body.family, weight: 400, style: 'italic', file: fonts.body.italic },
      { family: fonts.body.family, weight: 700, style: 'normal', file: fonts.body.bold },
      { family: fonts.body.family, weight: 700, style: 'italic', file: fonts.body.boldItalic },
      { family: fonts.heading.family, weight: 400, style: 'normal', file: fonts.heading.regular },
      { family: fonts.heading.family, weight: 700, style: 'normal', file: fonts.heading.bold },
    ];
    const seen = new Set<string>();
    return faces
      .filter((face) => {
        // Same family for both roles, or a style that falls back to another file
        const key = `${face.family}|${face.weight}|${face.style}`;
        if (seen.has(key) || seen.has(face.file)) return false;
        seen.add(key);
        seen.add(face.file);
        return true;
      })
      .map((face) => ({ ...face, href: `fonts/${path.basename(face.file)}` }));
  }

  /** @font-face rules for the embedded fonts, overriding the default stacks */
  private fontStyles(fonts: BookFonts | undefined, faces: EpubFont[]): string {
    if (!fonts) return '';
    return [
      ...faces.map(
        (f) =>
          `@font-face { font-family: "${f.family}"; font-weight: ${f.weight}; font-style: ${f.style}; src: url("${f.href}"); }`,
      ),
      `body { font-family: "${fonts.body.family}", Georgia, serif; }`,
      `h1, h2, h3 { font-family: "${fonts.heading.family}", Georgia, serif; }`,
    ].join('\n');
  }

  private async packageEpub(book: {
    title: string;
    subtitle: string;
    author: string;
    lang: string;
    description: string;
    pages: EpubPage[];
    images: EpubImage[];
    tocTitle: string;
    firstChapterHref?: string;
    fonts?: BookFonts;
  }): Promise<Buffer> {
    const zip = new JSZip();
    const identifier = `urn:uuid:${randomUUID()}`;
    const now = new Date();
    const modified = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const esc = (s: string) => this.escapeXml(s);

    // mimetype must be the first entry and stored uncompressed
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    );

    const fontFaces = this.epubFonts(book.fonts);
    zip.file(
      'OEBPS/book.css',
      [this.STYLES, this.fontStyles(book.fonts, fontFaces)]
        .filter(Boolean)
        .join('\n'),
    );

    for (const font of fontFaces) {
      zip.file(`OEBPS/${font.href}`, readFileSync(font.file));
    }

    for (const page of book.pages) {
      zip.file(`OEBPS/${page.href}`, page.xhtml);
    }

    for (const image of book.images) {
      zip.file(`OEBPS/${image.href}`, image.buffer, { compression: 'STORE' });
    }

    const tocPages = book.pages.filter((p) => p.inToc);
    const contentsPage = book.pages.find((p) => p.id === 'contents');

    zip.file(
      'OEBPS/nav.xhtml',
      this.wrapXhtml(
        book.tocTitle,
        book.lang,
        `<nav epub:type="toc" id="toc"><h1>${esc(book.tocTitle)}</h1><ol>${tocPages
          .map((p) => `<li><a href="${p.href}">${esc(p.title)}</a></li>`)
          .join('')}</ol></nav>
<nav epub:type="landmarks" hidden="hidden"><ol>${
          contentsPage
            ? `<li><a epub:type="toc" href="${contentsPage.href}">${esc(contentsPage.title)}</a></li>`
            : ''
        }${
          book.firstChapterHref
            ? `<li><a epub:type="bodymatter" href="${book.firstChapterHref}">${esc(book.title)}</a></li>`
            : ''
        }</ol></nav>`,
      ),
    );

    zip.file(
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${book.lang}">
  <head>
    <meta name="dtb:uid" content="${identifier}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${esc(book.title)}</text></docTitle>
  <navMap>
${tocPages
  .map(
    (p, i) =>
      `    <navPoint id="nav-${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(p.title)}</text></navLabel><content src="${p.href}"/></navPoint>`,
  )
  .join('\n')}
  </navMap>
</ncx>`,
    );

    const manifest = [
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `<item id="css" href="book.css" media-type="text/css"/>`,
      ...book.pages.map(
        (p) =>
          `<item id="${p.id}" href="${p.href}" media-type="application/xhtml+xml"/>`,
      ),
      ...book.images.map(
        (img) =>
          `<item id="${img.id}" href="${img.href}" media-type="image/jpeg"/>`,
      ),
      ...fontFaces.map(
        (font, index) =>
          `<item id="font-${index + 1}" href="${font.href}" media-type="font/ttf"/>`,
      ),
    ];

    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${book.lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${identifier}</dc:identifier>
    <dc:title id="title">${esc(book.title)}</dc:title>
    <meta refines="#title" property="title-type">main</meta>${
      book.subtitle
        ? `
    <dc:title id="subtitle">${esc(book.subtitle)}</dc:title>
    <meta refines="#subtitle" property="title-type">subtitle</meta>`
        : ''
    }
    <dc:creator id="creator">${esc(book.author)}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
    <dc:publisher>${esc(book.author)}</dc:publisher>
    <dc:language>${book.lang}</dc:language>
    <dc:date>${modified.slice(0, 10)}</dc:date>
    <dc:rights>Copyright © ${now.getFullYear()} ${esc(book.author)}. All rights reserved.</dc:rights>${
      book.description
        ? `
    <dc:description>${esc(book.description)}</dc:description>`
        : ''
    }
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${book.pages.map((p) => `<itemref idref="${p.id}"/>`).join('\n    ')}
  </spine>
</package>`,
    );

    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
      mimeType: 'application/epub+zip',
    });
  }

  private wrapXhtml(title: string, lang: string, body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${this.escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="book.css"/>
</head>
<body>
${body}
</body>
</html>`;
  }

  private escapeXml(text: string): string {
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // Control characters are illegal in XML and fail EPUB validation
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }
}
