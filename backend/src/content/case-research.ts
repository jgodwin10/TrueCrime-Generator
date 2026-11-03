// src/content/case-research.ts
//
// A true crime book must stand on real sources, not on what a model remembers.
// Each book starts with live web research: one search-backed pass per topic,
// written up as a dossier of plain facts that every later prompt writes from.
// A pass that came back without sources is thrown away, and a case without
// enough sources stops here instead of becoming a book.
import axios from 'axios';

export interface CaseSource {
  title: string;
  url: string;
  domain: string;
}

export interface CaseResearch {
  dossier: string;
  sources: CaseSource[];
  // Text of the pages that could be read, for the originality check
  pages: string[];
}

export const MIN_SOURCES = 6;
export const MIN_SOURCE_DOMAINS = 3;

// Prefix of errors that tell the book's owner why it stopped; other job errors
// can hold provider details and are never shown
export const BOOK_STOPPED_PREFIX = '[book stopped] ';

export function bookStoppedError(reason: string): Error {
  return new Error(`${BOOK_STOPPED_PREFIX}${reason}`);
}

// Where people repeat and speculate: useful as leads, never as evidence
const UNUSABLE_DOMAINS = [
  'reddit.com',
  'quora.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'pinterest.com',
  'youtube.com',
  'fandom.com',
  'websleuths.com',
];

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isUsableSource(url: string): boolean {
  const domain = domainOf(url);
  return (
    !!domain &&
    !UNUSABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
  );
}

export interface ResearchPass {
  id: string;
  heading: string;
  ask: string;
  // The book can't go ahead if this pass finds nothing
  required?: boolean;
}

export const RESEARCH_PASSES: ResearchPass[] = [
  {
    id: 'overview',
    heading: 'THE CASE',
    required: true,
    ask: 'Identify the case: what happened, when and where, how it came to light, and the correct names of the agencies and courts involved. If more than one case could match, say which one matches and how to tell them apart.',
  },
  {
    id: 'people-harmed',
    heading: 'THE PEOPLE HARMED',
    ask: 'Who was harmed, and who were they as people: their life, work, family and how those who knew them have publicly remembered them. Note whether each name has been publicly released, whether anyone was a minor, and any public request from a family or survivor about how they or the case should be discussed. Do not collect details of injuries.',
  },
  {
    id: 'investigation',
    heading: 'THE INVESTIGATION',
    ask: 'The order of events in the investigation, with dates: who led it, the main lines of inquiry, the evidence in general terms, the dead ends, and any official criticism of it. Do not collect details of methods that could help someone commit a crime or avoid detection.',
  },
  {
    id: 'legal',
    heading: 'THE LEGAL RECORD',
    ask: 'The full legal record: every arrest, charge, plea, trial, verdict, sentence, appeal, overturned conviction and exoneration, with dates and courts. List the current legal status of each person named as suspected, charged or convicted, and whether any proceedings are still active.',
  },
  {
    id: 'disputed',
    heading: 'DISPUTES AND CORRECTIONS',
    ask: 'What is disputed or commonly told wrong about this case: points where sources disagree, claims that were corrected or disproven, and popular myths, with what the record shows instead.',
  },
  {
    id: 'aftermath',
    heading: 'AFTERMATH AND LATEST DEVELOPMENTS',
    ask: 'What followed: changes in law or procedure, official reviews, memorials and foundations set up by families, and the most recent developments you can find, with dates.',
  },
];

export function buildResearchPrompt(
  pass: ResearchPass,
  subject: string,
  today: string,
  notes?: string,
): string {
  return `Today is ${today}. You are researching a real criminal case for a careful nonfiction book. Search the web before you answer, and search more than once.

CASE: ${subject}
${notes?.trim() ? `AUTHOR'S NOTES, to help identify the case. They are not evidence: check them:\n${notes.trim().slice(0, 1000)}\n` : ''}
TOPIC: ${pass.ask}

SOURCES:
- Prefer court records and rulings, official statements and reviews, and established news organizations.
- Do not treat forums, social media, fan wikis, or podcast and documentary retellings as evidence.
- For anything disputed, say who claims what. Mark anything found in only one source as "single source".

HOW TO WRITE IT:
- Write short, plain factual notes, one fact per line, with the date where you have one. This is a list of facts, not prose.
- Use your own words. Do not copy sentences, and do not include quotations longer than a few words.
- Report only what you found. Never fill a gap from memory or guesswork. If you found nothing on part of the topic, say "Not found".
- Keep each person's exact legal status. Never state that someone committed a crime unless they were convicted or pleaded guilty.
- No graphic detail, no descriptions of sexual acts, no home addresses or contact details.
- At most 700 words.

If you cannot find this case at all, reply with only: CASE_NOT_FOUND`;
}

export function caseNotFound(text: string): boolean {
  return /^\W*CASE_NOT_FOUND\W*$/.test(text.trim());
}

// Web search citations can point anywhere, so a request may never reach this
// machine's own network
export function isSafeToFetch(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    const host = hostname.toLowerCase();
    return (
      protocol === 'https:' &&
      host.includes('.') &&
      !host.endsWith('.local') &&
      !host.endsWith('.internal') &&
      !/^[\d.]+$/.test(host) &&
      !host.includes(':') &&
      !host.startsWith('[')
    );
  } catch {
    return false;
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&(?:#39|#x27|apos|rsquo|lsquo);/g, "'")
    .replace(/&(?:quot|ldquo|rdquo);/g, '"')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PAGE_CHARS = 150000;

/**
 * Follows a citation to the real page. Search citations are often temporary
 * redirect links, so this is also what gives the book a lasting URL. Many news
 * sites refuse bots: that still proves the page exists, it just has no text.
 */
export async function readSourcePage(
  url: string,
): Promise<{ url: string; text: string } | null> {
  if (!isSafeToFetch(url)) return null;
  try {
    const response = await axios.get<string>(url, {
      timeout: 15000,
      maxContentLength: MAX_PAGE_BYTES,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BookResearch/1.0)' },
      beforeRedirect: (options: Record<string, any>) => {
        if (!isSafeToFetch(options.href)) {
          throw new Error('Unsafe redirect');
        }
      },
    });
    const finalUrl: string =
      (response.request as any)?.res?.responseUrl || url;
    if (response.status === 404 || response.status === 410) return null;

    const isHtml = /html|text\/plain/i.test(
      String(response.headers['content-type'] || ''),
    );
    const readable = response.status < 400 && isHtml;
    return {
      url: finalUrl,
      text: readable
        ? htmlToText(String(response.data)).slice(0, MAX_PAGE_CHARS)
        : '',
    };
  } catch {
    return null;
  }
}

/** Keeps every source one entry, under the address readers will land on */
export function uniqueSources(sources: CaseSource[]): CaseSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// The book formatter strips markdown characters, which would break these URLs;
// percent-encoded they still lead to the same page
function printableUrl(url: string): string {
  const withoutFragment = url.replace(/#.*$/, '');
  const short =
    withoutFragment.length > 200
      ? withoutFragment.replace(/\?.*$/, '')
      : withoutFragment;
  return short.replace(
    /[_*~`[\]{}]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** The list printed at the end of the book */
export function formatSourcesSection(
  sources: CaseSource[],
  accessedOn: string,
): string {
  const entries = sources.map((source) => {
    const title = source.title.replace(/[_*~`[\]{}#]/g, ' ').trim();
    const label = title && title !== source.domain ? `${title} (${source.domain})` : source.domain;
    return `${label}: ${printableUrl(source.url)}`;
  });
  return [
    'Sources',
    `The research for this book drew on these public sources, accessed in ${accessedOn}. Pages can change or move after that date.`,
    ...entries,
  ].join('\n\n');
}
