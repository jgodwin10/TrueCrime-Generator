// src/content/table-of-contents.ts
import { seedFromString } from './true-crime-style';

// ═══════════════════════════════════════════════════════════════
// FORMAT SECTIONS — like the copyright page, every part of the table of
// contents has a list of options. An account can pick one, write its own
// (heading and entry only), or leave it on the option its account ID
// selects (so untouched accounts still differ).
// Entry templates use {n}, {word}, {ordinal}, {roman} and {title}.
// New options go at the end of a list so saved option numbers keep their
// meaning.
// ═══════════════════════════════════════════════════════════════
export const TOC_SECTIONS = [
  {
    key: 'heading',
    label: 'Heading',
    description: 'The title at the top of the contents page.',
    custom: true,
    options: [
      'Table of Contents',
      'Contents',
      'In This Book',
      'Chapters',
      'Inside This Book',
      "What's Inside",
      'The Chapters',
      'Chapter Guide',
      'Contents at a Glance',
      'The Story in Chapters',
      'Overview',
    ],
  },
  {
    key: 'entry',
    label: 'Chapter entries',
    description: 'How each chapter is listed.',
    custom: true,
    options: [
      'Chapter {n}: {title}',
      'Chapter {n} — {title}',
      '{n}. {title}',
      'Chapter {word}: {title}',
      '{roman}. {title}',
      '{title}',
      'Chapter {roman}: {title}',
      'Chapter {roman} — {title}',
      'Chapter {n} · {title}',
      'Chapter {n}. {title}',
      '{n} — {title}',
      '{word}: {title}',
      'Part {n}: {title}',
      'Part {word} — {title}',
      'Part {roman}. {title}',
      'The {ordinal} Chapter: {title}',
      '{ordinal} Chapter — {title}',
      '{title} (Chapter {n})',
      '{title} — Chapter {word}',
    ],
  },
  {
    key: 'detail',
    label: 'Detail',
    description: 'What is listed under each chapter.',
    custom: false,
    options: [
      'Chapters only',
      'Chapters and their sections',
      'Chapters, sections and subsections',
    ],
  },
] as const;

export type TocSectionKey = (typeof TOC_SECTIONS)[number]['key'];

/**
 * Per-account table of contents format, saved on the user. Each part is an
 * option number (0-based) or, for heading and entry, the account's own
 * text. Missing means the option this account's ID selects.
 */
export type TocSettings = Partial<Record<TocSectionKey, number | string>>;

export const MAX_CUSTOM_HEADING = 60;
export const MAX_CUSTOM_ENTRY = 80;

const CUSTOM_LIMITS: Partial<Record<TocSectionKey, number>> = {
  heading: MAX_CUSTOM_HEADING,
  entry: MAX_CUSTOM_ENTRY,
};

const sectionByKey = new Map<string, (typeof TOC_SECTIONS)[number]>(
  TOC_SECTIONS.map((s) => [s.key, s]),
);

/** The option an account gets for a part when it hasn't chosen one */
export function defaultTocOptionIndex(seed: string, key: TocSectionKey): number {
  const section = sectionByKey.get(key)!;
  return seedFromString(`${seed}::toc::${key}`) % section.options.length;
}

export function defaultTocSettings(seed: string): Record<TocSectionKey, number> {
  return Object.fromEntries(
    TOC_SECTIONS.map((s) => [s.key, defaultTocOptionIndex(seed, s.key)]),
  ) as Record<TocSectionKey, number>;
}

/**
 * Drops unknown parts, out-of-range numbers, and custom text where it isn't
 * allowed. A custom entry must contain {title}, or every chapter would read
 * the same.
 */
export function normalizeTocSettings(
  settings: TocSettings | null | undefined,
): TocSettings {
  const result: TocSettings = {};
  for (const [key, choice] of Object.entries(settings ?? {})) {
    const section = sectionByKey.get(key);
    if (!section) continue;
    if (
      typeof choice === 'number' &&
      Number.isInteger(choice) &&
      choice >= 0 &&
      choice < section.options.length
    ) {
      result[section.key] = choice;
    } else if (section.custom && typeof choice === 'string') {
      // One line only: the renderers read the contents page line by line
      const text = choice.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (section.key === 'entry' && !text.includes('{title}')) continue;
      result[section.key] = text.slice(0, CUSTOM_LIMITS[section.key]);
    }
  }
  return result;
}

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

export function numberToWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  return String(n);
}

const ORDINAL_ONES = [
  'Zeroth', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
  'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth',
  'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth',
  'Nineteenth',
];
const ORDINAL_TENS = [
  '', '', 'Twentieth', 'Thirtieth', 'Fortieth', 'Fiftieth', 'Sixtieth',
  'Seventieth', 'Eightieth', 'Ninetieth',
];

export function numberToOrdinalWords(n: number): string {
  if (n < 20) return ORDINAL_ONES[n];
  if (n < 100) {
    return n % 10
      ? `${TENS[Math.floor(n / 10)]}-${ORDINAL_ONES[n % 10]}`
      : ORDINAL_TENS[Math.floor(n / 10)];
  }
  return `${n}th`;
}

export function toRoman(n: number): string {
  const numerals: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = n;
  let result = '';
  for (const [value, numeral] of numerals) {
    while (rest >= value) {
      result += numeral;
      rest -= value;
    }
  }
  return result;
}

export interface TocChapterInput {
  chapterTitle: string;
  sections?: { sectionTitle: string; subsections?: string[] }[];
}

// Line layout of a stored contents page, read back by parseTableOfContents:
//   line 1      heading
//   no indent   one chapter entry (the k-th entry is chapter k)
//   2 spaces    a section of the chapter above
//   4 spaces    a subsection
const SECTION_INDENT = '  ';
const SUBSECTION_INDENT = '    ';

/**
 * The contents page for one book. `seed` is the account ID: it fixes any
 * part the account hasn't chosen.
 */
export function buildTableOfContents(options: {
  seed: string;
  chapters: TocChapterInput[];
  settings?: TocSettings | null;
}): string {
  const { seed, chapters } = options;
  const settings = normalizeTocSettings(options.settings);

  const choose = (key: TocSectionKey): number | string =>
    settings[key] ?? defaultTocOptionIndex(seed, key);
  const text = (key: TocSectionKey): string => {
    const choice = choose(key);
    return typeof choice === 'string'
      ? choice
      : sectionByKey.get(key)!.options[choice];
  };

  const entry = text('entry');
  const detail = choose('detail') as number; // never custom
  const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

  const lines = [oneLine(text('heading')), ''];
  chapters.forEach((chapter, index) => {
    const n = index + 1;
    const values: Record<string, string> = {
      n: String(n),
      word: numberToWords(n),
      ordinal: numberToOrdinalWords(n),
      roman: toRoman(n),
      title: oneLine(chapter.chapterTitle || ''),
    };
    lines.push(
      entry.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match),
    );

    if (detail >= 1) {
      for (const section of chapter.sections ?? []) {
        if (!section?.sectionTitle) continue;
        lines.push(SECTION_INDENT + oneLine(section.sectionTitle));
        if (detail >= 2) {
          for (const subsection of section.subsections ?? []) {
            if (subsection) lines.push(SUBSECTION_INDENT + oneLine(subsection));
          }
        }
      }
    }
    lines.push('');
  });

  return lines.join('\n').trimEnd() + '\n';
}

export interface ParsedTocEntry {
  /** 1-based chapter this entry links to */
  chapterNumber: number;
  text: string;
  children: { text: string; level: 1 | 2 }[];
}

export interface ParsedToc {
  heading: string;
  entries: ParsedTocEntry[];
}

// Contents pages made before formats existed: a bare "Chapter N" line
// followed by the title on its own line
const LEGACY_LABEL =
  /^(chapter|kapitel|chapitre|cap[ií]tulo|capitolo|hoofdstuk)\s+\d+\s*$/i;

/**
 * Reads a contents page made by buildTableOfContents. Returns null for the
 * older layout, which the renderers still handle their own way.
 */
export function parseTableOfContents(content: string): ParsedToc | null {
  const lines = (content || '').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return null;
  if (lines.some((line) => LEGACY_LABEL.test(line.trim()))) return null;

  const [heading, ...rest] = lines;
  const entries: ParsedTocEntry[] = [];
  for (const line of rest) {
    const text = line.trim();
    if (!line.startsWith(' ')) {
      entries.push({ chapterNumber: entries.length + 1, text, children: [] });
    } else if (entries.length) {
      const level = line.startsWith(SUBSECTION_INDENT) ? 2 : 1;
      entries[entries.length - 1].children.push({ text, level });
    }
  }

  return entries.length ? { heading: heading.trim(), entries } : null;
}
