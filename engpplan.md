# Engineering Plan — Venture Scout AI (LAUNCH Build)
# Updated: 2026-05-22

**Context:** `basic0j/` is the active implementation directory. `scout/` is untouched reference. Server runs on port 3002. TypeScript passes clean. This plan reflects everything discussed: original Phases 1–3 (implemented), bug fixes from the first live scan, thesis and scoring upgrades from the Modal and aivoicephone.com analysis, and the credibility verification layer.

---

## Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Data quality (date windows, noise filter, CONSENSUS_TERMS) | ✅ Done |
| Phase 2 | Pipeline architecture (signal roles, live themes, Stage 2 founder search) | ✅ Done |
| Phase 3 | Watchlist link drop (URL inference, subreddit/newsletter types, paste UI) | ✅ Done |
| Phase 0 | Bug fixes from first live scan | 🔴 Must do next |
| Phase 4 | Thesis + scoring upgrades (software-first lens, funding exclusion, deep tech traction) | 🟡 Pending |
| Phase 5 | Credibility verification layer (passive/active/verify button) | 🟡 Pending |
| Phase 6 | FounderLead output (specific people, not abstract themes) | 🟡 Pending |
| Phase 7 | Outcome calibration | 🟡 Future |

---

## Phase 0 — Bug Fixes (implement before anything else)

Five bugs caused the first live scan to surface a YC-backed company and a $40M Series A company as Launch deal flow. These must be fixed before Phase 4+ work begins — the pipeline produces wrong output until they are.

### 0A. Call `isConsensus()` — it's currently a dead function

**File:** `server.ts:595`

`isConsensus()` is defined at line 124 but never called. The dedup filter only applies `isNoise()`. Fix:

```ts
const fresh = signals.filter(s =>
  !seenUrls.has(s.url) &&
  !isNoise(s.title, s.snippet) &&
  !(s.role !== 'partner_post' && s.role !== 'investment' && isConsensus(s.title + ' ' + s.snippet))
);
```

The role guard matters: partner posts and investment signals are intentionally fetching megafund portfolio data — they should not be filtered by CONSENSUS_TERMS because "YC S25 batch" and "Sequoia portfolio" appearing in those signals is expected and correct. The consensus filter should only strip signals that are competing for the *opportunity* surface.

### 0B. Add missing terms to CONSENSUS_TERMS

**File:** `server.ts:114–117`

Currently missing: "series a", "series b", large round amounts, and YC batch identifiers. These cause already-institutional companies to pass through the filter.

```ts
const CONSENSUS_TERMS = [
  // Round stage — anything Series A or later is too late for Launch
  'series a', 'series b', 'series c', 'series d',
  // Round sizes that imply institutional discovery
  '$20m', '$25m', '$30m', '$40m', '$50m', '$100m', '$200m', '$500m', '$1b',
  // YC batch identifiers — companies already accepted into YC
  'yc w25', 'yc s25', 'yc w24', 'yc s24', 'yc batch', 'ycombinator.com/companies',
  // Other consensus signals
  'unicorn', 'already funded', 'ipo filing', 'pre-ipo', 'consensus pick',
  // Explicit VC backing language
  'backed by', 'portfolio company of', 'venture backed',
];
```

Note: 'y combinator' and 'yc' alone should NOT be in this list — they appear legitimately in partner posts and investment signals used for theme extraction.

### 0C. Remove `investFmt` from Synthesis 1 (opportunity generation)

**File:** `server.ts:654`

Currently:
```ts
`...INVESTMENT SIGNALS:\n${investFmt}...`
```

`investFmt` contains signals from `site:ycombinator.com/startups`, `Y Combinator YC S25 batch companies`, `Sequoia Capital new investment backed 2026`. These are already-institutional portfolio companies. Passing them into opportunity synthesis causes GPT-4o-mini to surface those companies as Launch candidates.

`investFmt` should only appear in:
1. `extractLiveThemes()` — for sector intelligence
2. Synthesis 4 — the Portfolio tab (informational display of what megafunds backed)

Remove it from Synthesis 1 entirely. The opportunity prompt should receive only `launchFmt`, `partnerFmt`, and `painFmt`.

### 0D. Harden Synthesis 1 with explicit funding exclusion rule

**File:** `server.ts` — Synthesis 1 system prompt (~line 643)

Add to the system prompt:

```
HARD EXCLUSION RULE — Do not surface any of the following as a Launch opportunity:
- Any company already accepted into YC, Techstars, or any equity-taking accelerator
- Any company that has received external equity financing (VC, angel, Series A/B/C/D, convertible notes from investors)
- Any company listed in a fund's portfolio (Sequoia, a16z, YC, etc.)
These companies are THEME INTELLIGENCE ONLY — they tell us what sectors are hot, not who to fund.

ACCEPTABLE prior funding that does NOT disqualify:
- University commercialization programs (CREATE-X, MIT TLO, Stanford OTL, Georgia Tech commercialization hub)
- Government grants: SBIR Phase I/II, STTR, NSF, NIH, DOE, DARPA, ARPA-E, DOD
- Research licensing from universities
- Revenue from pilots, even with institutional partners
```

### 0E. Fix portfolio activity query signal flow

**File:** `server.ts:552–564`

The three portfolio queries ("YC alumni startup launch growth", "Sequoia-backed startup product launch") find already-funded companies correctly tagged as `portfolio` role. This is fine — they correctly feed Synthesis 4 and Synthesis 5 (themes). The problem was that `allFmt` (which includes portfolio signals) was being passed to opportunity synthesis. After 0C removes `investFmt`, confirm `allFmt` only goes to Synthesis 5 (themes) and not to Synthesis 1. No structural change needed — just confirm the routing is clean after 0C.

---

## Phase 4 — Thesis + Scoring Upgrades

These changes implement the principles derived from the Modal and software-first discussions. They affect prompts, signal queries, and the basic0j YAML files.

### 4A. Software-first marginal cost lens in prompts

**Files:** Synthesis 1 and Synthesis 2 system prompts in `server.ts`

Launch backs capital-efficient software regardless of the vertical it serves. The vertical can be hardtech, regulated, or infrastructure-adjacent. The product must be deployable as code at near-zero marginal cost per additional customer.

Add to Synthesis 1:
```
SOFTWARE-FIRST LENS:
LAUNCH backs capital-efficient software. The vertical being served can be unsexy, regulated,
or physically adjacent (transit, healthcare, legal, government, supply chain). What matters
is that the core product is deployable as code and can scale to 100x customers without 100x
capital expenditure.

Pass immediately if:
- Core product involves hardware manufacturing, drug discovery with lab costs, or physical
  infrastructure deployment where new customers require proportional capital
- The company describes itself as a hardware company, not a software company serving a 
  hardware-adjacent market

Accept even if:
- The vertical is hardtech, deeptech, or B2G
- The company emerged from a university lab
- There is no pricing page (common for B2G and institutional customers)
```

### 4B. Funding exclusion precision — what's acceptable vs. disqualifying

**Files:** `basic0j/thesis.yaml` (already updated), Synthesis 1 and Synthesis 2 prompts

The current exclusion rule says "no VC/YC/a16z" — too narrow. Upgrade to:

**Disqualifying (no external equity, period):**
- VC investment at any stage
- Angel investors
- Equity-taking accelerators (YC takes 7%, Techstars takes 6%)
- Convertible notes from investors
- Any disclosed funding round

**Acceptable (non-equity or academic/government):**
- University commercialization programs: CREATE-X, GT commercialization hub, MIT TLO, Stanford OTL, any university tech transfer office
- Government grants: SBIR Phase I/II, STTR, NSF, NIH, DOE, DARPA, ARPA-E, DOD SBIR
- Revenue from pilots — even paid institutional pilots — this is earned revenue, not investor money
- Research licensing arrangements

**No-public-funding as a positive signal (add to traction inference guide in prompts):**
Absence of Crunchbase entry, no TechCrunch/Axios funding announcement, no "backed by" or "investors" section on website = company has not been discovered by institutional money yet. This is a positive signal for Launch, not neutral.

### 4C. Deep tech traction vocabulary in prompts

**File:** `server.ts` — `tractionGuide` constant (~line 627)

Add a parallel deep tech / B2G section alongside the existing SaaS-centric traction guide:

```
DEEP TECH / B2G TRACTION GUIDE (applies when product serves institutional customers):
For companies serving governments, municipalities, hospitals, universities, or large enterprises,
these signals replace pricing pages and consumer metrics:

Strongest signals:
- Named institutional pilot partner + quantified outcome metric
  ("66% ridership growth/month with MARTA", "3-min average wait time at UMich")
  This is HARDER evidence than a pricing page — a real institution staked its operations on it
- Multiple named pilots across diverse contexts = technology generalizes, not a one-off fit
- SBIR Phase II award = US government has validated both technical merit AND commercial potential
- Named LOI or MOU from a government or enterprise entity

Strong signals:
- Named university as research or deployment partner (not just "in talks")
- Quantified performance improvement vs. incumbent ("49% reduction in travel time")
- Government/municipal procurement announcement or press release

Acceptable (for deep tech Wildcard tier):
- SBIR Phase I award + working prototype
- University tech transfer agreement
- Published research paper + working prototype + founding team still active

NOT a negative signal for B2G/deep tech:
- No pricing page (B2G customers go through RFPs, not self-serve checkout)
- No consumer DAU or MRR (institutional revenue doesn't map to these metrics)
- No Show HN post (deep tech companies don't post there)
```

Also update the Goldilocks Zone definition in `goldilocksCtx` for deep tech:

```
Deep tech: Active pilot or deployment with at least one named institutional partner
           AND at least one quantified outcome metric, OR SBIR Phase II / equivalent
           government validation of commercial potential.
           (Upgrade from: "MVP or prototype + strong technical team")
```

### 4D. Credential-exit founder signal in Stage 2 and prompts

**File:** `server.ts` — Stage 2B (X building-in-public searches, ~line 504) and Synthesis 1 prompt

A founder who left an academic institution to build is making a high-conviction, expensive bet. This is distinct from pedigree. It's an execution signal: they had institutional safety and chose to give it up.

**Add to Stage 2B X search query:**
```ts
const q = `(shipped OR launched OR "built this" OR "just launched" OR "live demo"
            OR "we hit" OR "MRR" OR "DAU" OR "left my PhD" OR "dropped out"
            OR "left the lab" OR "spun out" OR "tech transfer") ${theme}`;
```

**Add to Synthesis 1 actionPrompt guidance:**
```
Credential-exit founders (PhD discontinued, researcher who left a lab to commercialize their 
own work) are a positive signal for deep tech and research-adjacent opportunities. These 
founders have EARNED DOMAIN INSIGHT — they were solving the problem before the company 
existed. Note this specifically in the actionPrompt when signals suggest this founder profile.
```

**Add to Stage 2 Show HN searches** — also include searches targeting university tech transfer news and SBIR award announcements for deep tech themes:
```ts
// Deep tech discovery: university press releases, SBIR awards
const deepTechQ = `("tech transfer" OR "spinout" OR "SBIR" OR "commercialization" OR 
                    "university pilot" OR "research to market") ${theme}`;
```

### 4E. Update `basic0j/scoring.yaml` deep tech Wildcard definition

The current MEDIUM / Wildcard tier says "MVP in market with minimal traction." For deep tech, a company with three named institutional pilots and quantified outcomes is not a Wildcard — it's HIGH. Update the tier definitions to distinguish:

- **Deep tech CRITICAL:** Named institutional pilots with quantified outcomes across multiple contexts
- **Deep tech HIGH:** Active deployment with at least one named institutional pilot, or SBIR Phase II
- **Deep tech MEDIUM (Wildcard):** Working prototype + SBIR Phase I, or research paper + spinning out

---

## Phase 5 — Credibility Verification Layer

See `verificationsteps.md` for the full specification of each step and cost breakdown. This phase implements that spec in code and UX.

### 5A. New types

**File:** `src/types.ts`

```ts
export type CredibilityTier = 'verified' | 'plausible' | 'contested' | 'unverifiable';

// Add to OpportunityScore:
credibility: CredibilityTier;
credibilityReason: string;   // e.g. "domain 3mo, zero reviews found, no named team"
credibilityChecks: {
  domainAgeDays?: number;
  namedClaimsFound: boolean;
  reviewPlatformHits: string[];    // e.g. ["producthunt", "g2"]
  teamVerifiable: boolean;
  contactFunctional: boolean;
};

// Add to ScanState:
flagged: DealFlowOpportunity[];   // unverifiable companies, separate from opportunities
```

### 5B. Passive layer — Synthesis 1 prompt additions (free, always on)

Add to Synthesis 1 system prompt:

```
CREDIBILITY ASSESSMENT (passive — based only on signals already in hand):

For each opportunity, assess:
1. NAMED vs. ANONYMOUS CLAIMS: Are traction claims attributed to named, verifiable entities
   (named customers, named pilot partners) or are they purely aggregate ("500+ businesses")?
   Named = higher credibility. Anonymous aggregate with no named examples = lower credibility.

2. CONTACT INFRASTRUCTURE: Does any signal show a functional email contact, support system,
   or help center? Phone-only with no email = operational immaturity flag.

Return credibility as: "verified" | "plausible" | "contested" | "unverifiable"
Return credibilityReason as a single sentence explaining the rating.
```

### 5C. Active layer — domain age check (RDAP)

**File:** `server.ts` — new function, runs for CRITICAL/HIGH after scoring

```ts
async function checkDomainAge(domain: string): Promise<number | null> {
  // RDAP lookup via rdap.org — free, no key required
  // Returns domain age in days, or null if not found
}
```

Scoring logic: domain age < 90 days with large claims → `contested`. Domain age < 180 days with large anonymous claims → `contested`. Domain age consistent with claimed traction → `plausible` (upgrades to `verified` if other checks pass).

### 5D. Active layer — review platform cross-reference (Exa)

**File:** `server.ts` — new function, runs for CRITICAL/HIGH

3–5 Exa searches per company:
- `site:producthunt.com [company name]`
- `site:g2.com [company name]`
- `site:trustpilot.com [company name]`
- `site:capterra.com [company name]` (for B2B)
- Vertical-specific boards as applicable (Clutch, Healthgrades, etc.)

Returns list of platforms where the company was found. Zero hits across all = `contested` if large claims exist.

### 5E. Active layer — team verifiability (Exa)

**File:** `server.ts` — new function, runs for CRITICAL/HIGH

1–2 Exa searches restricted to `linkedin.com` for the company name and any founder names visible in signals. Returns: named founder found (boolean), LinkedIn company page exists (boolean), founding date visible.

### 5F. Credibility scoring synthesis pass

**File:** `server.ts` — new Synthesis 6 (runs after active layer for CRITICAL/HIGH)

Receives: passive credibility assessment from Synthesis 1 + RDAP result + review platform hits + team verifiability result. Returns final `CredibilityTier` and `credibilityReason` per opportunity.

Cost: one small synthesis call per CRITICAL/HIGH company. Acceptable.

### 5G. UI — credibility tier badge on deal flow cards

**File:** `src/App.tsx` — update deal flow card component

The card gains a `Credibility` field below Traction:
- `verified` → green badge
- `plausible` → grey badge, no friction
- `contested` → amber badge + reason text + "Verify" button prominently shown
- `unverifiable` → card does not appear in main deal flow (routed to Flagged)

### 5H. UI — Flagged section

**File:** `src/App.tsx` — new `FlaggedTab` component

A separate tab ("Flagged") between Themes and Watchlist showing `unverifiable` companies. Grey count badge in nav. Each entry shows: company description, what was found, what was not found, and a Verify button. Entries older than 30 days with no action auto-archive.

### 5I. API — `/api/verify/:id` endpoint

**File:** `server.ts` — new POST endpoint

Triggered by VC clicking "Verify" on a specific company. Runs:
- Full Wayback Machine CDX API check (earliest cache date of domain)
- Deep review content fetch (Exa with full content extraction on G2/PH pages)
- 5–10 Exa searches for any web mention archaeology
- Re-runs credibility synthesis with expanded evidence

Returns updated `CredibilityTier` and detailed `credibilityChecks`. The UI updates the card in place.

Cost per click: $0.20–$0.60 in Exa. Acceptable — VC has already expressed interest.

---

## Phase 6 — FounderLead Synthesis (specific people, not abstract themes)

*Originally Phase 4 in prior plan. Unchanged in design.*

Synthesis pass extracts named founders, GitHub handles, X handles, HN profiles from `launch`-role signals only. Returns `FounderLead[]` with contact URL, aligned theme, traction evidence, and traction confidence. Already scaffolded in `src/types.ts` and partially in `server.ts` — needs credibility fields added after Phase 5.

---

## Phase 7 — Outcome Calibration (future)

*Originally Phase 5. Unchanged.*

The `outcomes` record (`interested | pass`) already persists per opportunity ID. Once 20+ decisions accumulate, a calibration pass computes which signal types predicted `interested` vs. `pass` and adjusts synthesis weights. No new data collection needed — just a new API endpoint and a weekly calibration synthesis pass.

---

## Implementation Order

### Batch A — Bug fixes (do now, blocks all downstream work)
| # | Change | File | Effort |
|---|---|---|---|
| 1 | Call `isConsensus()` with role guard in dedup | `server.ts:595` | 15 min |
| 2 | Expand CONSENSUS_TERMS (series a/b, YC batch, round sizes) | `server.ts:114` | 15 min |
| 3 | Remove `investFmt` from Synthesis 1 prompt | `server.ts:654` | 10 min |
| 4 | Add hard funding exclusion rule to Synthesis 1 | `server.ts:643` | 20 min |
| 5 | Confirm portfolio signal routing is clean (0E audit) | `server.ts:654` | 10 min |

**Total Batch A:** ~70 min. Ship as a single commit. Re-run scan to verify no institutional-backed companies surface.

### Batch B — Thesis + scoring upgrades
| # | Change | File | Effort |
|---|---|---|---|
| 6 | Software-first marginal cost lens to Synthesis 1 + 2 | `server.ts` | 30 min |
| 7 | Funding exclusion precision (acceptable vs. disqualifying) to prompts | `server.ts` | 30 min |
| 8 | Deep tech traction vocabulary to `tractionGuide` | `server.ts` | 45 min |
| 9 | Goldilocks Zone deep tech definition upgrade | `server.ts:619` | 20 min |
| 10 | Credential-exit signal in Stage 2B queries | `server.ts:504` | 20 min |
| 11 | Deep tech discovery queries (university/SBIR) in Stage 2 | `server.ts` | 45 min |
| 12 | Update `basic0j/scoring.yaml` deep tech tier definitions | `scoring.yaml` | 30 min |

**Total Batch B:** ~3.5 hr. Ship as single commit.

### Batch C — Credibility verification (passive + active layers)
| # | Change | File | Effort |
|---|---|---|---|
| 13 | Add `CredibilityTier` and credibility fields to types | `src/types.ts` | 30 min |
| 14 | Add credibility assessment to Synthesis 1 prompt (passive) | `server.ts` | 30 min |
| 15 | `checkDomainAge()` RDAP function | `server.ts` | 45 min |
| 16 | Review platform Exa searches function | `server.ts` | 45 min |
| 17 | Team verifiability Exa search function | `server.ts` | 30 min |
| 18 | Credibility synthesis pass (Synthesis 6) for CRITICAL/HIGH | `server.ts` | 1 hr |
| 19 | Update `ScanState` with `flagged[]` array | `src/types.ts` | 15 min |
| 20 | Route `unverifiable` companies to `flagged[]` in scan | `server.ts` | 20 min |

**Total Batch C:** ~4.5 hr. Ship as single commit.

### Batch D — Credibility UX
| # | Change | File | Effort |
|---|---|---|---|
| 21 | Credibility badge on deal flow cards | `src/App.tsx` | 45 min |
| 22 | `FlaggedTab` component with 30-day auto-archive | `src/App.tsx` | 1.5 hr |
| 23 | `/api/verify/:id` endpoint (verify button layer) | `server.ts` | 2 hr |
| 24 | Verify button in card UI + polling for result | `src/App.tsx` | 1 hr |
| 25 | Flagged tab in nav with grey count badge | `src/App.tsx` | 30 min |

**Total Batch D:** ~6 hr. Ship as single commit.

### Batch E — FounderLead + Calibration (future)
| # | Change | File | Effort |
|---|---|---|---|
| 26 | Add credibility fields to `FounderLead` type | `src/types.ts` | 20 min |
| 27 | FounderLead credibility synthesis | `server.ts` | 1 hr |
| 28 | Outcome calibration API endpoint + weekly pass | `server.ts` | 2 hr |

**Total Batch E:** ~3.5 hr.

---

## Key architectural constraints (do not violate)

1. `investFmt` feeds `extractLiveThemes()` and Synthesis 4 only. Never Synthesis 1.
2. `isConsensus()` does NOT filter `partner_post` or `investment` role signals — only signals competing for the opportunity surface.
3. Credibility verification active layer runs only on CRITICAL/HIGH — never on MEDIUM/LOW.
4. The Verify button layer never runs automatically — only on explicit VC click.
5. `unverifiable` companies go to `flagged[]`, never to `opportunities[]`. Auto-archive after 30 days with no action.
6. Government grants (SBIR, NSF, DOE, DARPA) are NOT in CONSENSUS_TERMS and are NOT disqualifying.
7. University commercialization funding is NOT disqualifying.
