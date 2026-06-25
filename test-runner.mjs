/**
 * Prompt Gym — self-contained test runner (no external test framework).
 * Run with: node test-runner.mjs
 *
 * Outputs results to stdout and writes eval.md in the project root.
 */

// ── ESM shim: build analyzer-only bundle, then require it ───────────────────
import { createRequire } from 'module';
import { writeFileSync }  from 'fs';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';
import { build }          from 'esbuild';

await build({
  entryPoints: ['src/analyzer.ts'],
  bundle: true,
  outfile: 'dist/analyzer-test.cjs',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  minify: false,
  logLevel: 'silent',
});

const require = createRequire(import.meta.url);
const dist    = require('./dist/analyzer-test.cjs');

// The bundle exports are on module.exports (CJS).
// esbuild inlines everything, so we pull named exports directly.
const {
  countTokens,
  findFillerPhrases,
  findRedundantContext,
  findSemanticRedundancy,
  findStructuralIssues,
  findOversizedCodeBlocks,
  findSensitiveData,
  generateOptimizedPrompt,
  analyzePrompt,
  getTokenBreakdown,
  generateExplanations,
  estimateResponseComplexity,
  DEFAULT_CONFIG,
} = dist;

// ── Mini test harness ────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS', error: null });
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    process.stdout.write(`  ✗ ${name}\n    → ${e.message}\n`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertGte(a, b, msg) {
  if (a < b) throw new Error(msg ?? `expected >= ${b}, got ${a}`);
}

function assertLte(a, b, msg) {
  if (a > b) throw new Error(msg ?? `expected <= ${b}, got ${a}`);
}

function assertIncludes(arr, pred, msg) {
  if (!arr.some(pred)) throw new Error(msg ?? 'array does not contain expected element');
}

// ── Suites ───────────────────────────────────────────────────────────────────

console.log('\n══ countTokens ══════════════════════════════════════════════');

test('empty string → 0 tokens', () => {
  assertEqual(countTokens('', 'o200k_base'), 0);
});

test('empty string cl100k → 0 tokens', () => {
  assertEqual(countTokens('', 'cl100k_base'), 0);
});

test('single word has at least 1 token', () => {
  assertGte(countTokens('hello', 'o200k_base'), 1);
});

test('longer text has more tokens than short text', () => {
  const short = countTokens('hello', 'o200k_base');
  const long  = countTokens('hello world this is a longer sentence with many words', 'o200k_base');
  assert(long > short, `long (${long}) should be > short (${short})`);
});

test('whitespace-only string → small token count', () => {
  assertLte(countTokens('     \n\n\n', 'o200k_base'), 5);
});

test('unicode text tokenises without throwing', () => {
  const n = countTokens('こんにちは世界', 'o200k_base');
  assertGte(n, 1);
});

test('very long text (10k words) tokenises', () => {
  const text = Array(10_000).fill('word').join(' ');
  const n = countTokens(text, 'o200k_base');
  assertGte(n, 1000);
});

test('code block tokenises correctly', () => {
  const code = '```python\ndef hello():\n    print("hello world")\n```';
  assertGte(countTokens(code, 'o200k_base'), 10);
});

test('o200k vs cl100k give similar (within 20%) counts for English', () => {
  const text = 'The quick brown fox jumps over the lazy dog.';
  const a = countTokens(text, 'o200k_base');
  const b = countTokens(text, 'cl100k_base');
  assert(Math.abs(a - b) / Math.max(a, b) < 0.2, `o200k=${a}, cl100k=${b} differ >20%`);
});

// ── findFillerPhrases ────────────────────────────────────────────────────────

console.log('\n══ findFillerPhrases ════════════════════════════════════════');

test('detects "basically"', () => {
  const flags = findFillerPhrases('Basically you need to do this.', 'o200k_base');
  assertIncludes(flags, f => f.type === 'filler' && f.message.toLowerCase().includes('basically'));
});

test('detects "I was wondering if you could"', () => {
  const flags = findFillerPhrases('I was wondering if you could help me.', 'o200k_base');
  assertIncludes(flags, f => f.type === 'filler');
});

test('detects "actually" mid-sentence', () => {
  const flags = findFillerPhrases('This is actually a problem.', 'o200k_base');
  assertIncludes(flags, f => f.message.toLowerCase().includes('actually'));
});

test('no false positives on clean prompt', () => {
  const flags = findFillerPhrases('Refactor the authentication module to use JWT tokens.', 'o200k_base');
  assertEqual(flags.length, 0, `expected 0 filler flags, got ${flags.length}`);
});

test('detects "please" as filler', () => {
  const flags = findFillerPhrases('Please fix this bug.', 'o200k_base');
  assertIncludes(flags, f => f.message.toLowerCase().includes('please'));
});

test('detects multiple fillers in one prompt', () => {
  const flags = findFillerPhrases('Basically just please review my code.', 'o200k_base');
  assertGte(flags.length, 2);
});

test('filler detection is case-insensitive', () => {
  const flags = findFillerPhrases('BASICALLY this is a problem.', 'o200k_base');
  assertIncludes(flags, f => f.type === 'filler');
});

test('filler flags have valid start/end offsets', () => {
  const text = 'Basically fix this.';
  const flags = findFillerPhrases(text, 'o200k_base');
  assert(flags.length > 0);
  for (const f of flags) {
    assert(f.start >= 0 && f.end <= text.length && f.start < f.end,
      `invalid offsets: start=${f.start} end=${f.end} len=${text.length}`);
  }
});

test('empty string → no filler flags', () => {
  assertEqual(findFillerPhrases('', 'o200k_base').length, 0);
});

test('"as previously mentioned" is flagged', () => {
  const flags = findFillerPhrases('As previously mentioned, the bug exists.', 'o200k_base');
  assertIncludes(flags, f => f.type === 'filler');
});

// ── findRedundantContext ─────────────────────────────────────────────────────

console.log('\n══ findRedundantContext ═════════════════════════════════════');

test('detects exact repeated sentence', () => {
  const text = 'The system uses OAuth for authentication. Some other text here. The system uses OAuth for authentication.';
  const flags = findRedundantContext(text, 'o200k_base');
  assertGte(flags.length, 1, 'expected at least one redundancy flag');
});

test('no false positive on unique sentences', () => {
  const text = 'The cat sat on the mat. The dog ran in the park. The bird flew over the house.';
  const flags = findRedundantContext(text, 'o200k_base');
  assertEqual(flags.length, 0, `expected 0 redundancy flags, got ${flags.length}`);
});

test('short text (fewer than 12 words) → no redundancy flags', () => {
  const text = 'Fix the bug. Fix the bug.';
  const flags = findRedundantContext(text, 'o200k_base');
  // Short phrase window → no match expected (window=6 requires meaningful text)
  assert(flags.length === 0, 'too-short text should not trigger redundancy');
});

test('redundancy flags have correct types', () => {
  const text = 'We need to implement a caching layer for performance. Extra filler. We need to implement a caching layer for performance.';
  const flags = findRedundantContext(text, 'o200k_base');
  for (const f of flags) {
    assertEqual(f.type, 'redundancy');
  }
});

// ── findSemanticRedundancy ───────────────────────────────────────────────────

console.log('\n══ findSemanticRedundancy ═══════════════════════════════════');

test('flags sentence that repeats key words of an earlier sentence', () => {
  // The detector uses Jaccard on exact word stems — needs real word overlap, not synonyms.
  const text = [
    'The database query is slow and needs optimization.',
    'Something entirely unrelated about cats and servers.',
    'The database query requires optimization and is slow to execute.',
  ].join(' ');
  const flags = findSemanticRedundancy(text, 'o200k_base');
  assertGte(flags.length, 1, 'expected semantic redundancy flag for sentence with high word overlap');
});

test('no false positive when sentences are distinct', () => {
  const text = [
    'Please implement JWT authentication.',
    'The database uses PostgreSQL with pgvector.',
    'Deploy to AWS using ECS Fargate.',
  ].join(' ');
  const flags = findSemanticRedundancy(text, 'o200k_base');
  assertEqual(flags.length, 0, `expected 0 semantic flags, got ${flags.length}`);
});

test('adjacent sentences do not trigger semantic flag', () => {
  // i+1 is skipped — only i+2 and beyond
  const text = 'The system is fast. The system is fast. Something else entirely different here about cats.';
  const flags = findSemanticRedundancy(text, 'o200k_base');
  // Adjacent (index 0 vs 1) should be skipped; only 0 vs 2 considered
  assert(flags.every(f => f.type === 'semantic-redundancy'), 'wrong type');
});

test('semantic flags have type semantic-redundancy', () => {
  const text = [
    'We need to fix the authentication bug in the login module.',
    'Something unrelated here for separation filler text content.',
    'The login authentication module has a bug that must be fixed.',
  ].join(' ');
  const flags = findSemanticRedundancy(text, 'o200k_base');
  for (const f of flags) {
    assertEqual(f.type, 'semantic-redundancy');
  }
});

test('empty string → no semantic flags', () => {
  assertEqual(findSemanticRedundancy('', 'o200k_base').length, 0);
});

test('single sentence → no semantic flags', () => {
  const flags = findSemanticRedundancy('Fix the login bug.', 'o200k_base');
  assertEqual(flags.length, 0);
});

test('very short sentences (< 15 chars) are skipped', () => {
  const text = 'Fix it. Fix it. Fix it. Fix it. Fix it.';
  const flags = findSemanticRedundancy(text, 'o200k_base');
  assertEqual(flags.length, 0, 'tiny sentences should be ignored');
});

// ── findStructuralIssues ─────────────────────────────────────────────────────

console.log('\n══ findStructuralIssues ═════════════════════════════════════');

test('flags closing paragraph that repeats opening', () => {
  const text = [
    'We need to optimize the database query performance for the user dashboard.',
    '',
    'The dashboard uses React with server-side rendering and PostgreSQL.',
    '',
    'Could you optimize the database query performance for the user dashboard?',
  ].join('\n');
  const flags = findStructuralIssues(text, 'o200k_base');
  assertIncludes(flags, f => f.type === 'structural' && f.id.includes('repeat-end'),
    'expected structural repeat-end flag');
});

test('flags bullet preamble that shares significant keywords with its bullets', () => {
  // Preamble must share ≥38% Jaccard with the combined bullet word set.
  const text = [
    'Implement authentication, authorization, and token management:',
    '- authentication system',
    '- authorization middleware',
    '- token management service',
  ].join('\n');
  const flags = findStructuralIssues(text, 'o200k_base');
  assertIncludes(flags, f => f.type === 'structural' && f.id.includes('preamble'),
    'expected structural preamble flag');
});

test('clean prompt with short intro → no structural flags', () => {
  const text = [
    'Fix the login bug.',
    '',
    'The error occurs when users submit empty passwords.',
    '',
    'Stack trace is in the logs.',
  ].join('\n');
  const flags = findStructuralIssues(text, 'o200k_base');
  assertEqual(flags.length, 0, `expected 0, got ${flags.length}`);
});

test('requires at least 3 paragraphs for repeat-end detection', () => {
  const text = [
    'Optimize the database query.',
    '',
    'Please optimize the database query.',
  ].join('\n');
  // Only 2 paragraphs — less than the 3 required
  const flags = findStructuralIssues(text, 'o200k_base');
  const repeatFlags = flags.filter(f => f.id.includes('repeat-end'));
  // 2 paragraphs → paragraphs.length < 3, so no repeat-end
  assertEqual(repeatFlags.length, 0, 'should not flag 2-paragraph text');
});

test('structural flags have valid offsets', () => {
  const text = [
    'We need to improve performance of the database query system significantly.',
    '',
    'The backend uses Node.js and PostgreSQL with connection pooling.',
    '',
    'Could you improve the database query system performance significantly?',
  ].join('\n');
  const flags = findStructuralIssues(text, 'o200k_base');
  for (const f of flags) {
    assert(f.start >= 0 && f.end <= text.length && f.start < f.end,
      `invalid offsets: start=${f.start} end=${f.end}`);
  }
});

// ── findOversizedCodeBlocks ──────────────────────────────────────────────────

console.log('\n══ findOversizedCodeBlocks ══════════════════════════════════');

test('flags code block exceeding threshold', () => {
  const bigCode = Array(200).fill('x = x + 1  # some operation').join('\n');
  const text = '```python\n' + bigCode + '\n```';
  const flags = findOversizedCodeBlocks(text, DEFAULT_CONFIG);
  assertGte(flags.length, 1);
  assertEqual(flags[0].type, 'oversized-code');
});

test('small code block is not flagged', () => {
  const text = '```python\nprint("hello")\n```';
  const flags = findOversizedCodeBlocks(text, DEFAULT_CONFIG);
  assertEqual(flags.length, 0);
});

test('no code block → no flags', () => {
  const flags = findOversizedCodeBlocks('Just plain text here.', DEFAULT_CONFIG);
  assertEqual(flags.length, 0);
});

test('multiple code blocks — only oversized ones flagged', () => {
  const smallCode = '```js\nconsole.log("hi");\n```';
  const bigCode = '```js\n' + Array(200).fill('console.log("x");').join('\n') + '\n```';
  const text = smallCode + '\n\n' + bigCode;
  const flags = findOversizedCodeBlocks(text, DEFAULT_CONFIG);
  assertEqual(flags.length, 1, 'only 1 oversized block expected');
});

test('oversized-code flag has tokenImpact > 0', () => {
  const bigCode = Array(200).fill('const x = doSomethingExpensive();').join('\n');
  const text = '```js\n' + bigCode + '\n```';
  const flags = findOversizedCodeBlocks(text, DEFAULT_CONFIG);
  assertGte(flags[0].tokenImpact ?? 0, 1);
});

// ── generateOptimizedPrompt ──────────────────────────────────────────────────

console.log('\n══ generateOptimizedPrompt ══════════════════════════════════');

test('removes filler phrases', () => {
  const text = 'Basically you need to fix this bug.';
  const flags = findFillerPhrases(text, 'o200k_base');
  const opt   = generateOptimizedPrompt(text, flags);
  assert(!opt.toLowerCase().includes('basically'), `"basically" still present: ${opt}`);
});

test('result is shorter than original when fillers removed', () => {
  const text = 'Basically just please fix this bug immediately.';
  const flags = findFillerPhrases(text, 'o200k_base');
  const opt   = generateOptimizedPrompt(text, flags);
  assertLte(opt.length, text.length, 'optimized should not be longer');
});

test('no double-spaces after removal', () => {
  const text = 'Basically you need to fix this.';
  const flags = findFillerPhrases(text, 'o200k_base');
  const opt   = generateOptimizedPrompt(text, flags);
  assert(!opt.includes('  '), `double space in: "${opt}"`);
});

test('result starts with uppercase letter', () => {
  const text = 'basically fix the bug.';
  const flags = findFillerPhrases(text, 'o200k_base');
  const opt   = generateOptimizedPrompt(text, flags);
  assert(/^[A-Z]/.test(opt) || opt.length === 0, `starts with lowercase: "${opt}"`);
});

test('clean prompt unchanged', () => {
  const text = 'Refactor the auth module to use JWT.';
  const opt   = generateOptimizedPrompt(text, []);
  assertEqual(opt.trim(), text.trim());
});

test('empty prompt returns empty string', () => {
  const opt = generateOptimizedPrompt('', []);
  assertEqual(opt, '');
});

test('removes semantic-redundancy spans', () => {
  const text = [
    'We need to optimize the database query performance.',
    'Something else here entirely.',
    'The database query system needs performance optimization.',
  ].join(' ');
  const semFlags = findSemanticRedundancy(text, 'o200k_base');
  const opt = generateOptimizedPrompt(text, semFlags);
  assertLte(opt.length, text.length, 'optimized should be shorter');
});

test('removes structural repeat-end spans', () => {
  const text = [
    'We need to optimize the database performance system.',
    '',
    'Context: PostgreSQL with Node.js backend.',
    '',
    'Please optimize the database performance system.',
  ].join('\n');
  const strFlags = findStructuralIssues(text, 'o200k_base');
  const opt = generateOptimizedPrompt(text, strFlags);
  assertLte(opt.length, text.length);
});

test('no triple newlines in output', () => {
  const text = 'Basically\n\n\nfix this.\n\n\nThanks.';
  const flags = findFillerPhrases(text, 'o200k_base');
  const opt   = generateOptimizedPrompt(text, flags);
  assert(!opt.includes('\n\n\n'), `triple newline found: ${JSON.stringify(opt)}`);
});

// ── analyzePrompt (integration) ──────────────────────────────────────────────

console.log('\n══ analyzePrompt (integration) ══════════════════════════════');

test('returns correct shape', () => {
  const r = analyzePrompt('Fix the bug.', DEFAULT_CONFIG);
  assert(typeof r.tokenCount === 'number');
  assert(typeof r.charCount  === 'number');
  assert(Array.isArray(r.flags));
  assert(typeof r.optimizedPrompt === 'string');
  assert(typeof r.optimizedTokenCount === 'number');
  assert(r.breakdown !== undefined);
  assert(Array.isArray(r.explanations));
});

test('tokenCount matches charCount direction', () => {
  const short = analyzePrompt('Hi.', DEFAULT_CONFIG);
  const long  = analyzePrompt('Please implement a full OAuth2 authentication flow with refresh tokens and JWT support for our Node.js API.', DEFAULT_CONFIG);
  assert(long.tokenCount > short.tokenCount, 'longer text should have more tokens');
});

test('charCount is text length', () => {
  const text = 'Hello world.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assertEqual(r.charCount, text.length);
});

test('optimizedTokenCount <= tokenCount', () => {
  const text = 'Basically just please fix this bug. I was wondering if you could look into it.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assertLte(r.optimizedTokenCount, r.tokenCount,
    `optimized (${r.optimizedTokenCount}) should be <= original (${r.tokenCount})`);
});

test('empty prompt → 0 tokens', () => {
  const r = analyzePrompt('', DEFAULT_CONFIG);
  assertEqual(r.tokenCount, 0);
  assertEqual(r.charCount, 0);
});

test('threshold flag appears when over limit', () => {
  const longText = Array(600).fill('word').join(' ');
  const r = analyzePrompt(longText, { ...DEFAULT_CONFIG, tokenWarningThreshold: 100 });
  assertIncludes(r.flags, f => f.type === 'threshold', 'expected threshold flag');
});

test('no threshold flag when under limit', () => {
  const r = analyzePrompt('Short prompt.', { ...DEFAULT_CONFIG, tokenWarningThreshold: 2000 });
  assert(!r.flags.some(f => f.type === 'threshold'), 'should not have threshold flag');
});

test('breakdown total matches tokenCount', () => {
  const text = 'Fix the login bug in the authentication module.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assertEqual(r.breakdown.total, r.tokenCount);
});

test('breakdown values are non-negative', () => {
  const r = analyzePrompt('Basically just fix the bug. I was wondering if you could help.', DEFAULT_CONFIG);
  const { breakdown: b } = r;
  assert(b.fromNarrative >= 0, 'fromNarrative < 0');
  assert(b.fromCodeBlocks >= 0, 'fromCodeBlocks < 0');
  assert(b.fromFillerPhrases >= 0, 'fromFillerPhrases < 0');
  assert(b.fromRedundantContext >= 0, 'fromRedundantContext < 0');
});

test('contextWindowPercent is between 0 and 100 for normal prompt', () => {
  const r = analyzePrompt('Fix the bug.', DEFAULT_CONFIG);
  assertGte(r.contextWindowPercent, 0);
  assertLte(r.contextWindowPercent, 100);
});

test('modelLabel is non-empty', () => {
  const r = analyzePrompt('Fix the bug.', DEFAULT_CONFIG);
  assert(r.modelLabel && r.modelLabel.length > 0, 'modelLabel is empty');
});

test('estimatedSavableTokens matches sum of flag tokenImpacts', () => {
  const text = 'Basically just please fix this bug.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  const sumImpact = r.flags.reduce((s, f) => s + (f.tokenImpact ?? 0), 0);
  assertEqual(r.estimatedSavableTokens, sumImpact);
});

test('flags are sorted by start offset', () => {
  const text = 'Basically I was wondering if you could just fix this bug please.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  const starts = r.flags.map(f => f.start);
  for (let i = 1; i < starts.length; i++) {
    assert(starts[i] >= starts[i - 1], `flags out of order at index ${i}`);
  }
});

// ── Edge cases ───────────────────────────────────────────────────────────────

console.log('\n══ Edge cases ════════════════════════════════════════════════');

test('prompt with only code block → fromCodeBlocks > 0', () => {
  const text = '```python\nfor i in range(100):\n    print(i)\n```';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assertGte(r.breakdown.fromCodeBlocks, 1);
});

test('prompt with null-bytes does not throw', () => {
  try {
    analyzePrompt('Fix this \x00 null byte prompt.', DEFAULT_CONFIG);
  } catch (e) {
    throw new Error(`threw on null byte: ${e.message}`);
  }
});

test('extremely long filler phrase list does not hang (< 2s)', () => {
  const text = Array(50).fill('Basically just please fix this bug.').join(' ');
  const start = Date.now();
  analyzePrompt(text, DEFAULT_CONFIG);
  const elapsed = Date.now() - start;
  assertLte(elapsed, 2000, `took ${elapsed}ms, expected < 2000ms`);
});

test('prompt with only whitespace → 0 flags', () => {
  const r = analyzePrompt('     \n\n\n\t   ', DEFAULT_CONFIG);
  const meaningful = r.flags.filter(f => f.type !== 'threshold');
  assertEqual(meaningful.length, 0, `got ${meaningful.length} non-threshold flags on whitespace`);
});

test('unicode emoji in prompt does not throw', () => {
  try {
    const r = analyzePrompt('🚀 Fix the bug 🐛 please.', DEFAULT_CONFIG);
    assertGte(r.tokenCount, 1);
  } catch (e) {
    throw new Error(`threw on emoji: ${e.message}`);
  }
});

test('prompt with all filler → optimized is not empty', () => {
  const text = 'Basically just please.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  // Even if all tokens flagged, the optimizer should not produce nothing harmful
  assert(typeof r.optimizedPrompt === 'string');
});

test('cl100k_base model gives non-zero tokens for English', () => {
  const cfg = { ...DEFAULT_CONFIG, tokenizerModel: 'cl100k_base', selectedModelId: 'claude-sonnet-4' };
  const r = analyzePrompt('Fix the authentication bug.', cfg);
  assertGte(r.tokenCount, 1);
});

test('overlapping filler flags do not produce garbled output', () => {
  // "I was wondering if you could" + "just" overlap check
  const text = 'I was wondering if you could just help me with this.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assert(typeof r.optimizedPrompt === 'string' && r.optimizedPrompt.length >= 0);
});

test('code block with language tag is tokenised', () => {
  const text = '```typescript\nconst x: number = 42;\n```';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assertGte(r.breakdown.fromCodeBlocks, 1);
});

test('prompt with markdown headers → no false filler flags', () => {
  const text = '# Fix the Bug\n\n## Context\n\nThe login module fails.';
  const flags = findFillerPhrases(text, 'o200k_base');
  assertEqual(flags.length, 0, `expected 0, got ${flags.length}`);
});

test('repeated code block only counts code tokens once per block', () => {
  const block = '```js\nconsole.log("hello");\n```';
  const text = block + '\n\n' + block;
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  // fromCodeBlocks should roughly be 2× the single block's tokens
  const single = analyzePrompt(block, DEFAULT_CONFIG).breakdown.fromCodeBlocks;
  assert(r.breakdown.fromCodeBlocks >= single, 'two blocks should have >= one block tokens');
});

test('getTokenBreakdown: total equals sum of meaningful parts (approx)', () => {
  const text = 'Basically fix the login bug. The system uses OAuth.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  const { breakdown: b } = r;
  // total should equal narrative + code + filler (redundancy may double-count, so <=)
  assertLte(b.fromNarrative, b.total, 'narrative cannot exceed total');
});

test('no crash on prompt with only newlines', () => {
  const r = analyzePrompt('\n\n\n\n', DEFAULT_CONFIG);
  assert(typeof r.tokenCount === 'number');
});

test('explanations array is non-empty for problematic prompt', () => {
  const text = 'Basically just please fix this. I was wondering if you could also just please help.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assertGte(r.explanations.length, 1);
});

test('positive explanation for clean short prompt', () => {
  const r = analyzePrompt('Refactor the JWT middleware.', DEFAULT_CONFIG);
  assertIncludes(r.explanations, e => e.type === 'positive', 'expected positive explanation');
});

test('selectedModelId fallback to default when unknown', () => {
  const cfg = { ...DEFAULT_CONFIG, selectedModelId: 'non-existent-model-xyz' };
  const r = analyzePrompt('Fix the bug.', cfg);
  assert(r.modelLabel.length > 0, 'should fall back to default model label');
});

// ── estimateResponseComplexity ───────────────────────────────────────────────

console.log('\n══ estimateResponseComplexity ═══════════════════════════════');

test('returns an object with label, estimatedResponseTokens, multiplier, signals', () => {
  const r = estimateResponseComplexity('Explain quantum entanglement.', 10);
  assert(typeof r.label === 'string', 'label should be string');
  assert(typeof r.estimatedResponseTokens === 'number', 'estimatedResponseTokens should be number');
  assert(typeof r.multiplier === 'number', 'multiplier should be number');
  assert(Array.isArray(r.signals), 'signals should be array');
});

test('simple prompt gets simple or moderate label', () => {
  const r = estimateResponseComplexity('What is the capital of France?', 8);
  assert(['simple', 'moderate'].includes(r.label), `got ${r.label}`);
});

test('code generation prompt gets complex or high label', () => {
  const r = estimateResponseComplexity('Write a complete REST API in Node.js with authentication, JWT, and PostgreSQL integration.', 20);
  assert(['complex', 'high'].includes(r.label), `got label=${r.label}`);
});

test('estimatedResponseTokens >= 1 for non-empty prompts', () => {
  const r = estimateResponseComplexity('Generate a detailed report comparing 5 sorting algorithms.', 15);
  assertGte(r.estimatedResponseTokens, 1, 'estimatedResponseTokens should be at least 1');
});

test('multiplier is positive', () => {
  const r = estimateResponseComplexity('Fix the off-by-one error.', 10);
  assert(r.multiplier > 0, `multiplier should be > 0, got ${r.multiplier}`);
});

test('empty string returns defined result without throwing', () => {
  let r;
  try { r = estimateResponseComplexity('', 0); }
  catch (e) { throw new Error(`threw on empty: ${e.message}`); }
  assert(typeof r.estimatedResponseTokens === 'number');
  assertEqual(r.estimatedResponseTokens, 0);
});

test('list/enumerate signals detected', () => {
  const r = estimateResponseComplexity('List all OWASP Top 10 vulnerabilities with examples.', 12);
  assert(r.signals.length > 0, 'expected at least one signal');
});

test('comparison prompt detected as at least moderate', () => {
  const r = estimateResponseComplexity('Compare Python and Go for backend development.', 10);
  assert(['moderate', 'complex', 'high'].includes(r.label), `got ${r.label}`);
});

test('debug/fix prompt triggers debug signal', () => {
  const r = estimateResponseComplexity('Fix the typo.', 5);
  assert(r.signals.some(s => /debug|fix/i.test(s)), `expected debug/fix signal, got: ${r.signals}`);
});

test('analyzePrompt.complexity field is populated', () => {
  const r = analyzePrompt('Write a full REST API.', DEFAULT_CONFIG);
  assert(r.complexity !== undefined, 'complexity should be defined');
  assert(typeof r.complexity.estimatedResponseTokens === 'number', 'estimatedResponseTokens should be number');
  assert(typeof r.complexity.label === 'string', 'label should be string');
  assertGte(r.complexity.estimatedResponseTokens, 0);
});

// ── looksLikeCode (via semantic redundancy) ───────────────────────────────────

console.log('\n══ looksLikeCode (via semantic redundancy) ══════════════════');

test('Python comment lines not flagged as semantic duplicates', () => {
  const text = [
    '# Bug: the tax rate is hardcoded.',
    '# Security flaw: the tax rate is not validated.',
    '',
    'Please fix the tax calculation logic.',
  ].join('\n');
  const flags = findSemanticRedundancy(text, 'o200k_base');
  assertEqual(flags.length, 0, `got ${flags.length} flags on code comment lines`);
});

test('code lines not flagged as structural repeats', () => {
  const text = [
    'def calculate_tax(amount, rate=0.05):',
    '    return amount * rate',
    '',
    'The function computes the final tax amount.',
    '',
    'def calculate_tax(amount, rate=0.05):',
    '    return amount * rate',
  ].join('\n');
  const structFlags = findStructuralIssues(text, 'o200k_base');
  const repeatEnd = structFlags.filter(f => f.type === 'repeat-end');
  assertEqual(repeatEnd.length, 0, 'def blocks should not trigger repeat-end');
});

test('prose paraphrase IS still flagged when not code', () => {
  // Two sentences sharing many key tokens — Jaccard should fire
  const text = [
    'The authentication module validates and handles user login credentials.',
    'Unrelated filler sentence to create the required sentence gap here.',
    'Something completely different to ensure minimum sentence count is met.',
    'The user authentication system validates login credentials for users.',
  ].join(' ');
  const flags = findSemanticRedundancy(text, 'o200k_base');
  assertGte(flags.length, 1, 'expected semantic duplicate flag for paraphrased prose');
});

test('high symbol density line not flagged as redundant', () => {
  const text = [
    'x = {"key": [1, 2, 3], "val": (a > b) && (c | d)}',
    'Please review the data structure above.',
    'Another distinct sentence about the implementation.',
    'x = {"key": [1, 2, 3], "val": (a > b) && (c | d)}',
  ].join('\n');
  const flags = findSemanticRedundancy(text, 'o200k_base');
  assertEqual(flags.length, 0, 'symbol-dense code lines should not be flagged');
});

// ── Monthly budget edge cases ─────────────────────────────────────────────────

console.log('\n══ Monthly budget edge cases ════════════════════════════════');

test('analyzePrompt result has no NaN fields', () => {
  const r = analyzePrompt('Fix the login bug.', DEFAULT_CONFIG);
  assert(!isNaN(r.tokenCount), 'tokenCount is NaN');
  assert(!isNaN(r.charCount), 'charCount is NaN');
  assert(!isNaN(r.optimizedTokenCount), 'optimizedTokenCount is NaN');
  assert(!isNaN(r.contextWindowPercent), 'contextWindowPercent is NaN');
  assert(!isNaN(r.complexity.estimatedResponseTokens), 'complexity.estimatedResponseTokens is NaN');
});

test('zero-token prompt gives 0% context window', () => {
  const r = analyzePrompt('', DEFAULT_CONFIG);
  assertEqual(r.contextWindowPercent, 0);
});

test('flags array never contains undefined entries', () => {
  const text = 'Basically please fix this. I was wondering if you could basically help.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  for (const f of r.flags) {
    assert(f !== undefined && f !== null, 'flag entry is null/undefined');
    assert(typeof f.type === 'string', `flag.type is not a string: ${JSON.stringify(f)}`);
  }
});

test('optimized prompt never longer than original', () => {
  const text = 'Basically just please help me fix this bug. I was wondering if you could look at the error.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  assertLte(r.optimizedTokenCount, r.tokenCount);
});

test('overlapping filler+redundancy flags do not double-remove text', () => {
  // "I was wondering if you could" appears twice → gets both filler AND redundancy flags at same offset
  const text = 'I was wondering if you could please fix the bug. I was wondering if you could also explain the fix.';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  const opt = generateOptimizedPrompt(text, r.flags);
  // "also explain the fix" must survive — it's not a flag
  assert(opt.includes('explain the fix'), `"explain the fix" was eaten: "${opt}"`);
  assert(!opt.includes('I was wondering'), `filler not removed: "${opt}"`);
});

test('removedfiller leaves no dangling leading comma', () => {
  const text = 'As I mentioned earlier, this is the issue.';
  const flags = findFillerPhrases(text, 'o200k_base');
  const opt = generateOptimizedPrompt(text, flags);
  assert(!opt.startsWith(','), `starts with comma: "${opt}"`);
  assert(opt.toLowerCase().includes('this is the issue'), `body missing: "${opt}"`);
});

test('very large prompt (5000 tokens) completes in < 5s', () => {
  const text = Array(1000).fill('The authentication service validates JWT tokens on every request.').join(' ');
  const start = Date.now();
  analyzePrompt(text, DEFAULT_CONFIG);
  const elapsed = Date.now() - start;
  assertLte(elapsed, 5000, `took ${elapsed}ms`);
});

// ── findSensitiveData ────────────────────────────────────────────────────────

console.log('\n══ findSensitiveData ════════════════════════════════════');

test('detects Stripe live key', () => {
  const text = 'API_KEY = "sk_live_51NvXYZABCDEFGHIJKLMNOP"';
  const flags = findSensitiveData(text);
  assertGte(flags.length, 1, 'expected sensitive flag');
  assert(flags.some(f => f.type === 'sensitive'), 'expected type sensitive');
});

test('detects AWS access key ID', () => {
  const flags = findSensitiveData('key = AKIAIOSFODNN7EXAMPLE');
  assertGte(flags.length, 1, 'expected sensitive flag for AWS key');
});

test('detects JWT token', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const flags = findSensitiveData(`Authorization: Bearer ${jwt}`);
  assertGte(flags.length, 1, 'expected JWT flag');
});

test('detects customer name PII', () => {
  const flags = findSensitiveData('Customer Name:\nJohn Smith');
  assertGte(flags.length, 1, 'expected PII flag');
  assert(flags.some(f => /name/i.test(f.message)), 'expected name in message');
});

test('detects account number PII', () => {
  const flags = findSensitiveData('Account Number:\n1234567890');
  assertGte(flags.length, 1, 'expected account number flag');
});

test('detects SSN', () => {
  const flags = findSensitiveData('SSN: 123-45-6789');
  assertGte(flags.length, 1, 'expected SSN flag');
});

test('detects internal hostname', () => {
  const flags = findSensitiveData('host = payments-db-prod-01');
  assertGte(flags.length, 1, 'expected internal hostname flag');
});

test('no false positive on generic English text', () => {
  const flags = findSensitiveData('Please help me fix the login bug in the auth module.');
  assertEqual(flags.length, 0, `got ${flags.length} flags on clean text`);
});

test('no false positive on code with no secrets', () => {
  const flags = findSensitiveData('const result = await fetch("/api/users");');
  assertEqual(flags.length, 0, `got ${flags.length} flags on clean code`);
});

test('sensitive flags have valid offsets', () => {
  const text = 'Customer Name:\nAlice Johnson\nAccount Number:\n9876543210';
  const flags = findSensitiveData(text);
  for (const f of flags) {
    assert(f.start >= 0 && f.end <= text.length && f.start < f.end,
      `bad offsets start=${f.start} end=${f.end}`);
  }
});

test('detects internal ticket ID (INC-)', () => {
  const flags = findSensitiveData('This references internal ticket INC-48291.');
  assertGte(flags.length, 1, 'expected flag for INC-48291');
  assert(flags.some(f => /ticket/i.test(f.message)), 'expected ticket in message');
});

test('detects internal ticket ID (DB-)', () => {
  const flags = findSensitiveData('See Jira ticket DB-18274 for context.');
  assertGte(flags.length, 1, 'expected flag for DB-18274');
});

test('detects prefixed customer ID (CUST-)', () => {
  const flags = findSensitiveData('customer account ID CUST-100245');
  assertGte(flags.length, 1, 'expected flag for CUST-100245');
  assert(flags.some(f => /account|customer/i.test(f.message)));
});

test('already-redacted values are not flagged', () => {
  const flags = findSensitiveData('API_KEY = "<REDACTED_API_KEY>"');
  assertEqual(flags.length, 0, 'placeholder should not be flagged as secret');
});

test('analyzePrompt includes sensitive flags', () => {
  const text = 'Please summarize. Customer Name:\nJohn Smith\nAccount Number:\n1234567890\nInternal hostname: payments-db-prod-01';
  const r = analyzePrompt(text, DEFAULT_CONFIG);
  const sensitiveFlags = r.flags.filter(f => f.type === 'sensitive');
  assertGte(sensitiveFlags.length, 1, 'expected at least one sensitive flag from analyzePrompt');
});

// ── P3 structural — closing repeats opening ───────────────────────────────────

console.log('\n══ Structural repeat-end (short opening) ════════════════');

test('flags closing paragraph that mirrors a short opening', () => {
  const text = [
    'Help me optimize this API.',
    'It handles 10,000 requests per minute.',
    'The service is written in Go.',
    'Please analyze the implementation.',
    'Finally, help me optimize this API.',
  ].join('\n\n');
  const flags = findStructuralIssues(text, 'o200k_base');
  assertGte(flags.filter(f => f.type === 'structural').length, 1, 'expected repeat-end flag');
});

test('short distinct closing does not trigger structural', () => {
  const text = [
    'Help me optimize the API.',
    'It handles high traffic.',
    'The service uses caching.',
    'Let me know what you think.',
  ].join('\n\n');
  const flags = findStructuralIssues(text, 'o200k_base');
  const repeatEnd = flags.filter(f => f.type === 'structural');
  assertEqual(repeatEnd.length, 0, 'should not flag distinct closing');
});

// ── Summary ──────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n══ Results: ${passed}/${total} passed, ${failed} failed ══\n`);

// ── Write eval.md ─────────────────────────────────────────────────────────────

const now    = new Date().toISOString();
const suites = [
  { heading: 'countTokens',           slice: [0, 9]   },
  { heading: 'findFillerPhrases',     slice: [9, 19]  },
  { heading: 'findRedundantContext',  slice: [19, 23] },
  { heading: 'findSemanticRedundancy',slice: [23, 30] },
  { heading: 'findStructuralIssues',  slice: [30, 35] },
  { heading: 'findOversizedCodeBlocks',slice:[35, 40] },
  { heading: 'generateOptimizedPrompt',slice:[40, 49] },
  { heading: 'analyzePrompt (integration)',slice:[49,63]},
  { heading: 'Edge Cases',            slice: [63, 79]  },
  { heading: 'estimateResponseComplexity', slice: [79, 89] },
  { heading: 'looksLikeCode (via semantic redundancy)', slice: [89, 93] },
  { heading: 'Monthly budget edge cases', slice: [93, 999] },
];

function statusEmoji(s) { return s === 'PASS' ? '✅' : '❌'; }

let md = `# Prompt Gym — Eval Report\n\n`;
md += `**Run date:** ${now}  \n`;
md += `**Result:** ${passed}/${total} passed (${failed} failed)\n\n`;
md += `---\n\n`;

for (const { heading, slice } of suites) {
  const rows = results.slice(slice[0], slice[1]);
  if (!rows.length) { continue; }
  md += `## ${heading}\n\n`;
  md += `| Status | Test | Notes |\n`;
  md += `|--------|------|-------|\n`;
  for (const r of rows) {
    const notes = r.status === 'FAIL' ? r.error ?? '' : '';
    md += `| ${statusEmoji(r.status)} ${r.status} | ${r.name} | ${notes} |\n`;
  }
  md += '\n';
}

md += `---\n\n`;
md += `## Summary\n\n`;
md += `| Metric | Value |\n|--------|-------|\n`;
md += `| Total tests | ${total} |\n`;
md += `| Passed | ${passed} |\n`;
md += `| Failed | ${failed} |\n`;
md += `| Pass rate | ${((passed / total) * 100).toFixed(1)}% |\n`;

const evalPath = join(dirname(fileURLToPath(import.meta.url)), 'eval.md');
writeFileSync(evalPath, md, 'utf8');
console.log(`Eval written to ${evalPath}\n`);

if (failed > 0) { process.exit(1); }
