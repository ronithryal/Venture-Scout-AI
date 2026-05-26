# Venture Scout AI

**Live:** [Venture Scout on Railway](https://venture-scout-production.up.railway.app)

## What This Is

Venture Scout AI is an agentic deal-flow engine that surfaces pre-seed and seed-stage companies before they raise — or before anyone else in a fund's network notices them.

It runs a continuous background pipeline that monitors VC partner activity on X/Twitter, Hacker News launches, GitHub repositories, Reddit communities, and the broader open web. Every signal it finds is synthesized, scored, and surfaced in a real-time dashboard. The fund analyst never has to open a feed; the system does the monitoring and delivers tiered, ranked opportunities with a written thesis attached to each one.

---

## How the Pipeline Works

The system runs in seven stages, triggered on-demand via the "Scan Now" button (auto-scan is implemented but disabled by default — enable by calling `startAutoScan()` in server.ts, which fires an initial scan 15s after boot then every 3 hours via `setInterval`):

**Stage 0.5 — Builder Pre-Pass**
Before theme extraction, the pipeline fetches ~60 posts from quiet-builder subreddits (Indie Hackers, r/SideProject, r/microsaas, r/IMadeThis) with no theme gate. This gives Stage 1 real builder discourse context before themes are set — preventing megafund commentary from dominating the extraction.

**Stage 1 — Theme Extraction**
Gemini reads the builder pre-pass output alongside recent VC partner posts and investment announcements, then extracts 5–8 investment themes the fund is actively signaling — e.g. "agentic infrastructure for enterprise" or "open-source LLM fine-tuning tooling." Builder discourse and early-stage investment signals are weighted highest; general multi-stage GP commentary is weighted lowest. These themes steer what the system searches for next.

**Stage 2 — Signal Ingestion**
Multiple source paths run in parallel using the extracted themes as search intent:
- **Exa Neural Search** (semantic, not keyword) queries GitHub, Reddit, Hacker News, ProductHunt, SBIR.gov/grants.gov (federal pre-seed grants), USPTO patent filings, and the open web. Exa's neural retrieval finds things like "founder building compliance automation" without needing to know the company name.
- **Grok API** (xAI first-party firehose) fetches real-time X/Twitter posts from tracked partner handles only — Exa cannot access X's authenticated content. Grok output feeds Founder Themes context, not deal flow directly.

Press releases, aggregator noise, and signals from already-funded companies are filtered at ingestion via `isPressRelease()` and `isConsensus()` guards.

**Stage 3 — Signal Extraction**
Gemini takes the raw search results and structures them: company name, product description, founding signal type (launch, open-source release, founder post, pain thread), and what VC firms' orbits it showed up in. Each result is assigned a `SignalRole` — whether it's a product launch, a market pain signal, a partner post, or a portfolio-adjacent activity.

**Stage 4 — Scoring**
Every extracted company is scored across four dimensions:
- **Traction** (35%) — anchored to Goldilocks thresholds; too early = no signal, too late = already funded
- **Velocity** (30%) — how fast the signal is moving (recent GitHub pushes, social engagement, HN ranking)
- **Market** (20%) — thesis alignment with what top-tier funds are actively writing about
- **Mechanics** (15%) — team verifiability, product coherence, market timing

Each company receives a `SignalTier`: **CRITICAL**, **HIGH**, **MEDIUM**, or **LOW**, plus a composite score (0–5) and a written `takeaway` explaining the thesis in two sentences.

**Stage 5 — Enrichment**
CRITICAL and HIGH companies are automatically enriched: GitHub star counts, recent push dates, infrastructure signals, and HN thread engagement are pulled and attached to the opportunity card.

**Stage 6 — Credibility Check & Hermes Agentic Conviction**
Active credibility verification runs on top-tier signals: domain age check, named claims search, review platform hits (Product Hunt, G2), team LinkedIn verifiability, and homepage funding language scrape.

In parallel, **Hermes** (an agentic research agent) conducts deep conviction verification on CRITICAL and HIGH opportunities. It autonomously searches the web to verify product existence, flag undisclosed equity funding, and surface supporting evidence. Hermes returns a conviction level (strong/moderate/weak/pass) that can downgrade opportunities if signals are thin or funding is undisclosed. This layer catches hallucinated or inflated companies before they reach the analyst's inbox.

---

## Self-Improving Scoring

The system records every analyst decision — Interested, Pass, or Flag — along with an optional written note explaining the reasoning. All decisions are persisted to `data/venture-scout.db` (SQLite, WAL mode) for historical tracking. When 3 or more decisions with notes accumulate, a feedback digest is injected into future scoring prompts:

```
VC FEEDBACK FROM PAST DECISIONS (calibrate your scoring to these patterns):
- INTERESTED: "semble" — "great wedge into a fragmented market, founder has prior exit"
- PASS: "rushdb" — "too infrastructure-heavy for our pre-seed focus"
- PASS: "aproxymade" — "no verifiable team, domain 3 weeks old"
Apply: weight factors that drove past "interested" decisions higher; downgrade factors that repeatedly led to "pass".
```

**How calibration works:**

1. **Analyst decision** — Mark a company Interested, Pass, or Flag with an optional note explaining the reasoning
2. **Decision logged** — Metadata persisted: company ID, tier, score, outcome, note, timestamp
3. **Threshold check** — System monitors for 3+ decisions with notes (shown in header: "Learning (2/3 notes)" → "Calibrated (3 decisions)")
4. **Feedback injection** — On next scoring pass, logged decisions are formatted and prepended to the LLM prompt
5. **Recalibration** — Gemini weights scoring factors based on historical patterns (e.g., if all "interested" deals had founder exits, founder signal gets stronger weighting)
6. **Continuous learning** — Each new noted decision refines the calibration; analyst sees calibration status update in real-time

**Key constraints:**

- Feedback only activates with 3+ noted decisions (insufficient signal = silent mode)
- Scoring rubric weights stay fixed (35/30/20/15) — only the LLM's framing adapts
- Digest limited to last 10 decisions (~400 tokens) to avoid prompt bloat
- "Clear History" button (in Shortlist/Pass tabs) resets the log if strategy changes

The more decisions the analyst logs with notes, the more tuned the output becomes to the fund's investment taste — without retraining or changing the underlying rubric.

---

## Hermes: Agentic Conviction Verification

Hermes is an optional but powerful layer that catches deals requiring deeper scrutiny. It's an agentic research agent with access to live web search (via Exa) that:

- **Autonomously verifies claims**: Runs a single targeted Exa search per opportunity to confirm product existence, find supporting press, or validate founding signals — structured as a deterministic single-pass call rather than a polling loop
- **Enforces hard rules**: Immediately flags any opportunity with undisclosed equity funding (VC, angel, convertible notes) as "pass" — non-negotiable red line
- **Returns conviction levels**:
  - **strong**: All signals verified, live product, traction evident
  - **moderate**: Good signals but some gaps in corroboration
  - **weak**: Thin signals or inconsistent evidence → downgrades opportunity one tier
  - **pass**: Undisclosed funding or <2 corroborating signals → downgrades to LOW

The conviction result is appended to the opportunity's thesis takeaway so analysts see not just what Hermes found, but why. Hermes runs in parallel with passive credibility checks (domain age, LinkedIn, Product Hunt) — they verify different attack surfaces.

Hermes is optional (requires `HERMES_API_KEY`). Without it, the system falls back to Gemini-based synthesis and passive credibility checks — still robust, but without live-search conviction verification.

---

## Model Stack

| Stage | Model | Role |
|---|---|---|
| Theme Extraction | **Gemini 3.5 Flash** | Structured JSON extraction from VC social content and builder discourse |
| X/Twitter Signal Ingestion | **Grok (xAI Responses API)** | Real-time X post retrieval from tracked partner handles via first-party firehose |
| Signal Retrieval | **Exa Neural Search** | Semantic web search across GitHub, Reddit, HN, ProductHunt, SBIR.gov, USPTO, open web |
| Opportunity Scoring | **Gemini 3.5 Flash** | Synthesis 1–5: extraction, scoring, enrichment |
| Credibility Verification | **Hermes-3-Llama-3.1-70B** (optional) | Agentic research: single-pass Exa search + conviction assessment; flags undisclosed funding |
| Fallback Synthesis | **Gemini 3.5 Flash** | Structured verification when Hermes unavailable; active credibility checks (domain age, LinkedIn, Product Hunt) |
| Theme Synthesis | **Gemini 3.5 Flash** | Investment theme clustering and multi-firm signal correlation |

All synthesis passes use JSON-mode output with automatic truncation repair — broken responses are healed before parsing rather than discarded. Hermes (via NVIDIA Integrated API) is optional; if `HERMES_API_KEY` is absent, credibility checks default to passive verification only.

---

## Dashboard Features

- **Deal Flow tab** — tiered opportunity cards with traction evidence, thesis takeaway, GitHub/HN enrichment, and credibility badge
- **Shortlist tab** — archive of all Interested decisions with scores, analyst notes, and timestamps; includes "Clear History" button to reset decision log
- **Pass List tab** — archive of all Pass decisions; same decision history view as Shortlist
- **Flagged tab** — low-credibility or unverifiable opportunities held for potential future re-check
- **Themes tab** — investment theme clusters with momentum indicators and multi-firm evidence
- **Watchlist** — add any X handle, company, topic, Reddit community, or URL for continuous monitoring
- **Targeted Re-scan** — supply a list of company names; the system searches Exa for fresh signals and re-scores them directly into Deal Flow
- **Founder Themes tab** — what builders (not VCs) are publicly discussing; leading indicator for thesis formation
- **Calibration Indicator** (header) — shows feedback loop status: "Calibrated (N decisions)" when 3+ noted decisions are active, or "Learning (N/3 notes)" when below threshold

---

## How I Would Continue Building This

The system as built is a strong deal-sourcing foundation. Here is what I would build out next if embedded with the Launch team as a researcher or contractor:

- **Founder Outreach Drafting** — When a company hits CRITICAL tier and the analyst marks it Interested, automatically draft a personalized cold outreach email — pulling from the company's homepage, recent GitHub activity, and HN thread to write something that doesn't sound templated. The analyst reviews and sends in one click. Turnaround from signal to outreach drops from days to minutes.

- **Investment Memo Generation** — For every opportunity sourced, generate a full structured investment memo with the click of a button: market size, competitive landscape, thesis fit, founder background summary, key risks, and a recommendation. Backed by the signals the system already holds — not a generic summary, but a sourced document the analyst can bring directly to a partner meeting. This can be updated over time with new inputs such as email chains and meeting notes. 

- **Portfolio Monitoring** — Track every company the fund has invested in or seriously considered. Alert the team when a portfolio company shows signals of momentum (GitHub star spike, HN front page, new hiring post) or distress (founder goes quiet, engineering velocity drops, team departures surface on LinkedIn). Proactive, not reactive.

- **Weekly Deal Digest Email** — Every Monday morning, the system composes and sends a formatted email to partners: top 3 CRITICAL signals from the week, 5 emerging themes to watch, and a one-line status on each watchlist entry. No login required; the intelligence comes to the inbox.

- **Founder Intelligence Enrichment** — When a company scores HIGH or above, automatically pull public founder data — prior companies, GitHub contribution history, conference talks, published writing, and mutual network connections — and attach it to the opportunity card. Gives the analyst context before the first call.

- **Mutual Network Routing** — Cross-reference flagged founders against the Launch portfolio founder network and LP list. If there's a mutual connection, surface it on the card so the outreach can come warm instead of cold. Second-degree intros close faster.

- **Thesis Validation Loop** — Each quarter, run a retrospective: which themes generated the most Interested decisions? Which sources had the highest signal-to-noise? Automatically surface this as a one-page thesis update — "this quarter, your deal flow skewed toward agentic infrastructure and open-source data tooling; here are the 12 companies worth tracking going into Q3."

- **CRM Sync** — Push every Interested decision directly into Attio, Affinity, or whatever CRM the fund uses — pre-populated with company name, description, source URL, score, and thesis notes. Eliminates double-entry and keeps the pipeline current without analyst effort.

- **Self-Improving Agent Stack: Outcomes → Skills → Models → Multi-Agent Orchestration** — A four-phase learning architecture that transforms the system from static rubric to genuinely self-improving agent. **Phase 1 (Outcome Tracking):** Track what happens to every decision — did INTERESTED deals close fundraises? Did PASS deals raise elsewhere? Measure which signals were actually predictive of outcomes, not just correlated with analyst decisions. This data feeds everything downstream. **Phase 2 (Skill Documents):** Each decision triggers Hermes reflection: what signals *actually* predicted this outcome? What founder profile matched or mismatched? What risk flags mattered vs. noise? Store these reflections as **skill documents** — reusable knowledge artifacts about what works for this fund. On future deals with similar characteristics (same sector, founder type, traction pattern), load relevant skills into context. The system learns compound wisdom, not just decision history. **Phase 3 (Deep User Modeling):** Extract this fund's specific investment taste from 30+ outcomes — which founder profiles do you consistently pass on? Which sectors generate your highest close rates? What's your real risk tolerance (not stated, observed)? How does your thesis drift quarter-to-quarter? Build a persistent model that shapes how signals are ranked and conviction is assessed. True personalization: Hermes knows you better than you know your own rubric. **Phase 4 (Multi-Agent Orchestration):** Rather than one verification call per deal, spawn a master orchestrator that launches 5 domain-specific sub-agents in parallel: portfolio adjacency (network effects), founder deep-dive (GitHub history, talks, writing, exits), technical velocity (commit patterns, contributor churn), IP/patent activity (USPTO filings, non-self-promoted deep tech), team movement (departures, founder pivots). Merge parallel findings asynchronously, rank signals by strength, return conviction assessment that's richer than any single agent can produce. Cross-domain patterns (founder moved from X to Y + team departure + patent filing) surface anomalies that isolated signals miss. Each phase is a prerequisite for the next: outcomes enable skills, skills enable user modeling, modeling enables orchestration. Without Phase 1, the entire stack collapses — you can't write predictive skills without knowing what actually closed.

- **WhatsApp + Email Outreach Pipeline** — Integrate WhatsApp Business API and email (SendGrid/Resend) to enable one-click warm outreach. When an analyst marks a company Interested, generate a personalized cold email or WhatsApp message template (using Hermes or Gemini to pull from LinkedIn, Twitter, recent press). If a mutual connection exists, use that in the outreach ("I noticed you worked with X, who I know well..."). Track engagement: clicks, replies, meeting bookings — feed back into the feedback loop so the system learns which companies actually convert to meetings.

- **Founder & Company Network Graph** — Build a knowledge graph of founder nodes (linked by prior companies, co-founder relationships, shared advisors, mutual investors, conference attendance), company nodes (linked by investors, customers, employees, technology stacks, market segments), and fund nodes (portfolio companies, LPs, partner firms, signal sources). Query patterns unlock relational intelligence: "Show me all founders 2 degrees away from our portfolio founders," "Which companies share 3+ employees with a company we passed on 6 months ago?", "Map the investor network for all companies scoring HIGH — where's the overlap?", "Visualize emerging clusters: which founders/companies are starting to signal the same thesis?" This transforms isolated company signals into relational intelligence — you can see clusters, founder migration patterns, and second-order effects.

- **Scheduled Pipeline Caching & Batching** — Optimize the 3-hour theme extraction and scoring cycle without sacrificing real-time signal responsiveness. Cache Exa semantic search results (6h TTL per theme query) and Gemini synthesis responses (via prompt caching) to reduce redundant API calls. Batch credibility checks (domain age, review platforms) and Hermes conviction verification across all CRITICAL/HIGH opportunities from a single scan. This keeps the real-time webhook layer instant (GitHub/HN/Twitter/LinkedIn alerts fire immediately) while making scheduled synthesis cheaper and faster.

- **Real-time Signal Webhooks** — Set up webhooks for high-velocity signals: GitHub API (watched repository star milestones or commit surges notify immediately), Hacker News API (founder or company name on front page pages analyst), Twitter Streaming API (post from watched founder/company triggers Hermes conviction check and Slack alert), LinkedIn (key team member joins/leaves HIGH/CRITICAL company surfaces instantly). Real-time monitoring means catching moments when founders are signaling major moves or launches — don't batch these.

---

For local development, see [RUNLOCAL.md](RUNLOCAL.md).