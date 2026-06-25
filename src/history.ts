/**
 * Prompt history — stored in VS Code globalState (local, no network).
 * Saves a record each time the user copies a prompt.
 * Provides Jaccard-similarity search to detect near-duplicate sends.
 */

import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptRecord {
  id: string;
  /** Prompt text, capped at MAX_TEXT_LEN chars to bound storage size. */
  text: string;
  truncated: boolean;
  tokenCount: number;
  timestamp: number;   // Date.now()
  fingerprint: string; // used for exact-duplicate guard
}

export interface SimilarMatch {
  record: PromptRecord;
  /** 0–1; 1 = identical word set */
  similarity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_KEY   = 'promptHistory';
const MAX_RECORDS   = 100;
const MAX_AGE_MS    = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_TEXT_LEN  = 10_000;                    // chars per record
/** Flag as similar if Jaccard ≥ this value */
export const SIMILARITY_THRESHOLD = 0.72;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(text: string): Set<string> {
  return new Set(normalise(text).split(' ').filter(Boolean));
}

/** Jaccard similarity on word sets — O(n), no dependencies. */
export function computeSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) { return 0; }
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 && setB.size === 0) { return 1; }

  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) { intersection++; }
  }
  return intersection / (setA.size + setB.size - intersection);
}

/** Simple djb2 hash — used as an exact-duplicate fingerprint. */
function fingerprint(text: string): string {
  const norm = normalise(text);
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = Math.imul(h, 33) ^ norm.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class HistoryStore {
  constructor(private readonly state: vscode.Memento) {}

  /** Returns all non-expired records, most-recent first. */
  getAll(): PromptRecord[] {
    const raw = this.state.get<PromptRecord[]>(HISTORY_KEY, []);
    const cutoff = Date.now() - MAX_AGE_MS;
    return raw.filter(r => r.timestamp >= cutoff);
  }

  /**
   * Saves a prompt when the user copies it (the "send" action).
   * Silently skips exact duplicates and empty text.
   */
  async add(text: string, tokenCount: number): Promise<void> {
    if (!text.trim()) { return; }

    const fp = fingerprint(text);
    let records = this.getAll();

    // Skip exact duplicate
    if (records.some(r => r.fingerprint === fp)) { return; }

    const truncated = text.length > MAX_TEXT_LEN;
    const record: PromptRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: truncated ? text.slice(0, MAX_TEXT_LEN) : text,
      truncated,
      tokenCount,
      timestamp: Date.now(),
      fingerprint: fp,
    };

    records.unshift(record);
    if (records.length > MAX_RECORDS) {
      records = records.slice(0, MAX_RECORDS);
    }

    await this.state.update(HISTORY_KEY, records);
  }

  /**
   * Returns up to `limit` records whose Jaccard similarity to `text`
   * meets or exceeds SIMILARITY_THRESHOLD, sorted by similarity desc.
   */
  findSimilar(text: string, limit = 3): SimilarMatch[] {
    if (!text.trim()) { return []; }
    return this.getAll()
      .map(record => ({ record, similarity: computeSimilarity(text, record.text) }))
      .filter(m => m.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Sum of tokens for all prompts sent in the current calendar month.
   * This is the cumulative budget consumed so far this month.
   */
  getMonthlyUsage(): number {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return this.getAll()
      .filter(r => r.timestamp >= startOfMonth)
      .reduce((sum, r) => sum + r.tokenCount, 0);
  }

  async clear(): Promise<void> {
    await this.state.update(HISTORY_KEY, []);
  }
}
