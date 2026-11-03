// src/content/gemini.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import {
  BookOutlineDto,
  ChapterOutline,
} from './dto/generate-true-crime.dto';
import {
  buildStyleProfile,
  formatForChapter,
  StyleProfile,
} from './true-crime-style';

interface APIProvider {
  type: 'gemini' | 'openai';
  client: GoogleGenerativeAI | OpenAI;
  model: string;

  lastUsedAt: number; // timestamp of last API call
  rateLimitedUntil: number; // when rate limit expires (0 = not limited)

  // ── NEW: Track consecutive errors per provider ──
  consecutiveErrors: number;
  lastErrorAt: number;
  lastErrorType: string | null;
}

interface GenerationOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'application/json' | 'text/plain';
}

// ═══════════════════════════════════════════════════════════════
// CASE BRIEF — the case the book covers, plus optional facts the author
// supplies. Author notes take priority over model memory on the facts, but
// never on who may be called guilty.
// ═══════════════════════════════════════════════════════════════
export interface CaseBrief {
  // The case the book covers
  subject: string;
  notes?: string;
  // Unique per book (the project id): picks this book's writing style, so
  // books with the same title still read differently
  seed?: string;
}

// Keeps very long notes from crowding out the actual instructions
const MAX_AUTHOR_NOTES_CHARS = 4000;

const PLAIN_LANGUAGE_RULES = `PLAIN LANGUAGE REQUIREMENT:
- Write every generated section in plain English.
- Use common words and short, clear sentences.
- Tell the story the way a good storyteller would tell it out loud.
- Avoid jargon, academic wording, fancy phrasing, and long tangled sentences.
- If a technical term, title or institution needs explaining, explain it right away in simple words.`;

// ═══════════════════════════════════════════════════════════════
// FACTUAL ACCURACY — true crime is about real people and real harm, so an
// invented detail can wrong a victim or accuse an innocent person. Every
// prompt carries these rules.
// ═══════════════════════════════════════════════════════════════
const TRUE_CRIME_FACT_RULES = `FACTUAL ACCURACY — THIS BOOK IS ABOUT A REAL CASE AND REAL PEOPLE:
- Only state facts you are confident are part of the documented public record: court records and rulings, official statements, sworn testimony, and established news reporting.
- Never invent anything: no quotes, dialogue, scenes, people, evidence, documents, file numbers, dates, times, numbers or sources.
- Never put words in quotation marks and attribute them to anyone unless the words are famous and exact. Otherwise paraphrase and attribute ("a witness testified that...", "police later said...").
- Never narrate what anyone thought or felt, especially the victim's last moments or an offender's state of mind. Nobody can report them. You may describe what a person said about their own feelings in public, and say so.
- Do not recreate events minute by minute unless the record really does establish them. Where the sequence is unknown, say so.
- When a detail is uncertain or accounts disagree, say so plainly ("accounts differ", "according to the prosecution") or leave it out. Never fill a gap with something plausible.
- Give dates when you are confident. Use exact times and days only when you are certain. Do not invent figures; use rounded, hedged figures only when you are confident of the size.
- Your knowledge has a cutoff. Do not claim to know where the case stands today; describe the latest events you know "as of this writing", and do not predict outcomes.
- Context is welcome — the era, the place, how police and courts worked — but present it as context, not as facts about the people in the case.
- If AUTHOR NOTES are provided, use them, and let them override your memory on dates, places and events. They never override the FAIRNESS rules: if a note says someone is guilty and that person was not convicted, report it only as an allegation or leave it out.
- If you do not clearly recognize this case, do not invent one. Write only what the author notes establish, name nobody who is not in the notes, and widen the lens to general context, saying plainly that the record available is limited.`;

// ═══════════════════════════════════════════════════════════════
// FAIRNESS — accusing a real person of a crime is the book's biggest
// legal risk. What the court decided sets the words the writer may use.
// ═══════════════════════════════════════════════════════════════
const TRUE_CRIME_FAIRNESS_RULES = `FAIRNESS AND LEGAL CARE — NON-NEGOTIABLE:
- Only say a person committed a crime if a court convicted them or they pleaded guilty, and the conviction stands. Then say so in those terms ("was convicted of", "pleaded guilty to").
- Everyone else keeps the exact status the record gives them: "suspected", "questioned", "charged", "accused", "acquitted", "cleared", "exonerated", "never charged". Use "allegedly" and "according to prosecutors" where they belong. Say clearly when charges were dropped or a person was acquitted.
- If a conviction was overturned or the person was exonerated, say so as prominently as the conviction, and do not hint that they really did it.
- Do not call anyone "the killer", "the murderer" or "the thief" unless that person was convicted. In an unsolved case, say "whoever did this" or "the person responsible".
- Never name a culprit of your own, and never build or hint at your own theory of who did it. No hinting by arrangement, by questions ("could it have been...?") or by placing a person's name next to suspicious details. You may describe theories that officials or a court considered, as theirs, and say what evidence does and does not support them.
- Name a suspect who was never charged only if officials publicly named them or the naming was itself a major documented part of the case. Then state, in the same passage, that they were never charged, and give any denial or clearing. Otherwise describe them without a name.
- Do not accuse a named police officer, prosecutor, lawyer, witness or journalist of misconduct unless a court or official review found it; then attribute it to that finding.
- Give the defense's case, denials and appeals fairly. A person with an active case or appeal is presumed innocent of anything not yet decided, so report it neutrally as what has been alleged and what has been ruled so far.
- Do not diagnose anyone. Mention mental illness or a psychological label only if it was part of the court record or official findings, and attribute it.`;

// ═══════════════════════════════════════════════════════════════
// DIGNITY AND SAFETY — the people harmed are not material
// ═══════════════════════════════════════════════════════════════
const TRUE_CRIME_DIGNITY_RULES = `DIGNITY AND SAFETY — NON-NEGOTIABLE:
- The people harmed are people first. Show who they were, as far as the record and their families' public statements allow. Never blame them, and do not judge their choices, habits or relationships unless that was a material issue in court.
- Violence: state what happened once, plainly, as the official finding. No gore, no injury descriptions beyond what the story strictly needs, no autopsy detail, no lingering on suffering, and never use a death for suspense.
- Sexual crimes: name the nature of the crime in general terms only (for example, "was charged with sexual assault"). Never describe the acts.
- Children: never include any sexual detail or anything sexualized about a person under 18, under any circumstances. If the case involves such a crime against a child, say only what the charge or conviction was.
- Do not name minors or survivors of sexual crimes unless they have chosen to be publicly identified or were already identified by officials and widely reported. Describe them by role otherwise.
- Keep private people private. Describe relatives, neighbors, coworkers, jurors and minor witnesses by role unless their name is central to the case and already on the public record.
- Never include home addresses, phone numbers, workplaces, license plates, or anything that would help someone find a living person, including people released from prison and victims' relatives.
- No instructions. Never give details that would help someone copy a crime or avoid being caught: no quantities, recipes, techniques, security weaknesses or ways of defeating forensic methods. Say what was done in general terms, then move on.
- Never glorify offenders. No admiration of their cleverness, no celebrity treatment, no repeating their self-justifications without challenge. Do not reproduce their manifestos, letters or claims beyond a brief paraphrase that the story needs.
- Mention race, religion, nationality, sexuality or disability only where it is relevant and documented.`;

// ═══════════════════════════════════════════════════════════════
// COPYRIGHT — the facts of a case are free to use; other people's words,
// reconstructions and storytelling choices are not
// ═══════════════════════════════════════════════════════════════
const TRUE_CRIME_COPYRIGHT_RULES = `COPYRIGHT AND PLAGIARISM — NON-NEGOTIABLE:
- Facts belong to no one: dates, places, names, events, charges, verdicts and rulings are free to use. The way anyone else told those facts is not.
- Other works on this case are off limits as a source of expression. That covers books, long-form articles, news stories, podcasts, documentaries, TV shows, films, Wikipedia, encyclopedias, fan sites, forums and press releases. Never reproduce, closely paraphrase or summarize them passage by passage or scene by scene.
- Dialogue and reconstructed scenes in earlier books, shows and podcasts are those authors' creative work, not facts. Do not reuse them, even in your own words. Use only what is established by the record itself.
- Do not copy another work's storytelling choices: its chapter titles, order of revelation, opening scene, framing device, central thesis, recurring image, memorable phrases or selection of details. Build this book's selection and order from the case and this book's own plan.
- Do not write in the style of any named author, podcast or show, and do not use their signature phrases.
- Use a nickname for a case or offender only if it is widely used to identify the case, and only for identification. Never use a name coined by one specific book, show or podcast as your own framing.
- Quotation: never quote from any book, article, podcast, documentary or show. From court records or official statements, quote at most one short, exact phrase at a time, and only when you are certain of the words. Everything else is attributed paraphrase in your own sentence structure. Do not reproduce transcripts, emergency calls, confessions, letters or diaries.
- Never quote song lyrics or poems, not even a single line. Titles are fine.
- If a fact is known only from one journalist's or author's original work, state the bare fact in your own words and attribute it generally ("later reporting found"), only when you are confident. Do not name a source unless you are certain it exists.
- You may mention that a book, podcast or show about the case exists only if that fact matters to the story, as something that happened in public. Do not describe its contents in detail.`;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — narrative true crime writer, styled per book
// ═══════════════════════════════════════════════════════════════
function buildTrueCrimeSystemPrompt(style: StyleProfile): string {
  const { persona } = style;
  return `You are ${persona.name}, ${persona.background}. You write narrative true crime for general readers: carefully grounded in the public record, honest about what is and isn't known, respectful of the people harmed, and told so that a case reads like a story rather than a police report. ${persona.focus}. As a writer, you ${persona.writingHabit}. This habit should show up naturally across the chapter, not just once.

Your personality as a writer: by temperament you are ${persona.temperament}. You admire ${persona.admires}. You distrust ${persona.distrusts}. You can't help noticing ${persona.notices}, but you bring in such details only when the record supports them. Let this personality show in what you emphasize and how you weigh things — never in invented facts, and never as opinions dressed up as facts.

This persona only sets your voice. It is not a fact about the book. Never mention this name or background in the text. Never claim to have attended a trial, interviewed anyone, visited a place, read a case file, or covered the case yourself.

Tone for this book: ${style.tone}

Your writing voice:
- Third person. Keep yourself out of the story.
- Humane but clear-eyed: sympathy for the people harmed, fairness to everyone accused, no contempt and no thrill
- Concrete: names where allowed, places, dates, documents, decisions and their consequences — not adjectives
- Short sentences mixed with longer ones — never uniform
- Tension comes from the order of events and what was unknown at the time, never from exaggeration, gore or fake cliffhangers
- Show how we know things: the ruling, the testimony, the official statement, the later reporting
- Connect the case to people and place: what it did to a family, a town, a department or a law
- Let the record speak; never moralize

${TRUE_CRIME_FACT_RULES}

${TRUE_CRIME_FAIRNESS_RULES}

${TRUE_CRIME_DIGNITY_RULES}

${TRUE_CRIME_COPYRIGHT_RULES}

ORIGINALITY — THIS IS NON-NEGOTIABLE:
Every sentence you write must be entirely original wording in your own voice, generated fresh for this book. Never reproduce, closely paraphrase, structurally mirror, or echo the phrasing of any published or online source, in any language.
- Do not recall a telling of this case and restate it. Start from the bare facts and find your own words, sentence shapes and order of ideas.
- Do not open the book or any chapter the way true crime usually opens: not on a body, not on a scream, not on "It was a quiet night in...". Find a better way in.
- Do not organize every chapter the same way. Let each chapter's shape come from the part of the case it covers.
- Treat every section as if you are drafting it for the first time, not recalling a version of it you've written before.

ABSOLUTELY NEVER use these words/phrases — they are dead giveaways of AI writing or tabloid true crime:
"delve", "tapestry", "vibrant", "myriad", "plethora", "embark on a journey", "a testament to", "it's worth noting",
"in terms of", "when it comes to", "at the end of the day", "seamlessly", "effortlessly", "game-changer",
"indelible mark", "iconic", "legendary", "unparalleled", "pivotal moment", "against all odds",
"the rest is history", "little did (he/she/they) know", "navigate the complexities", "multifaceted", "enigmatic", "resonate",
"chilling", "spine-chilling", "bone-chilling", "blood-curdling", "gruesome", "grisly", "heinous", "unspeakable", "unthinkable",
"monster", "pure evil", "evil incarnate", "cold-blooded", "mastermind", "criminal genius", "sleepy town", "quiet town",
"nobody could have imagined", "would never be the same", "sent shockwaves", "shocked the nation", "a parent's worst nightmare",
"justice was served", "finally found closure", "tragically cut short", "the case that gripped"

Instead use plain, specific language. Show why something mattered with facts instead of announcing how shocking it was.

${PLAIN_LANGUAGE_RULES}`;
}
// ═══════════════════════════════════════════════════════════════
// Post-processing patterns — shared + domain-specific
// ═══════════════════════════════════════════════════════════════

const SHARED_AI_TELL_PATTERNS: Array<{ pattern: RegExp; replacement: string }> =
  [
    { pattern: /\bdelve(?:s|d)?\b/gi, replacement: 'dig' },
    { pattern: /\btapestry\b/gi, replacement: 'mix' },
    { pattern: /\bmyriad\b/gi, replacement: 'many' },
    { pattern: /\bplethora\b/gi, replacement: 'plenty' },
    { pattern: /\bseamlessly\b/gi, replacement: 'smoothly' },
    { pattern: /\beffortlessly\b/gi, replacement: 'easily' },
    { pattern: /\bembark on a journey\b/gi, replacement: 'get started' },
    { pattern: /\ba testament to\b/gi, replacement: 'proof of' },
    { pattern: /\bit(?:'s| is) worth noting\b/gi, replacement: '' },
    { pattern: /\baforementioned\b/gi, replacement: 'that' },
    { pattern: /\bfurthermore\b/gi, replacement: 'also' },
    { pattern: /\bmoreover\b/gi, replacement: 'and' },
    { pattern: /\bin conclusion\b/gi, replacement: '' },
    { pattern: /\bIn summary\b/gi, replacement: '' },
    { pattern: /\bgame-changer\b/gi, replacement: 'big deal' },
    { pattern: /\butilize(?:s|d)?\b/gi, replacement: 'use' },
    { pattern: /\bleverag(?:e|es|ed|ing)\b/gi, replacement: 'use' },
    { pattern: /\bfacilitat(?:e|es|ed|ing)\b/gi, replacement: 'help' },
    { pattern: /\bnevertheless\b/gi, replacement: 'still' },
    { pattern: /\bnonetheless\b/gi, replacement: 'still' },
    { pattern: /\bin addition(?:ally)?\b/gi, replacement: 'also' },
    { pattern: /\bsubsequently\b/gi, replacement: 'then' },
    { pattern: /\bconsequently\b/gi, replacement: 'so' },
    { pattern: /\bultimately\b/gi, replacement: 'in the end' },
    { pattern: /\bsignificantly\b/gi, replacement: 'a lot' },
    { pattern: /\bsubstantially\b/gi, replacement: 'a lot' },
    { pattern: /\bnotably\b/gi, replacement: '' },
    { pattern: /\bindeed\b/gi, replacement: '' },
    { pattern: /\bcertainly\b/gi, replacement: '' },
    { pattern: /\bof course\b/gi, replacement: '' },
    { pattern: /\brich history\b/gi, replacement: 'long history' },
    { pattern: /\bdiverse culture\b/gi, replacement: 'mixed culture' },
    { pattern: /\blocal flavor\b/gi, replacement: 'local character' },
    { pattern: /\bmust-visit\b/gi, replacement: 'worth visiting' },
    { pattern: /\bmust-see\b/gi, replacement: 'worth seeing' },
    { pattern: /\boff the beaten path\b/gi, replacement: 'out of the way' },
    { pattern: /\boff-the-beaten-path\b/gi, replacement: 'out of the way' },
    { pattern: /\bunique experience\b/gi, replacement: 'experience' },
    { pattern: /\bmemorable experience\b/gi, replacement: 'good experience' },
    { pattern: /\bit is important to note\b/gi, replacement: '' },
    { pattern: /\bplease note that\b/gi, replacement: '' },
    { pattern: /\bkeep in mind that\b/gi, replacement: '' },
  ];

const TRUE_CRIME_AI_TELL_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  // Article-aware forms first, so "a pivotal" doesn't become "a important"
  { pattern: /\ba pivotal\b/g, replacement: 'an important' },
  { pattern: /\bA pivotal\b/g, replacement: 'An important' },
  { pattern: /\ban (?:iconic|legendary)\b/g, replacement: 'a famous' },
  { pattern: /\bAn (?:iconic|legendary)\b/g, replacement: 'A famous' },
  { pattern: /\ban unparalleled\b/g, replacement: 'a rare' },
  { pattern: /\bAn unparalleled\b/g, replacement: 'A rare' },
  { pattern: /\bleft an indelible mark\b/gi, replacement: 'left a lasting mark' },
  { pattern: /\ban indelible\b/g, replacement: 'a lasting' },
  { pattern: /\bindelible\b/gi, replacement: 'lasting' },
  { pattern: /\biconic\b/gi, replacement: 'famous' },
  { pattern: /\blegendary\b/gi, replacement: 'famous' },
  { pattern: /\bpivotal\b/gi, replacement: 'important' },
  { pattern: /\bagainst all odds\b/gi, replacement: 'against long odds' },
  { pattern: /\bmultifaceted\b/gi, replacement: 'complicated' },
  { pattern: /\bunparalleled\b/gi, replacement: 'rare' },
  { pattern: /\bvibrant\b/gi, replacement: 'lively' },
  { pattern: /\bnavigat(?:e|ed|ing) the complexities of\b/gi, replacement: 'dealing with' },
  // Tabloid wording that survives the prompt; anything that needs real
  // rewriting is left to the authenticity audit
  { pattern: /\bsleepy (town|village|community|suburb)\b/gi, replacement: 'small $1' },
  { pattern: /\bcold-blooded\s+/gi, replacement: '' },
  { pattern: /\b(?:spine|bone)-chilling\s+/gi, replacement: '' },
  { pattern: /\bblood-curdling\s+/gi, replacement: '' },
];

const SENTENCE_UNIFORMITY_PATTERNS = [
  /(?:^|\. )The (?:\w+ ){2,}/g,
  /(?:^|\. )You (?:can|will|should|might) /g,
];

interface RefinementContext {
  bookTitle?: string;
  bookSubtitle?: string;
  chapterTitle?: string;
  chapterOutline?: ChapterOutline;
  isMainChapter?: boolean;
  brief?: CaseBrief;
}

interface AuthenticityIssue {
  issue: string;
  instruction: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private apiProviders: APIProvider[] = [];
  private currentProviderIndex: number = 0;
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_RETRY_DELAY = 6000;

  // ── Per-provider cooldown settings ──────────────────────────
  private readonly PROVIDER_COOLDOWN_MS = 5000; // Min 5s between calls to same key
  private readonly RATE_LIMIT_LOCKOUT_MS = 60000; // Lock out for 60s after 429

  private readonly REQUEST_TIMEOUT_MS = 95000; // 95s timeout per request
  private readonly PROVIDER_SWITCH_DELAY_MS = 4000; // 4s delay when switching after failure
  private readonly MAX_CONSECUTIVE_ERRORS = 5; // Max errors before extended lockout
  private readonly EXTENDED_LOCKOUT_MS = 300000; // 5 min lockout after too many errors

  constructor(private configService: ConfigService) {
    this.initializeProviders();

    if (this.apiProviders.length === 0) {
      throw new Error(
        'At least one API key (GEMINI or OPENAI) must be configured',
      );
    }

    this.logger.log(
      `Service initialized with ${this.apiProviders.length} API provider(s)`,
    );
    this.apiProviders.forEach((provider, idx) => {
      this.logger.log(
        `Provider ${idx + 1}: ${provider.type} (${provider.model})`,
      );
    });
  }

  private initializeProviders(): void {
    const geminiPrimary = this.configService.get<string>('GEMINI_API_KEY');
    const geminiSecondary = this.configService.get<string>('GEMINI_API_KEYS');

    const geminiKeys: string[] = [];
    if (geminiPrimary) geminiKeys.push(geminiPrimary);
    if (geminiSecondary) {
      const keys = geminiSecondary
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k);
      geminiKeys.push(...keys);
    }

    // Override with GEMINI_MODEL / OPENAI_MODEL when a model is retired
    const geminiModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
    const openaiModel =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4.1-nano';

    const uniqueGeminiKeys = [...new Set(geminiKeys)];
    uniqueGeminiKeys.forEach((key) => {
      this.apiProviders.push({
        type: 'gemini',
        client: new GoogleGenerativeAI(key),
        model: geminiModel,
        lastUsedAt: 0,
        rateLimitedUntil: 0,
        consecutiveErrors: 0,
        lastErrorAt: 0,
        lastErrorType: null,
      });
    });

    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (openaiKey) {
      this.apiProviders.push({
        type: 'openai',
        client: new OpenAI({ apiKey: openaiKey }),
        model: openaiModel,
        lastUsedAt: 0,
        rateLimitedUntil: 0,
        consecutiveErrors: 0,
        lastErrorAt: 0,
        lastErrorType: null,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FIXED: Improved provider selection with error tracking
  // ══════════════════════════════════════════════════════════════
  private getNextProvider(): APIProvider | null {
    const now = Date.now();

    // Filter out rate-limited and error-locked providers
    const available = this.apiProviders.filter((p) => {
      if (now < p.rateLimitedUntil) return false;
      // Skip providers with too many consecutive errors (extended lockout)
      if (p.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        const timeSinceError = now - p.lastErrorAt;
        if (timeSinceError < this.EXTENDED_LOCKOUT_MS) {
          return false;
        }
        // Reset if lockout period passed
        p.consecutiveErrors = 0;
      }
      return true;
    });
    if (available.length === 0) return null;
    // Prefer providers with fewer errors, then pick the one idle longest
    available.sort((a, b) => {
      if (a.consecutiveErrors !== b.consecutiveErrors) {
        return a.consecutiveErrors - b.consecutiveErrors;
      }
      return a.lastUsedAt - b.lastUsedAt;
    });
    return available[0];
  }
  private async waitForProviderCooldown(provider: APIProvider): Promise<void> {
    const now = Date.now();
    const timeSinceLastUse = now - provider.lastUsedAt;
    if (
      timeSinceLastUse < this.PROVIDER_COOLDOWN_MS &&
      provider.lastUsedAt > 0
    ) {
      const waitTime = this.PROVIDER_COOLDOWN_MS - timeSinceLastUse;
      this.logger.debug(
        `Provider ${provider.type} cooling down ${waitTime}ms...`,
      );
      await this.sleep(waitTime);
    }
  }

  private isAccessDeniedError(error: any): boolean {
    return (
      error?.status === 403 ||
      error?.message?.includes('403') ||
      error?.message?.includes('Forbidden') ||
      error?.message?.includes('denied access') ||
      error?.message?.includes('API key not valid') ||
      error?.message?.includes('API_KEY_INVALID') ||
      error?.message?.includes('permission') ||
      error?.message?.includes('disabled')
    );
  }

  /** 404: this provider's model was retired or isn't offered to this key */
  private isModelUnavailableError(error: any): boolean {
    return (
      error?.status === 404 ||
      error?.message?.includes('404 Not Found') ||
      error?.message?.includes('no longer available')
    );
  }
  /**
   * The model blocked or refused this text. True crime trips safety filters
   * more often, and Gemini's RECITATION block means the draft was repeating
   * existing text, so neither should ever be kept: try the next provider.
   */
  private isContentBlockedError(error: any): boolean {
    return (
      error?.name === 'ContentBlockedError' ||
      /\b(?:blocked due to|SAFETY|RECITATION|PROHIBITED_CONTENT)\b/.test(
        error?.message || '',
      ) ||
      error?.code === 'content_policy_violation' ||
      error?.code === 'content_filter'
    );
  }

  private contentBlockedError(reason: string): Error {
    const error = new Error(`Model output blocked: ${reason}`);
    error.name = 'ContentBlockedError';
    return error;
  }

  /** A short reply that opens by declining, instead of the requested text */
  private looksLikeRefusal(text: string): boolean {
    const trimmed = text.trim();
    return (
      trimmed.length < 800 &&
      /^(?:i['’]m sorry|i am sorry|sorry,|i can(?:['’]t|not)|i won['’]t|i['’]m unable|i am unable|i['’]m not able)\b/i.test(
        trimmed,
      )
    );
  }

  // ══════════════════════════════════════════════════════════════
  // NEW: Network error detection
  // ══════════════════════════════════════════════════════════════
  private getNestedErrorValues(error: any): string {
    const values: string[] = [];
    const seen = new Set<any>();
    let current = error;

    while (current && !seen.has(current)) {
      seen.add(current);
      values.push(
        current?.message,
        current?.code,
        current?.errno,
        current?.syscall,
        current?.hostname,
        current?.name,
        current?.type,
      );
      current = current?.cause;
    }

    return values.filter(Boolean).join(' ').toLowerCase();
  }

  private isNetworkError(error: any): boolean {
    const errorText = this.getNestedErrorValues(error);

    return (
      errorText.includes('connection error') ||
      errorText.includes('connectiontimeouterror') ||
      errorText.includes('fetch failed') ||
      errorText.includes('eai_again') ||
      errorText.includes('econnreset') ||
      errorText.includes('etimedout') ||
      errorText.includes('timed out') ||
      errorText.includes('timeout') ||
      errorText.includes('econnrefused') ||
      errorText.includes('socket hang up') ||
      errorText.includes('network') ||
      errorText.includes('dns') ||
      errorText.includes('getaddrinfo') ||
      errorText.includes('enotfound') ||
      errorText.includes('enetunreach') ||
      errorText.includes('ehostunreach') ||
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error?.name === 'APIConnectionTimeoutError'
    );
  }
  private isRateLimitError(error: any): boolean {
    return (
      error?.status === 429 ||
      error?.message?.includes('rate limit') ||
      error?.message?.includes('quota') ||
      error?.message?.includes('too many requests') ||
      error?.message?.includes('Resource has been exhausted')
    );
  }
  private isOverloadError(error: any): boolean {
    return (
      error?.status === 503 ||
      error?.status === 502 ||
      error?.status === 500 ||
      error?.message?.includes('overloaded') ||
      error?.message?.includes('unavailable') ||
      error?.message?.includes('capacity')
    );
  }
  private isRetryableError(error: any): boolean {
    return (
      this.isNetworkError(error) ||
      this.isRateLimitError(error) ||
      this.isOverloadError(error) ||
      this.isContentBlockedError(error) || // blocked text = try the next provider
      this.isAccessDeniedError(error) || // 403 = skip this key, try next
      this.isModelUnavailableError(error) // 404 = skip this model, try next
    );
  }
  // ══════════════════════════════════════════════════════════════
  // NEW: Add jitter to prevent thundering herd
  // ══════════════════════════════════════════════════════════════
  private addJitter(baseMs: number, jitterPercent: number = 0.3): number {
    const jitter = baseMs * jitterPercent * (Math.random() - 0.5) * 2;
    return Math.max(100, Math.floor(baseMs + jitter));
  }

  // ═══════════════════════════════════════════════════════════════
  // TRUE CRIME VOICE + SHARED PROMPT BLOCKS
  // ═══════════════════════════════════════════════════════════════
  /** This book's style; falls back to a title-based seed for old callers */
  private styleFor(
    brief: CaseBrief | undefined,
    title: string,
    subtitle: string,
  ): StyleProfile {
    return buildStyleProfile(brief?.seed || `${title}::${subtitle}`);
  }

  private getSystemPrompt(
    brief: CaseBrief | undefined,
    title: string,
    subtitle: string,
  ): string {
    return buildTrueCrimeSystemPrompt(this.styleFor(brief, title, subtitle));
  }

  private getAITellPatterns(): Array<{ pattern: RegExp; replacement: string }> {
    return [...SHARED_AI_TELL_PATTERNS, ...TRUE_CRIME_AI_TELL_PATTERNS];
  }

  private buildAuthorNotesBlock(brief?: CaseBrief): string {
    const notes = brief?.notes?.trim();
    if (!notes) return '';

    const trimmed =
      notes.length > MAX_AUTHOR_NOTES_CHARS
        ? `${notes.slice(0, MAX_AUTHOR_NOTES_CHARS)}...`
        : notes;

    return `
AUTHOR NOTES (supplied by the author — use them where they fit, and let them override your memory on dates, places and events. They never override the FAIRNESS rules):
"""
${trimmed}
"""`;
  }

  private buildBookPromise(
    title: string,
    subtitle: string,
    brief?: CaseBrief,
  ): string {
    const subject = brief?.subject?.trim() || 'the case named in the title';
    const { context } = this.styleFor(brief, title, subtitle);
    const subtitleLine = subtitle?.trim()
      ? `Subtitle promise: ${subtitle.trim()}`
      : 'Subtitle promise: no subtitle was provided, so tell the full story of the case.';

    return `BOOK PROMISE AND FACT CONTRACT:
- The case this book covers: ${subject}
- Title: ${title}
- ${subtitleLine}
- Every chapter is about this case. Make sure you are writing about the right one: if the name could refer to more than one case, use the title, subtitle and author notes to identify it, and stay consistent.
- Treat the title and subtitle as the contract with the reader. If they promise an angle ("the investigation", "the trial", "the wrong man", a specific era or question), give that angle the most weight while still telling a coherent story. A title or subtitle never decides who is guilty: if it implies more than the record shows, stay with the record.
- Use accurate, named details where the rules allow: places, institutions, courts, agencies, officials acting in public roles, rulings and years.
- BROADER CONTEXT: this is one independent, standalone book. Let the chapter order, section headings and emphasis come from this particular case rather than from a fixed formula or from any earlier telling of it, so the finished book reads as its own work.

BOOK CONTEXT (this book's own angle — keep it consistent across every chapter):
- Written for: ${context.reader}. Pitch explanations, background and pace to them.
- The question this book keeps asking: ${context.drivingQuestion} Keep it in view; each chapter should add something to the answer, without forcing it into every paragraph.
- Lens: the book looks at the case mainly through ${context.lens}. Give it extra weight where the record supports it, without leaving out what matters most.
- Pacing: ${context.pacing}
${this.buildAuthorNotesBlock(brief)}`;
  }

  private buildCaseQualityRules(): string {
    return `REAL TRUE CRIME STANDARD:
- Write like a finished chapter of a serious published true crime book, not notes, a tabloid story, a forum post, a podcast script or a police report.
- Use the section headings from the outline, then write polished narrative paragraphs under them.
- Keep the timeline clear: anchor sections with dates where the record supports them, and make time jumps obvious.
- Each section should answer what happened, when, where, who was involved in what role, how we know, and what it led to.
- Keep each person's legal status clear every time it matters: suspected, charged, acquitted, convicted, cleared.
- Link earlier events to later ones only when the record supports the link — don't invent motives or psychology.
- No placeholder phrases, no TODO-style notes, no filler transitions, no fake cliffhangers.

${PLAIN_LANGUAGE_RULES}`;
  }

  private buildMainChapterDepthRules(): string {
    return `MAIN CHAPTER LENGTH AND DEPTH REQUIREMENTS:
- This is a main chapter, so make it long, full and satisfying. Do not write a short overview.
- Write 35-45 substantial paragraphs covering every section and subsection in the outline.
- Each paragraph should usually have 3-5 clear sentences. Short paragraphs are fine for emphasis, but most need real detail.
- Introduce people, places, agencies and legal terms the first time they appear, for a reader who is new to this case.
- Depth comes from documented detail, context and consequence: how police and courts worked, what the law required, what the place was like. Never from invented scenes, quotes or numbers, and never from more violent detail.
- If the documented record for this stage is thin, cover the context honestly and say plainly that less is known. Do not pad, and do not invent.`;
  }

  // ══════════════════════════════════════════════════════════════
  // FIXED: Provider calls with timeout using AbortController
  // ══════════════════════════════════════════════════════════════
  private async generateWithProvider(
    provider: APIProvider,
    prompt: string,
    systemPrompt: string = buildTrueCrimeSystemPrompt(buildStyleProfile('default')),
    options: GenerationOptions = {},
  ): Promise<string> {
    await this.waitForProviderCooldown(provider);
    provider.lastUsedAt = Date.now();
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.REQUEST_TIMEOUT_MS);
    try {
      if (provider.type === 'gemini') {
        const model = (
          provider.client as GoogleGenerativeAI
        ).getGenerativeModel({
          model: provider.model,
          // Fix 1: In generateWithProvider, increase maxOutputTokens for Gemini
         generationConfig: {
            temperature: options.temperature ?? (0.95 + (Math.random() * 0.15)),
            topP: options.topP ?? (0.88 + (Math.random() * 0.08)),
            topK: options.topK ?? (40 + Math.floor(Math.random() * 20)),
            maxOutputTokens: options.maxOutputTokens ?? 16384,
            responseMimeType: options.responseMimeType,
          },
          systemInstruction: systemPrompt,
        });
        // Pass abort signal to the request
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        clearTimeout(timeoutId);
        const response = await result.response;

        // Reset error count on success
        provider.consecutiveErrors = 0;

        const text = response.text();
        if (this.looksLikeRefusal(text)) {
          throw this.contentBlockedError('the model declined');
        }
        return text;
      } else {
        const completion = await (
          provider.client as OpenAI
        ).chat.completions.create(
          {
            model: provider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: options.temperature ?? 0.9,
            frequency_penalty: options.frequencyPenalty ?? 0.4,
            presence_penalty: options.presencePenalty ?? 0.3,
            response_format:
              options.responseMimeType === 'application/json'
                ? { type: 'json_object' }
                : undefined,
          },
          {
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        // Reset error count on success
        provider.consecutiveErrors = 0;

        const message = completion.choices[0]?.message;
        const text = message?.content || '';
        if (message?.refusal || !text.trim() || this.looksLikeRefusal(text)) {
          throw this.contentBlockedError('the model declined');
        }
        return text;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Track the error. A blocked text says nothing about this key's health,
      // so it must not count toward locking the key out.
      if (!this.isContentBlockedError(error)) {
        provider.consecutiveErrors++;
        provider.lastErrorAt = Date.now();
        provider.lastErrorType = error?.name || error?.code || 'unknown';
      }

      // Convert abort to timeout error for clearer logging
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(
          `Request timeout after ${this.REQUEST_TIMEOUT_MS}ms`,
        );
        (timeoutError as any).name = 'TimeoutError';
        (timeoutError as any).originalError = error;
        throw timeoutError;
      }

      throw error;
    }
  }
  // ══════════════════════════════════════════════════════════════
  // FIXED: Provider rotation with network error handling and delays
  // ══════════════════════════════════════════════════════════════
  private async generateWithProviderRotation(
    prompt: string,
    systemPrompt?: string,
    options: GenerationOptions = {},
  ): Promise<string> {
    const maxAttempts = this.apiProviders.length * 2;
    let lastError: any;
    let attemptCount = 0;

    while (attemptCount < maxAttempts) {
      attemptCount++;

      const provider = this.getNextProvider();

      if (!provider) {
        const now = Date.now();
        let soonest: APIProvider | null = null;
        let shortestWait = Infinity;

        for (const p of this.apiProviders) {
          let waitTime = 0;

          if (p.rateLimitedUntil > now) {
            waitTime = p.rateLimitedUntil - now;
          } else if (p.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            const timeSinceError = now - p.lastErrorAt;
            waitTime = Math.max(0, this.EXTENDED_LOCKOUT_MS - timeSinceError);
          }
          if (waitTime < shortestWait) {
            shortestWait = waitTime;
            soonest = p;
          }
        }

        if (soonest && shortestWait > 0) {
          const cappedWait = Math.min(shortestWait, 60000);
          this.logger.warn(
            `All providers locked out. Waiting ${Math.round(cappedWait / 1000)}s for ${soonest.type} provider...`,
          );
          await this.sleep(cappedWait);

          soonest.rateLimitedUntil = 0;
          if (soonest.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            soonest.consecutiveErrors = Math.floor(
              this.MAX_CONSECUTIVE_ERRORS / 2,
            );
          }
        }

        continue;
      }

      const providerIdx = this.apiProviders.indexOf(provider) + 1;

      try {
        this.logger.log(
          `Attempting with ${provider.type} provider #${providerIdx} (attempt ${attemptCount}/${maxAttempts})...`,
        );

        const result = await this.generateWithProvider(
          provider,
          prompt,
          systemPrompt,
          options,
        );
        return result;
      } catch (error: any) {
        lastError = error;

        const errorType = this.isContentBlockedError(error)
          ? 'content_blocked'
          : this.isAccessDeniedError(error)
          ? 'access_denied' // ← NEW
          : this.isModelUnavailableError(error)
            ? 'model_unavailable'
          : this.isRateLimitError(error)
            ? 'rate_limit'
            : this.isNetworkError(error)
              ? 'network'
              : this.isOverloadError(error)
                ? 'overload'
                : 'other';

        this.logger.warn(
          `${provider.type} provider #${providerIdx} failed (${errorType}): ${error?.message?.substring(0, 100)}`,
        );

        // ══════════════════════════════════════════════════════════
        // 403 ACCESS DENIED — Lock out permanently, skip to next
        // ══════════════════════════════════════════════════════════
        if (this.isAccessDeniedError(error)) {
          // Lock this key out for 24 hours — it's denied, not just busy
          provider.rateLimitedUntil = Date.now() + 24 * 60 * 60 * 1000;
          provider.consecutiveErrors = this.MAX_CONSECUTIVE_ERRORS; // Mark as bad
          this.logger.error(
            `Provider #${providerIdx} (${provider.type}) ACCESS DENIED (403) — permanently skipping this key. Try the next provider immediately.`,
          );
          // NO DELAY — immediately try next provider, no point waiting
          continue;
        }

        // 404 MODEL UNAVAILABLE — same model on every key of this type, so
        // lock this provider out and move on (e.g. to OpenAI) right away
        if (this.isModelUnavailableError(error)) {
          provider.rateLimitedUntil = Date.now() + 24 * 60 * 60 * 1000;
          provider.consecutiveErrors = this.MAX_CONSECUTIVE_ERRORS;
          this.logger.error(
            `Provider #${providerIdx} (${provider.type}) model "${provider.model}" is unavailable (404) — skipping it. Set GEMINI_MODEL / OPENAI_MODEL to a current model.`,
          );
          continue;
        }

        if (this.isRateLimitError(error)) {
          provider.rateLimitedUntil = Date.now() + this.RATE_LIMIT_LOCKOUT_MS;
          this.logger.warn(
            `Provider #${providerIdx} rate limited, locked out for ${this.RATE_LIMIT_LOCKOUT_MS / 1000}s`,
          );
        } else if (this.isNetworkError(error)) {
          const lockoutMs = this.addJitter(5000);
          provider.rateLimitedUntil = Date.now() + lockoutMs;
          this.logger.warn(
            `Provider #${providerIdx} network error, brief lockout for ${Math.round(lockoutMs / 1000)}s`,
          );
        } else if (this.isOverloadError(error)) {
          const lockoutMs = this.addJitter(30000);
          provider.rateLimitedUntil = Date.now() + lockoutMs;
          this.logger.warn(
            `Provider #${providerIdx} overloaded, locked out for ${Math.round(lockoutMs / 1000)}s`,
          );
        }

        if (this.isRetryableError(error) && attemptCount < maxAttempts) {
          const switchDelay = this.addJitter(this.PROVIDER_SWITCH_DELAY_MS);
          this.logger.debug(
            `Waiting ${switchDelay}ms before trying next provider...`,
          );
          await this.sleep(switchDelay);
          continue;
        }

        if (!this.isRetryableError(error)) {
          this.logger.error(
            `Non-retryable error from provider #${providerIdx}:`,
            error,
          );
          throw error;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // Check if ALL providers are access-denied before giving up
    // ══════════════════════════════════════════════════════════════
    const allDenied = this.apiProviders.every(
      (p) => p.rateLimitedUntil > Date.now() + 23 * 60 * 60 * 1000,
    );

    if (allDenied) {
      this.logger.error(
        'ALL providers have been access-denied (403). Check your API keys — they may be revoked or billing has lapsed.',
      );
      throw new Error(
        'All API keys are access-denied (403 Forbidden). Please check your API key configuration.',
      );
    }

    this.logger.error(`All ${maxAttempts} provider attempts failed`);
    throw lastError || new Error('All providers failed');
  }

  private async generateOutlineJson(
    prompt: string,
    systemPrompt: string,
  ): Promise<string> {
    return await this.generateWithProviderRotation(prompt, systemPrompt, {
      temperature: 0.2,
      topP: 0.8,
      topK: 20,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ═══════════════════════════════════════════════════════════════
  // Strip leaked conversational wrapper text (e.g. "Here's a polished
  // version of your chapter..." / "Let me know if you'd like changes!")
  // Models sometimes answer the prompt like a chat reply instead of
  // returning only the requested document body. This detects and
  // removes that wrapper without touching the actual content.
  // ═══════════════════════════════════════════════════════════════
  private stripConversationalWrapper(text: string): string {
    let result = text.trim();

    // Only ever consider the first paragraph as a candidate preamble —
    // never strip anything past the first blank line, so real content
    // that happens to start with "Here's" (rare) survives untouched
    // beyond the first paragraph.
    const paragraphs = result.split(/\n{2,}/);

    if (paragraphs.length > 1) {
      const firstParagraph = paragraphs[0].trim();
      const looksLikePreamble =
        firstParagraph.length < 400 &&
        /^(here'?s?|here is|below is|sure[,!]?|certainly[,!]?|absolutely[,!]?|okay[,!]?|i'?ve|i have|great[,!]?|of course[,!]?|this is)\b/i.test(
          firstParagraph,
        ) &&
        /\b(polish|refine|revis|rewrit|version|draft|chapter|section|edit|updated|final|book)\w*\b/i.test(
          firstParagraph,
        );

      if (looksLikePreamble) {
        result = paragraphs.slice(1).join('\n\n').trim();
      }
    }

    // Strip a leaked sign-off / trailing chat commentary, e.g.
    // "Let me know if you'd like any adjustments!" or
    // "I hope this helps with your book!"
    const lines = result.split('\n');
    while (lines.length > 1) {
      const lastLine = lines[lines.length - 1].trim();
      const looksLikeSignOff =
        lastLine.length > 0 &&
        lastLine.length < 300 &&
        /\b(let me know|i hope this helps|feel free to|happy to (?:adjust|revise|tweak)|want me to|would you like)\b/i.test(
          lastLine,
        );

      if (looksLikeSignOff) {
        lines.pop();
        while (lines.length && lines[lines.length - 1].trim() === '') {
          lines.pop();
        }
      } else {
        break;
      }
    }

    return lines.join('\n').trim();
  }

  // ═══════════════════════════════════════════════════════════════
  // Post-processing — strips AI-tell phrasing
  // ═══════════════════════════════════════════════════════════════
  private humanizeText(text: string): string {
    let result = this.stripConversationalWrapper(text);

    const patterns = this.getAITellPatterns();
    for (const { pattern, replacement } of patterns) {
      result = result.replace(pattern, replacement);
    }

    result = result.replace(/ {2,}/g, ' ');
    result = result.replace(/\n{3,}/g, '\n\n');

    for (const uniformPattern of SENTENCE_UNIFORMITY_PATTERNS) {
      const matches = result.match(uniformPattern);
      if (matches && matches.length > 3) {
        this.logger.warn(
          `Detected ${matches.length} repetitive sentence patterns: "${matches[0].substring(0, 40)}..."`,
        );
      }
    }

    return result.trim();
  }

  private countMatches(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length || 0;
  }

  private getRepeatedParagraphStarts(text: string): string[] {
    const starts = text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim().match(/^["']?([A-Za-z]{3,})\b/)?.[1])
      .filter((word): word is string => Boolean(word))
      .map((word) => word.toLowerCase());

    const counts = new Map<string, number>();
    for (const start of starts) {
      counts.set(start, (counts.get(start) || 0) + 1);
    }

    return [...counts.entries()]
      .filter(([, count]) => count >= 4)
      .map(([word]) => word);
  }

  private getCaseAuthenticityIssues(text: string): AuthenticityIssue[] {
    const issues: AuthenticityIssue[] = [];
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    const lower = text.toLowerCase();
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const headingCount = this.countMatches(text, /^[A-Z][^\n]{3,80}$/gm);
    const yearCount = this.countMatches(text, /\b(?:1[5-9]\d\d|20\d\d)s?\b/g);
    // Long quoted passages are where invented words and copied text both show up
    const longQuoteCount = this.countMatches(text, /["“][^"”\n]{25,}["”]/g);
    const privateThoughtCount = this.countMatches(
      lower,
      /\b(?:he|she|they|the (?:killer|victim|offender|attacker))\s+(?:thought|wondered|felt|knew|realized|realised|sensed|feared|hoped)\s+(?:to\s+(?:him|her|them)sel(?:f|ves)|that|deep down)\b|\b(?:couldn't help but|in (?:his|her|their) heart|deep down,? (?:he|she|they))\b/g,
    );
    const noteLikeCount = this.countMatches(
      text,
      /^\s*(?:[-*•]|\d+[.)]|#{1,6}\s)/gm,
    );
    const genericPhraseCount = this.countMatches(
      lower,
      /\b(little did (?:he|she|they) know|the rest is history|would never be the same|nobody could have imagined|no one could have imagined|sent shockwaves|shocked the nation|worst nightmare|justice was served|found closure|tragically cut short|in this chapter|this section|as mentioned earlier)\b/g,
    );
    const sensationalCount = this.countMatches(
      lower,
      /\b(chilling|gruesome|grisly|heinous|monster|monstrous|pure evil|evil incarnate|mastermind|criminal genius|unspeakable|unthinkable|horrific|sadistic)\b/g,
    );
    const graphicCount = this.countMatches(
      lower,
      /\b(pools? of blood|blood-soaked|blood-spattered|covered in blood|dismember\w*|mutilat\w*|decapitat\w*|disembowel\w*|entrails|gore|gaping wounds?|stab wounds?|autopsy (?:found|showed|revealed))\b/g,
    );
    const clicheOpener =
      /^[^\n.]{0,80}(?:\bwas born (?:on|in)\b|\bit was a (?:dark|cold|quiet|cool|warm|rainy|stormy|typical|normal|ordinary)\b|\bon what (?:seemed|began|started)\b)/i.test(
        text.trim(),
      );
    const repeatedStarts = this.getRepeatedParagraphStarts(text);

    if (wordCount > 700 && headingCount < 2) {
      issues.push({
        issue: 'few section headings',
        instruction:
          'Add the section headings from the outline so the chapter feels edited and easy to follow.',
      });
    }

    if (paragraphs.length > 10 && yearCount < 4) {
      issues.push({
        issue: 'weak timeline anchors',
        instruction:
          'Anchor the narrative in time: add years or dates wherever the record supports them, so readers always know when events happen. Do not invent dates — leave a year out if you are not confident of it.',
      });
    }

    if (longQuoteCount >= 2) {
      issues.push({
        issue: 'long direct quotations (fabrication and copyright risk)',
        instruction:
          'Turn every long quotation into attributed paraphrase in your own sentence structure ("a witness testified that..."). Keep at most a short, exact phrase from the court record or an official statement, and nothing from any book, article, show or podcast.',
      });
    }

    if (privateThoughtCount >= 3) {
      issues.push({
        issue: 'narrates private thoughts and feelings',
        instruction:
          'Remove inner thoughts and feelings nobody could have reported, or attribute them to the person\'s own public account ("he later testified that he felt...").',
      });
    }

    if (noteLikeCount >= 5) {
      issues.push({
        issue: 'content looks like notes or an outline',
        instruction:
          'Convert note-like bullets and fragments into finished narrative prose, keeping only polished headings.',
      });
    }

    if (genericPhraseCount >= 3) {
      issues.push({
        issue: 'cliched true crime phrasing',
        instruction:
          'Replace stock phrases with specific evidence: a document, a decision, a result, a consequence.',
      });
    }

    if (sensationalCount >= 2) {
      issues.push({
        issue: 'sensational wording',
        instruction:
          'Remove tabloid words and labels for people. Describe what is documented in plain language and let the facts carry the weight.',
      });
    }

    if (graphicCount >= 2) {
      issues.push({
        issue: 'graphic detail',
        instruction:
          'State the official finding once, plainly, and remove injury and crime-scene description the story does not strictly need.',
      });
    }

    if (clicheOpener) {
      issues.push({
        issue: 'opens on a stock line',
        instruction:
          'Open on a specific, documented moment or detail instead of a birth-date sentence or a scene-setting cliche.',
      });
    }

    if (repeatedStarts.length > 0) {
      issues.push({
        issue: `repeated paragraph starts: ${repeatedStarts.join(', ')}`,
        instruction:
          'Rewrite paragraph openings so the chapter sounds edited by a human, not generated from a template.',
      });
    }

    return issues;
  }

  private buildRefinementContextBlock(
    heading: string,
    refinementContext?: RefinementContext,
  ): string {
    if (!refinementContext?.bookTitle && !refinementContext?.bookSubtitle) {
      return '';
    }

    return `
${heading}
${refinementContext.bookTitle ? `Title: "${refinementContext.bookTitle}"` : ''}
${refinementContext.bookSubtitle ? `Subtitle: "${refinementContext.bookSubtitle}"` : ''}
${refinementContext.chapterTitle ? `Chapter: "${refinementContext.chapterTitle}"` : ''}
${refinementContext.chapterOutline ? `Chapter outline: ${JSON.stringify(refinementContext.chapterOutline, null, 2)}` : ''}

${this.buildBookPromise(refinementContext.bookTitle || '', refinementContext.bookSubtitle || '', refinementContext.brief)}
${this.buildCaseQualityRules()}
`;
  }

  private getAuthenticityRewritePrompt(
    text: string,
    issues: AuthenticityIssue[],
    refinementContext?: RefinementContext,
  ): string {
    const issueList = issues
      .map(
        (issue, index) => `${index + 1}. ${issue.issue}: ${issue.instruction}`,
      )
      .join('\n');

    const mainChapterDepthInstruction = refinementContext?.isMainChapter
      ? `
MAIN CHAPTER DEPTH TO PRESERVE:
${this.buildMainChapterDepthRules()}
- Do not shorten the chapter during this final pass, except to remove invented or unsupported material.
`
      : '';

    return `You are doing the final editor and legal-read pass on a true crime chapter before publication.

The chapter still has these problems:
${issueList}

${this.buildRefinementContextBlock('BOOK CONTEXT:', refinementContext)}
${mainChapterDepthInstruction}

${TRUE_CRIME_FACT_RULES}

${TRUE_CRIME_FAIRNESS_RULES}

${TRUE_CRIME_DIGNITY_RULES}

${TRUE_CRIME_COPYRIGHT_RULES}

EDITORIAL REQUIREMENTS:
- Make it read like a chapter of a careful, published true crime book.
- Keep the documented facts already present, but remove filler, repetition, note-like fragments, sensational wording and anything that reads as invented.
- Do not add new facts in this pass unless you are confident they are part of the documented record.
- Use clear headings where helpful, but do not turn the chapter into bullet notes.
- Keep the final chapter in plain English: common words, clear sentences, no jargon, no fancy phrasing.
- Return only the finished chapter text.

CHAPTER TO FIX:
${text}`;
  }

  private async enforceCaseAuthenticity(
    text: string,
    systemPrompt?: string,
    refinementContext?: RefinementContext,
  ): Promise<string> {
    const issues = this.getCaseAuthenticityIssues(text);

    if (issues.length === 0) {
      return text;
    }

    this.logger.warn(
      `Book authenticity audit found ${issues.length} issue(s): ${issues
        .map((issue) => issue.issue)
        .join('; ')}`,
    );

    const rewritePrompt = this.getAuthenticityRewritePrompt(
      text,
      issues,
      refinementContext,
    );
    const rewritten = await this.generateWithProviderRotation(
      rewritePrompt,
      systemPrompt,
    );

    return this.humanizeText(rewritten);
  }

  // ═══════════════════════════════════════════════════════════════
  // Multi-turn refinement — draft, fact/voice critique, audit
  // ═══════════════════════════════════════════════════════════════
  private async generateAndRefine(
    prompt: string,
    systemPrompt?: string,
    refinementContext?: RefinementContext,
  ): Promise<string> {
    const draft = await this.generateWithProviderRotation(prompt, systemPrompt);

    const refined = await this.generateWithProviderRotation(
      this.getCaseRefinePrompt(draft, refinementContext),
      systemPrompt,
    );

    return await this.enforceCaseAuthenticity(
      this.humanizeText(refined),
      systemPrompt,
      refinementContext,
    );
  }

  private getCaseRefinePrompt(
    draft: string,
    refinementContext?: RefinementContext,
  ): string {
    const mainChapterDepthInstruction = refinementContext?.isMainChapter
      ? `
MAIN CHAPTER DEPTH TO PRESERVE:
${this.buildMainChapterDepthRules()}
- During this rewrite, do not shorten the chapter except to remove invented or unsupported material.
`
      : '';

    return `Here is a draft true crime chapter you wrote. Rewrite it to fix these specific issues:

1. FACT CHECK FIRST: Remove or hedge any claim you are not confident is documented. Delete invented quotes, dialogue, inner thoughts and scenes nobody could have witnessed; turn uncertain quotes into attributed paraphrase. Where accounts differ, say so once, plainly.
2. LEGAL READ: Check every statement about a real person. Nobody is described as having committed a crime unless convicted or a guilty plea stands. Keep each person's exact status (suspected, charged, acquitted, cleared, exonerated). Remove any theory of your own, and any hint of guilt created by questions or by where a name is placed. Remove any claim of misconduct not found by a court or official review.
3. ORIGINALITY AND COPYRIGHT: Rewrite any passage that sounds like Wikipedia, a news story, a podcast, a documentary or another true crime book. Every sentence must be original phrasing. Remove any dialogue or reconstructed scene that comes from another author's telling. Remove all lyrics and poetry, and cut any quotation longer than a short, exact phrase from the court record or an official statement. Remove any quotation from a book, article, show or podcast. Check that the headings and paragraph order don't follow a stock "The Crime / The Investigation / The Trial / The Aftermath" template or the order of any earlier work — the structure should come from this case and this outline.
4. DIGNITY AND SAFETY: Cut gore, injury detail and any description of sexual acts. Cut anything that blames the person harmed or admires an offender. Cut home addresses and anything that could help someone find a living private person. Cut any detail that could work as instructions for committing a crime or avoiding detection.
5. Replace sensational wording ("chilling", "monster", "shocked the nation") with specific evidence: a document, a decision, a result, a reaction, a consequence.
6. Vary sentence length aggressively — mix short, plain sentences with longer narrative ones; no two consecutive sentences with the same rhythm.
7. Make sure no two consecutive paragraphs start with the same word or the same structure.
8. Keep the timeline clear: dates where the record supports them, and explicit time jumps.
9. Preserve the case, angle and promise from the title/subtitle — every paragraph should serve this story.
10. Turn note-like passages into finished narrative prose with the section headings from the outline.
11. VOICE CHECK: It should read like a careful writer telling a true story — not a tabloid, not a police report, not a podcast script. Remove any claim that the writer attended, interviewed, visited or personally investigated anything.

${this.buildRefinementContextBlock('BOOK CONTEXT TO PRESERVE:', refinementContext)}
${mainChapterDepthInstruction}

DRAFT TO REWRITE:
${draft}

Return ONLY the rewritten text. No commentary.`;
  }

  async generateText(
    prompt: string,
    {
      refine = false,
      systemPrompt,
      refinementContext,
    }: {
      refine?: boolean;
      systemPrompt?: string;
      refinementContext?: RefinementContext;
    } = {},
  ): Promise<string> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        this.logger.log(
          `Generating book content (attempt ${attempt}/${this.MAX_RETRIES})...`,
        );

        let text: string;

        if (refine) {
          text = await this.generateAndRefine(
            prompt,
            systemPrompt,
            refinementContext,
          );
        } else {
          text = await this.generateWithProviderRotation(prompt, systemPrompt);
          text = this.humanizeText(text);
        }

        this.logger.log('Content generated successfully');
        return text;
      } catch (error: any) {
        lastError = error;
        const isTransientError =
          this.isNetworkError(error) ||
          this.isOverloadError(error) ||
          this.isRateLimitError(error);

        if (isTransientError) {
          if (attempt < this.MAX_RETRIES) {
            const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            this.logger.warn(
              `All providers temporarily unavailable (attempt ${attempt}/${this.MAX_RETRIES}). Retrying in ${delay}ms...`,
            );
            await this.sleep(delay);
            continue;
          }
        }

        this.logger.error('Error generating content:', error);
        throw error;
      }
    }

    this.logger.error(`All ${this.MAX_RETRIES} retry attempts failed`);
    throw lastError;
  }

  // ═══════════════════════════════════════════════════════════════
  // BOOK OUTLINE — the arc of a case
  // ═══════════════════════════════════════════════════════════════
  async generateBookOutline(
    title: string,
    subtitle: string,
    numberOfChapters: number,
    brief: CaseBrief,
  ): Promise<BookOutlineDto> {
    this.logger.log(
      `Generating book outline for "${title}" (case: ${brief.subject})`,
    );

    const outlineSystemPrompt =
      'You are a book editor specializing in narrative true crime, careful about accuracy, fairness and original structure. Return only one valid JSON object. No markdown, no backticks, no comments, no ellipses, no placeholders, no explanation.';

    // Split large outlines into two halves to stay within token limits
    const useChunkedGeneration = numberOfChapters > 8;
    const MAX_OUTLINE_ATTEMPTS = 3;

    if (useChunkedGeneration) {
      return await this.generateBookOutlineChunked(
        title,
        subtitle,
        numberOfChapters,
        brief,
        outlineSystemPrompt,
      );
    }

    // ── Single-pass generation for ≤8 chapters ──────────────────
    const prompt = this.buildOutlinePrompt(
      title,
      subtitle,
      numberOfChapters,
      1,
      numberOfChapters,
      brief,
    );

    for (let attempt = 1; attempt <= MAX_OUTLINE_ATTEMPTS; attempt++) {
      this.logger.log(
        `Generating book outline (attempt ${attempt}/${MAX_OUTLINE_ATTEMPTS})...`,
      );

      const response = await this.generateOutlineJson(
        prompt,
        outlineSystemPrompt,
      );

      const outline = this.parseAndValidateOutline(
        response,
        numberOfChapters,
        attempt,
        MAX_OUTLINE_ATTEMPTS,
      );

      if (outline) {
        return { title, subtitle, author: '', chapters: outline.chapters };
      }

      if (attempt < MAX_OUTLINE_ATTEMPTS) {
        this.logger.warn(
          `Outline attempt ${attempt} failed. Retrying in 3s...`,
        );
        await this.sleep(3000);
      }
    }

    throw new Error(
      `Failed to generate a valid book outline after ${MAX_OUTLINE_ATTEMPTS} attempts`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CHUNKED GENERATION — For books with >8 chapters
  // Splits into ranges, and recursively shrinks failed ranges.
  // Later ranges see the chapters already planned so the timeline
  // continues instead of restarting.
  // ═══════════════════════════════════════════════════════════════
  private async generateBookOutlineChunked(
    title: string,
    subtitle: string,
    numberOfChapters: number,
    brief: CaseBrief,
    outlineSystemPrompt: string,
  ): Promise<BookOutlineDto> {
    const half = Math.ceil(numberOfChapters / 2);

    this.logger.log(
      `Outline too large (${numberOfChapters} chapters) — generating in two chunks: [1-${half}] and [${half + 1}-${numberOfChapters}]`,
    );

    const chunk1Chapters = await this.generateOutlineRange(
      title,
      subtitle,
      numberOfChapters,
      1,
      half,
      brief,
      outlineSystemPrompt,
      [],
    );

    const chunk2Chapters = await this.generateOutlineRange(
      title,
      subtitle,
      numberOfChapters,
      half + 1,
      numberOfChapters,
      brief,
      outlineSystemPrompt,
      chunk1Chapters,
    );

    // ── Merge chunks and fix chapter numbers ─────────────────────
    const allChapters: ChapterOutline[] = [
      ...chunk1Chapters,
      ...chunk2Chapters,
    ].map((chapter, idx) => ({
      ...chapter,
      chapterNumber: idx + 1,
    }));

    this.logger.log(
      `Outline chunks merged successfully: ${allChapters.length} chapters total`,
    );

    return { title, subtitle, author: '', chapters: allChapters };
  }

  private async generateOutlineRange(
    title: string,
    subtitle: string,
    totalChapters: number,
    fromChapter: number,
    toChapter: number,
    brief: CaseBrief,
    outlineSystemPrompt: string,
    previousChapters: ChapterOutline[],
  ): Promise<ChapterOutline[]> {
    const chapterCount = toChapter - fromChapter + 1;
    const MAX_OUTLINE_ATTEMPTS = 3;
    const prompt = this.buildOutlinePrompt(
      title,
      subtitle,
      totalChapters,
      fromChapter,
      toChapter,
      brief,
      previousChapters,
    );

    for (let attempt = 1; attempt <= MAX_OUTLINE_ATTEMPTS; attempt++) {
      this.logger.log(
        `Generating outline chapters ${fromChapter}-${toChapter}, attempt ${attempt}/${MAX_OUTLINE_ATTEMPTS}...`,
      );

      const response = await this.generateOutlineJson(
        prompt,
        outlineSystemPrompt,
      );

      const parsed = this.parseAndValidateOutline(
        response,
        chapterCount,
        attempt,
        MAX_OUTLINE_ATTEMPTS,
      );

      if (parsed) {
        return parsed.chapters;
      }

      if (attempt < MAX_OUTLINE_ATTEMPTS) {
        await this.sleep(3000);
      }
    }

    if (chapterCount > 1) {
      const midpoint = Math.floor((fromChapter + toChapter) / 2);
      this.logger.warn(
        `Outline chapters ${fromChapter}-${toChapter} failed as one range; splitting into ${fromChapter}-${midpoint} and ${midpoint + 1}-${toChapter}`,
      );

      const first = await this.generateOutlineRange(
        title,
        subtitle,
        totalChapters,
        fromChapter,
        midpoint,
        brief,
        outlineSystemPrompt,
        previousChapters,
      );
      const second = await this.generateOutlineRange(
        title,
        subtitle,
        totalChapters,
        midpoint + 1,
        toChapter,
        brief,
        outlineSystemPrompt,
        [...previousChapters, ...first],
      );
      return [...first, ...second];
    }

    throw new Error(
      `Failed to generate outline chapter ${fromChapter} after all attempts`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // PROMPT BUILDER — Generates prompt for a specific chapter range
  // ═══════════════════════════════════════════════════════════════
  private buildOutlinePrompt(
    title: string,
    subtitle: string,
    totalChapters: number,
    fromChapter: number,
    toChapter: number,
    brief: CaseBrief,
    previousChapters: ChapterOutline[] = [],
  ): string {
    const chapterCount = toChapter - fromChapter + 1;
    const isFirstChunk = fromChapter === 1;
    const isLastChunk = toChapter === totalChapters;
    const isFullOutline = isFirstChunk && isLastChunk;

    let chapterRules = '';

    if (isFullOutline) {
      chapterRules = `
3. Chapter 1: Introduction — what this case is, who was harmed and why it is worth understanding, built around one documented moment that is not an act of violence
4. Chapters 2-${totalChapters - 1}: The case, in time order
5. Chapter ${totalChapters}: Conclusion — where the case stands, what was and wasn't settled, and what it changed`;
    } else if (isFirstChunk) {
      chapterRules = `
3. Chapter 1: Introduction — what this case is, who was harmed and why it is worth understanding, built around one documented moment that is not an act of violence
4. Chapters 2-${toChapter}: The case, in time order (first half of the book: the background and events onward)
NOTE: This is the FIRST HALF of a ${totalChapters}-chapter book. Do NOT include a conclusion chapter here, and do not cover the later stages of the case yet.`;
    } else if (isLastChunk) {
      chapterRules = `
3. Chapters ${fromChapter}-${toChapter - 1}: The case, continuing in time order from where the earlier chapters stop
4. Chapter ${toChapter}: Conclusion — where the case stands, what was and wasn't settled, and what it changed
NOTE: This is the SECOND HALF of a ${totalChapters}-chapter book. Number chapters starting from ${fromChapter}.`;
    } else {
      chapterRules = `
3. Chapters ${fromChapter}-${toChapter}: The case, continuing in time order
NOTE: This is a middle section of a ${totalChapters}-chapter book. Number chapters starting from ${fromChapter}.`;
    }

    const style = this.styleFor(brief, title, subtitle);

    const alreadyPlanned = previousChapters.length
      ? `
CHAPTERS ALREADY PLANNED (continue the timeline from here — do not repeat these periods or events):
${previousChapters
  .map((c) => `- Chapter ${c.chapterNumber}: ${c.chapterTitle}`)
  .join('\n')}
`
      : '';

    return `Create a detailed outline for chapters ${fromChapter} through ${toChapter} of a true crime book about ${brief.subject}.

Book Title: "${title}"
Subtitle: "${subtitle}"
Total book length: ${totalChapters} chapters
Generate: EXACTLY ${chapterCount} chapters (chapters ${fromChapter}-${toChapter})

${this.buildBookPromise(title, subtitle, brief)}
${alreadyPlanned}
${TRUE_CRIME_FACT_RULES}

${TRUE_CRIME_FAIRNESS_RULES}

${TRUE_CRIME_DIGNITY_RULES}

${TRUE_CRIME_COPYRIGHT_RULES}

THIS BOOK'S SHAPE: ${style.architecture.outline}
HEADING STYLE for section titles: ${style.headingStyle}

REQUIREMENTS:
1. Generate EXACTLY ${chapterCount} chapters
2. Number chapters from ${fromChapter} to ${toChapter}${chapterRules}
6. Each chapter should have 2 to 5 sections (vary it — not every chapter needs the same count)
7. Each section should have 2 to 4 subsections (vary these too)
8. Every subsection must be a non-empty string — no blank entries
9. Section and subsection titles should sound like a human wrote them — no generic filler
10. Case chapters follow the case in time order. Each covers a distinct stage or turning point — for example the people and place before it happened, how it came to light, the first days of the investigation, leads and dead ends, arrests and charges, court proceedings, verdicts and appeals, what it did to the people and community around it, and later developments — chosen and named to fit this particular case. Include only the stages this case really had: an unsolved case gets no invented arrest or trial. No overlaps, no repeats.
11. Do not use bare generic chapter titles like "The Crime", "The Investigation", "The Trial" or "The Aftermath". Name the place, document, decision, date or question. Do not reuse chapter titles from any existing book, documentary or podcast about this case.
12. Plan chapters, sections and subsections only around events you are confident are documented, or that appear in the author notes. Do not plan sections around events you are unsure happened.
13. No title may state or imply that someone is guilty unless they were convicted. No title may dwell on violence, a body or a victim's suffering, or use a sensational nickname as a hook.
14. Give at least one early section to the person or people harmed as people, if the record allows it. Do not plan any section around the details of violence, a sexual crime or an offender's methods.
15. If the case is open or still in the courts, the last case chapter covers the most recent documented stage "as of this writing".
16. If the subtitle promises an angle, era or count, honor it clearly across the chapters without padding or duplicate ideas.
17. Use plain English for all titles, sections, and subsections: common words, direct phrasing, no jargon

BAD chapter/section titles (too generic or too lurid):
- "The Crime"
- "The Investigation"
- "A Monster Among Them"
- "The Final Moments"

GOOD chapter/section titles (specific, but only when true for this case):
- "The Car on the Service Road"
- "Forty Hours Without a Call"
- "The Receipt Nobody Checked"
- "What the Jury Never Heard"

JSON RULES:
- Return one complete JSON object and nothing else
- Do not include comments, markdown, backticks, notes, or explanations
- Do not use ellipses, "omitted", "as above", "continue similarly", or placeholder chapters
- Every chapter, section, and subsection must be fully written out

OUTPUT FORMAT (JSON):
{
  "chapters": [
    {
      "chapterNumber": ${fromChapter},
      "chapterTitle": "A specific chapter title",
      "sections": [
        {
          "sectionTitle": "A specific interesting title",
          "subsections": ["Concrete topic 1", "Concrete topic 2", "Concrete topic 3"]
        }
      ]
    }
  ]
}

Generate ALL ${chapterCount} chapters (${fromChapter} through ${toChapter}). CRITICAL: Return valid JSON only. Use double quotes for all strings. No single quotes, no trailing commas, no markdown.`;
  }

  // ═══════════════════════════════════════════════════════════════
  // JSON PARSER — Tries clean parse, then repair, then partial salvage
  // ═══════════════════════════════════════════════════════════════
  private parseAndValidateOutline(
    response: string,
    expectedChapters: number,
    attempt: number,
    maxAttempts: number,
  ): { chapters: ChapterOutline[] } | null {
    const cleaned = this.extractLikelyJson(response);

    // ── Attempt 1: clean parse ────────────────────────────────────
    let outline = this.tryParseJson(cleaned);

    // ── Attempt 2: repair truncated JSON ─────────────────────────
    if (!outline) {
      this.logger.warn(
        `Attempt ${attempt}: Clean JSON parse failed — trying repair...`,
      );
      outline = this.tryRepairJson(cleaned);
    }

    if (!outline) {
      this.logger.error(
        `Attempt ${attempt}/${maxAttempts}: Could not parse or repair outline JSON. ` +
          `Response tail: ...${cleaned.slice(-200)}`,
      );
      return null;
    }

    if (!outline.chapters || !Array.isArray(outline.chapters)) {
      this.logger.error(
        `Attempt ${attempt}/${maxAttempts}: Outline missing chapters array`,
      );
      return null;
    }

    if (this.containsOutlinePlaceholders(outline)) {
      this.logger.error(
        `Attempt ${attempt}/${maxAttempts}: Outline contains placeholder or editorial text`,
      );
      return null;
    }

    // ── Chapter count check ───────────────────────────────────────
    if (outline.chapters.length < expectedChapters) {
      this.logger.warn(
        `Attempt ${attempt}/${maxAttempts}: Got ${outline.chapters.length} chapters, expected ${expectedChapters}`,
      );
      // Only hard-fail on last attempt — partial outlines on early attempts → retry
      if (attempt === maxAttempts) {
        throw new Error(
          `AI generated only ${outline.chapters.length} chapters instead of ${expectedChapters} after ${maxAttempts} attempts`,
        );
      }
      return null;
    }

    // Trim if too many chapters came back
    if (outline.chapters.length > expectedChapters) {
      this.logger.warn(
        `Got ${outline.chapters.length} chapters, trimming to ${expectedChapters}`,
      );
      outline.chapters = outline.chapters.slice(0, expectedChapters);
    }

    // ── Structural validation + auto-repair ──────────────────────
    outline.chapters.forEach((chapter: ChapterOutline, idx: number) => {
      // Auto-repair missing sections array
      if (!chapter.sections || !Array.isArray(chapter.sections)) {
        this.logger.warn(
          `Chapter ${idx + 1} missing sections — inserting placeholder`,
        );
        chapter.sections = [
          {
            sectionTitle: chapter.chapterTitle || 'Overview',
            subsections: ['Introduction'],
          },
        ];
      }

      chapter.sections.forEach((section: any, secIdx: number) => {
        // Auto-repair missing or malformed subsections
        if (!section.subsections || !Array.isArray(section.subsections)) {
          if (
            typeof section.subsections === 'string' &&
            section.subsections.trim()
          ) {
            // Model returned a string instead of array — wrap it
            this.logger.warn(
              `Chapter ${idx + 1}, Section ${secIdx + 1} subsections is a string — wrapping in array`,
            );
            section.subsections = [section.subsections.trim()];
          } else {
            // Missing entirely — fall back to section title
            this.logger.warn(
              `Chapter ${idx + 1}, Section ${secIdx + 1} missing subsections — using section title as fallback`,
            );
            section.subsections = [section.sectionTitle || 'Overview'];
          }
        }

        // Filter out blank subsections (model sometimes emits "")
        section.subsections = section.subsections.filter(
          (s: any) => typeof s === 'string' && s.trim().length > 0,
        );

        // Still empty after filtering — use section title
        if (section.subsections.length === 0) {
          this.logger.warn(
            `Chapter ${idx + 1}, Section ${secIdx + 1} has no valid subsections after filtering — using section title as fallback`,
          );
          section.subsections = [section.sectionTitle || 'Overview'];
        }
      });
    });

    return outline;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS — JSON parse + repair
  // ═══════════════════════════════════════════════════════════════
  private tryParseJson(raw: string): any | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private extractLikelyJson(response: string): string {
    const withoutFences = response
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();
    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return withoutFences.slice(firstBrace, lastBrace + 1).trim();
    }

    return withoutFences;
  }

  private containsOutlinePlaceholders(outline: any): boolean {
    const serialized = JSON.stringify(outline).toLowerCase();
    return /\b(omitted|as above|same as above|continue similarly|continued similarly|placeholder|proceeding accordingly|filling in chapters?|chapter \d+ would|would be complete|to be filled|todo|tbd)\b|\.\.\./i.test(
      serialized,
    );
  }

  private tryRepairJson(raw: string): any | null {
    try {
      // Remove trailing commas before ] or }
      let repaired = this.normalizeSingleQuotes(raw);

      repaired = repaired
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      repaired = repaired.replace(/,\s*([}\]])/g, '$1');

      // Close any unclosed strings (truncation mid-string)
      // Count unmatched quotes — if odd, the string was cut off; close it
      const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        repaired = repaired.trimEnd() + '"';
      }

      // Close unclosed arrays and objects by tracking the stack
      const stack: string[] = [];
      let inString = false;
      let escape = false;

      for (const ch of repaired) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\' && inString) {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (ch === '{' || ch === '[') stack.push(ch);
        if (ch === '}' || ch === ']') stack.pop();
      }

      // Close open structures in reverse order
      for (const open of [...stack].reverse()) {
        repaired += open === '{' ? '}' : ']';
      }

      const result = JSON.parse(repaired);
      this.logger.warn('JSON repair succeeded — response was truncated');
      return result;
    } catch {
      return null;
    }
  }

  // New helper to add
  private normalizeSingleQuotes(raw: string): string {
    // Replace single-quoted keys and values with double-quoted ones
    // Handles: 'key': 'value', 'key': ['val1', 'val2']
    // Does NOT touch apostrophes inside words (e.g., "don't", "Albania's")
    return (
      raw
        // Keys: 'word' followed by : → "word":
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '"$1":')
        // Values: : 'value' or , 'value' or [ 'value'
        .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"')
        .replace(/,\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ', "$1"')
        .replace(/\[\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, '["$1"')
    );
  }

  private stripMetaCommentary(text: string): string {
    const metaPatterns = [
      /^here'?s?\s+(?:the\s+)?(?:revised|rewritten|updated|edited|final|complete)\s+chapter[^:\n]*:\s*/im,
      /^here\s+is\s+(?:the\s+)?(?:revised|rewritten|updated|edited|final|complete)\s+chapter[^:\n]*:\s*/im,
      /^(?:revised|rewritten|updated|edited|final)\s+chapter[^:\n]*:\s*/im,
      /^ready\s+for\s+publication[^:\n]*:\s*/im,
      /^here'?s?\s+the\s+introduction[^:\n]*:\s*/im,
      /^here'?s?\s+your[^:\n]*:\s*/im,
      /^the\s+following\s+is[^:\n]*:\s*/im,
    ];

    let result = text.trim();
    for (const pattern of metaPatterns) {
      result = result.replace(pattern, '').trim();
    }

    // Also strip a repeated chapter title if it appears as the very first line
    // before any real paragraph content (bold heading leak)
    result = result.replace(/^#{1,6}\s+.+\n+/m, '').trim();

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // INTRODUCTION — why this case matters
  // ═══════════════════════════════════════════════════════════════
  async generateIntroduction(
    title: string,
    subtitle: string,
    outline: BookOutlineDto,
    brief: CaseBrief,
  ): Promise<string> {
    const introChapter = outline.chapters.find((c) => c.chapterNumber === 1);

    if (!introChapter) {
      throw new Error('Introduction chapter not found in outline');
    }

    const result = await this.generateText(
      this.buildIntroPrompt(title, subtitle, introChapter, outline, brief),
      {
        refine: true,
        systemPrompt: this.getSystemPrompt(brief, title, subtitle),
        refinementContext: {
          bookTitle: title,
          bookSubtitle: subtitle,
          chapterTitle: introChapter.chapterTitle,
          chapterOutline: introChapter,
          brief,
        },
      },
    );

    return this.stripMetaCommentary(result);
  }

  private buildIntroPrompt(
    title: string,
    subtitle: string,
    introChapter: ChapterOutline,
    outline: BookOutlineDto,
    brief: CaseBrief,
  ): string {
    const style = this.styleFor(brief, title, subtitle);

    return `Write the complete Introduction chapter for this true crime book about ${brief.subject}:

Title: "${title}"
Subtitle: "${subtitle}"

${this.buildBookPromise(title, subtitle, brief)}
${this.buildCaseQualityRules()}

Chapter Structure:
${JSON.stringify(introChapter, null, 2)}

The rest of the book (so you can set it up without repeating it):
${outline.chapters
  .slice(1)
  .map((c) => `- Chapter ${c.chapterNumber}: ${c.chapterTitle}`)
  .join('\n')}

STRUCTURE:
- Write 15-20 paragraphs covering all sections and subsections from the outline
- Vary paragraph length: some short (2 sentences), some longer (4-5 sentences)
- How to open: ${style.openingMove} Whatever you open on must be documented — not an act of violence, not a body, not a list of shocking facts
- This book's shape: ${style.architecture.intro}
- Raise the book's question (see BOOK CONTEXT) in your own words, early on. Don't answer it yet.
- Explain why this case is worth understanding, what the book's angle is (from the title/subtitle), and who was harmed
- Include one short, honest paragraph on sources: this is an independent account built from the public record, such as court records, official statements and reporting; where accounts differ, the text says so; and it makes no accusation beyond what the record shows. Do not name specific sources unless you are certain they exist. Do not claim any interviews or private access.
- Stay in the third person. Do not describe the writer's own experience of the case.
- Close with forward momentum into the next chapter, without a fake cliffhanger
- Do not summarize every chapter; set up the story instead

SENTENCE RHYTHM (critical for sounding human):
- Mix short sentences (4-8 words) with medium (12-18 words) and occasional long (20-25 words)
- Never start 3+ consecutive sentences the same way
- Use a fragment now and then where it lands well

VOICE EXAMPLE (an invented case — copy the rhythm and the way in, never the facts):
"""
${style.voiceExample}
"""

Write in plain English the complete Introduction chapter now.
Return ONLY the chapter text. Do NOT include any preamble, meta-commentary, or phrases like "Here's the revised chapter" or "Here's the introduction". Do NOT restate the chapter title as a heading at the start. Begin directly with the opening moment.`;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHAPTER CONTENT — each book rotates through its own formats
  // ═══════════════════════════════════════════════════════════════
  async generateChapterContent(
    chapterOutline: ChapterOutline,
    bookTitle: string,
    bookSubtitle: string,
    brief: CaseBrief,
    outline?: BookOutlineDto,
  ): Promise<string> {
    const format = formatForChapter(
      this.styleFor(brief, bookTitle, bookSubtitle),
      chapterOutline.chapterNumber,
    );
    this.logger.log(
      `Generating chapter ${chapterOutline.chapterNumber} with format: ${format.id}`,
    );

    return await this.generateText(
      this.buildChapterPrompt(
        chapterOutline,
        bookTitle,
        bookSubtitle,
        format.instructions,
        brief,
        outline,
      ),
      {
        refine: true,
        systemPrompt: this.getSystemPrompt(brief, bookTitle, bookSubtitle),
        refinementContext: {
          bookTitle,
          bookSubtitle,
          chapterTitle: chapterOutline.chapterTitle,
          chapterOutline,
          isMainChapter: true,
          brief,
        },
      },
    );
  }

  private buildChapterPrompt(
    chapterOutline: ChapterOutline,
    bookTitle: string,
    bookSubtitle: string,
    formatInstructions: string,
    brief: CaseBrief,
    outline?: BookOutlineDto,
  ): string {
    const previous = outline?.chapters.find(
      (c) => c.chapterNumber === chapterOutline.chapterNumber - 1,
    );
    const next = outline?.chapters.find(
      (c) => c.chapterNumber === chapterOutline.chapterNumber + 1,
    );
    const placement =
      previous || next
        ? `
WHERE THIS CHAPTER SITS:
${previous ? `- Previous chapter: "${previous.chapterTitle}" (already written — pick up from where it ends, don't retell it)` : ''}
${next ? `- Next chapter: "${next.chapterTitle}" (don't cover its events here)` : ''}
`
        : '';

    return `Write Chapter ${chapterOutline.chapterNumber}: "${chapterOutline.chapterTitle}" for the true crime book "${bookTitle}${bookSubtitle ? `: ${bookSubtitle}` : ''}" about ${brief.subject}, IN PLAIN ENGLISH.

${this.buildBookPromise(bookTitle, bookSubtitle, brief)}
${this.buildMainChapterDepthRules()}

Chapter Structure:
${JSON.stringify(chapterOutline, null, 2)}
${placement}
PURPOSE: This is narrative true crime. Every paragraph should move the story of the case forward or help the reader understand the people and the process.

${formatInstructions}

${this.getChapterSharedRules()}

Write in plain English the complete chapter now:`;
  }

  private getChapterSharedRules(): string {
    return `
${this.buildCaseQualityRules()}

TRUE CRIME CONTENT RULES (apply regardless of format):
- Every section needs: what happened, when, where, who was involved in what role, how we know, and what came next
- Explain police, forensic and legal terms in plain words so a newcomer understands why they mattered, without detail anyone could use to copy a crime
- Include mistakes, disputes and open questions from this stage where documented; this book is neither a tribute to the police nor an attack on them
- Keep the people harmed present as people, not as plot devices
- Use attributed paraphrase for what people said; direct quotes only under the COPYRIGHT rules
- Tie the chapter back to the book's angle from the title/subtitle at least once
- Make time jumps explicit
- Use the section headings from the outline. The chapter should feel edited, coherent and ready to publish.

${TRUE_CRIME_COPYRIGHT_RULES}

WHAT TO AVOID:
- Don't list facts like a police report — tell what happened and why it mattered
- Don't moralize, and don't turn paragraphs into tributes
- Don't foreshadow with clichés ("little did she know", "it was only the beginning") or end sections on fake cliffhangers
- Don't start more than two paragraphs in a row with the same person's name or "He"/"She"/"They"
- Don't summarize sections or telegraph what's coming next
- Don't end paragraphs with vague statements about tragedy or evil
- Don't use difficult words when simple ones will do — "use" not "utilize", "fix" not "ameliorate"`;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONCLUSION — where the case stands, plus a case timeline
  // ═══════════════════════════════════════════════════════════════
  async generateConclusion(
    title: string,
    subtitle: string,
    outline: BookOutlineDto,
    brief: CaseBrief,
  ): Promise<string> {
    const conclusionChapter = outline.chapters.find(
      (c) => c.chapterNumber === outline.chapters.length,
    );

    if (!conclusionChapter) {
      throw new Error('Conclusion chapter not found in outline');
    }

    return await this.generateText(
      this.buildConclusionPrompt(title, subtitle, conclusionChapter, brief),
      {
        refine: true,
        systemPrompt: this.getSystemPrompt(brief, title, subtitle),
        refinementContext: {
          bookTitle: title,
          bookSubtitle: subtitle,
          chapterTitle: conclusionChapter.chapterTitle,
          chapterOutline: conclusionChapter,
          brief,
        },
      },
    );
  }

  private buildConclusionPrompt(
    title: string,
    subtitle: string,
    conclusionChapter: ChapterOutline,
    brief: CaseBrief,
  ): string {
    const style = this.styleFor(brief, title, subtitle);

    return `Write in plain English the Conclusion chapter for this true crime book about ${brief.subject}:

Title: "${title}"
Subtitle: "${subtitle}"

${this.buildBookPromise(title, subtitle, brief)}
${this.buildCaseQualityRules()}

Chapter Structure:
${JSON.stringify(conclusionChapter, null, 2)}

PURPOSE: Step back from the timeline and weigh the case. What was firmly established, what remains open, what changed because of it, and how it has been remembered. This is an honest assessment, not a verdict of your own.

STRUCTURE:
- 15-20 paragraphs of narrative covering all sections and subsections, then the CASE TIMELINE reference below
- Open with a specific, documented image or fact that sums up the case — not "In conclusion", and not the crime itself
- This book's shape: ${style.architecture.conclusion}
- Answer the book's question (see BOOK CONTEXT) as far as the record allows, using what the chapters showed. If the record doesn't settle it, say so.
- How to close: ${style.closingMove}
- Cover lasting effects with concrete examples (a law, a procedure, a review, an institution) rather than claims of importance
- State each person's final legal status plainly, as far as you know it
- Do not solve the case. If it is unsolved or disputed, do not suggest who is responsible or which side is right beyond what a court decided
- Give the last word to the facts or to the people harmed, as they chose to be remembered in public — never to the offender
- If the case is open or still in the courts, describe where things stand "as of this writing" without predicting the outcome
- Close the narrative with a short final paragraph (2-3 sentences) — clear-eyed, not sentimental

CASE TIMELINE (after the narrative, under the heading "Case Timeline"):
- A simple list of 10-20 important events in time order, one per line, formatted "YEAR — event"
- Only include events and years you are confident are documented; leave out anything uncertain rather than guessing
- Use the same careful language about legal status as the rest of the book, with no violent detail
- Lists are allowed here; this is the reference section of the book

WHAT TO AVOID:
- Don't open with "In conclusion", "As we come to the end" or "Looking back"
- Don't retell the book chapter by chapter
- Don't end with "justice was served", "may they rest in peace", "finally found closure" or similar stock lines
- Don't say how the families feel now unless they have said so publicly
- Don't invent statistics, tributes, memorials or quotes
- Don't use difficult words when simple ones will do

Write the complete Conclusion chapter now:`;
  }

  // ═══════════════════════════════════════════════════════════════
  // ABOUT BOOK
  // ═══════════════════════════════════════════════════════════════
  async generateAboutBook(
    title: string,
    subtitle: string,
    brief: CaseBrief,
  ): Promise<string> {
    const prompt = `Write an "About This Book" blurb for a true crime book about ${brief.subject} titled "${title}"${subtitle ? ` with the subtitle "${subtitle}"` : ''}.

${this.buildBookPromise(title, subtitle, brief)}
${TRUE_CRIME_FAIRNESS_RULES}

${TRUE_CRIME_COPYRIGHT_RULES}

${PLAIN_LANGUAGE_RULES}

4-6 short paragraphs. NO generic phrases like "gripping true story", "you won't believe", "the definitive account" or "everything you need to know". NO sensational hooks, and no violent detail.

Instead, be specific about:
- The angle this book takes and the part of the case it gives the most weight to
- Who will get the most out of it (readers new to the case? readers interested in how courts or investigations work? readers interested in the era?)
- One honest limitation: this is an independent account drawn from the public record — it is not authorized by anyone involved, doesn't claim private access or interviews, and doesn't name anyone as responsible beyond what the courts decided
- How it's organized (the story told in order, with a case timeline at the end)

Do not invent quotes, sources or endorsements. Do not compare it to any other book, show or podcast.

Tone: confident, direct, respectful. Like a back-cover blurb written by the writer, not a marketer.`;

    return await this.generateText(prompt, {
      refine: false,
      systemPrompt: this.getSystemPrompt(brief, title, subtitle),
    });
  }
}
