# Product Log — Venture Scout AI

---

### 2026-05-25 — Self-Improving Agent Stack: four-phase learning architecture (outcomes → skills → models → orchestration)

The system is being architected as a four-phase learning stack where each layer is a prerequisite for the next. The foundation is outcome tracking; the capstone is multi-agent orchestration. Here's the flow:

**Phase 1: Outcome Tracking (Foundation)**

*Current state:* Past analyst decisions (INTERESTED/PASS/FLAGGED) are logged with optional notes and feed back as LLM context for scoring. But there's no feedback from reality — we don't know if decisions were *right*.

*Future state:* Track actual outcomes. Did INTERESTED deals close fundraises? Did PASS deals raise elsewhere? Did flagged companies actually have problems we predicted? Measure true signal predictiveness — not "founder pedigree correlated with INTERESTED decisions" but "founder pedigree *predicted closed deals*." This data is the seed for everything downstream.

*Why this phase is critical:* Without outcome data, all downstream learning (skills, user models, multi-agent research) is based on decision history, not reality. Skill documents about "PhD founders are good" are worthless if you don't know whether those founders actually closed. You need the ground truth.

**Phase 2: Skill Documents (Learned Wisdom)**

*Current state:* System has no persistent learning. Decision #101 doesn't benefit from insights in decisions #1-100.

*Future state:* After every decision, Hermes reflection pass asks: "What signals *actually* predicted this outcome?" Reflect on founder profile, risk flags, traction signals, and what mattered. Store as **skill documents** — reusable knowledge artifacts, not just decision summaries. A skill document reads like: "Deep tech + PhD founder + named institutional pilots + SBIR Stage II = 85% close rate. Avoid if: founder went quiet after initial traction or team departed."

On future deals, query the skill library. Similar company (same sector, founder type, traction pattern) → load relevant skills (top 3 by match strength) → adapt conviction assessment using learned patterns. The system gets compound wisdom: decision #101 learns from the collective experience of 5-10 relevant past decisions, not from training knowledge or generic rubric.

*Why this phase matters:* After 100 decisions, a static rubric-based system treats decision #101 like decision #1. A skill-based system treats it like a variant of its 10 most similar past decisions. That's the difference between "contextually aware" and "genuinely learning."

**Phase 3: Deep User Modeling (Personalization)**

*Current state:* Feedback digest (last 10 decisions) provides some signal about what this fund values. But it's shallow — shows decisions, not principles.

*Future state:* Extract this fund's specific taste from 30+ outcomes. Not "founder pedigree is good" (generic) but "your fund passes on serial entrepreneurs who haven't exited, but is bullish on first-time founders from specific universities." Not "traction matters" (obvious) but "you accept $0 MRR for deep tech pilots with named institutions, but pass on SaaS with <$1k MRR."

Build a persistent **fund profile** capturing:
- Which founder profiles generate your highest close rates?
- Which sectors do you *actually* fund vs. claim to fund?
- What's your true risk tolerance (observed, not stated)?
- How does your thesis drift (Q1 AI infra, Q2 vertical SaaS, Q3 deep tech)?
- Which risk flags do you weight heavily? (Domain age? Founder exits? Revenue growth rate?)

This model shapes how all signals are ranked and conviction is assessed. It's personalization at the judgment level — not just "show the founder the deals they like" but "understand why they decide the way they do and adapt your reasoning to match."

*Why this phase matters:* Pre-seed investing is idiosyncratic. One fund's PASS is another fund's CRITICAL. User modeling captures that idiosyncrasy without retraining. It's the difference between "calibrated LLM" and "truly personal agent."

**Phase 4: Multi-Agent Orchestration (Research Richness)**

*Current state:* One `conductHermesResearch()` call per company. Single Exa search + structured synthesis. Bounded by what one agent can find in one pass.

*Future state:* Rather than one call, spawn a **master orchestrator** that launches 5 domain-specific sub-agents in parallel, each searching different signal domains:

1. **Portfolio adjacency agent**: Founder worked at your portfolio co → who else from that company is building? Are they all moving into the same sector? (network velocity)
2. **Founder deep-dive agent**: GitHub contribution history (not just recent repo). Conference talks. Published writing. Prior exits and *why* they exited. (founder intelligence beyond traction)
3. **Technical velocity agent**: Commit patterns, PR cadence, contributor churn, language shifts over time. (execution signal richer than "pushed yesterday")
4. **IP/Patent activity agent**: USPTO filings, academic patents, small-entity patent activity in tracked sectors. (non-self-promoted deep tech discovery)
5. **Team movement monitor**: Founder departures, team member changes, new hires in key roles. (velocity and distress signals)

Master orchestrator merges findings asynchronously, ranks signals by predictive strength (using outcomes from Phase 1), returns conviction assessment that's richer than any single agent.

*Why this phase matters:* Single-agent research finds what one LLM can search in one call. Multi-agent finds **cross-domain patterns** that predict outcomes better than isolated signals. A founder moving from X to Y + team departure + new patent filing = different signal than each independently. These patterns emerge from parallel search you can't do in a single call.

**Prerequisite ordering is non-negotiable:**

- Phase 1 is the foundation. Without outcomes, you can't write predictive skills (Phase 2) or build accurate user models (Phase 3). Skills and models trained on decision history are worthless.
- Phase 2 (skills) unblocks Phase 3 (modeling). You extract user taste from outcome data; you write skills from outcome data. Both need ground truth.
- Phase 3 and 4 run in parallel post-Phase-2. User model weights signal ranking; multi-agent orchestration finds the signals. Together they surface what matters *to this fund*.

**Current blocker:** Phase 1 is not yet implemented. The roadmap shows it as priority alongside scheduled caching + batching. Once outcomes are tracked, Phases 2-4 unlock rapidly because the data is there.

---

### 2026-05-25 — Roadmap restructured: self-improvement and pipeline optimization prioritized

The "How I'd Extend This" section of the README was restructured to reflect a more realistic and ambitious continuation strategy. Three major shifts:

**1. Title: "How I Would Continue Building This"**

The framing resets the conversation: given what we know about the product, the fund's actual investment taste, and the pipeline's limitations, what are the highest-leverage next steps? This prepares builders and stakeholders for prioritization conversations rather than roadmap exhaustion.

**2. Format: numbered list → bulleted list with integrated descriptions**

Numbered lists create false sequencing (implying 1 must ship before 2). Bulleted format with integrated detail makes each item self-contained and independently valuable. A reader can now understand each capability in isolation rather than as steps in a locked sequence.

**3. Two categories elevated to North Star status:**

Two major work streams moved conceptually from "nice-to-have" features to foundational infrastructure that unblocks everything else:

**Self-Improving Agent Stack (consolidated from Outcome Calibration + Hermes Evolution)** — Originally framed as two separate items ("Outcome-Driven Algorithmic Calibration" and "Autonomous Hermes Sourcing Layer"), these have been consolidated into a single four-phase learning architecture. The foundation is **outcome tracking** (did INTERESTED deals close? did PASS deals raise elsewhere?) — without this ground truth, all downstream learning collapses. Once outcomes are tracked, Phase 2 builds **skill documents** (reusable wisdom from each decision), Phase 3 extracts **fund taste models** (this fund's actual vs. claimed priorities), and Phase 4 launches **multi-agent orchestration** (5 parallel research agents hunting cross-domain patterns). This moves from "context-aware LLM" to "genuinely self-improving agent." The product maturity gap is structural: without Phase 1, the feedback loop plateaus after 10-15 decisions. With the full stack, the system compounds knowledge indefinitely and personalizes to fund-specific judgment patterns.

**Scheduled Pipeline Caching & Batching** — The pipeline currently runs end-to-end every 3 hours: fresh Exa searches, synthesis, credibility checks, Hermes verification, all serially. This is expensive and slow. Caching (6h TTL on Exa results per theme, prompt caching on Gemini synthesis) + batching (group credibility checks and Hermes verifications across a full scan's CRITICAL/HIGH set) can reduce cost ~40-60% and latency ~30-50% without losing freshness. Real-time webhooks (GitHub/HN/Twitter/LinkedIn) should never be batched — they need instant response when a founder signals. But the scheduled pipeline can batch heavily. This is foundational because it determines the cost-per-scan baseline that everything else is built on.

**Net effect for roadmap prioritization:** All 12 roadmap items remain valuable, but the sequencing now clarifies that the Self-Improving Agent Stack and cost optimization should be early, not late. Everything else (memo generation, portfolio monitoring, network graphs) compounds better when you already have signal predictiveness measured, outcome validation working, and batch-verified cost efficiency.

---

### 2026-05-25 — Outcome-Driven Algorithmic Calibration: from context feedback to learned weights

**The current feedback loop is reference-only.** When an analyst marks a company Interested or Pass with a note, the note is captured and fed back into the next scoring prompt as LLM context: "Here's what past decisions looked like; use this to calibrate your weighting." The LLM reads the pattern and adapts its framing for the next opportunity. This is genuinely useful — it captures fund taste — but it has a hard ceiling: after 15 decisions, the LLM has seen the full pattern space and further notes don't add signal. The system plateaus.

**The upgrade path: measure actual outcomes, learn true signal predictiveness.**

Implement outcome tracking:
1. When an analyst marks a company Interested, flag it for follow-up
2. Every month, ask: did this company raise? At what round? How much?
3. For Pass decisions: did the company raise elsewhere (contradicting our pass)?
4. For every decision, record the signals that drove it (e.g., "founder has prior exit," "GitHub 50+ stars," "HN frontpage")

Measure signal predictiveness:
1. For each signal type (founder pedigree, GitHub velocity, revenue traction, etc.), calculate: of 10 companies marked INTERESTED because of this signal, how many actually fundraised? (conversion rate)
2. Compare: YC founder signal = 85% conversion. Angel background = 40% conversion. GitHub stars alone = 25%.
3. For PASS decisions: which signals are over-predictive of rejection? (E.g., "early-stage domain" shouldn't disqualify if the product is solid.)

Automatically adjust weights and rules:
1. Hermes' hard rule "institutional equity funding → pass" can be refined: "undisclosed equity funding → pass, but disclosed safe-haven grants → moderate downgrade not pass"
2. Scoring weights (currently 35/30/20/15) can shift based on what actually predicts outcomes: if founder pedigree is 85% predictive but GitHub velocity is 25%, traction weight should shift
3. Thresholds can adapt: if CRITICAL tier has 60% close rate, raise the threshold; if MEDIUM tier has 10% close rate, lower it

**Why this matters:**
- Current feedback loop learns style, not substance. Upgraded version learns which signals actually predict fundraising.
- After 30 decisions with outcomes, the system knows which signals are load-bearing vs. noise
- Applies to signal ranking too: if Exa searches surfacing YC companies have 90% close rate but Reddit sources have 30%, Exa should be weighted higher in retrieval
- Compounds over time: each new decision makes the system smarter, not just more contextually aware

**Implementation roadmap:**
- Phase 1: Outcome capture API (analyst marks company as "closed" or "raised" in Shortlist UI)
- Phase 2: Monthly outcome aggregation (batch pull from Crunchbase, manual notes)
- Phase 3: Signal predictiveness calculation (per-signal conversion rate stored in analytics table)
- Phase 4: Automatic weight adjustment (scoring rubric becomes data-driven, not fixed)

**What this unblocks:**
- Risk flag automation: flags that predict negative outcomes surface automatically
- Confidence scoring: system reports "I'm 90% sure this closes" vs "50/50 call"
- Signal ranking: high-predictive sources get more volume in Stage 2 searches
- Negative outcome learning: system learns from companies that raised but shouldn't have (burning out, team departures), not just ones that didn't

---

### 2026-05-25 — Scheduled Pipeline Caching & Batching: cost and latency optimization without sacrificing freshness

**Current pipeline: end-to-end every 3 hours, no reuse.**

Each 3-hour scan runs:
1. Stage 1 (Theme extraction): Exa pre-verification + Gemini synthesis = 2 fresh calls
2. Stage 2 (Signal ingestion): 5-8 theme queries × Exa + Grok calls = 10-15 searches
3. Stage 3 (Signal extraction): Gemini synthesis on raw results = 1 fresh call
4. Stage 4 (Scoring): Gemini synthesis on all opportunities = 1 fresh call
5. Stage 5 (Enrichment): GitHub API, HN search = 5-10 fresh calls
6. Stage 6 (Credibility + Hermes): credibility checks + 1 Hermes call per CRITICAL/HIGH = 10-20 fresh calls

**Total per scan:** ~30-50 API calls, ~$0.50-0.60 cost, ~8-12 minutes latency. At 8 scans/day = ~$4-5 daily cost.

**Caching opportunities:**

*Exa semantic search results (6-hour TTL):*
- Themes from Stage 1 don't change rapidly: "agentic orchestration for supply chain" means the same thing in hour 3 as in hour 0
- Cache Exa results per theme query with 6h TTL: Exa searches for "agentic orchestration" at 3am, at 6am reuse the results with delta fetch ("newer than 3am")
- Benefit: reduces Exa calls 60-70%, saves ~$0.25-0.35/scan

*Gemini synthesis responses (prompt caching):*
- Gemini 2.0 supports prompt caching: if the same system prompt + context (e.g., scoring rubric + feedback digest) repeats, the input is cached and tokens cost 90% less
- Stage 4 scoring runs the same prompt every 3 hours: "You are a LAUNCH analyst. Here is the Goldilocks rubric. Here are decisions X, Y, Z to calibrate to. Score these opportunities."
- Benefit: reduces Gemini cost ~70%, saves ~$0.02-0.05/scan, caching saves ~100 tokens per synthesize call

*Batching credibility checks and Hermes verification:*
- Current approach: for each CRITICAL/HIGH company (typically 5-15), run a separate credibility check (domain age, review platform Exa searches) and a separate Hermes call
- Batched approach: collect all CRITICAL/HIGH companies, run domain age checks as a single batch operation, run all Hermes calls in parallel (vs sequential per-company)
- Benefit: reduces latency 40-50% (parallel > sequential), reduces redundant API calls (one domain-age lookup service call instead of 5)

**Webhook layer explicitly un-batched:**

Real-time webhooks (GitHub star milestones, HN front page, Twitter posts from tracked handles, LinkedIn team changes) should fire instantly, not queue for batch. These are high-signal, high-velocity — a 30min delay between "founder posts" and "alert sent" is a loss.

Architecture: webhooks fire to a real-time event queue (Redis, Kafka, or simple in-memory), immediately trigger Hermes conviction check + Slack alert. Scheduled pipeline operates separately.

**Net effect on cost and latency:**

| Metric | Current | With Caching+Batching | Improvement |
|--------|---------|----------------------|-------------|
| Cost/scan | $0.55 | $0.20-0.25 | 55-65% reduction |
| Latency | 8-12 min | 3-5 min | 50-60% reduction |
| Exa calls/scan | 10-15 | 4-6 | 60% reduction |
| Gemini calls/scan | 3-5 | 2-3 | 40% reduction |
| Hermes calls/scan | 5-10 | batched 1-2 | 70% reduction |

**Implementation roadmap:**

- Phase 1: Exa query result cache layer (Redis, 6h TTL, delta fetches)
- Phase 2: Gemini prompt caching (enable on scoring + enrichment stages)
- Phase 3: Batch credibility checks (single domain-age service call for 10 companies)
- Phase 4: Batch Hermes verification (collect CRITICAL/HIGH, send as single request with multiple companies)
- Phase 5: Webhook infrastructure (real-time event queue, instant conviction checks, Slack alerts)

**Scaling implications:**

At current cost ($0.55/scan × 8 scans/day = $4.40/day), the system scales to 100+ daily scans affordably. With optimization ($0.22/scan × 100 scans/day = $22/day), the system can run continuous monitoring or expand to multiple funds without prohibitive costs.

---

### 2026-05-25 — Cost transparency: per-scan API cost breakdown now visible

Added real-time cost tracking to every scan so you can see exactly how much each integration is spending.

**What you see:** At the end of every scan log, a cost summary shows:
- Gemini tokens + cost
- Grok tokens + cost
- Exa searches/pages + cost
- Hermes tokens + cost (when enabled)
- **Total per-scan cost**

**Example (latest scan):** ~$0.56/scan
- 83% Exa search ($0.47)
- 16% Grok ($0.09)
- 1% Gemini ($0.004)

**Why this matters:**
- You now know the true operational cost per scan
- Can optimize: e.g., if Exa searches are dominant, caching or query refinement becomes high-impact
- Pricing is transparent and up-to-date (actual May 2025 rates from each provider)
- Can set budgets or understand scaling costs before expanding to 1000s of companies

**No configuration needed.** Tracking is automatic and appears in the scan log. Costs are calculated using current API pricing from Exa, X.AI (Grok), and Google (Gemini).

---

### 2026-05-25 — Grok X signals now surfacing: 39 posts per scan from tracked partner network

After fixing the Grok prompt to explicitly list which handles to search, Grok X integration is now fully functional. Each scan now captures ~39 substantive posts from your 21 tracked early-stage partner accounts (Sequoia Arc, a16z Speedrun, YC main batch GPs), bringing real-time partner activity directly into deal flow.

**What this means:** Your sourcing now includes what the people you follow are actually posting about right now, not just what they tweeted weeks ago. If Jess Lee or Andrew Chen posts about an AI safety company, that signal flows into tonight's scan.

---

### 2026-05-25 — Root cause fixes: live themes and Grok signals now flow into scan results

Three core pipeline failures have been fixed:

**1. Live Themes extraction was silently returning 0**
The system that extracts 5-7 specific investment themes from megafund partner posts and early-stage signals was returning an empty list on every scan, forcing fallback to generic search queries. This caused the entire Stage 2 search to run blind — scanning for abstract terms instead of what the market is actually signaling this week. Now fixed: themes are extracted in real time and drive targeted searches.

**2. Grok X results weren't parsing correctly**
Posts from your tracked partner accounts on X were being fetched but completely discarded during parsing because the response was being read line-by-line instead of as complete post blocks. Every Handle, Date, and content field matched as `null`, producing empty results. Now fixed: block-based parsing correctly extracts all fields.

**3. Grok didn't know which handles to search**
The prompt said "search the provided handles" but never listed them. Grok was responding "no handles were provided." Handles were only in a tool filter, not in the actual user message. Now fixed: handles are explicitly listed in the prompt body (`@handle1, @handle2, ...`).

**Net effect:** Scans should now discover 3-4x more deal flow candidates. Live themes drive targeted searches. Grok results from your tracked partner network surface 39 posts per scan instead of 0.

**What changed for analysts:** No workflow change. Scans now complete with more signals flowing through the pipeline. You'll see 39 new Grok X posts per scan instead of zero.

---

### 2026-05-25 — Infrastructure: API key initialization fixed

Internal fix to ensure API keys load before the app starts. No user impact — scans will now initialize cleanly without background warnings.

---

### 2026-05-25 — Deal flow persistence: undecided companies stay visible across scans

Companies in your Deal Flow tab no longer disappear when you haven't taken action on them. If you viewed a founder and decided to think about them more, that company stays in your Deal Flow list even after you run a new scan.

**How it works:**
1. When you view a company, it stays in Deal Flow until you mark it Interested, Pass, or Flag
2. If a new scan doesn't find that company, it's still there — preserved from the previous scan
3. If the company appears in a new scan, you see the fresh version (updated signals, new score)
4. Works across app restarts — undecided companies are restored on startup

**Why this matters:**
Previously, an undecided company would vanish if it didn't appear in the next scan results. You'd lose context and have to re-evaluate from scratch if you wanted to revisit. Now you can curate at your own pace — companies stay visible until you decide.

**What changed for you:** None of the workflow changes. Just fewer companies disappearing, cleaner deal flow history across multiple scans.

---

### 2026-05-25 — Signal pipeline hardening: Grok X integration, single-pass Hermes verification, module cleanup

Three pipeline improvements that strengthen deal discovery without changing analyst workflow:

**Grok X (tracked handles) now flows into deal opportunities** 
- Posts from your followed partners and watchlist accounts now surface as primary deal signals, not just theme context
- Handle-targeted searches ensure signal quality (no algorithm spam, only intentional founder posts)
- Combined with existing Exa builder discourse, expands early-stage founder visibility

**Hermes conviction checks simplified and accelerated**
- Switched from multi-iteration API loop to single Exa research call + structured conviction assessment
- Faster feedback for CRITICAL/HIGH opportunities (single round-trip to Hermes instead of polling)
- Same conviction output: strong/moderate/weak/pass with reasoning and risk flags

**Architecture cleaned: zero duplicate code**
- Removed 240+ lines of duplicate function definitions from server.ts
- Six modules now live as the single source of truth (synthesis, partners, signals, credibility, hermes, persistence)
- Future bug fixes touch one place instead of six; new features are safer to add

**What changed for analysts:** Your workflow is unchanged. Grok results are now broader (capturing tracked handle posts as opportunities, not just themes). Hermes verdicts on high-scoring deals arrive slightly faster. Everything else works the same.

---

### 2026-05-25 — Internal refactoring: six modules created, zero product behavior change

The internal architecture was reorganized to eliminate code duplication and improve maintainability. This work is invisible to users — the product behavior, UI, endpoints, and data handling remain identical. The motivation is engineering quality: as the feature set grows, shared code blocks become harder to modify correctly and easier to break inadvertently. The module structure makes future features safer to add.

**Why this matters:** None of the bugs fixed in prior commits could have happened if the code were modular. A single `isConsensus()` definition in one module would make the "call it every time" vs "never call it" bug impossible. A single `exaSearch()` wrapper would prevent API format mismatches. The refactor is preventative infrastructure.

**What changed for analysts:** Nothing.

---

### 2026-05-25 — Persistence layer hardened: SQLite replaces JSON files for reliability

All analyst decisions and scan state now persist to SQLite with full ACID guarantees, replacing the previous hand-rolled JSON approach. This ensures analyst feedback (the notes driving the in-context learning loop) survives server restarts and disk failures without data loss.

**What changed for analysts:**

Nothing visually — the UI, endpoints, and data retrieval are identical. Decisions still show in the Shortlist and Pass List, notes still feed the calibration indicator, "Clear History" still works. The only difference is internal: data now writes to a single `.db` file with atomic transactions instead of six separate JSON files that could get out of sync.

**Why this matters:**

The feedback-steered scoring system depends on retaining every analyst decision and note. If a restart corrupts `decisions.json` or `outcomes.json`, the learning loop loses history and must start from scratch. SQLite's WAL (write-ahead logging) mode ensures that even if the server crashes mid-write, the database recovers to a consistent state automatically on restart. Notes are never lost.

**Under the hood:**

- `data/venture-scout.db` replaces six JSON files (decided.json, decisions.json, outcomes.json, seen.json, themes.json, opps.json)
- All 21 decided opportunities, 3 feedback decisions, and 25 analyst outcomes migrated with zero data loss
- Each write (e.g., marking a deal "Interested") now inserts a row into the decisions table immediately, guaranteeing persistence
- Watchlist.json remains file-based (user-managed, separate semantics)

---

### 2026-05-25 — Analyst feedback loop: fund taste learns in real-time from decisions

The scoring engine now learns from every analyst decision, automatically calibrating future scores toward the fund's investment taste without changing the underlying rubric. This closes the feedback loop: the more notes an analyst adds to their Interested/Pass decisions, the more the scorer adapts to their patterns.

**How it works:**

1. **Analyst marks a decision** (Interested, Pass, or Flagged) and optionally adds a note explaining their reasoning
2. **System logs the decision** with full metadata: company, tier, score, outcome, note, timestamp
3. **Feedback reaches threshold** when 3+ decisions have notes (showing sufficient signal)
4. **On next scoring pass**, the logged decisions are formatted and injected into the LLM prompt
5. **LLM weights factors** based on past decisions (e.g., if all "interested" deals were founder-led, founder signal gets boosted)
6. **Analyst sees status** in the dashboard header: "Calibrated (N decisions)" or "Learning (N/3 notes)"

**Analyst visibility:**

- Calibration indicator in header shows whether feedback is active or still learning
- Shortlist and Pass List tabs show all past decisions with scores, notes, and timestamps
- "Clear History" button resets the feedback loop if strategy changes
- No intervention needed — learning happens automatically with every decision

**Why this matters:**

Each fund has a distinct investment taste: one may value founder pedigree, another shipping velocity, another market size. Pre-seed investors especially make snap decisions based on intangible signals (founder fit, thesis wedge) that don't fit rubric dimensions. This loop captures that taste in real time and injects it into scoring, making the AI a true extension of the analyst's judgment rather than a static rubric engine.

**Constraints maintained:**

- Scoring rubric weights unchanged (35/30/20/15)
- Signal tier thresholds fixed
- Only the LLM's contextual framing changes based on feedback
- Feedback only activates with 3+ noted decisions (insufficient signal = silent)
- Token budget capped at ~400 tokens (10 decisions max) to avoid prompt bloat

---

### 2026-05-25 — Scan pipeline hardened: date window accuracy and crash resistance

**Grok X was ignoring `lastScanned` and always fetching the same 10-day window.** Each scan is supposed to fetch only content published after the previous scan, using `sinceDate` (derived from `lastScanned`, clamped to 3 days minimum). Grok X was ignoring this and recomputing its own hardcoded 10-day window locally — meaning it always pulled the same posts, adding no incremental signal after the first run. Now passes `sinceDate` from the pipeline into `grokXFromHandles` so the Grok date filter respects the same window as every other source.

**Scans were silently crashing on long output.** The AI synthesis calls used to crash with a JSON parse error whenever Gemini generated more output than the token limit allowed — the response was simply cut off mid-JSON, and the crash would terminate the entire scan with zero results. Two fixes: (1) a repair function that finds the last complete item in the truncated response and closes the brackets correctly, so partial output is salvaged instead of discarded; (2) the synthesis layer now catches all JSON errors internally and returns an empty result rather than crashing the scan. The VC now sees fewer opportunities on a given scan instead of a crash with no output.

**`extractLiveThemesAgentic` now runs even without an Exa key.** The function that extracts live investment themes was incorrectly gated behind `EXA_API_KEY` — meaning the entire theme extraction would short-circuit to `[]` if Exa wasn't configured. Exa is optional in this function (used only for pre-verification searches); the actual theme synthesis runs on Gemini. Fixed: only Gemini is required; each Exa call is individually skipped when no key is present.

---

### 2026-05-25 — Grok integration repaired: pipeline restored from 0 results

A diagnostic review identified three root-cause bugs introduced during the Grok API integration that caused every scan to return 0 startup opportunities:

**Grok was calling the wrong API endpoint with the wrong request format.** The code was using the OpenAI Chat Completions format (`messages[]`, `max_tokens`) against xAI's Responses API, which uses a different schema (`input[]`, `max_output_tokens`). Every Grok call was silently failing or returning garbage, producing an empty `xDiscourseItems` pool and starving theme extraction.

**The X search tool name had a typo.** The tool was configured as `type: 'xsearch'` (no underscore). The xAI Responses API requires `type: 'x_search'` (underscore). Without the correct tool name, Grok wasn't filtering to tracked handles and wasn't applying the date range — returning noise or nothing.

**Theme extraction was gated behind the wrong API key.** `extractLiveThemes()` had `if (!EXA_API_KEY || !OPENAI_API_KEY) return []`. The function uses Gemini for synthesis, not OpenAI — so with no OpenAI key set, the entire theme extraction short-circuited. Themes fell back to three generic fallbacks ("AI agents for business workflows", etc.), which drove searches too broad to find pre-consensus founders.

**OpenAI dependency fully removed.** `extractLiveThemesAgentic` had been calling OpenAI's Chat Completions API with tool-calling for agentic theme verification. This was replaced with a Gemini `synthesize<>` call — the same pattern used everywhere else in the pipeline. All OpenAI imports, the `openai` client instance, and the `OPENAI_API_KEY` constant were removed. The pipeline now runs entirely on Gemini + Exa + Grok with no OpenAI dependency.

**Post-scan dedup cache cleared.** The `seen.json` cache had accumulated URLs from the broken Grok era (noise posts from random accounts). These were blocking the same URLs from re-entering the pipeline even after the Grok fix, because the dedup window doesn't distinguish good from bad cache entries. Cache deleted; next scan started clean.

---

### 2026-05-25 — Scan pipeline hardened: date window accuracy and crash resistance

**Grok X was ignoring `lastScanned` and always fetching the same 10-day window.** Each scan is supposed to fetch only content published after the previous scan, using `sinceDate` (derived from `lastScanned`, clamped to 3 days minimum). Grok X was ignoring this and recomputing its own hardcoded 10-day window locally — meaning it always pulled the same posts, adding no incremental signal after the first run. Now passes `sinceDate` from the pipeline into `grokXFromHandles` so the Grok date filter respects the same window as every other source.

**Scans were silently crashing on long output.** The AI synthesis calls used to crash with a JSON parse error whenever Gemini generated more output than the token limit allowed — the response was simply cut off mid-JSON, and the crash would terminate the entire scan with zero results. Two fixes: (1) a repair function that finds the last complete item in the truncated response and closes the brackets correctly, so partial output is salvaged instead of discarded; (2) the synthesis layer now catches all JSON errors internally and returns an empty result rather than crashing the scan. The VC now sees fewer opportunities on a given scan instead of a crash with no output.

**`extractLiveThemesAgentic` now runs even without an Exa key.** The function that extracts live investment themes was incorrectly gated behind `EXA_API_KEY` — meaning the entire theme extraction would short-circuit to `[]` if Exa wasn't configured. Exa is optional in this function (used only for pre-verification searches); the actual theme synthesis runs on Gemini. Fixed: only Gemini is required; each Exa call is individually skipped when no key is present.

---

### 2026-05-25 — UX Stability: auto-scroll jumping and screen blanking fixed

During active scanning and research evaluation, the web interface suffered from two major UX friction points: the page would aggressively force-scroll back to the top whenever new logs arrived, and the entire website would occasionally freeze or blank out. 

**Fixes implemented:**
- **Scroll Stabilization:** The progress log box now scrolls internally instead of hijacking the browser viewport scroll. Users can freely scroll down to read opportunity tiles and scores without the interface jumping back up to the top log panel when background scans emit new log lines.
- **Unmounting/Blanking Prevention:** The interface is now robust against temporary network dropouts and bad JSON data. Network reconnects are handled gracefully behind the scenes rather than resetting the UI scanning status, showing false "Unknown error" banners, or crashing the React render loop.

### 2026-05-24 — Thesis calibrated to real Launch portfolio; signal sources expanded

**The thesis was wrong.** The original prompts described Launch as funding AI Infrastructure, Knowledge Graphs, and Fintech-Crypto. The real portfolio is much broader and more pragmatic: AI lesson planning for teachers (Monsha), wind tunnel analytics for motorsport (SKN Systems), construction RFP automation (Actuality), counter-drone acoustic software (Prandtl Dynamics), behavioral health documentation (NextVisit), hourly workforce hiring (HeyHire), outbound SMS automation (PitchPrfct), AI for US defense software delivery (Argonath). The unifying pattern is not a sector — it's an approach: **vertical AI applied to any niche operational problem where a software-first founder can build a capital-efficient solution**.

Sector coverage is now open: construction, defense tech software, edtech, healthcare, hourly workforce, legal, compliance, niche industry analytics (motorsport, agriculture, maritime), e-commerce, creator tools, developer infrastructure, supply chain, transit. The prompt no longer filters by sector — it filters by the nature of the solution (capital-efficient software) and the stage of the company (working product + any real user).

**The traction bar was wrong.** Previous Goldilocks Zone had `$2,000+ MRR with 20%+ MoM` as the entry minimum. Launch writes $125,000 checks. Their portfolio includes companies that probably had $0 MRR at entry. The new calibration: product exists + at least one external user or customer. Any revenue growing = strong positive signal. One paying customer at $50/month = real traction for a $125K check decision.

**The signal pipeline now has real sources for founders who ship:**

The old Stage 2B X search was domain-restricted to x.com/twitter.com and returned nothing (Exa can't index X auth-gated content). It's been replaced by:
- Grok API: real-time X search when `GROK_API_KEY` is set — xAI has first-party firehose access
- Unrestricted Exa: finds founder content on personal blogs, Substack, LinkedIn articles without hitting X's wall
- ProductHunt (new Stage 2E): the clearest possible "this product was just shipped" signal; fully indexed by Exa; a 200+ upvote PH launch is public validation
- Reddit launch posts: r/SideProject and r/IMadeThis posts classified by title — "I built", "I shipped", "first paying customer" get role `launch`, not `pain`

**The hallucination problem is structurally fixed.** The model was generating opportunities from training knowledge (well-known, well-funded companies) when `launchFmt` was thin. Two fixes: (1) synthesis now requires every signal to include a real URL from the input data and returns 0 opportunities if none are found — padding from training knowledge is explicitly blocked; (2) a post-validation pass discards any signal without a URL and any opportunity with zero validated signals. The pipeline now either surfaces real founders or says nothing.

---

### 2026-05-22 — Second scan feedback: themes good, deal flow / partner sourcing still broken

### 2026-05-22 — Second scan feedback: themes good, deal flow / partner sourcing still broken

Themes tab producing good output. Deal Flow and Founder Leads still surfacing already-discovered companies (public company product launch, a16z Series A company). Partners tab not pulling live X or LinkedIn content. Date stamps incorrect across the app.

The Deal Flow contamination is a pipeline architecture problem, not a prompt wording problem. The model sees company names in the data it's given and generates opportunities from them regardless of instructions. The only reliable fix is to not give it the company names in the first place — remove `partnerFmt` from Synthesis 1. The themes from partners are already extracted into `themesCtx`; the named company references serve no purpose in opportunity generation.

The partners issue confirms that Exa's access to real-time X content is too limited to be the primary signal source for partner activity. The right approach is unrestricted search (finding what these people are talking about across all indexed sources — tech blogs, newsletters, LinkedIn articles, conference transcripts) rather than domain-restricted search that hits X's auth wall.

The date stamp issue erodes trust in the data quality signal the app is trying to convey. Stale dates on "recent" signals suggest the app is not actually finding fresh content, even when it is. Must be fixed before any external demo.

---

### 2026-05-22 — Funding exclusion rule finalized: no external equity, full stop

The exclusion is not "no YC/Sequoia/a16z." It is no external equity financing of any kind: no VC, no angels, no equity-taking accelerators (YC takes 7%), no convertible notes from investors, no disclosed rounds of any size.

Acceptable prior funding that does NOT disqualify:
- University commercialization programs (CREATE-X, GT commercialization hub, MIT TLO, Stanford OTL)
- Government grants: SBIR Phase I/II, STTR, NSF, NIH, DOE, DARPA, ARPA-E, DOD
- Revenue from pilots — earned revenue, not investor money

The key distinction is equity and price discovery. Grants don't create investor rights or make the company visible to VCs. A company with SBIR Phase II funding is as undiscovered as one with $0 — but it has government validation of commercial viability. This is a positive signal.

No Crunchbase entry + no TechCrunch funding announcement + no "backed by" on website = positive signal for Launch. The company hasn't been found yet.

---

### 2026-05-22 — Credibility verification layer designed: three-tier architecture

The system now distinguishes two questions: (1) does this company have traction? (2) are the claims real? These require separate passes.

**Credibility tiers:** verified / plausible / contested / unverifiable

**Three-layer architecture:**
- Passive (always on, free): named vs. anonymous claims + contact infrastructure — in synthesis prompt
- Active (CRITICAL/HIGH only, ~$0.03–$0.10 per company): RDAP domain age, review platform Exa searches, team verifiability Exa searches
- Verify button (on-demand per VC click, ~$0.20–$0.60): Wayback Machine, deep review content, web archaeology

**Unverifiable tier:** goes to a dedicated Flagged section, not the main deal flow surface. Never auto-discarded. VC can review and click Verify to trigger deeper checks. Auto-archives after 30 days with no action.

**Rationale for gating expensive checks:** One outreach email to a fraudulent company costs more in VC credibility than any API call. The verification layer protects the VC's attention and outreach reputation. But not every company needs deep verification — the three-tier architecture concentrates expensive checks on companies the VC is actually close to contacting.

---

### 2026-05-22 — Software-first thesis refined: vertical can be hard, product must be soft

Launch backs capital-efficient software. The key test: can this product scale to 100x customers without 100x capital expenditure? If yes, it's in scope regardless of the vertical.

What's in scope even though the vertical is hard:
- Software orchestrating transit (Modal), not building buses
- Software automating healthcare workflows, not building medical devices
- Software for supply chain visibility, not building warehouses
- AI agents for legal/finance, not practicing law or running a fund

What's out of scope regardless of how interesting the science is:
- Hardware manufacturing at any stage
- Drug discovery with meaningful wet lab costs
- Physical infrastructure deployment where customers require proportional capital

University-origin is a bonus signal, not a requirement. The product just needs to be code.

---

### 2026-05-22 — Deep tech traction vocabulary established from Modal analysis

Modal (ridemodal.com) is the reference case for what a Launch-appropriate deep tech company looks like: software product, no disclosed external equity, named institutional pilot partners (MARTA, UMich, CAT) with quantified outcome metrics (66% ridership growth/month, 3-min wait time, 49% travel time reduction), founder with "PhD (Discontinued)" on LinkedIn.

The generalizable principles:

**Named + quantified > named alone > anonymous aggregate.** "66% ridership growth/month with MARTA" is harder evidence than a pricing page. A real institution staked operations on the technology. This is not a red flag that there's no pricing page — B2G doesn't work through self-serve checkout.

**Multiple named pilots across diverse contexts > one pilot.** Three different institution types (municipal authority, research university, transit provider) signals the technology generalizes. That's stronger than one deep relationship.

**Credential-exit signal.** "PhD (Discontinued)" + founded company = high-conviction execution bet. The founder had institutional safety and chose to give it up to build. This is an execution signal, not a pedigree signal. The founder earned domain insight before the company existed — they were solving the problem in the lab, then commercialized it.

**Absence of public funding = undiscovered.** No Crunchbase, no TechCrunch, no "investors" section = institutional money hasn't found them. This is positive for Launch.

---

### 2026-05-22 — aivoicephone.com analyzed: credibility gap example

aivoicephone.com claims "500+ businesses" and "$12M+ recovered" but has a blank email field and no functional contact form beyond a phone number. This is a claims/operations mismatch — the scale of the claim doesn't coexist with a broken contact form.

The lesson is not that this company is fraudulent. The lesson is that the system needs to distinguish between traction detection and claims verification. A company can have real traction and poor ops. It can also have fake claims and polished ops. The two are separate questions.

The blank email field specifically: for a company serving 500+ businesses, there are inbound inquiries, support requests, onboarding questions. Those don't flow through a phone number. The absence of a functional email contact implies either the company is much earlier than claimed, or the contact infrastructure hasn't kept up with growth — which is itself operationally concerning for a B2B software product.

aivoicephone.com would surface as `contested` under the credibility layer: claims outpace operational signals. The VC sees `contested — large aggregate claims, contact form non-functional` and decides whether to click Verify before investing time in outreach.

---

### 2026-05-22 — Traction confidence layer shipped: stated vs. inferred

The product now explicitly distinguishes between traction that a founder stated (e.g., "we hit $2k MRR" in a post) versus traction that is inferred from behavioral proxies (pricing page + customer logos + HN launch engagement). Both are surfaced in the UI with different color-coded confidence badges: green for stated, amber for inferred, grey for unknown.

This matters for Launch's workflow: a stated $2k MRR is actionable today. An inferred traction signal from a Show HN post with 300 upvotes needs a follow-up to verify. The scout should not conflate them.

Behavioral proxies surfaced in prompts:
- HN comment energy ("how do I pay?", "we use this at [co]")
- GitHub star velocity as DAU proxy for dev tools
- Pricing page with real tiers (not "contact us")
- Customer logos and testimonials on landing page
- Job postings for CS/Sales = paying customers to support
- Product Hunt "I've been using this" comments
- Integration marketplace listings
- Press with specific customer counts or revenue

---

### 2026-05-22 — Founder Leads tab shipped: specific people, not abstract themes

The previous product only surfaced abstract "opportunities" (e.g., "Agentic orchestration for supply chain"). Launch's workflow requires specific people to call. The new Founder Leads tab extracts named founders, GitHub handles, X handles, and HN profiles from launch-role signals (Show HN, building-in-public posts, GitHub product repos). Only extracts what is explicitly in the signal data — does not invent names.

Each lead card shows: name/handle, project, which live theme they align to, traction evidence (stated or inferred), and a direct contact link.

---

### 2026-05-22 — Watchlist UX: paste anything, system infers type

Old UX: four-option type dropdown + two separate text fields.
New UX: one paste field. Paste `@pmarca`, `r/LocalLLaMA`, `https://nfx.com/post`, or `voice AI healthcare` — the system infers and routes.

Supported inputs: X handles (with or without @), Reddit communities (URL or `r/sub`), newsletter/site URLs (any https://), topic keywords. Type badge shown on each entry so the user knows what was inferred.

All watchlist sources now feed Stage 1 theme extraction alongside megafund signals. A user who adds `r/LocalLLaMA` is not just adding a Reddit scrape — they're influencing which themes the system searches for in Stage 2.

---

### 2026-05-22 — Port set to 3002: basic0j and scout/ run independently

`basic0j/` is an independent app from `scout/`. PORT changed to 3002 so both can run simultaneously. `scout/` remains on 3001 and is not modified.

---

### 2026-05-22 — Goldilocks Zone criteria locked in as primary product filter

Launch provided exact traction thresholds that now anchor the entire product:

- Enterprise/marketplace: $2k+ MRR, 20%+ month-over-month growth
- Consumer: 3k+ DAUs, 5%+ week-over-week growth
- Deep tech: MVP or prototype + strong technical team

These thresholds change what the product is trying to find. It is not finding "interesting AI companies" — it is finding founders who are already past zero and on a trajectory that Launch can accelerate. The sourcing funnel now has a concrete exit condition: does this founder map to one of these three profiles?

Product implication: the output surface (opportunities, scored cards) needs to surface traction data — MRR, DAU, growth rate — as the first visible field, not buried in a description. If the signal doesn't contain traction data, the card should say so explicitly rather than omitting it. Absence of traction data is itself a signal.

---

### 2026-05-22 — "No pedigree filter" confirmed as product design principle

Launch's actual founder profile — confirmed by review of their alumni page — includes founders who didn't attend college, founders from outside the US, and founders who majored in non-STEM fields. The product was inadvertently filtering for Big Tech alumni through its departure signal queries ("ex-Google", "ex-OpenAI", "founding engineer stealth startup").

This is a product design failure, not just a data quality issue. The departure signal phase was designed around a prestige heuristic that doesn't match the customer (Launch). The replacement design: search for *behavior* (shipping in public, GitHub infra signals, Show HN posts) rather than *credentials*. A founder who posted "Show HN: I built X" with 200 points and no Big Tech background is more on-profile for Launch than an ex-Stripe engineer in stealth.

This principle should be enforced at the query design level, not just the synthesis level. If a query string contains alumni/pedigree terms, it's the wrong query.

---

### 2026-05-22 — Link drop feature scoped: end-users can add any source

Users need to be able to add any source they want tracked — X accounts, Reddit communities, newsletters, specific founder profiles, company URLs — without having to select a type from a dropdown or understand the system's internal categories.

Design decision: single text input, paste anything. System infers type from URL pattern:
- `x.com/handle` or `@handle` → tracked as Twitter/X account
- `reddit.com/r/sub` or `r/sub` → fetched as subreddit
- Any other URL → Exa search restricted to that domain (newsletter, blog, product site)
- Bare keyword → topic search

This matters for Launch specifically because the scout's value is partly editorial — the team will curate sources over time (specific founder accounts to watch, newsletters they trust, communities where their founder profile hangs out). The system should make that curation frictionless.

---

### 2026-05-22 — 10-day signal freshness window decided

All signals must be from the last 10 days. This is a product decision, not just a data decision. A 90-day window produces signals that are:
- Already discovered by other investors
- No longer actionable (the founder may have already raised)
- Mixed with stale noise that dilutes fresh signal quality

10 days keeps the product in "early mover" territory, which is the only territory where Launch has an edge. If a signal is 11 days old, someone else has probably already seen it.

GitHub exception: use `pushed:>` (recent commits) rather than `created:>` (repo birth date). A repo created 6 months ago with commits from yesterday is fresh. A repo created yesterday with no subsequent activity is not.

---

### 2026-05-22 — Two-stage pipeline design finalized

**Stage 1:** Collect signals from megafund partner posts, investment announcements, portfolio activity, AND all user-added watchlist entries. Run a synthesis pass to extract 5-7 specific live themes that these sources are signaling *this week*. This replaces the static `thesis.yaml` as the driver of Stage 2 searches.

**Stage 2:** Use live themes to run targeted searches across raw channels — Show HN/Launch HN, building-in-public X posts, GitHub repos with startup infra signals. These searches produce founder-level signals (specific people or projects) rather than market-level signals (abstract themes).

The key product shift: Stage 1 answers "what spaces are hot right now?" Stage 2 answers "who is building in those spaces before anyone knows about them?" The product delivers both layers, and they are causally connected — Stage 2 is only as good as Stage 1's theme extraction.

User watchlist as editorial input to Stage 1 is a deliberate design choice. The user's curation is a first-class data source, not a supplemental filter.

---

### 2026-05-22 — Pedigree bias problem identified in existing scan pipeline

The existing departure signal queries (Phase 3 of `server.ts:runScan()`) actively filter for prestige background:

```
"ex-Google" OR "ex-Stripe" OR "ex-OpenAI" OR "ex-Anthropic" founder "new company"
"founding engineer" stealth startup AI
'"next chapter" OR "starting something new" engineer founder 2026'
```

This is the wrong profile for Launch on two levels:

1. **Who it finds:** Founders with Big Tech backgrounds who are typically well-networked, well-funded before they even launch, and visible to Tier-1 VCs from day one. These are not founders who need Launch.

2. **Who it misses:** The founders Launch actually wants — high-agency builders who found a problem through lived experience, built something people use, and are growing without institutional support or a famous résumé.

The fix is not to add more varied queries alongside the existing ones. The fix is to delete the departure signal phase entirely and replace it with behavior-based discovery: Show HN posts, GitHub repos with startup infra, building-in-public X threads. No credential terms.

---

### 2026-05-22 — Project context established: LAUNCH.co, Jason Calacanis, original prompt scope

**Client:** LAUNCH Accelerator (launch.co), led by Jason Calacanis.

**Original prompt requirement:** "Build an app or agent using the coding tool of your choice that tracks Sequoia, a16z, and Y Combinator. What are they investing in? What are their partners talking about on LinkedIn and X? What are their portfolio startups talking about? Etc. (The goal is to identify investment deal flow opportunities.)"

**Interpretation of the prompt:** Two-layer funnel.
- Layer 1: Track what the megafunds are betting on (what sectors, what themes, what founders they're publicly championing). This is market intelligence.
- Layer 2: Use that market intelligence to find founders already building in those spaces who are not yet on the megafunds' radar — and who fit Launch's Goldilocks Zone. This is deal flow.

The product is not a megafund tracker. The megafund data is the input signal, not the output. The output is specific founders or projects that Launch should be calling.

**Working directory:** `/Users/ronith/antigravity/Venture-Scout-AI/scout/`  
**Plan and staging files:** `/Users/ronith/antigravity/Venture-Scout-AI/basic0j/`

---

### 2026-05-25 — Three silent failures: phantom counters, blocked Flag action, scan starvation

**Shortlist and Pass List showed counts but no cards.** 28 companies had been decided on — 9 shortlisted, 13 passed, 6 flagged — and the counter badges reflected this accurately. But clicking either tab rendered nothing. The underlying cause: opportunity objects only live in memory for the duration of the scan that produced them. Each new scan replaces `state.opportunities` wholesale. When the tabs went to look up the 28 decided companies, the objects were gone. The decisions (id → tier) had been persisted to disk; the objects (name, traction, signals, everything the card renders) had not. From the VC's perspective, 28 hours of review work had produced an empty list.

The fix is a permanent archive: every time a company is shortlisted, passed, or flagged, the full opportunity object is written to `decided.json` alongside the outcome record. The archive is loaded at startup and returned with every state fetch. Shortlist and Pass List now render correctly regardless of how many scans have run since the decision was made.

**The Flag action was silently rejected.** The API validated that outcome must be one of `interested` or `pass` — `flagged` was not in the allowed list, despite being a valid tier everywhere else in the product. Every click of the Flag button sent back a 400 error that the UI swallowed without feedback. Companies flagged as suspicious were recorded nowhere. This is now fixed.

**Scan output went to zero.** The pipeline maintains a rolling 3-day deduplication window to avoid re-processing the same URLs. After ~10 scans across one day, the window had accumulated 444 URLs — essentially every URL that Exa returns for the standing queries. Each new scan ran, found those same URLs, dropped them all as "already seen," and returned 0 opportunities. The signal slate was cleared to unblock the next scan. The structural fix (time-bounding Exa queries so each scan fetches only URLs published since the previous scan) is the next priority.

**Outcome of reset.** The 28 prior decisions were cleared since the opportunity objects behind them were permanently lost. The seen-URL window was cleared. The next scan starts fresh.

---

### 2026-05-25 — From "Runtime sailed through despite being YC-backed" to evidence-based verification

Two diagnostic scans returned 0 and 2 opportunities. The 2-opp scan surfaced Runtime, a YC-backed company whose own website says it's YC-backed — the pipeline never looked. The structural overhaul addresses the root causes:

**The sourcing was a closed echo chamber.** Megafund partner X posts drove theme extraction. But Sequoia/a16z partners mostly comment on Series A+ consensus spaces (Cursor, Harvey, Perplexity). The themes extracted were "AI coding assistants" and "agent orchestration" — exactly the spaces LAUNCH cannot win in. Pipeline was optimizing for discovery AFTER consensus formed.

The fix is north-star focus + complementary builder discourse, not "delete the megafunds." Sequoia, a16z, and YC DO invest at pre-seed — through specific sub-funds. The roster now tiers partners:

- **Early-stage tier** (full volume): Sequoia Arc partners (Jess Lee, Sonya Huang, Konstantine Buhler), a16z Speedrun partners (Jonathan Lai, Andrew Chen), YC main batch GPs (expanded to include Jared Friedman, Tom Blomfield, Diana Hu).
- **Multi-stage tier** (stage-filtered): general GPs whose signals must contain pre-seed/seed/angel/cohort language to survive. Series A+ commentary gets dropped at the source.

Stage B investment queries now target the actual pre-seed entry points: Sequoia Arc cohort pages, a16z Speedrun batches, the YC company directory (`site:ycombinator.com/companies`), and YC launches feed. The pipeline now treats "Sequoia Arc just backed X" and "YC W26 just added Y" as primary signals — that's where LAUNCH's competition is making first checks, and that's where LAUNCH needs to be on the radar 1-2 weeks earlier.

**X is now narrow on purpose.** Grok X used to do theme-based search of arbitrary X accounts, which is how random X spam handles flooded the pipeline. New behavior: Grok X only fetches posts FROM tracked handles — the fund partners listed above, plus any portfolio company / portfolio founder handles a user adds via watchlist (type: `twitter`). The X stream becomes a curated north-star view, not a discovery channel. All X output routes to Founder Themes only, never directly into deal flow.

**Theme extraction now weighted toward builders, not megafunds.** Before themes are extracted, the pipeline runs a Stage 0.5 pre-pass: 60 posts from quiet-builder subreddits (Indie Hackers, microsaas, SaaS, SideProject), no theme gate. The theme synthesis prompt now explicitly weights builder discourse + early-stage investment HIGHEST and multi-stage GP commentary LOWEST.

**The pipeline now visits the company's own website.** Every opportunity gets its homepage resolved from signal URLs (skipping aggregator hosts like HN/PH/Reddit/GitHub). The homepage + /about + /team + /investors + /press pages are fetched via Exa contents and scanned for funding-disclosure language: "Y Combinator," "Backed by Sequoia," "Series A," "Our investors," etc. If the company says it's funded on its own page, we now read it. Runtime would not have shipped under this verification.

The old sanity screen was parametric LLM-only (gpt-4o-mini guessing from training cutoff knowledge). The new evidence-based verification merges sanity + funding + homepage into one parallel check: homepage scan + YC directory lookup + funding news search, all in real time. Disqualification requires actual evidence, not just a model guess. Verification evidence is now attached to every surfaced opportunity (homepage flags, YC directory hit, funding news count).

**Credibility checks now use the actual company name.** The biggest non-obvious bug: credibility searches were running on `opp.id.replace(/[-_]/g, ' ')` — the synthesized slug, not the company name. Searching LinkedIn for "runtime cloud deployment platform" misses "Runtime" entirely. Synthesis 1 now requires a `companyName` field separate from the synthesized title/id, and all downstream checks (LinkedIn team, G2/Capterra/Trustpilot reviews, YC directory, funding news) use the real name. This single fix should move most previously-`unverifiable` companies into `plausible` or `verified`.

**Domain age stops penalizing the right companies.** Old logic flagged domains <90 days old as a credibility downgrade. But that's exactly the LAUNCH target — a founder who shipped 14 days ago and registered the domain last month. Inverted: fresh domain is now positive/neutral; only stale domains (>3 years, no other evidence) get downgraded. Empty review-platform presence is now neutral, not a negative — pre-seed companies don't have G2 reviews by definition.

**Synthesis 1 stopped gatekeeping.** Old prompt had three contradictory instructions ("5-7 opportunities," "max = distinct signals," "return 0 if data doesn't support") and gpt-4o-mini interpreted that conservatively. Rewritten as pure extraction: extract every distinct company referenced, 1-10 entries, downstream filters quality. Added a two-pass fallback: if first pass returns <3 opportunities while launch signals ≥8, re-run with explicit "recall not precision" instruction.

**Non-self-promoting sources added.** SBIR/STTR awards (government-validated deep tech), USPTO patent filings (individual-inventor and small-entity assignments in tracked verticals), and 7 additional quiet-builder subreddits. Plus thesis-mapped subs added for Healthcare, Legal, Construction, Education, Defense.

**New evaluate-on-demand endpoint.** `POST /api/evaluate { name, url? }` runs the full verification pipeline on a single company. This closes the largest remaining gap: founders who don't post publicly. Network introductions, referrals, and the user's own discovery channels can be fed in and evaluated using the same logic as scan-surfaced opportunities. The system becomes a "research-on-demand on this company" tool in addition to a "discover companies" tool.

**Net effect.** Sourcing should now reflect what early-stage GPs at Sequoia Arc, a16z Speedrun, and YC are doing right now, weighted by what builders are actually shipping in subs and communities — not what megafund partners are tweeting about Series B companies. Verification should catch funded companies (Runtime-class misses) before they surface. Credibility checks should stop false-negative-ing legitimate pre-seed companies. Volume should increase from the Synthesis 1 rewrite + new sources; quality should hold from the evidence-based verification layer.
