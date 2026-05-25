# Venture Scout AI


## What This Is

Venture Scout AI is an agentic deal-flow engine that surfaces pre-seed and seed-stage companies before they raise — or before anyone else in a fund's network notices them.

It runs a continuous background pipeline that monitors VC partner activity on X/Twitter, Hacker News launches, GitHub repositories, Reddit communities, and the broader open web. Every signal it finds is synthesized, scored, and surfaced in a real-time dashboard. The fund analyst never has to open a feed; the system does the monitoring and delivers tiered, ranked opportunities with a written thesis attached to each one.

The current live system sits at `localhost:3002` during development. It ingests, scores, and renders results with no manual intervention needed.

---

## How the Pipeline Works

The system runs in six stages, triggered automatically every 3 hours and on-demand:

**Stage 1 — Theme Extraction**
Gemini 3.5 Flash reads recent VC partner posts and investment announcements, then extracts 5–8 investment themes the firm is actively signaling — e.g. "agentic infrastructure for enterprise" or "open-source LLM fine-tuning tooling." These themes steer what the system searches for next.

**Stage 2 — Signal Ingestion**
Exa Neural Search (semantic, not keyword) queries GitHub, X/Twitter, Reddit, Hacker News, and the open web using the extracted themes as search intent. It fetches the most recent, relevant pages with highlight extraction. Exa's neural retrieval means it finds things like "ex-Stripe engineer building compliance automation" without needing to know the company name.

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

**Stage 6 — Credibility Check**
Active credibility verification runs on top-tier signals: domain age check, named claims search, review platform hits (Product Hunt, G2), team LinkedIn verifiability, and homepage funding language scrape. This catches hallucinated or inflated companies before they reach the analyst's inbox.

---

## Self-Improving Scoring

The system records every analyst decision — Interested, Pass, or Flag — along with an optional written note explaining the reasoning. When 3 or more noted decisions have accumulated, a feedback digest is injected into future scoring prompts:

```
VC FEEDBACK FROM PAST DECISIONS:
- PASS: "rushdb" — "too infrastructure-heavy for our pre-seed focus"
- INTERESTED: "semble" — "great wedge into a fragmented market, founder has prior exit"
- PASS: "aproxymade" — "no verifiable team, domain 3 weeks old"
```

The model uses this context to recalibrate scoring for future companies — effectively learning the fund's investment taste without retraining. The more decisions the analyst logs with notes, the more calibrated the output becomes.

---

## Model Stack

| Stage | Model | Role |
|---|---|---|
| Theme Extraction | **Gemini 3.5 Flash** | Structured JSON extraction from VC social content |
| Signal Retrieval | **Exa Neural Search** | Semantic web search with domain-level targeting |
| Opportunity Scoring | **Gemini 3.5 Flash** | Synthesis 1–5: extraction, scoring, credibility, enrichment |
| Theme Synthesis | **Gemini 3.5 Flash** | Synthesis 6: investment theme clustering |

All synthesis passes use JSON-mode output with automatic truncation repair — broken responses are healed before parsing rather than discarded.

---

## Dashboard Features

- **Deal Flow tab** — tiered opportunity cards with traction evidence, thesis takeaway, GitHub/HN enrichment, and credibility badge
- **Shortlist tab** — archive of all Interested/Pass/Flag decisions; filterable by outcome
- **Themes tab** — investment theme clusters with momentum indicators and multi-firm evidence
- **Watchlist** — add any X handle, company, topic, Reddit community, or URL for continuous monitoring
- **Targeted Re-scan** — supply a list of company names; the system searches Exa for fresh signals and re-scores them directly into Deal Flow
- **Founder Themes tab** — what builders (not VCs) are publicly discussing; leading indicator for thesis formation

---

## How I'd Extend This Working with Launch

The system as built is a strong deal-sourcing foundation. Here is what I would build out next if embedded with the Launch team as a researcher or contractor:

### 1. Founder Outreach Drafting
When a company hits CRITICAL tier and the analyst marks it Interested, automatically draft a personalized cold outreach email — pulling from the company's homepage, recent GitHub activity, and HN thread to write something that doesn't sound templated. The analyst reviews and sends in one click. Turnaround from signal to outreach drops from days to minutes.

### 2. Investment Memo Generation
For every Interested decision, generate a full structured investment memo: market size, competitive landscape, thesis fit, founder background summary, key risks, and a recommendation. Backed by the signals the system already holds — not a generic summary, but a sourced document the analyst can bring directly to a partner meeting.

### 3. Portfolio Monitoring
Track every company the fund has invested in or seriously considered. Alert the team when a portfolio company shows signals of momentum (GitHub star spike, HN front page, new hiring post) or distress (founder goes quiet, engineering velocity drops, team departures surface on LinkedIn). Proactive, not reactive.

### 4. Weekly Deal Digest Email
Every Monday morning, the system composes and sends a formatted email to partners: top 3 CRITICAL signals from the week, 5 emerging themes to watch, and a one-line status on each watchlist entry. No login required; the intelligence comes to the inbox.

### 5. Founder Intelligence Enrichment
When a company scores HIGH or above, automatically pull public founder data — prior companies, GitHub contribution history, conference talks, published writing, and mutual network connections — and attach it to the opportunity card. Gives the analyst context before the first call.

### 6. Mutual Network Routing
Cross-reference flagged founders against the Launch portfolio founder network and LP list. If there's a mutual connection, surface it on the card so the outreach can come warm instead of cold. Second-degree intros close faster.

### 7. Thesis Validation Loop
Each quarter, run a retrospective: which themes generated the most Interested decisions? Which sources had the highest signal-to-noise? Automatically surface this as a one-page thesis update — "this quarter, your deal flow skewed toward agentic infrastructure and open-source data tooling; here are the 12 companies worth tracking going into Q3."

### 8. CRM Sync
Push every Interested decision directly into Attio, Affinity, or whatever CRM the fund uses — pre-populated with company name, description, source URL, score, and thesis notes. Eliminates double-entry and keeps the pipeline current without analyst effort.

---

## Run Locally

```bash
cd basic0j
npm install
npm run dev
```

The `predev` script automatically clears port 3002 before starting. Configure API keys in `.env` (one level up from `basic0j/`):

```
EXA_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=
GITHUB_TOKEN=        # optional — raises GitHub API rate limits
```

Data is persisted locally in `basic0j/data/` (gitignored). The system starts an auto-scan 15 seconds after boot and rescans every 3 hours.