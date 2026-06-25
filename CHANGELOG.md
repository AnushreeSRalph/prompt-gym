# Changelog

## [0.9.0] — 2026-06-25

### Added
- Sensitive data detection — flags API keys, JWTs, AWS/Stripe/GitHub tokens, internal ticket IDs (INC-, DB-, JIRA-), customer/account reference IDs (CUST-, ACCT-), SSNs, account numbers, internal hostnames, and PII fields; highlighted in red with replacement suggestions
- Structural repeat-end detection now catches short single-sentence openings (threshold lowered from 5 → 3 semantic words)

### Fixed
- Optimized prompt double-removal bug — overlapping filler + redundancy flags at the same position no longer eat adjacent text
- Post-processing cleanup: dangling commas, standalone `!` artifacts, and missing capitalisation after filler removal are now corrected
- `generateOptimizedPrompt` capitalises first word of each paragraph after removals

## [0.1.1] — 2026-06-24

### Added
- Activity bar icon — Prompt Gym now appears in the VS Code sidebar like GitHub Copilot (click the barbell icon to open)
- Response complexity estimate — gauge shows estimated response tokens and total cost (prompt + response); Why High? tab explains the signals driving the estimate
- Monthly token budget reads from `promptGym.monthlyTokenBudget` setting (default 400K); context bar shows "resets 1st" reminder

### Fixed
- VSIX bundle size: 9.91 MB → 1.5 MB — source map was being included due to a glob depth issue in `.vscodeignore`

## [0.1.0] — 2026-06-19

### Added
- Live token counting via `gpt-tokenizer` (o200k_base and cl100k_base) — fully offline, no API key
- Model selector: GPT-4o, GPT-4.1, o3, Copilot, Claude Sonnet/Haiku/Opus 4, Gemini 2.5 Flash/Pro
- Filler phrase detection (30+ patterns) with inline Remove buttons
- Exact redundancy detection via sliding 6-word window
- Semantic redundancy detection via Jaccard similarity on sentence pairs
- Structural issue detection: closing paragraph repeats opening; verbose bullet preamble
- Oversized code block flagging with configurable token threshold
- One-click Remove button per flag — applies fix instantly without leaving the Issues tab
- Optimized prompt view with Diff / Clean sub-tabs
- 30-day prompt history with Jaccard-based similarity warning
- Status bar token counter — tracks active file or selection; switches to panel count while Prompt Gym is open
- Right-click → Prompt Gym: Optimize Selection — replace, copy, or open in panel
- Token breakdown chart (Why High? tab) with plain-English explanations
- Monthly token budget tracker (400 K/month default)
- `promptGym.tokenWarningThreshold` setting (default 2000)
- `promptGym.pastedCodeTokenThreshold` setting (default 300)
- `promptGym.tokenizerModel` setting (default o200k_base)
