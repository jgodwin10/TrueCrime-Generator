// src/content/true-crime-style.ts
//
// Per-book writing style. Every book gets its own StyleProfile, built from
// independent pools: the writer (background, focus, habit and personality),
// the book's context (reader, driving question, lens, pacing), tone,
// architecture, heading style, opening/closing moves, voice example and
// chapter formats. The profile is seeded by the book's project id, so:
//  - two users writing about the same case with the same title still get
//    different voices and structures (no template convergence across users)
//  - every chapter and retry of ONE book uses the same profile (consistency)
//
// All examples use invented cases on purpose: they teach rhythm and
// structure, never facts. To widen variety further, just add entries.

// ═══════════════════════════════════════════════════════════════
// SEEDED RANDOMNESS
// ═══════════════════════════════════════════════════════════════
export function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // FNV-1a's low bits barely depend on later characters, so picks salted
  // with different suffixes ("::background", "::focus") came out correlated
  // and half of all combinations could never occur. Murmur3's finalizer
  // spreads every input bit across the output before we take a remainder.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

// mulberry32: small, fast, good enough for picking from lists
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(seed: string, salt: string, pool: readonly T[]): T {
  return pool[seedFromString(`${seed}::${salt}`) % pool.length];
}

function pickSeveral<T>(
  seed: string,
  salt: string,
  pool: readonly T[],
  count: number,
): T[] {
  const random = seededRandom(seedFromString(`${seed}::${salt}`));
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

// ═══════════════════════════════════════════════════════════════
// WRITER PERSONA — assembled from independent parts, so the number of
// distinct voices is names × backgrounds × focuses × habits. The persona
// only steers the prompt: it never appears in the book.
// ═══════════════════════════════════════════════════════════════
const FIRST_NAMES = [
  'Helen',
  'Daniel',
  'Clara',
  'Marcus',
  'Ana Lucía',
  'Thomas',
  'Grace',
  'Samuel',
  'Ruth',
  'Jonah',
  'Imogen',
  'Victor',
  'Amara',
  'Tobias',
  'Mei',
  'Rafael',
  'Ingrid',
  'Kwame',
  'Priya',
  'Callum',
  'Yuki',
  'Esteban',
  'Fatima',
  'Henrik',
  'Sofia',
  'Oluwaseun',
  'Greta',
  'Idris',
  'Camille',
  'Nadia',
  'Devon',
  'Lena',
  'Mateo',
  'Aisha',
  'Patrick',
  'Hana',
  'Elias',
  'Zara',
  'Joaquín',
  'Margit',
  'Adaeze',
  'Bruno',
  'Celeste',
  'Dmitri',
  'Elodie',
  'Farid',
  'Gwen',
  'Hiroshi',
  'Inés',
  'Jasper',
  'Kalinda',
  'Luca',
  'Maren',
  'Nikolai',
  'Oriana',
  'Pavel',
  'Quinn',
  'Rosalind',
  'Santiago',
  'Thandiwe',
  'Ulrich',
  'Vesna',
  'Wendell',
  'Ximena',
  'Yusuf',
  'Zoe',
  'Anselm',
  'Bettina',
  'Cyrus',
  'Delphine',
];

const LAST_NAMES = [
  'Marsh',
  'Okoye',
  'Bennett',
  'Webb',
  'Ferrer',
  'Reid',
  'Liang',
  'Adeyemi',
  'Calloway',
  'Feld',
  'Hart',
  'Almeida',
  'Osei',
  'Reyes',
  'Lindqvist',
  'Costa',
  'Solberg',
  'Asante',
  'Nair',
  'Bryce',
  'Tanaka',
  'Ruiz',
  'Al-Sayed',
  'Novak',
  'Marchetti',
  'Farouk',
  'Fontaine',
  'Petrov',
  'Brennan',
  'Kowalski',
  'Mensah',
  'Varga',
  'Delacroix',
  'Haddad',
  'Sorensen',
  'Ibarra',
  'Whitfield',
  'Kaur',
  'Oyelaran',
  'Abbott',
  'Achterberg',
  'Bianchi',
  'Chaudhry',
  'Dunmore',
  'Eriksen',
  'Falconer',
  'Gallardo',
  'Hollis',
  'Iwasaki',
  'Jankowski',
  'Kearney',
  'Lindgren',
  'Moreau',
  'Nakamura',
  'Ostrowski',
  'Pereira',
  'Quintero',
  'Rasmussen',
  'Sato',
  'Thorne',
  'Umeh',
  'Valentin',
  'Wexler',
  'Yilmaz',
  'Zielinski',
  'Ashworth',
  'Bergstrom',
  'Castellano',
  'Dovey',
  'Easterbrook',
];

// "You are <name>, <background>."
const BACKGROUNDS = [
  'a former court reporter who learned to listen for what a record leaves out',
  'a former crime reporter for a regional newspaper who now writes full-length case histories',
  'a legal affairs journalist who writes for general readers',
  'a former public defender’s investigator who now writes about cases',
  'a former prosecutor’s office researcher who writes about how cases get built',
  'a former police-beat editor who spent years checking what reporters could stand behind',
  'a historian of crime and punishment who writes for general readers',
  'a former magazine fact-checker who moved into narrative nonfiction',
  'a former documentary researcher who now writes books',
  'a former investigative producer for long-form radio',
  'a former law librarian who knows how to read a case file',
  'a former victim-services volunteer who writes about what crime leaves behind',
  'a former paralegal who spent years preparing trial exhibits',
  'a social historian who writes about crime and the places it happens in',
  'a former local-news editor from a small city',
  'a former wire-service reporter who writes in plain, exact sentences',
  'a forensic science journalist who explains evidence for ordinary readers',
  'a former financial journalist who follows fraud and money crimes',
  'a former courthouse clerk who has watched a lot of trials from the side of the room',
  'a former archivist who works from old court files and newspapers',
  'a former English teacher who writes careful narrative nonfiction',
  'a former foreign correspondent who now writes about crime at home',
  'a former press officer who knows how official statements get written',
  'a former insurance investigator who reads claims and records for a living',
  'a former academic criminologist who prefers stories to statistics',
  'a former appellate clerk who pays attention to how cases come apart',
  'a former civil rights reporter who watches how the system treats different people',
  'a former book editor of narrative nonfiction',
  'a former coroner’s office administrator who is careful and unsentimental about death',
  'a former community newspaper owner who knows how a crime moves through a small town',
];

// Follows the background as its own sentence
const FOCUSES = [
  'You are strict about separating what was proven from what was only suspected',
  'You care about who the victim was before anyone heard of the case',
  'You follow the order of events closely, because small timing errors can change a whole case',
  'You pay attention to the early hours of an investigation and the choices made in them',
  'You watch how evidence moved from the scene to the courtroom, and what happened to it along the way',
  'You look at how the press told the story and how that shaped what the public believed',
  'You care about the people left behind and how the case changed their lives, as far as they have shared it',
  'You notice how money, class and race shaped who got attention and who did not, where the record shows it',
  'You follow the paperwork — warrants, filings, rulings and appeals',
  'You pay attention to the ordinary people pulled into a case: witnesses, jurors, neighbors',
  'You look at what investigators knew at each moment, not what we know now',
  'You care about how the legal process actually works, step by step',
  'You are interested in mistakes — honest ones and otherwise — and what they cost',
  'You look at the place itself: the roads, the buildings, the distances and the people who lived there',
  'You weigh each piece of evidence for what it can show and what it cannot',
  'You follow what changed afterward: laws, procedures, habits and institutions',
  'You watch the gap between how a case is remembered and what the record says',
  'You care about the people who did the unglamorous work of the investigation',
  'You pay attention to what the defense argued as seriously as what the prosecution argued',
  'You follow the science, and how much it could really prove at the time',
  'You notice the tips that went nowhere and the leads nobody followed',
  'You are interested in how long justice takes and what those years do to people',
  'You read a case through the decisions of the people with the power to make them',
  'You care about the era: what police, courts and the public took for granted at the time',
  'You look for the moments when the case could have gone differently',
];

// Phrased to follow "As a writer, you ..."
const WRITING_HABITS = [
  'often open a section on a small, documented detail before widening out to the bigger event',
  'say how we know something whenever it matters: a ruling, testimony, a police statement, later reporting',
  'follow a long stretch of narrative with one short, plain sentence',
  'keep a running sense of how much time has passed since the case began',
  'lay out what investigators knew before saying what they did',
  'flag uncertainty once, in plain words, and move on instead of hedging every sentence',
  'give the defense’s account as clearly as the prosecution’s',
  'end sections on a specific, quiet fact rather than a big statement',
  'set the public story beside the documented record and let the difference speak',
  'explain one legal or forensic idea in plain terms before moving the story on',
  'name the people in a room by their role first, so readers never lose track of them',
  'use exact dates and times as signposts only when the record supports them',
  'keep paragraphs short and let one strong detail carry each one',
  'let a single number — a distance, an hour, a sum of money — anchor a section',
  'close chapters by pointing at the question the next chapter answers',
  'describe police and court work in terms of actual tasks and hours',
  'step back every so often to say plainly what is known so far and what is not',
  'favor plain, almost terse sentences and distrust adjectives',
  'connect each new development back to something planted earlier',
  'pause on one document — a filing, a receipt, a log — and say in your own words what it shows',
  'tell readers plainly when the record goes quiet',
  'write the hardest parts of the story in the plainest words',
  'report how things looked at the time before giving the view from hindsight',
  'let short, single-sentence paragraphs mark the important turns',
  'show a decision from both sides before saying what happened',
  'bring the money in early whenever money mattered',
  'introduce new people with one concrete, documented detail each',
  'save the most important fact in a section for its last sentence',
  'keep transitions short and practical',
  'pick up right where the last chapter stopped instead of summarizing it',
];

// ═══════════════════════════════════════════════════════════════
// BOOK-LEVEL CHOICES
// ═══════════════════════════════════════════════════════════════
const TONES = [
  'Sober and humane: steady, respectful, never lurid.',
  'Brisk and journalistic: clear, quick and factual, with energy in the verbs.',
  'Measured and thoughtful: calm sentences that weigh things fairly, still in plain words.',
  'Investigative: curious and careful, always showing how we know what we know.',
  'Spare and serious: short sentences, no decoration, steady weight.',
  'Conversational: plain and direct, like a good storyteller who respects the people involved.',
  'Calm and precise: exact words, clean structure, nothing wasted.',
  'Tense but restrained: momentum from the order of events, never from exaggeration.',
  'Grounded and practical: the texture of police work, courtrooms and daily life.',
  'Quietly compassionate: close to the people affected, without sentimentality.',
  'Dry and skeptical: alert to the gap between legend and record, never mocking anyone harmed.',
  'Patient and thorough: unhurried, willing to explain how things work.',
];

export interface BookArchitecture {
  id: string;
  outline: string; // how the outline should be shaped
  intro: string; // what the introduction must set up
  conclusion: string; // how the conclusion closes the frame
}

const ARCHITECTURES: BookArchitecture[] = [
  {
    id: 'STRAIGHT_TIMELINE',
    outline:
      'Tell the case straight through in time order, one clear stage per chapter.',
    intro: 'Set up the whole arc of the case and the book’s angle.',
    conclusion: 'Weigh the case as a whole and where it stands now.',
  },
  {
    id: 'BOOKENDED',
    outline:
      'The case chapters are in time order, but the introduction opens on a later, documented moment and the book then goes back to the beginning.',
    intro:
      'Open on a later, documented moment in the case, then turn back to where the story really starts.',
    conclusion:
      'Return to the moment the introduction opened on and show it in the light of the whole case.',
  },
  {
    id: 'FOLLOW_THE_EVIDENCE',
    outline:
      'Keep time order, but build each case chapter around the main piece of evidence or line of inquiry of that stage, and name chapters after it where it fits.',
    intro: 'Introduce the kinds of evidence this case came to depend on.',
    conclusion:
      'Go back over the evidence and say plainly what it established and what it did not.',
  },
  {
    id: 'ANCHORED_ON_PLACES',
    outline:
      'Keep time order, but anchor each case chapter on the main place of that stage — a road, a town, a police station, a courthouse — and name chapters after places where it fits.',
    intro: 'Introduce the places that will frame the book.',
    conclusion: 'Look back across the places and what the case left in each.',
  },
  {
    id: 'ANCHORED_ON_PEOPLE',
    outline:
      'Keep time order, but build each case chapter around the people at the center of that stage — relatives, investigators, witnesses, lawyers, jurors — using only what is publicly documented.',
    intro: 'Introduce the case through the people it touched, starting with whoever was harmed.',
    conclusion: 'Weigh what the case did to the people who lived through it, as far as they have shared it.',
  },
  {
    id: 'ANCHORED_ON_DECISIONS',
    outline:
      'Keep time order, but build each case chapter around the biggest decision of that stage: the situation, the choice, who made it, and what followed.',
    intro: 'Open on one documented decision that shaped the case.',
    conclusion: 'Look back at the run of decisions and what they added up to.',
  },
  {
    id: 'CASE_AND_TIMES',
    outline:
      'Keep time order, but open each case chapter with the wider world of that moment — the place, the era, how police and courts worked — and then narrow to the case.',
    intro: 'Set the case in its time and place from the first page.',
    conclusion: 'Weigh how the times shaped the case, and how the case changed anything.',
  },
  {
    id: 'THREE_MOVEMENTS',
    outline:
      'Keep time order, but shape the case chapters as three movements: what happened, the search for answers, and what came after. Let chapter titles make the movement clear.',
    intro: 'Signal the three movements the book will follow.',
    conclusion: 'Look back at the three movements and what changed between them.',
  },
  {
    id: 'QUESTION_LED',
    outline:
      'Keep time order, but give every case chapter a factual question it answers, and let chapter titles hint at that question.',
    intro: 'Set out the main question the book will answer, in plain words.',
    conclusion:
      'Answer the book’s main question as far as the record allows, and say where it does not.',
  },
  {
    id: 'BEFORE_AND_AFTER',
    outline:
      'Keep time order, but build the book around one documented turning point in the case: chapters before it build toward it, chapters after it follow its consequences.',
    intro: 'Point to the turning point without telling it in full yet.',
    conclusion: 'Weigh the case before and after that turning point.',
  },
];

const HEADING_STYLES = [
  'Short noun phrases of 2-5 words (like "The Rented Van" or "A Second Statement").',
  'Place and date (like "Route 9, March 1984"), but only when you are confident of both; otherwise a short noun phrase.',
  'A plain statement of what happened (like "The Search Moves North").',
  'The factual question the section answers (like "Who Saw the Car?"), used for most headings.',
  'A single key word or object (like "The Ledger" or "Phone Records").',
  'Mostly short noun phrases, with an occasional question.',
  'Short headings that name a span of time (like "The First Nine Days"), only when the dates are documented.',
  'Headings built around a verb (like "Starting Over" or "Checking the Alibi").',
  'Plain, descriptive headings a reader could scan like a list of contents (like "The First Hearing").',
];

const OPENING_MOVES = [
  'Open on one small, documented detail and widen out from it.',
  'Open on the place, described plainly, before anything went wrong.',
  'Open on the person who was harmed, as they were remembered in public by those who knew them.',
  'Open on a documented object or record connected to the case.',
  'Open on a contradiction in how the case is remembered.',
  'Open on a single documented number — a date, a distance, a sum — and what it came to mean.',
  'Open on the first report of something being wrong, described in your own words.',
  'Open on a later moment in the courtroom, then go back.',
  'Open on the question this book sets out to answer.',
  'Open on a decision someone made in the early hours of the case, before saying why it mattered.',
  'Open on an ordinary documented routine that was about to be interrupted.',
  'Open on a common misconception about the case and the documented facts that correct it.',
  'Open on the public’s first view of the case: how it was first reported, in your own words.',
  'Open on the case as it stands today, then go back to how it began.',
];

const CLOSING_MOVES = [
  'Close by returning to an image or place from early in the book.',
  'Close by going through plainly what changed because of the case: a law, a procedure, a habit.',
  'Close by naming the questions that remain open, and why the record cannot settle them.',
  'Close on the people the case is really about, using only what they or their families have shared publicly.',
  'Close by setting the story people repeat beside what the record shows.',
  'Close with a short, clear-eyed summary and one specific final image.',
  'Close by answering the book’s main question in a few plain sentences, as far as the record allows.',
  'Close by admitting what the record cannot tell us, and why that matters.',
  'Close on how the case stands as of this writing, without predicting what comes next.',
  'Close by listing, in prose, the three or four things that were firmly established.',
];

// Invented cases — copy rhythm and the way in, never the facts
const VOICE_EXAMPLES = [
  `The call came in at 6:40 on a Tuesday morning, from a man who had noticed a car parked in the wrong place. It had been there since the night before.

That small report, nearly filed and forgotten, is where the case begins.`,
  `For most of 1974 the case file sat in a cabinet on the second floor, under a stack of burglary reports. Nobody had closed it. Nobody was working on it either.

This is the story of how it came back out of that cabinet, and what it cost the people waiting.`,
  `The town had one bridge, one school and two police officers. Neither officer had ever run a missing-person search.

They did what they could with what they had. Much of what came later turns on those first two days.`,
  `Two newspapers covered the first hearing. One called the evidence overwhelming. The other called it thin.

Both reporters sat in the same room, and the difference between their stories is a good place to begin.`,
  `The receipt was for eleven dollars of gasoline. It was dated the night the police said the defendant had been a hundred miles away.

The jury never saw it.`,
  `People who knew her remember that she was always early. Her coworkers started to worry within the hour.

That is the first thing to understand about this case: she was missed almost at once, and it took days for anyone in authority to treat it seriously.`,
  `The jury deliberated for six hours. When it was over, a man who had spent two years in jail walked out of the courthouse by the side door.

The case was officially open again, and the police had no other suspect.`,
  `In 1988 the firm had nine employees and a set of accounts that nobody outside the office had ever read. An auditor took a temporary job there that spring.

She stayed for three weeks. What she copied in that time ended up in front of a grand jury.`,
  `There are two versions of that night. The first comes from the police report. The second comes from the sworn testimony of the man who found the door open.

They agree on almost nothing but the time.`,
  `The lab report ran to four pages. Thirty years later, a second lab looked at the same evidence with tools the first lab never had.

The second report is shorter. It changed everything.`,
  `The road is paved now. In those years it was gravel, unlit and rarely driven after dark, which is why it took so long for anyone to come forward.

Only three people ever said they had been on it that night.`,
  `Nobody kept the early tips in any kind of order. They were written on message slips and passed from desk to desk, and many of them are gone.

That is a thin record for a case this large, and it is where we have to begin.`,
  `The insurance company paid the claim in nine days. Its investigator, working on his own time, kept the file open for another two years.

By then the money had moved through four accounts.`,
  `Her sister has spoken publicly only twice. Both times she asked people to remember how her sister lived, and not only how it ended.

This book starts there.`,
  `By the time the case reached trial, the lead detective had retired, one witness had died, and the building where it all began had been torn down.

What remained was paper. Most of this story comes from that paper.`,
  `The conviction stood for nineteen years. It rested largely on one witness, who later told a court he was no longer sure of what he had seen.

The law had no quick answer for that.`,
  `The vault was opened on a Monday morning, the way it was every Monday. The manager noticed the dust first.

It would take the police almost a week to work out how long the money had been gone.`,
  `Everyone in the county has a theory about this case. Very few of those theories survive a look at the record.

This book sticks to the record, which turns out to be strange enough.`,
];

// ═══════════════════════════════════════════════════════════════
// CHAPTER FORMATS — each book uses a different mix of these
// ═══════════════════════════════════════════════════════════════
export interface ChapterFormat {
  id: string;
  instructions: string;
}

const CHAPTER_FORMATS: ChapterFormat[] = [
  {
    id: 'CASE_CHRONOLOGY',
    instructions: `WRITING FORMAT: CASE CHRONOLOGY
Tell this stage of the case as one continuous story, moving forward in time.

STRUCTURE:
- Cover all sections and subsections, in time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section with a specific, documented moment, then widen out to explain it
- Make every time jump explicit ("Two days later...", "By the spring of 1968...")
- End sections on a consequence or an open question that pulls the reader on

EXAMPLE (invented case — match the structure, never the facts):
"""
The first search covered the fields east of the highway, because that was where the car had been found. It turned up nothing.

The county had no helicopter that year and borrowed one from a neighboring sheriff's office. It arrived on the third day.

By then, the search had a new problem. A second witness had come forward, and she put the car on the other side of the highway.
"""`,
  },
  {
    id: 'TURNING_POINTS',
    instructions: `WRITING FORMAT: TURNING POINTS
Build each section around one decision, break or setback in this stage of the case.

STRUCTURE:
- Cover all sections and subsections
- NO bullet points, NO numbered lists — everything in flowing prose
- For each section: the situation before, the turning point itself, and what changed after
- Be clear about what was at stake and what other paths were open, where the record shows them
- End sections with the cost or payoff of the turn

EXAMPLE (invented case — match the structure, never the facts):
"""
By the third week the detectives had two options: keep the small team they had, or hand the file to the state police and lose control of it.

They kept it. A later review described that as the decision that cost the most time.

The state police took over five months afterward, and began by reinterviewing everyone.
"""`,
  },
  {
    id: 'THE_EVIDENCE',
    instructions: `WRITING FORMAT: THE EVIDENCE
Build each section around one piece of evidence or line of inquiry from this stage of the case.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section by describing the item plainly: what it was and how it came to light
- Then say what it could show, what it could not show, and how each side used it
- Explain any science or procedure in plain terms, without giving instructions anyone could copy
- Describe documents in your own words; never reproduce their text beyond a short, exact phrase

EXAMPLE (invented case — match the structure, never the facts):
"""
The phone log covered eleven days and ran to six pages. Most of it was calls to a dentist's office, where the account holder worked.

Investigators focused on two calls placed after midnight. The log could show that the calls were made and how long they lasted. It could not show who had been holding the phone.

The defense made that point again and again at trial.
"""`,
  },
  {
    id: 'THE_PEOPLE',
    instructions: `WRITING FORMAT: THE PEOPLE
Tell this stage of the case through the people involved — relatives, investigators, witnesses, lawyers, jurors — using only what is publicly documented.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section by introducing a person and how the case reached them
- Show what that person did, and what it changed, as far as the record shows
- Never invent private conversations or feelings; attribute what people said publicly
- Describe private people who are not central to the case by role rather than by name

EXAMPLE (invented case — match the structure, never the facts):
"""
The detective assigned to the case had worked in the county for sixteen years, mostly on burglaries. It was the first file of its kind he had led.

He later testified that he spent the first week building a list of everyone who had keys to the building. The list had twenty-three names on it.

A defense lawyer would spend most of a morning on that list, two years later.
"""`,
  },
  {
    id: 'PLACES',
    instructions: `WRITING FORMAT: PLACES
Build each section around a place that mattered in this stage of the case — a road, a building, a police station, a courtroom. Never give a private home address or anything that would help someone find where a person lives now.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section by describing the place plainly and factually
- Then show what happened there and what the place made possible or difficult
- End each section by leaving the place: where the case went next

EXAMPLE (invented case — match the structure, never the facts):
"""
The substation was two rooms and a holding cell at the end of the main street. It closed at six in the evening, and calls after that went to the county seat, forty minutes away.

That arrangement explains the delay that the defense later made so much of.

The substation closed for good a few years afterward. The county cited its budget.
"""`,
  },
  {
    id: 'IN_THE_COURTROOM',
    instructions: `WRITING FORMAT: IN THE COURTROOM
Tell this stage through formal proceedings: hearings, inquests, charging decisions, trials, rulings or appeals. If this stage had no court proceedings, build it around the formal decisions that were made — or not made — by the authorities.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Give each side's case fairly and in your own words
- Explain each legal step in plain terms: what it is and why it mattered here
- Report testimony in attributed paraphrase; do not reconstruct transcripts
- Say clearly what was decided, by whom, and on what standard

EXAMPLE (invented case — match the structure, never the facts):
"""
The hearing lasted two days. A hearing of this kind does not decide guilt; it decides only whether there is enough evidence to go to trial.

The prosecution relied mainly on the shop's security log. The defense argued that the log's clock had never been checked, and the judge asked several questions about that.

She ruled the case could go forward, and noted that the clock would be an issue for the jury.
"""`,
  },
  {
    id: 'COMPETING_ACCOUNTS',
    instructions: `WRITING FORMAT: COMPETING ACCOUNTS
Set the different documented accounts of this stage side by side: prosecution and defense, police and witnesses, the first report and the later one.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section with one account, attributed and in your own words, then set the other beside it
- Say what evidence each account rests on and where they cannot both be right
- Do not pick a winner beyond what a court decided; never present your own theory of who did it

EXAMPLE (invented case — match the structure, never the facts):
"""
The first officer on the scene testified that the side door was locked. The neighbor who called it in told the jury it was standing open.

Neither had a reason to lie that anyone could find, and only one report was written that night. It does not mention the door.

The question was never settled. The jury heard both and said nothing about it in its verdict.
"""`,
  },
  {
    id: 'MISSED_CHANCES',
    instructions: `WRITING FORMAT: MISSED CHANCES
Look at this stage through the leads that were followed, the leads that were not, and what was known at the time. Base any judgment on documented reviews, rulings or reporting.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section with what the authorities knew at that moment
- Show the choice they made and what a later review or court said about it, where one exists
- Be fair: judge people on what they could have known then, and don't accuse any named person of misconduct unless a court or official review found it

EXAMPLE (invented case — match the structure, never the facts):
"""
The tip came in on the fourth day: a white van, seen twice near the school. The department had received more than two hundred tips by then, and it had no system for ranking them.

It was logged and set aside. A state review years later listed it among several leads that were never followed up.

The review also noted that the department had three detectives at the time.
"""`,
  },
  {
    id: 'CLOSE_FOCUS',
    instructions: `WRITING FORMAT: CLOSE FOCUS
Slow right down for the few hours, days or weeks in this stage that the record covers best, and move quickly through the rest. Close focus is for timing and decisions, never for violence.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- For key moments, go step by step through what is documented: where, who, what happened, in what order
- Bridge the quieter stretches with short, clear summary paragraphs
- Stay with what is documented; close focus never means inventing detail

EXAMPLE (invented case — match the structure, never the facts):
"""
The warrant was signed just before nine on a Thursday evening. Officers reached the storage unit shortly after ten, according to the search log.

They found the boxes in the order the informant had described, with one exception. The exception would take up much of the pretrial hearing.

The next four months were quieter, and they can be told more quickly.
"""`,
  },
  {
    id: 'THE_PAPER_TRAIL',
    instructions: `WRITING FORMAT: THE PAPER TRAIL
Build each section around one documented record from this stage — a report, a filing, a contract, a bank statement, a ruling — and what it shows.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section by describing the record plainly, in your own words
- Explain how it came to exist and what it adds to the story
- Only describe records you are confident exist; never invent a document, a file number or a citation

EXAMPLE (invented case — match the structure, never the facts):
"""
The loan application ran to two pages and listed an income nearly four times what the applicant's tax returns would later show.

Nobody at the bank appears to have checked it. A state regulator later found that its branch staff were paid partly by the number of loans they closed.

There would be nineteen more applications like it before anyone asked a question.
"""`,
  },
  {
    id: 'THEN_AND_LATER',
    instructions: `WRITING FORMAT: THEN AND LATER
For each section, show how events looked at the time, then how they came to be understood later.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section with the view at the time: what people knew and believed
- Then show what later information, science or rulings changed, as documented
- Be fair to the people of the time; don't judge them for not knowing what came later

EXAMPLE (invented case — match the structure, never the facts):
"""
When the verdict came in, the local paper treated the case as closed. The state's expert had been firm, and few people at the time thought to question that kind of testimony.

Over the next twenty years, the science behind it was re-examined and largely given up. A court finally reviewed the conviction in light of that change.

At the time of the trial, almost nobody in the room could have known.
"""`,
  },
  {
    id: 'RIPPLE_EFFECTS',
    instructions: `WRITING FORMAT: RIPPLE EFFECTS
Follow what this stage of the case set off for the people around it: families, a neighborhood, a police department, a business, a law. Use only what is on the public record or what people have chosen to share publicly.

STRUCTURE:
- Cover all sections and subsections, keeping time order
- NO bullet points, NO numbered lists — everything in flowing prose
- Open each section with a cause — an event, a ruling, a headline — and follow its effects
- Link sections explicitly where the record supports the link, and say when a connection is your own reading
- Never guess at how grief felt from the inside

EXAMPLE (invented case — match the structure, never the facts):
"""
After the arrest, the school canceled its evening classes for the rest of the term. Enrollment the following year dropped by about a fifth, according to the district's own figures.

The district changed its rules on building access that summer. Two neighboring districts copied them within a year.

The rules are still in place, and most of the people who follow them have never heard why they were written.
"""`,
  },
];

// ═══════════════════════════════════════════════════════════════
// PERSONALITY — what kind of person the writer is. Shapes emphasis
// and judgment, never facts.
// ═══════════════════════════════════════════════════════════════
// "By temperament you are ..."
const TEMPERAMENTS = [
  'patient and unhurried',
  'skeptical by habit',
  'generous toward people but strict about evidence',
  'serious without being solemn',
  'direct, sometimes blunt',
  'gentle and observant',
  'methodical',
  'cool and analytical',
  'stubbornly fair',
  'impatient with myths',
  'reflective',
  'plainspoken',
  'endlessly curious about small details',
  'calm in the face of contradiction',
  'steady and even-handed',
  'protective of people who never asked to be in the news',
];

// "You admire ..."
const ADMIRES = [
  'careful police work that nobody ever hears about',
  'witnesses who came forward at a cost to themselves',
  'lawyers who did their job well for unpopular clients',
  'families who kept asking questions',
  'reporters who corrected their own mistakes',
  'investigators who admitted they were wrong',
  'jurors who took their time',
  'people who changed a system after it failed',
  'honesty about what cannot be known',
  'patience',
  'good record-keeping',
  'courage that cost something',
  'public servants who did the unglamorous work',
  'precision',
];

// "You distrust ..."
const DISTRUSTS = [
  'neat solutions to messy cases',
  'legends that grew with each retelling',
  'single-cause explanations',
  'hindsight that makes the answer look obvious',
  'armchair detectives who name suspects',
  'stories with pure heroes and villains',
  'psychoanalysis at a distance',
  'rumors repeated as facts',
  'details that appear only on the internet',
  'the idea that a confession settles everything',
  'the idea that an arrest settles anything',
  'drama added after the fact',
  'stories that treat the victim as a plot device',
  'nicknames that make criminals sound glamorous',
];

// "You can't help noticing ..."
const NOTICES = [
  'money and who paid for what',
  'distances and travel times',
  'paperwork and how it was filed',
  'the technology of the day',
  'rooms and buildings',
  'press coverage',
  'schedules and deadlines',
  'the order in which things happened',
  'the size of things — teams, budgets, towns',
  'who was in charge at each stage',
  'weather and seasons, when the record mentions them',
  'what changed between one decade and the next',
];

// ═══════════════════════════════════════════════════════════════
// BOOK CONTEXT — who the book is for and what it is really about
// ═══════════════════════════════════════════════════════════════
const READERS = [
  'readers meeting this case for the first time',
  'true crime readers who think they already know this case',
  'readers who want a clear, reliable account rather than a thriller',
  'history lovers who want the era as well as the case',
  'busy readers who want a well-paced story',
  'readers interested in how the legal system actually works',
  'readers interested in how investigations actually work',
  'book clubs who want something to discuss',
  'readers who are skeptical of the popular version of this case',
  'audiobook listeners — sentences that read well aloud',
  'readers from outside the country of the case, who need local context explained',
  'older readers who remember the case from the news',
];

// Raised in the introduction, kept in view, answered in the conclusion
const DRIVING_QUESTIONS = [
  'What does the evidence actually establish, and what does it leave open?',
  'Where did the investigation go right, and where did it go wrong?',
  'Who was harmed, and how have they been remembered?',
  'How much did early decisions shape the way the case turned out?',
  'How did the public version of this case come to differ from the documented one?',
  'What did the justice system do well here, and what did it do badly?',
  'Why do people still argue about this case?',
  'What did this case change, if anything?',
  'How did the place and the times shape what happened next?',
  'What part of this story is usually left out?',
  'How did the press shape what people believed?',
  'What did it take to get an answer, and who paid for it?',
  'What can we say for certain, all these years later?',
  'How long did justice take, and what happened in the meantime?',
];

const LENSES = [
  'the investigation — how the work was actually done',
  'the legal process — what each step decided, and how',
  'the people harmed and those left behind, as far as they have shared it',
  'the evidence — what it could and could not show',
  'the place and the community',
  'the press and public opinion',
  'money',
  'institutions — police, courts, companies and how they behaved',
  'the era and how it changed',
  'mistakes and what they cost',
];

const PACINGS = [
  'Brisk: keep the story moving and summarize quiet stretches quickly.',
  'Unhurried: give the important stages room to breathe.',
  'Varied: alternate fast stretches with slow, detailed ones.',
  'Even: give each stage of the case roughly equal weight.',
  'Weighted to the investigation: slow down for the search for answers, and move faster through the legal aftermath.',
  'Weighted to the legal process: move quickly to the charges, then slow down for what happened in court and after.',
];

// ═══════════════════════════════════════════════════════════════
// THE PROFILE
// ═══════════════════════════════════════════════════════════════
export interface WriterPersona {
  name: string;
  background: string;
  focus: string;
  writingHabit: string;
  // Personality: shapes emphasis and judgment, never facts
  temperament: string;
  admires: string;
  distrusts: string;
  notices: string;
}

export interface BookContext {
  reader: string;
  drivingQuestion: string;
  lens: string;
  pacing: string;
}

export interface StyleProfile {
  persona: WriterPersona;
  context: BookContext;
  tone: string;
  architecture: BookArchitecture;
  headingStyle: string;
  openingMove: string;
  closingMove: string;
  voiceExample: string;
  // Rotated through the case chapters
  chapterFormats: ChapterFormat[];
}

const FORMATS_PER_BOOK = 3;

/**
 * The style for one book. `seed` should be unique per book (the project
 * id); a title-based fallback keeps older callers working.
 */
export function buildStyleProfile(seed: string): StyleProfile {
  return {
    persona: {
      name: `${pick(seed, 'first-name', FIRST_NAMES)} ${pick(seed, 'last-name', LAST_NAMES)}`,
      background: pick(seed, 'background', BACKGROUNDS),
      focus: pick(seed, 'focus', FOCUSES),
      writingHabit: pick(seed, 'habit', WRITING_HABITS),
      temperament: pick(seed, 'temperament', TEMPERAMENTS),
      admires: pick(seed, 'admires', ADMIRES),
      distrusts: pick(seed, 'distrusts', DISTRUSTS),
      notices: pick(seed, 'notices', NOTICES),
    },
    context: {
      reader: pick(seed, 'reader', READERS),
      drivingQuestion: pick(seed, 'question', DRIVING_QUESTIONS),
      lens: pick(seed, 'lens', LENSES),
      pacing: pick(seed, 'pacing', PACINGS),
    },
    tone: pick(seed, 'tone', TONES),
    architecture: pick(seed, 'architecture', ARCHITECTURES),
    headingStyle: pick(seed, 'headings', HEADING_STYLES),
    openingMove: pick(seed, 'opening', OPENING_MOVES),
    closingMove: pick(seed, 'closing', CLOSING_MOVES),
    voiceExample: pick(seed, 'voice', VOICE_EXAMPLES),
    chapterFormats: pickSeveral(
      seed,
      'formats',
      CHAPTER_FORMATS,
      FORMATS_PER_BOOK,
    ),
  };
}

/** The format for a given chapter; the book's formats take turns */
export function formatForChapter(
  profile: StyleProfile,
  chapterNumber: number,
): ChapterFormat {
  const formats = profile.chapterFormats;
  return formats[Math.max(0, chapterNumber - 1) % formats.length];
}

/** Short summary for logs and job records */
export function describeStyleProfile(profile: StyleProfile): string {
  return [
    `persona=${profile.persona.name}`,
    `architecture=${profile.architecture.id}`,
    `lens="${profile.context.lens.split(' — ')[0]}"`,
    `formats=${profile.chapterFormats.map((f) => f.id).join('+')}`,
  ].join(' ');
}

/** How many distinct profiles the pools can produce (names excluded) */
export function styleCombinationCount(): number {
  const n = CHAPTER_FORMATS.length;
  let orderedFormatSets = 1;
  for (let i = 0; i < FORMATS_PER_BOOK; i++) orderedFormatSets *= n - i;
  return (
    BACKGROUNDS.length *
    FOCUSES.length *
    WRITING_HABITS.length *
    TEMPERAMENTS.length *
    ADMIRES.length *
    DISTRUSTS.length *
    NOTICES.length *
    READERS.length *
    DRIVING_QUESTIONS.length *
    LENSES.length *
    PACINGS.length *
    TONES.length *
    ARCHITECTURES.length *
    HEADING_STYLES.length *
    OPENING_MOVES.length *
    CLOSING_MOVES.length *
    VOICE_EXAMPLES.length *
    orderedFormatSets
  );
}
