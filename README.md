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

**Stage 6 — Credibility Check & Hermes Agentic Conviction**
Active credibility verification runs on top-tier signals: domain age check, named claims search, review platform hits (Product Hunt, G2), team LinkedIn verifiability, and homepage funding language scrape.

In parallel, **Hermes** (an agentic research agent) conducts deep conviction verification on CRITICAL and HIGH opportunities. It autonomously searches the web to verify product existence, flag undisclosed equity funding, and surface supporting evidence. Hermes returns a conviction level (strong/moderate/weak/pass) that can downgrade opportunities if signals are thin or funding is undisclosed. This layer catches hallucinated or inflated companies before they reach the analyst's inbox.

---

## Self-Improving Scoring

The system records every analyst decision — Interested, Pass, or Flag — along with an optional written note explaining the reasoning. All decisions are persisted to `data/decisions.json` for historical tracking. When 3 or more decisions with notes accumulate, a feedback digest is injected into future scoring prompts:

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

- **Autonomously verifies claims**: Can run up to 3 targeted searches per opportunity to confirm product existence, find supporting press, or validate founding signals
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
| Theme Extraction | **Gemini 3.5 Flash** | Structured JSON extraction from VC social content |
| Signal Retrieval | **Exa Neural Search** | Semantic web search with domain-level targeting |
| Opportunity Scoring | **Gemini 3.5 Flash** | Synthesis 1–5: extraction, scoring, enrichment |
| Credibility Verification | **Hermes-3-Llama-3.1-70B** (optional) | Agentic research: verifies claims, flags undisclosed funding, returns conviction assessment |
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

### 9. Autonomous Hermes Sourcing Layer
Upgrade Hermes from a verification-only gate to an autonomous sourcing agent. Instead of waiting for Gemini to surface opportunities, let Hermes proactively hunt for companies matching the fund's investment thesis. Give it:
- Recent portfolio company announcements and founder moves as search vectors
- Competitive landscaping queries ("who's building in open-source infra like our portfolio co X?")
- Founder signal monitoring (when a founder with prior exits moves, Hermes surfaces what they're building)
- Weekly autonomously-sourced deal list with conviction scores, requiring zero analyst input to trigger

This turns the system from reactive (waiting for signals to bubble up) to proactive (Hermes hunting for relevant founders and companies directly).

### 10. WhatsApp + Email Outreach Pipeline
Integrate WhatsApp Business API and email (SendGrid/Resend) to enable one-click warm outreach:
- When an analyst marks a company Interested, generate a personalized cold email or WhatsApp message template (using Hermes or Gemini to pull from LinkedIn, Twitter, recent press)
- If a mutual connection exists (from founder intelligence enrichment), use that in the outreach ("I noticed you worked with X, who I know well...")
- Track engagement: clicks, replies, meeting bookings — feed back into the feedback loop so the system learns which companies actually convert to meetings
- Scheduled batch sends: every Friday at 2pm, send queued outreach and include a digest of what got replies

### 11. Founder & Company Network Graph
Build a knowledge graph of:
- **Founder nodes**: linked by prior companies, co-founder relationships, shared advisors, mutual investors, conference attendance
- **Company nodes**: linked by investors, customers, employees, technology stacks, market segments
- **Fund nodes**: portfolio companies, LPs, partner firms, signal sources

Query patterns that unlock value:
- "Show me all founders 2 degrees away from our portfolio founders"
- "Which companies share 3+ employees with a company we passed on 6 months ago?"
- "Map the investor network for all companies scoring HIGH — where's the overlap?"
- "Visualize emerging clusters: which founders/companies are starting to signal the same thesis?"

This transforms isolated company signals into relational intelligence — you can see clusters, founder migration patterns, and second-order effects (e.g. a team of ex-Stripe people who all moved to different startups signals something).

### 12. Real-time Signal Webhooks
Set up webhooks for high-velocity signals:
- GitHub API: when a watched repository hits a star-count milestone or sees a surge in commits, notify immediately
- Hacker News API: when a founder's name or company appears on the front page, page the analyst
- Twitter Streaming API: new post from watched founder or company handle triggers a Hermes conviction check and Slack alert
- LinkedIn: when a key team member joins or leaves a HIGH/CRITICAL company, surface it instantly

Don't batch these — real-time monitoring means catching moments when founders are signaling major moves or launches.

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
GITHUB_TOKEN=        # optional — raises GitHub API rate limits
HERMES_API_KEY=      # optional — agentic conviction verification (NVIDIA Integrated API)
HERMES_BASE_URL=     # optional — defaults to https://integrate.api.nvidia.com/v1
```

Data is persisted locally in `basic0j/data/` (gitignored). The system starts an auto-scan 15 seconds after boot and rescans every 3 hours.