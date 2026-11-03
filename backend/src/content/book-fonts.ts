// src/content/book-fonts.ts
import * as path from 'path';
import { seedFromString } from './true-crime-style';

// ═══════════════════════════════════════════════════════════════
// BOOK FONTS — like the copyright page and table of contents, an account
// picks a heading font and a body font, or leaves each on the option its
// account ID selects. The choice is copied onto each book when it's
// generated, so a book's downloads keep their look if the account changes
// its fonts later. Books from before fonts existed have none and keep the
// renderers' original fonts.
//
// Files live in assets/fonts as `${file}-${Style}.ttf` (static instances
// from Google Fonts, SIL Open Font License). Ids are stored, so never
// change one; new fonts go at the end of a list so defaults stay put as
// much as possible.
// ═══════════════════════════════════════════════════════════════

export type FontRole = 'heading' | 'body';

interface FontFamily {
  id: string;
  /** Family name inside the font files, also used in CSS and Word */
  family: string;
  /** File name prefix in assets/fonts */
  file: string;
  category: 'serif' | 'sans';
  /** Has Italic and BoldItalic files (needed for body text) */
  italics: boolean;
  /** Has an ExtraBold file (used for the PDF title page) */
  extraBold: boolean;
}

const FAMILIES: FontFamily[] = [
  { id: 'playfair-display', family: 'Playfair Display', file: 'PlayfairDisplay', category: 'serif', italics: true, extraBold: true },
  { id: 'lora', family: 'Lora', file: 'Lora', category: 'serif', italics: true, extraBold: false },
  { id: 'eb-garamond', family: 'EB Garamond', file: 'EBGaramond', category: 'serif', italics: true, extraBold: false },
  { id: 'merriweather', family: 'Merriweather', file: 'Merriweather', category: 'serif', italics: true, extraBold: false },
  { id: 'libre-baskerville', family: 'Libre Baskerville', file: 'LibreBaskerville', category: 'serif', italics: true, extraBold: false },
  { id: 'crimson-pro', family: 'Crimson Pro', file: 'CrimsonPro', category: 'serif', italics: true, extraBold: false },
  { id: 'source-serif-4', family: 'Source Serif 4', file: 'SourceSerif4', category: 'serif', italics: true, extraBold: false },
  { id: 'alegreya', family: 'Alegreya', file: 'Alegreya', category: 'serif', italics: true, extraBold: false },
  { id: 'spectral', family: 'Spectral', file: 'Spectral', category: 'serif', italics: true, extraBold: false },
  { id: 'pt-serif', family: 'PT Serif', file: 'PTSerif', category: 'serif', italics: true, extraBold: false },
  { id: 'literata', family: 'Literata', file: 'Literata', category: 'serif', italics: true, extraBold: false },
  { id: 'noto-serif', family: 'Noto Serif', file: 'NotoSerif', category: 'serif', italics: true, extraBold: false },
  { id: 'source-sans-3', family: 'Source Sans 3', file: 'SourceSans3', category: 'sans', italics: true, extraBold: false },
  { id: 'cormorant-garamond', family: 'Cormorant Garamond', file: 'CormorantGaramond', category: 'serif', italics: false, extraBold: false },
  { id: 'cinzel', family: 'Cinzel', file: 'Cinzel', category: 'serif', italics: false, extraBold: true },
  { id: 'bodoni-moda', family: 'Bodoni Moda', file: 'BodoniModa', category: 'serif', italics: false, extraBold: true },
  { id: 'montserrat', family: 'Montserrat', file: 'Montserrat', category: 'sans', italics: false, extraBold: true },
  { id: 'raleway', family: 'Raleway', file: 'Raleway', category: 'sans', italics: false, extraBold: true },
  { id: 'josefin-sans', family: 'Josefin Sans', file: 'JosefinSans', category: 'sans', italics: false, extraBold: false },
  { id: 'oswald', family: 'Oswald', file: 'Oswald', category: 'sans', italics: false, extraBold: false },
];

const familyById = new Map(FAMILIES.map((f) => [f.id, f]));

export const FONT_SECTIONS: {
  key: FontRole;
  label: string;
  description: string;
  options: string[]; // Font ids
}[] = [
  {
    key: 'heading',
    label: 'Heading font',
    description: 'The book title, chapter titles and page headings.',
    options: [
      'playfair-display', 'cormorant-garamond', 'cinzel', 'bodoni-moda',
      'libre-baskerville', 'eb-garamond', 'merriweather', 'lora', 'spectral',
      'montserrat', 'raleway', 'josefin-sans', 'oswald',
    ],
  },
  {
    key: 'body',
    label: 'Body font',
    description: 'The text of every chapter. Pick one that reads easily at length.',
    options: [
      'lora', 'eb-garamond', 'merriweather', 'libre-baskerville', 'crimson-pro',
      'source-serif-4', 'alegreya', 'spectral', 'pt-serif', 'literata',
      'noto-serif', 'source-sans-3',
    ],
  },
];

/** Per-account fonts, saved on the user. Missing means the account's default. */
export type FontSettings = Partial<Record<FontRole, string>>;

/** The fonts a book was generated with, saved on the project */
export type ProjectFonts = Record<FontRole, string>;

const sectionByKey = new Map(FONT_SECTIONS.map((s) => [s.key, s]));

/** What the settings form needs to show each option in its own face */
export function describeFontOptions() {
  return FONT_SECTIONS.map((section) => ({
    ...section,
    options: section.options.map((id) => {
      const { family, category } = familyById.get(id)!;
      return { id, family, category };
    }),
  }));
}

export function defaultFontId(seed: string, role: FontRole): string {
  const { options } = sectionByKey.get(role)!;
  return options[seedFromString(`${seed}::fonts::${role}`) % options.length];
}

export function defaultFontSettings(seed: string): ProjectFonts {
  return { heading: defaultFontId(seed, 'heading'), body: defaultFontId(seed, 'body') };
}

/** Drops unknown roles and fonts that aren't offered for that role */
export function normalizeFontSettings(
  settings: FontSettings | null | undefined,
): FontSettings {
  const result: FontSettings = {};
  for (const [key, id] of Object.entries(settings ?? {})) {
    const section = sectionByKey.get(key as FontRole);
    if (section && typeof id === 'string' && section.options.includes(id)) {
      result[section.key] = id;
    }
  }
  return result;
}

/** The fonts to copy onto a new book: the account's choices, else its defaults */
export function resolveFontSettings(
  seed: string,
  settings: FontSettings | null | undefined,
): ProjectFonts {
  return { ...defaultFontSettings(seed), ...normalizeFontSettings(settings) };
}

export interface FontFiles {
  family: string;
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
  extraBold: string;
}

/** Font files for one face; missing styles fall back to the nearest one */
function fontFiles(id: string): FontFiles {
  const font = familyById.get(id)!;
  const file = (style: string) =>
    path.join(process.cwd(), 'assets/fonts', `${font.file}-${style}.ttf`);
  return {
    family: font.family,
    regular: file('Regular'),
    bold: file('Bold'),
    italic: file(font.italics ? 'Italic' : 'Regular'),
    boldItalic: file(font.italics ? 'BoldItalic' : 'Bold'),
    extraBold: file(font.extraBold ? 'ExtraBold' : 'Bold'),
  };
}

export interface BookFonts {
  heading: FontFiles;
  body: FontFiles;
}

/**
 * The files for a book's saved fonts. Undefined for books made before
 * fonts could be chosen, so the renderers keep their original look.
 */
export function bookFonts(
  fonts: Partial<ProjectFonts> | null | undefined,
): BookFonts | undefined {
  if (!fonts) return undefined;
  const pick = (role: FontRole) => {
    const id = fonts[role];
    return id && sectionByKey.get(role)!.options.includes(id)
      ? id
      : role === 'heading'
        ? 'playfair-display'
        : 'lora';
  };
  return { heading: fontFiles(pick('heading')), body: fontFiles(pick('body')) };
}
