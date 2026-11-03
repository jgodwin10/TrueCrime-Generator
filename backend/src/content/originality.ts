// src/content/originality.ts
//
// A real check to go with the prompt rules: compares each chapter word by word
// against the pages the research read, earlier chapters of this book, and other
// books on the same case. It can only see those texts, so it doesn't replace a
// plagiarism checker that searches the wider web.
import { seedFromString } from './true-crime-style';

const SHINGLE_WORDS = 8;
// Shorter runs are mostly stock legal phrases ("sentenced to life in prison")
export const MIN_COPIED_RUN_WORDS = 12;
// What's still allowed after the rewrites, as a share of the chapter's words
export const MAX_REMAINING_COPIED_SHARE = 0.01;

function wordsOf(text: string): Array<{ word: string; start: number; end: number }> {
  const words: Array<{ word: string; start: number; end: number }> = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)) {
    words.push({
      word: match[0].toLowerCase().replace(/’/g, "'"),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return words;
}

function shingleHash(words: Array<{ word: string }>, at: number): number {
  let joined = '';
  for (let i = at; i < at + SHINGLE_WORDS; i++) joined += `${words[i].word} `;
  return seedFromString(joined);
}

/** Hashes rather than text: a few dozen pages must fit on a small server */
export class OriginalityIndex {
  private readonly hashes = new Set<number>();

  add(text: string): void {
    const words = wordsOf(text);
    for (let i = 0; i + SHINGLE_WORDS <= words.length; i++) {
      this.hashes.add(shingleHash(words, i));
    }
  }

  check(text: string): OriginalityReport {
    const words = wordsOf(text);
    const passages: string[] = [];
    let copiedWords = 0;
    let i = 0;

    while (i + SHINGLE_WORDS <= words.length) {
      if (!this.hashes.has(shingleHash(words, i))) {
        i++;
        continue;
      }
      let last = i;
      while (
        last + 1 + SHINGLE_WORDS <= words.length &&
        this.hashes.has(shingleHash(words, last + 1))
      ) {
        last++;
      }
      const runWords = last - i + SHINGLE_WORDS;
      if (runWords >= MIN_COPIED_RUN_WORDS) {
        passages.push(
          text.slice(words[i].start, words[last + SHINGLE_WORDS - 1].end),
        );
        copiedWords += runWords;
      }
      i = last + SHINGLE_WORDS;
    }

    return {
      passages,
      copiedWords,
      copiedShare: words.length ? copiedWords / words.length : 0,
    };
  }
}

export interface OriginalityReport {
  passages: string[];
  copiedWords: number;
  copiedShare: number;
}
