# Prompt Gym — Eval Report

**Run date:** 2026-06-25T17:08:43.403Z  
**Result:** 116/116 passed (0 failed)

---

## countTokens

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | empty string → 0 tokens |  |
| ✅ PASS | empty string cl100k → 0 tokens |  |
| ✅ PASS | single word has at least 1 token |  |
| ✅ PASS | longer text has more tokens than short text |  |
| ✅ PASS | whitespace-only string → small token count |  |
| ✅ PASS | unicode text tokenises without throwing |  |
| ✅ PASS | very long text (10k words) tokenises |  |
| ✅ PASS | code block tokenises correctly |  |
| ✅ PASS | o200k vs cl100k give similar (within 20%) counts for English |  |

## findFillerPhrases

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | detects "basically" |  |
| ✅ PASS | detects "I was wondering if you could" |  |
| ✅ PASS | detects "actually" mid-sentence |  |
| ✅ PASS | no false positives on clean prompt |  |
| ✅ PASS | detects "please" as filler |  |
| ✅ PASS | detects multiple fillers in one prompt |  |
| ✅ PASS | filler detection is case-insensitive |  |
| ✅ PASS | filler flags have valid start/end offsets |  |
| ✅ PASS | empty string → no filler flags |  |
| ✅ PASS | "as previously mentioned" is flagged |  |

## findRedundantContext

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | detects exact repeated sentence |  |
| ✅ PASS | no false positive on unique sentences |  |
| ✅ PASS | short text (fewer than 12 words) → no redundancy flags |  |
| ✅ PASS | redundancy flags have correct types |  |

## findSemanticRedundancy

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | flags sentence that repeats key words of an earlier sentence |  |
| ✅ PASS | no false positive when sentences are distinct |  |
| ✅ PASS | adjacent sentences do not trigger semantic flag |  |
| ✅ PASS | semantic flags have type semantic-redundancy |  |
| ✅ PASS | empty string → no semantic flags |  |
| ✅ PASS | single sentence → no semantic flags |  |
| ✅ PASS | very short sentences (< 15 chars) are skipped |  |

## findStructuralIssues

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | flags closing paragraph that repeats opening |  |
| ✅ PASS | flags bullet preamble that shares significant keywords with its bullets |  |
| ✅ PASS | clean prompt with short intro → no structural flags |  |
| ✅ PASS | requires at least 3 paragraphs for repeat-end detection |  |
| ✅ PASS | structural flags have valid offsets |  |

## findOversizedCodeBlocks

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | flags code block exceeding threshold |  |
| ✅ PASS | small code block is not flagged |  |
| ✅ PASS | no code block → no flags |  |
| ✅ PASS | multiple code blocks — only oversized ones flagged |  |
| ✅ PASS | oversized-code flag has tokenImpact > 0 |  |

## generateOptimizedPrompt

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | removes filler phrases |  |
| ✅ PASS | result is shorter than original when fillers removed |  |
| ✅ PASS | no double-spaces after removal |  |
| ✅ PASS | result starts with uppercase letter |  |
| ✅ PASS | clean prompt unchanged |  |
| ✅ PASS | empty prompt returns empty string |  |
| ✅ PASS | removes semantic-redundancy spans |  |
| ✅ PASS | removes structural repeat-end spans |  |
| ✅ PASS | no triple newlines in output |  |

## analyzePrompt (integration)

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | returns correct shape |  |
| ✅ PASS | tokenCount matches charCount direction |  |
| ✅ PASS | charCount is text length |  |
| ✅ PASS | optimizedTokenCount <= tokenCount |  |
| ✅ PASS | empty prompt → 0 tokens |  |
| ✅ PASS | threshold flag appears when over limit |  |
| ✅ PASS | no threshold flag when under limit |  |
| ✅ PASS | breakdown total matches tokenCount |  |
| ✅ PASS | breakdown values are non-negative |  |
| ✅ PASS | contextWindowPercent is between 0 and 100 for normal prompt |  |
| ✅ PASS | modelLabel is non-empty |  |
| ✅ PASS | estimatedSavableTokens matches sum of flag tokenImpacts |  |
| ✅ PASS | flags are sorted by start offset |  |
| ✅ PASS | prompt with only code block → fromCodeBlocks > 0 |  |

## Edge Cases

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | prompt with null-bytes does not throw |  |
| ✅ PASS | extremely long filler phrase list does not hang (< 2s) |  |
| ✅ PASS | prompt with only whitespace → 0 flags |  |
| ✅ PASS | unicode emoji in prompt does not throw |  |
| ✅ PASS | prompt with all filler → optimized is not empty |  |
| ✅ PASS | cl100k_base model gives non-zero tokens for English |  |
| ✅ PASS | overlapping filler flags do not produce garbled output |  |
| ✅ PASS | code block with language tag is tokenised |  |
| ✅ PASS | prompt with markdown headers → no false filler flags |  |
| ✅ PASS | repeated code block only counts code tokens once per block |  |
| ✅ PASS | getTokenBreakdown: total equals sum of meaningful parts (approx) |  |
| ✅ PASS | no crash on prompt with only newlines |  |
| ✅ PASS | explanations array is non-empty for problematic prompt |  |
| ✅ PASS | positive explanation for clean short prompt |  |
| ✅ PASS | selectedModelId fallback to default when unknown |  |
| ✅ PASS | returns an object with label, estimatedResponseTokens, multiplier, signals |  |

## estimateResponseComplexity

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | simple prompt gets simple or moderate label |  |
| ✅ PASS | code generation prompt gets complex or high label |  |
| ✅ PASS | estimatedResponseTokens >= 1 for non-empty prompts |  |
| ✅ PASS | multiplier is positive |  |
| ✅ PASS | empty string returns defined result without throwing |  |
| ✅ PASS | list/enumerate signals detected |  |
| ✅ PASS | comparison prompt detected as at least moderate |  |
| ✅ PASS | debug/fix prompt triggers debug signal |  |
| ✅ PASS | analyzePrompt.complexity field is populated |  |
| ✅ PASS | Python comment lines not flagged as semantic duplicates |  |

## looksLikeCode (via semantic redundancy)

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | code lines not flagged as structural repeats |  |
| ✅ PASS | prose paraphrase IS still flagged when not code |  |
| ✅ PASS | high symbol density line not flagged as redundant |  |
| ✅ PASS | analyzePrompt result has no NaN fields |  |

## Monthly budget edge cases

| Status | Test | Notes |
|--------|------|-------|
| ✅ PASS | zero-token prompt gives 0% context window |  |
| ✅ PASS | flags array never contains undefined entries |  |
| ✅ PASS | optimized prompt never longer than original |  |
| ✅ PASS | overlapping filler+redundancy flags do not double-remove text |  |
| ✅ PASS | removedfiller leaves no dangling leading comma |  |
| ✅ PASS | very large prompt (5000 tokens) completes in < 5s |  |
| ✅ PASS | detects Stripe live key |  |
| ✅ PASS | detects AWS access key ID |  |
| ✅ PASS | detects JWT token |  |
| ✅ PASS | detects customer name PII |  |
| ✅ PASS | detects account number PII |  |
| ✅ PASS | detects SSN |  |
| ✅ PASS | detects internal hostname |  |
| ✅ PASS | no false positive on generic English text |  |
| ✅ PASS | no false positive on code with no secrets |  |
| ✅ PASS | sensitive flags have valid offsets |  |
| ✅ PASS | detects internal ticket ID (INC-) |  |
| ✅ PASS | detects internal ticket ID (DB-) |  |
| ✅ PASS | detects prefixed customer ID (CUST-) |  |
| ✅ PASS | already-redacted values are not flagged |  |
| ✅ PASS | analyzePrompt includes sensitive flags |  |
| ✅ PASS | flags closing paragraph that mirrors a short opening |  |
| ✅ PASS | short distinct closing does not trigger structural |  |

---

## Summary

| Metric | Value |
|--------|-------|
| Total tests | 116 |
| Passed | 116 |
| Failed | 0 |
| Pass rate | 100.0% |
