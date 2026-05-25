# Product Log — Venture Scout AI

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
