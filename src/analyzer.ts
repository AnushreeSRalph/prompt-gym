import { encode as encodeO200k } from 'gpt-tokenizer/model/gpt-4o';
import { encode as encodeCl100k } from 'gpt-tokenizer/model/gpt-3.5-turbo';

export type TokenizerModel = 'o200k_base' | 'cl100k_base';

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

export interface ModelInfo {
  label: string;
  contextWindow: number;
  tokenizer: TokenizerModel;
  provider: 'openai' | 'anthropic' | 'google' | 'microsoft';
  /** Shown in UI when tokenizer is an approximation */
  tokenizerNote?: string;
}

/**
 * Monthly token budget used as the shared limit across all models.
 * Reflects a typical enterprise allocation (e.g. 400 K tokens/month)
 * rather than the model's technical context-window size.
 */
export const MONTHLY_BUDGET = 400_000;

export const MODELS: Record<string, ModelInfo> = {
  'gpt-4o': {
    label: 'GPT-4o',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'o200k_base',
    provider: 'openai',
  },
  'gpt-4o-mini': {
    label: 'GPT-4o Mini',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'o200k_base',
    provider: 'openai',
  },
  'gpt-4-1': {
    label: 'GPT-4.1',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'o200k_base',
    provider: 'openai',
  },
  'o3': {
    label: 'o3',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'o200k_base',
    provider: 'openai',
  },
  'copilot': {
    label: 'GitHub Copilot',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'o200k_base',
    provider: 'microsoft',
  },
  'claude-sonnet-4': {
    label: 'Claude Sonnet 4',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'cl100k_base',
    provider: 'anthropic',
    tokenizerNote: '~95% accurate — Claude uses its own tokenizer',
  },
  'claude-haiku-3-5': {
    label: 'Claude Haiku 3.5',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'cl100k_base',
    provider: 'anthropic',
    tokenizerNote: '~95% accurate — Claude uses its own tokenizer',
  },
  'claude-opus-4': {
    label: 'Claude Opus 4',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'cl100k_base',
    provider: 'anthropic',
    tokenizerNote: '~95% accurate — Claude uses its own tokenizer',
  },
  'gemini-2-5-flash': {
    label: 'Gemini 2.5 Flash',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'cl100k_base',
    provider: 'google',
    tokenizerNote: '~95% accurate — Gemini uses its own tokenizer',
  },
  'gemini-2-5-pro': {
    label: 'Gemini 2.5 Pro',
    contextWindow: MONTHLY_BUDGET,
    tokenizer: 'cl100k_base',
    provider: 'google',
    tokenizerNote: '~95% accurate — Gemini uses its own tokenizer',
  },
};

export const DEFAULT_MODEL_ID = 'gpt-4o';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AnalysisConfig {
  /** Overridden at runtime by whichever model is selected */
  tokenizerModel: TokenizerModel;
  tokenWarningThreshold: number;
  pastedCodeTokenThreshold: number;
  selectedModelId: string;
}

export const DEFAULT_CONFIG: AnalysisConfig = {
  tokenizerModel: 'o200k_base',
  tokenWarningThreshold: 2000,
  pastedCodeTokenThreshold: 300,
  selectedModelId: DEFAULT_MODEL_ID,
};

// ---------------------------------------------------------------------------
// Flag
// ---------------------------------------------------------------------------

export interface Flag {
  id: string;
  type: 'filler' | 'redundancy' | 'oversized-code' | 'threshold' | 'semantic-redundancy' | 'structural' | 'sensitive';
  severity: 'info' | 'warning';
  message: string;
  /** Concrete next step shown in the Issues tab */
  suggestion?: string;
  start: number;
  end: number;
  tokenImpact?: number;
}

// ---------------------------------------------------------------------------
// Token breakdown & explanations
// ---------------------------------------------------------------------------

export interface TokenBreakdown {
  total: number;
  fromNarrative: number;
  fromCodeBlocks: number;
  fromFillerPhrases: number;
  fromRedundantContext: number;
  /** Savable slice of code-block tokens (excess above threshold) */
  fromOversizedCode: number;
}

export interface TokenExplanation {
  title: string;
  detail: string;
  savable: number;
  type: 'positive' | 'warning' | 'info';
}

// ---------------------------------------------------------------------------
// Response complexity estimate
// ---------------------------------------------------------------------------

export type ComplexityLabel = 'simple' | 'moderate' | 'complex' | 'high';

export interface ComplexityEstimate {
  label: ComplexityLabel;
  /** Estimated response tokens / prompt tokens ratio */
  multiplier: number;
  estimatedResponseTokens: number;
  /** promptTokens + estimatedResponseTokens */
  totalEstimatedTokens: number;
  /** Primary reason driving the estimate */
  reason: string;
  /** All signals detected, shown in Why High? */
  signals: string[];
}

interface ComplexitySignal {
  pattern: RegExp;
  mult: number;
  label: ComplexityLabel;
  signal: string;
}

const COMPLEXITY_SIGNALS: ComplexitySignal[] = [
  // High — code/feature generation
  {
    pattern: /\b(write|generate|create|implement|build|develop|make)\b[\s\S]{0,60}\b(function|class|component|api|endpoint|service|module|app|script|cli|server|client)\b/i,
    mult: 5.5, label: 'high',
    signal: 'Code generation (write/create/implement + code artifact)',
  },
  {
    pattern: /\b(implement|scaffold|bootstrap|generate)\b/i,
    mult: 4.5, label: 'high',
    signal: 'Implementation task',
  },
  // Complex — fix/refactor/review
  {
    pattern: /\b(refactor|rewrite|redesign|restructure)\b/i,
    mult: 3.5, label: 'complex',
    signal: 'Refactor/rewrite task — response mirrors input size',
  },
  {
    pattern: /\b(fix|debug|resolve|diagnose|troubleshoot)\b/i,
    mult: 2.5, label: 'complex',
    signal: 'Debug/fix task — explanation + corrected code expected',
  },
  {
    pattern: /\b(review|audit|analyse|analyze|evaluate|assess)\b/i,
    mult: 2.0, label: 'complex',
    signal: 'Review/audit task — detailed feedback expected',
  },
  {
    pattern: /\b(convert|translate|transform|migrate|port)\b/i,
    mult: 2.0, label: 'complex',
    signal: 'Conversion task — output mirrors input length',
  },
  // Moderate — explanation/list
  {
    pattern: /\b(explain|describe|elaborate|walk me through|how does|how do|why does|what happens)\b/i,
    mult: 2.0, label: 'moderate',
    signal: 'Explanation requested — prose response expected',
  },
  {
    pattern: /\b(list|enumerate|give me|what are the|steps to|how to)\b/i,
    mult: 1.8, label: 'moderate',
    signal: 'List/steps requested — multi-item response expected',
  },
  {
    pattern: /\b(compare|difference|pros and cons|trade.?off|versus|vs\.?)\b/i,
    mult: 2.0, label: 'moderate',
    signal: 'Comparison requested — structured multi-part response',
  },
  // Simple — lookup / yes-no
  {
    pattern: /\b(yes or no|is it|does it|can it|will it|true or false|is there a)\b/i,
    mult: 0.4, label: 'simple',
    signal: 'Yes/no or binary question — short response expected',
  },
  {
    pattern: /^\s*(what is|who is|when (was|is|did)|where is|how many|how much|what('s| is) the)\b/i,
    mult: 0.8, label: 'simple',
    signal: 'Factual lookup — concise answer expected',
  },
];

export function estimateResponseComplexity(
  text: string,
  promptTokens: number,
): ComplexityEstimate {
  if (promptTokens === 0) {
    return {
      label: 'simple', multiplier: 1, estimatedResponseTokens: 0,
      totalEstimatedTokens: 0, reason: 'Empty prompt', signals: [],
    };
  }

  const signals: string[] = [];
  let bestMult = 1.0;
  let bestLabel: ComplexityLabel = 'moderate';
  let bestReason = 'General prompt — moderate response expected';

  for (const s of COMPLEXITY_SIGNALS) {
    if (s.pattern.test(text)) {
      signals.push(s.signal);
      if (s.mult > bestMult) {
        bestMult = s.mult;
        bestLabel = s.label;
        bestReason = s.signal;
      }
    }
  }

  // Boost for multiple requirements (bullet points / numbered list in prompt)
  const bulletCount = (text.match(/^\s*[-*•\d+\.]\s+\S/gm) ?? []).length;
  if (bulletCount >= 3) {
    signals.push(`${bulletCount} requirements listed — each likely needs a response section`);
    bestMult = Math.max(bestMult, 1.5 + bulletCount * 0.3);
    if (bestLabel === 'simple') { bestLabel = 'moderate'; }
  }

  // Code block in prompt → model will likely reply with code too
  const hasCodeBlock = /```[\s\S]*?```/.test(text);
  if (hasCodeBlock && bestMult < 3) {
    signals.push('Code block in prompt — model likely responds with code');
    bestMult = Math.max(bestMult, 2.5);
    if (bestLabel === 'simple' || bestLabel === 'moderate') { bestLabel = 'complex'; }
  }

  // Very short prompt with no task signal → conversational
  if (signals.length === 0 && promptTokens < 30) {
    bestLabel = 'simple';
    bestMult = 0.8;
    bestReason = 'Short conversational prompt';
    signals.push('Short prompt — brief response expected');
  }

  const estimatedResponseTokens = Math.round(promptTokens * bestMult);
  return {
    label: bestLabel,
    multiplier: bestMult,
    estimatedResponseTokens,
    totalEstimatedTokens: promptTokens + estimatedResponseTokens,
    reason: bestReason,
    signals,
  };
}

// ---------------------------------------------------------------------------
// Analysis result
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  tokenCount: number;
  charCount: number;
  flags: Flag[];
  estimatedSavableTokens: number;
  optimizedPrompt: string;
  optimizedTokenCount: number;
  breakdown: TokenBreakdown;
  explanations: TokenExplanation[];
  contextWindowSize: number;
  contextWindowPercent: number;
  modelLabel: string;
  tokenizerNote?: string;
  complexity: ComplexityEstimate;
}

// ---------------------------------------------------------------------------
// Token counter
// ---------------------------------------------------------------------------

export function countTokens(text: string, model: TokenizerModel): number {
  if (!text) { return 0; }
  const encoder = model === 'cl100k_base' ? encodeCl100k : encodeO200k;
  try {
    return encoder(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

// ---------------------------------------------------------------------------
// Filler-phrase detection
// ---------------------------------------------------------------------------

const FILLER_PHRASES: string[] = [
  // Multi-word hedges (match first — longer patterns take priority)
  'i was wondering if you could',
  'i was hoping you could',
  'could you possibly',
  'would it be possible to',
  "if you don’t mind",
  "if you don't mind",
  "if it’s not too much trouble",
  "if it's not too much trouble",
  'just wanted to ask',
  'i think maybe',
  'i would really appreciate it if',
  'as you may know',
  'to be honest',
  'in my opinion',
  'feel free to',
  'needless to say',
  'it goes without saying',
  'as previously mentioned',
  'as i mentioned earlier',
  'as mentioned above',
  'i hope this makes sense',
  'let me know if you need more',
  'hope that helps',
  'any help would be appreciated',
  'thanks in advance',
  'thank you so much',
  // Single words (checked last so multi-word patterns above get priority)
  'basically',
  'actually',
  'sort of',
  'kind of',
  'just',
  'please',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findFillerPhrases(text: string, model: TokenizerModel): Flag[] {
  const flags: Flag[] = [];
  const lower = text.toLowerCase();

  for (const phrase of FILLER_PHRASES) {
    const pattern = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lower)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const tokenImpact = countTokens(text.slice(start, end), model);
      flags.push({
        id: `filler-${start}-${end}`,
        type: 'filler',
        severity: 'info',
        message: `Filler phrase: "${text.slice(start, end)}"`,
        suggestion: `Remove — adds ~${tokenImpact} token${tokenImpact === 1 ? '' : 's'} without adding meaning. Models respond the same way without it.`,
        start,
        end,
        tokenImpact,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Semantic helpers (shared by semantic-redundancy + structural detectors)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can',
  'could','to','of','in','on','at','by','for','with','about','as','into','through',
  'during','before','after','above','below','from','up','down','and','but','or',
  'nor','so','yet','both','either','neither','not','no','this','that','these',
  'those','i','you','he','she','it','we','they','me','him','her','us','them','my',
  'your','his','its','our','their','what','which','who','how','when','where','why',
  'if','then','than','so','also','just','very','more','some','any','all','each',
]);

function semanticWords(sentence: string): Set<string> {
  return new Set(
    sentence.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) { return 0; }
  let inter = 0;
  for (const w of a) { if (b.has(w)) { inter++; } }
  return inter / (a.size + b.size - inter);
}

// ---------------------------------------------------------------------------
// Semantic redundancy detection (sentence-level Jaccard)
// ---------------------------------------------------------------------------

function looksLikeCode(s: string): boolean {
  // Skip comment lines
  if (/^\s*(#|\/\/|\/\*|\*|<!--)/.test(s)) { return true; }
  // Skip lines with code-specific keywords at the start
  if (/^\s*(def |class |function |return |import |from |export |const |let |var |if |for |while |try |except |raise |public |private |async )/.test(s)) { return true; }
  // Skip lines with assignment operators, brackets, or self/this patterns
  if (/[{}[\]()=><|&]/.test(s) && !/[.!?]$/.test(s.trim())) { return true; }
  // Skip lines where less than 55% of characters are letters or spaces (high symbol density)
  const letters = (s.match(/[a-zA-Z\s]/g) ?? []).length;
  if (letters / s.length < 0.55) { return true; }
  return false;
}

export function findSemanticRedundancy(text: string, model: TokenizerModel): Flag[] {
  // Split into sentences by ./?/!/newline, keeping the delimiter
  const parts = text.split(/(?<=[.!?\n])\s+/);
  const sentences: Array<{ text: string; start: number }> = [];
  let cursor = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length >= 15 && !looksLikeCode(trimmed)) {
      const idx = text.indexOf(trimmed, cursor);
      if (idx !== -1) {
        sentences.push({ text: trimmed, start: idx });
        cursor = idx + trimmed.length;
      }
    } else {
      cursor += part.length + 1;
    }
  }

  if (sentences.length < 3) { return []; }

  const wordSets = sentences.map(s => semanticWords(s.text));
  const flags: Flag[] = [];
  const flagged = new Set<number>();

  for (let i = 0; i < sentences.length; i++) {
    if (wordSets[i].size < 4) { continue; }
    for (let j = i + 2; j < sentences.length; j++) {
      if (flagged.has(j)) { continue; }
      const sim = jaccardSim(wordSets[i], wordSets[j]);
      if (sim >= 0.5) {
        flagged.add(j);
        const s = sentences[j];
        const end = s.start + s.text.length;
        const tokenImpact = countTokens(s.text, model);
        flags.push({
          id: `semantic-redundancy-${s.start}`,
          type: 'semantic-redundancy',
          severity: 'warning',
          message: `Semantically repeats an earlier sentence (${Math.round(sim * 100)}% overlap)`,
          suggestion: `This conveys the same idea as a sentence you wrote earlier. Removing it saves ~${tokenImpact} token${tokenImpact === 1 ? '' : 's'} without losing meaning.`,
          start: s.start,
          end,
          tokenImpact,
        });
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Structural issue detection
// ---------------------------------------------------------------------------

export function findStructuralIssues(text: string, model: TokenizerModel): Flag[] {
  const flags: Flag[] = [];
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  // Rule 1: closing paragraph semantically repeats the opening paragraph
  if (paragraphs.length >= 3 && !looksLikeCode(paragraphs[0]) && !looksLikeCode(paragraphs[paragraphs.length - 1])) {
    const firstWords = semanticWords(paragraphs[0]);
    const lastWords  = semanticWords(paragraphs[paragraphs.length - 1]);
    const sim = jaccardSim(firstWords, lastWords);
    if (sim >= 0.45 && firstWords.size >= 3) {
      const lastPara = paragraphs[paragraphs.length - 1];
      const start = text.lastIndexOf(lastPara);
      if (start !== -1) {
        const tokenImpact = countTokens(lastPara, model);
        flags.push({
          id: `structural-repeat-end-${start}`,
          type: 'structural',
          severity: 'warning',
          message: `Closing paragraph repeats the opening (${Math.round(sim * 100)}% word overlap)`,
          suggestion: `You've restated your goal at the end after stating it at the top. Remove the closing restatement — models read the full prompt regardless.`,
          start,
          end: start + lastPara.length,
          tokenImpact,
        });
      }
    }
  }

  // Rule 2: bullet-list preamble whose content is already captured by the bullets
  const bulletSectionRe = /^(.{10,}:)\n((?:[ \t]*[-*•]\s+[^\n]+\n?){2,})/gm;
  let match: RegExpExecArray | null;
  while ((match = bulletSectionRe.exec(text)) !== null) {
    const preamble = match[1];
    const bulletsText = match[2];
    const preambleWords = semanticWords(preamble);
    const allBulletWords = new Set(
      bulletsText.split('\n')
        .filter(l => /^\s*[-*•]/.test(l))
        .flatMap(b => [...semanticWords(b)]),
    );
    const sim = jaccardSim(preambleWords, allBulletWords);
    if (sim >= 0.38 && preambleWords.size >= 4) {
      const start = match.index;
      const end   = start + preamble.length;
      const tokenImpact = countTokens(preamble, model);
      flags.push({
        id: `structural-preamble-${start}`,
        type: 'structural',
        severity: 'info',
        message: `Bullet preamble echoes the list content (${Math.round(sim * 100)}% overlap)`,
        suggestion: `"${preamble.trim().slice(0, 60)}${preamble.length > 60 ? '…' : ''}" overlaps with your bullets. Replace with a short label like "Requirements:" to save ~${tokenImpact} token${tokenImpact === 1 ? '' : 's'}.`,
        start,
        end,
        tokenImpact,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Redundant-context detection
// Uses split-with-delimiter to get correct character offsets regardless of
// how much whitespace separates words (fixes the +1 drift bug).
// ---------------------------------------------------------------------------

export function findRedundantContext(text: string, model: TokenizerModel): Flag[] {
  // Split keeping whitespace delimiters so we can track real char offsets.
  const parts = text.split(/(\s+)/);
  const wordTokens: string[] = [];
  const wordOffsets: number[] = [];

  let charIdx = 0;
  for (const part of parts) {
    if (/\S/.test(part)) {
      wordTokens.push(part);
      wordOffsets.push(charIdx);
    }
    charIdx += part.length;
  }

  const windowSize = 6;
  if (wordTokens.length < windowSize * 2) { return []; }

  const seen = new Map<string, number>(); // phrase → first occurrence word-index
  const duplicateWordIdx = new Set<number>();

  for (let i = 0; i <= wordTokens.length - windowSize; i++) {
    const phrase = wordTokens.slice(i, i + windowSize).join(' ').toLowerCase();
    if (phrase.length < 20) { continue; }
    if (seen.has(phrase)) {
      for (let w = i; w < i + windowSize; w++) {
        duplicateWordIdx.add(w);
      }
    } else {
      seen.set(phrase, i);
    }
  }

  if (duplicateWordIdx.size === 0) { return []; }

  // Merge contiguous duplicate word indices into single spans.
  const sortedIdx = Array.from(duplicateWordIdx).sort((a, b) => a - b);
  const flags: Flag[] = [];
  let spanStart = sortedIdx[0];
  let prev = sortedIdx[0];

  const flush = (startWord: number, endWord: number) => {
    const start = wordOffsets[startWord];
    const end = wordOffsets[endWord] + wordTokens[endWord].length;
    if (end <= start) { return; }
    const tokenImpact = countTokens(text.slice(start, end), model);
    flags.push({
      id: `redundant-${start}-${end}`,
      type: 'redundancy',
      severity: 'warning',
      message: 'Repeated context',
      suggestion: `This was already stated earlier (~${tokenImpact} token${tokenImpact === 1 ? '' : 's'} duplicated). Remove the second occurrence.`,
      start,
      end,
      tokenImpact,
    });
  };

  for (let k = 1; k < sortedIdx.length; k++) {
    if (sortedIdx[k] === prev + 1) { prev = sortedIdx[k]; continue; }
    flush(spanStart, prev);
    spanStart = sortedIdx[k];
    prev = sortedIdx[k];
  }
  flush(spanStart, prev);

  return flags;
}

// ---------------------------------------------------------------------------
// Oversized code-block detection
// ---------------------------------------------------------------------------

export function findOversizedCodeBlocks(text: string, config: AnalysisConfig): Flag[] {
  const flags: Flag[] = [];
  const fencePattern = /```[\w-]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(text)) !== null) {
    const content = match[1];
    const start = match.index;
    const end = start + match[0].length;
    const tokens = countTokens(content, config.tokenizerModel);

    if (tokens > config.pastedCodeTokenThreshold) {
      const lines = content.split('\n').length;
      const excess = tokens - config.pastedCodeTokenThreshold;
      flags.push({
        id: `oversized-code-${start}-${end}`,
        type: 'oversized-code',
        severity: 'warning',
        message: `Code block: ${tokens} tokens across ${lines} lines`,
        suggestion: `Trim to the relevant function or lines only. Saving ~${excess} tokens by cutting unreferenced code won't hurt the model's understanding.`,
        start,
        end,
        tokenImpact: excess,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Sensitive / secret detection
// ---------------------------------------------------------------------------

interface SensitivePattern {
  re: RegExp;
  label: string;
  kind: 'secret' | 'pii';
  suggestion: string;
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // API keys & tokens — common prefixes
  {
    re: /\b(sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,})/g,
    label: 'Stripe secret key',
    kind: 'secret',
    suggestion: 'Replace with a placeholder like <STRIPE_KEY> before sending to any LLM.',
  },
  {
    re: /\b(ghp_[A-Za-z0-9]{36,}|gho_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g,
    label: 'GitHub personal access token',
    kind: 'secret',
    suggestion: 'Replace with <GITHUB_TOKEN>.',
  },
  {
    re: /\b(xoxb-[0-9]+-[A-Za-z0-9-]+|xoxp-[0-9]+-[A-Za-z0-9-]+)/g,
    label: 'Slack token',
    kind: 'secret',
    suggestion: 'Replace with <SLACK_TOKEN>.',
  },
  {
    re: /\b(AKIA[A-Z0-9]{16})\b/g,
    label: 'AWS access key ID',
    kind: 'secret',
    suggestion: 'Replace with <AWS_KEY_ID>.',
  },
  {
    re: /\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})\b/g,
    label: 'JWT token',
    kind: 'secret',
    suggestion: 'Replace with <JWT_TOKEN>.',
  },
  // Generic high-entropy secret-like values after common env-var names
  {
    re: /(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|AUTH_TOKEN|ACCESS_TOKEN)\s*[=:]\s*["']?([A-Za-z0-9+/_.~-]{16,})["']?/gi,
    label: 'Potential secret value',
    kind: 'secret',
    suggestion: 'Replace the value with a placeholder like <SECRET>.',
  },
  // Internal hostnames: hostname patterns with internal/prod/staging/dev suffixes
  {
    re: /\b([a-z][a-z0-9-]*(?:[-.](?:internal|prod|production|staging|dev|uat|corp|local))[a-z0-9.-]*)\b/gi,
    label: 'Internal hostname',
    kind: 'secret',
    suggestion: 'Replace with <INTERNAL_HOST> — internal infrastructure names can leak topology.',
  },
  // PII — names after "Customer Name:", "User Name:", "Full Name:", etc.
  {
    re: /(?:customer|user|client|full|first|last)\s+name\s*:?\s*\n?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    label: 'Customer / user name (PII)',
    kind: 'pii',
    suggestion: 'Replace with <CUSTOMER_NAME> — avoid sharing real names with external LLM providers.',
  },
  // Account numbers / IDs after labelled fields
  {
    re: /(?:account\s*(?:number|num|no|#)|account\s*id)\s*:?\s*\n?\s*([0-9]{6,})/gi,
    label: 'Account number (PII)',
    kind: 'pii',
    suggestion: 'Replace with <ACCOUNT_NUMBER>.',
  },
  // SSN patterns
  {
    re: /\b(\d{3}-\d{2}-\d{4})\b/g,
    label: 'Potential SSN',
    kind: 'pii',
    suggestion: 'Replace with <SSN>.',
  },
  // Email addresses in data-entry context (label + value)
  {
    re: /(?:email|e-mail)\s*:?\s*\n?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi,
    label: 'Email address (PII)',
    kind: 'pii',
    suggestion: 'Replace with <EMAIL>.',
  },
  // Credit card numbers (basic Luhn-pattern, not validated)
  {
    re: /\b(\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4})\b/g,
    label: 'Potential credit card number',
    kind: 'pii',
    suggestion: 'Replace with <CARD_NUMBER>.',
  },
  // Internal ticket / incident IDs — e.g. INC-48291, JIRA-1234, DB-18274
  {
    re: /\b((?:INC|INCIDENT|JIRA|DB|CHG|CR|TICKET|ISSUE|BUG|TASK|CASE|REQ|SVC|TKT)-\d{3,})\b/gi,
    label: 'Internal ticket / incident ID',
    kind: 'secret',
    suggestion: 'Remove or replace with a generic reference — internal ticket IDs can expose project and system names.',
  },
  // Prefixed customer / account reference IDs — e.g. CUST-100245, ACCT-98765
  {
    re: /\b((?:CUST|CUSTOMER|ACCT|ACCOUNT|CLIENT|ORG|USR|USER|EMP|EMPLOYEE|MBR|MEMBER|SUB|SUBSCRIBER)-[A-Z0-9]{3,})\b/gi,
    label: 'Internal account / customer ID',
    kind: 'pii',
    suggestion: 'Replace with <CUSTOMER_ID> — internal IDs can be cross-referenced against internal systems.',
  },
];

export function findSensitiveData(text: string): Flag[] {
  const flags: Flag[] = [];
  const seen = new Set<string>(); // deduplicate by match value

  for (const { re, label, kind, suggestion } of SENSITIVE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // The matched value is either group 1 (the extracted value) or the whole match
      const value = m[1] ?? m[0];
      const dedupeKey = `${label}:${value}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const start = m.index;
      const end   = start + m[0].length;
      const verb  = kind === 'pii' ? 'Sensitive information' : 'Potential secret';
      flags.push({
        id: `sensitive-${start}-${end}`,
        type: 'sensitive',
        severity: 'warning',
        message: `${verb} detected: ${label}`,
        suggestion,
        start,
        end,
        tokenImpact: 0,
      });
    }
  }

  // Sort by position
  return flags.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Token breakdown
// ---------------------------------------------------------------------------

export function getTokenBreakdown(
  text: string,
  flags: Flag[],
  config: AnalysisConfig,
): TokenBreakdown {
  const total = countTokens(text, config.tokenizerModel);

  const fromFillerPhrases = flags
    .filter(f => f.type === 'filler')
    .reduce((s, f) => s + (f.tokenImpact ?? 0), 0);

  const fromRedundantContext = flags
    .filter(f => f.type === 'redundancy' || f.type === 'semantic-redundancy' || f.type === 'structural')
    .reduce((s, f) => s + (f.tokenImpact ?? 0), 0);

  const fromOversizedCode = flags
    .filter(f => f.type === 'oversized-code')
    .reduce((s, f) => s + (f.tokenImpact ?? 0), 0);

  let fromCodeBlocks = 0;
  const fencePattern = /```[\w-]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(text)) !== null) {
    fromCodeBlocks += countTokens(match[1], config.tokenizerModel);
  }

  const fromNarrative = Math.max(
    0,
    total - fromCodeBlocks - fromFillerPhrases - fromRedundantContext,
  );

  return {
    total,
    fromNarrative,
    fromCodeBlocks,
    fromFillerPhrases,
    fromRedundantContext,
    fromOversizedCode,
  };
}

// ---------------------------------------------------------------------------
// Optimized prompt generation (rule-based, no LLM)
// ---------------------------------------------------------------------------

export function generateOptimizedPrompt(text: string, flags: Flag[]): string {
  // Remove filler, redundancy, semantic-redundancy, and structural spans.
  const removable = flags
    .filter(f => (
      f.type === 'filler' ||
      f.type === 'redundancy' ||
      f.type === 'semantic-redundancy' ||
      f.type === 'structural'
    ) && f.end > f.start)
    .sort((a, b) => b.start - a.start);

  // Apply removals from end→start; skip flags that overlap a previously-processed span
  // (two flags at the same offset, e.g. both filler+redundancy, would otherwise double-remove).
  let result = text;
  let lastStart = Infinity;
  for (const flag of removable) {
    if (flag.end > lastStart) continue; // overlaps a span already removed
    lastStart = flag.start;
    result = result.slice(0, flag.start) + result.slice(flag.end);
  }

  // Post-process: collapse whitespace artifacts left by removals.
  result = result
    .replace(/[ \t]{2,}/g, ' ')                   // multiple spaces → one
    .replace(/\n{3,}/g, '\n\n')                   // triple+ newlines → double
    .replace(/([.!?])\s*,\s*/g, '$1 ')            // ". ," or "! ," → ". "
    .replace(/,\s*([.!?])/g, '$1')                // ", ." → "."
    // Remove artifact punctuation at the start of a paragraph (e.g. "! also" after filler removal)
    .replace(/(^|\n\n)\s*[!?,;]\s*/g, '$1')       // "! word" at paragraph start → "word"
    .replace(/^[,;\s]+/, '')                        // any remaining leading comma/whitespace
    .replace(/[ \t]+([.!?,])/g, '$1')              // space/tab before punctuation (not newlines)
    .replace(/\n{3,}/g, '\n\n')                    // re-collapse after above rules
    // Trim leading whitespace from each paragraph, then capitalize its first letter
    .replace(/\n\n[ \t]+/g, '\n\n')
    .replace(/(\n\n)([a-z])/g, (_, nl, ch) => nl + ch.toUpperCase())
    // Capitalize first word after sentence-ending punctuation followed by a space
    // (catches lowercase artifacts from mid-sentence filler removal, e.g. ". this")
    .replace(/([.!?]) ([a-z])/g, (_, p, ch) => `${p} ${ch.toUpperCase()}`)
    .trim();

  // Capitalise first character if it's now lowercase due to a removal.
  if (result.length > 0) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

// ---------------------------------------------------------------------------
// "Why is this high?" explanations
// ---------------------------------------------------------------------------

export function generateExplanations(
  flags: Flag[],
  breakdown: TokenBreakdown,
  config: AnalysisConfig,
): TokenExplanation[] {
  const explanations: TokenExplanation[] = [];
  const total = breakdown.total;
  if (total === 0) { return explanations; }

  const pct = (n: number) => Math.round((n / total) * 100);

  // Code blocks
  if (breakdown.fromCodeBlocks > 0) {
    const cp = pct(breakdown.fromCodeBlocks);
    if (cp >= 40) {
      explanations.push({
        title: `Code blocks are your biggest driver (${cp}% of tokens)`,
        detail: breakdown.fromOversizedCode > 0
          ? `Your pasted code totals ${breakdown.fromCodeBlocks} tokens. Trimming to just the relevant lines could save ~${breakdown.fromOversizedCode} tokens.`
          : `Your pasted code totals ${breakdown.fromCodeBlocks} tokens. Size looks reasonable — make sure you're not including more than the model needs.`,
        savable: breakdown.fromOversizedCode,
        type: breakdown.fromOversizedCode > 0 ? 'warning' : 'info',
      });
    } else if (breakdown.fromOversizedCode > 0) {
      explanations.push({
        title: `Oversized code block — ${breakdown.fromOversizedCode} savable tokens`,
        detail: `One or more code blocks exceed the recommended size. Trim to the relevant function or section.`,
        savable: breakdown.fromOversizedCode,
        type: 'warning',
      });
    }
  }

  // Redundant context (exact + semantic + structural)
  if (breakdown.fromRedundantContext > 0) {
    const count = flags.filter(f =>
      f.type === 'redundancy' || f.type === 'semantic-redundancy' || f.type === 'structural',
    ).length;
    explanations.push({
      title: `${count} repeated context span${count === 1 ? '' : 's'} — ${breakdown.fromRedundantContext} wasted tokens`,
      detail: `The same information appears more than once. Models don't benefit from repetition — each duplicate burns tokens without improving the response.`,
      savable: breakdown.fromRedundantContext,
      type: 'warning',
    });
  }

  // Filler
  if (breakdown.fromFillerPhrases > 0) {
    const count = flags.filter(f => f.type === 'filler').length;
    const fp = pct(breakdown.fromFillerPhrases);
    explanations.push({
      title: `${count} filler phrase${count === 1 ? '' : 's'} — ~${breakdown.fromFillerPhrases} tokens`,
      detail: `Phrases like "I was wondering if you could" or "basically" consume tokens without adding information. Models give identical responses whether you're polite or direct.`,
      savable: breakdown.fromFillerPhrases,
      type: fp >= 5 ? 'warning' : 'info',
    });
  }

  // Narrative — comment only if it looks clean
  if (
    breakdown.fromNarrative > 0 &&
    breakdown.fromFillerPhrases === 0 &&
    breakdown.fromRedundantContext === 0 &&
    pct(breakdown.fromNarrative) >= 70
  ) {
    explanations.push({
      title: `Narrative: ${breakdown.fromNarrative} tokens (${pct(breakdown.fromNarrative)}%)`,
      detail: `This is the substantive part — background, constraints, and your actual question. No obvious waste detected. Long prompts are fine as long as every sentence is earning its place.`,
      savable: 0,
      type: 'positive',
    });
  }

  // All-clean state
  if (explanations.length === 0 || explanations.every(e => e.type === 'positive')) {
    if (total < config.tokenWarningThreshold) {
      explanations.unshift({
        title: 'Prompt looks lean',
        detail: `${total} tokens with no detected waste. Every part appears to be doing useful work.`,
        savable: 0,
        type: 'positive',
      });
    }
  }

  return explanations;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function analyzePrompt(
  text: string,
  config: AnalysisConfig = DEFAULT_CONFIG,
): AnalysisResult {
  const model = MODELS[config.selectedModelId] ?? MODELS[DEFAULT_MODEL_ID];

  // The model's tokenizer takes precedence over the VS Code setting.
  const effectiveConfig: AnalysisConfig = {
    ...config,
    tokenizerModel: model.tokenizer,
  };

  const tokenCount = countTokens(text, effectiveConfig.tokenizerModel);

  const flags: Flag[] = [
    ...findFillerPhrases(text, effectiveConfig.tokenizerModel),
    ...findRedundantContext(text, effectiveConfig.tokenizerModel),
    ...findSemanticRedundancy(text, effectiveConfig.tokenizerModel),
    ...findStructuralIssues(text, effectiveConfig.tokenizerModel),
    ...findOversizedCodeBlocks(text, effectiveConfig),
    ...findSensitiveData(text),
  ];

  if (tokenCount > effectiveConfig.tokenWarningThreshold) {
    flags.push({
      id: 'threshold-total',
      type: 'threshold',
      severity: 'warning',
      message: `Prompt exceeds warning threshold (${tokenCount} tokens)`,
      suggestion: `You're above your ${effectiveConfig.tokenWarningThreshold}-token warning threshold. See the "Why High?" tab for a breakdown.`,
      start: 0,
      end: 0,
    });
  }

  flags.sort((a, b) => a.start - b.start);

  const breakdown = getTokenBreakdown(text, flags, effectiveConfig);
  const optimizedPrompt = generateOptimizedPrompt(text, flags);
  const optimizedTokenCount = countTokens(optimizedPrompt, effectiveConfig.tokenizerModel);
  const estimatedSavableTokens = flags.reduce((s, f) => s + (f.tokenImpact ?? 0), 0);
  const explanations = generateExplanations(flags, breakdown, effectiveConfig);
  const complexity = estimateResponseComplexity(text, tokenCount);

  const contextWindowPercent =
    model.contextWindow > 0 ? (tokenCount / model.contextWindow) * 100 : 0;

  return {
    tokenCount,
    charCount: text.length,
    flags,
    estimatedSavableTokens,
    optimizedPrompt,
    optimizedTokenCount,
    breakdown,
    explanations,
    complexity,
    contextWindowSize: model.contextWindow,
    contextWindowPercent,
    modelLabel: model.label,
    tokenizerNote: model.tokenizerNote,
  };
}
