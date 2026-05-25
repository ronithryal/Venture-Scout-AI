# Verification Steps — Credibility Layer for Deal Flow

Companion to `engpplan.md`. Defines how the system verifies that traction claims are real, not fabricated.

This is a two-question problem. Traction detection asks: *does this company have traction?* Credibility verification asks: *are the claims on this website real?* These are separate questions requiring separate passes.

---

## Output: Claims Credibility Tier

Every company that reaches the deal flow surface gets a credibility rating alongside its traction confidence:

| Tier | Meaning |
|---|---|
| `verified` | Claims backed by named, cross-referenceable evidence |
| `plausible` | Claims anonymous but operationally consistent with company age and size |
| `contested` | Claims outpace operational evidence — scale of claim inconsistent with signals |
| `unverifiable` | No independent evidence can be found for any claim |

**What the VC does with each tier:**
- `verified` → outreach-ready, evidence speaks for itself
- `plausible` → standard first call, ask founder to walk through claims
- `contested` → before outreach, independently verify the specific claims (find one real customer, check domain age, find one review)
- `unverifiable` → do not surface as an opportunity; archive pending discovery through a different signal

---

## The Five Steps

### Step 1 — Domain Maturity vs. Claimed Traction

**What it checks:** Whether the domain has existed long enough for the claimed traction to be plausible.

A company claiming "500+ businesses" and "$12M recovered" with a 4-month-old domain is showing a hard logical inconsistency — those customers couldn't have found the product in that time frame.

**How it works:**
- RDAP lookup (the public successor to WHOIS, `rdap.org` — free JSON API, no key required) returns the exact domain registration date
- Compare domain age against claimed traction scale
- Separately, search Exa for the earliest indexed mention of the domain to cross-check

**Scoring logic:**
- Domain age ≥ 18 months with large claims → consistent
- Domain age 6-18 months with moderate claims → plausible
- Domain age < 6 months with large claims ($1M+, 100+ customers) → contested
- Domain registered last 90 days with any significant claims → immediate contested flag

---

### Step 2 — Named vs. Anonymous Claims

**What it checks:** Whether the company's claims are traceable to real, verifiable entities or are purely aggregate/anonymous.

**The spectrum:**
- Strongest: Named institutional partner + quantified outcome ("66% ridership growth with MARTA") — verifiable
- Strong: Named customer logo + attributed quote — LinkedIn-verifiable
- Moderate: Industry-specific case study without name ("a logistics company in Atlanta") — plausible, unverifiable
- Weak: Pure aggregate ("500+ businesses", "$12M recovered") — anonymous, unverifiable
- Red flag: Large aggregate claims with zero named examples — contested

**How it works:** This step runs inside the existing synthesis pass at essentially zero extra cost. The prompt instructs the model to assess whether claims are named or anonymous and flag the gap between claim scale and evidence specificity.

Named claims can be cross-referenced. Anonymous claims cannot. A company claiming 500 customers with zero named examples is making a claim that can never be proven or disproven from the outside — that asymmetry itself is a signal.

---

### Step 3 — Review Platform Cross-Reference

**What it checks:** Whether independent, third-party validation of the product's existence and quality exists outside the company's own website.

**Platforms to check (in priority order for SaaS):**
- ProductHunt — launch post with upvotes and comments; dates are public and authentic
- G2, Capterra, GetApp — verified B2B reviews; reviewer identity is moderated
- Trustpilot — volume and sentiment; look for response from the company (operational signal)
- Google Business reviews — existence implies the business is registered and operating
- Niche boards relevant to the vertical (Clutch for agencies/services, Healthgrades for health, Slashdot for devtools)
- AppSumo — indicates an early revenue push to non-VC audience

**The check isn't just presence — it's consistency.** A company claiming 500+ paying customers with zero reviews across all platforms is anomalous. Real customers always include at least some who post reviews unprompted, especially dissatisfied ones.

**How it works:** 3-5 targeted Exa searches: one per platform, domain-restricted. The search looks for `site:g2.com [company name]`, `site:producthunt.com [company name]`, etc. This is cheap per company and definitive — either the listing exists or it doesn't.

---

### Step 4 — Team Verifiability

**What it checks:** Whether a named, real founder with verifiable history stands behind the product.

Anonymous companies with no named team and no contact email are making claims that no person has staked their reputation on. That asymmetry lowers the credibility of every claim on the site.

**What to look for:**
- Named founder on the website with a LinkedIn profile that shows: the company, consistent dates, a verifiable prior work or academic history
- LinkedIn company page that exists and has a founding date consistent with domain age
- Any press coverage, podcast appearances, or conference talks where the founder is named and can be looked up

**Credibility anchors (positive):**
- Founder with an academic institution affiliation that explains the product's origin (research spinout)
- Prior company with verifiable existence (even if it failed)
- Named advisors or co-founders with checkable LinkedIn histories

**Red flags:**
- No named team anywhere on website or LinkedIn
- LinkedIn company page created in the last 30 days with large traction claims
- Founder's LinkedIn history doesn't include the company despite claiming it's been operating for a year

**How it works:** 1-2 Exa searches with linkedin.com domain restriction. Cheap.

---

### Step 5 — Contact Infrastructure Maturity

**What it checks:** Whether the company's contact infrastructure is consistent with the scale it claims.

A broken or incomplete contact form is an operational signal. A company with 500+ business customers has support workflows, onboarding processes, and inbound inquiries — infrastructure that doesn't coexist with a blank email field.

**What to check:**
- Does a functional contact email exist (not just a phone number)?
- Is there a support email distinct from a founder's personal email? (indicates operational maturity)
- Is there a help center, Intercom widget, or documentation? (implies active customers asking questions)
- Does the phone number have a real area code consistent with the company's claimed location?

**How it works:** Runs on the existing website snapshot already captured during the scan — no additional API calls. The synthesis prompt checks for these signals in the content already fetched.

---

## Layered Architecture

Not all steps should run on every company, on every scan. The cost calculus is explicit below.

### Passive Layer — Runs always, no extra cost

| Step | How | Marginal cost |
|---|---|---|
| Step 2: Named vs. anonymous claims | Added language in existing synthesis prompt | $0 |
| Step 5: Contact infrastructure | Analyzed from existing website snippet | $0 |
| Basic team existence flag | Checked from signals already in pipeline | $0 |

These run on every company because they require no new API calls — they're instructions layered onto synthesis passes that already happen.

### Active Layer — Runs automatically on CRITICAL and HIGH tier only

| Step | How | Marginal cost per company |
|---|---|---|
| Step 1: Domain age | RDAP JSON fetch (free public API) | ~$0 |
| Step 3: Review platforms | 3-5 Exa searches (PH, G2, Trustpilot) | ~$0.02–$0.08 |
| Step 4: Team verifiability | 1-2 Exa searches (LinkedIn domain) | ~$0.01–$0.03 |

At 10 CRITICAL/HIGH companies per scan, the active layer costs approximately **$0.30–$1.10 per scan.** At Exa's search pricing, this is negligible relative to the scan's total API cost.

Running these on MEDIUM or LOW tier companies is not worth it — if the traction signal is weak, the investment in credibility verification doesn't improve the decision. The right call for LOW tier is archive, not verify.

### Verify Button Layer — Triggered per-company by VC click only

These are expensive, slow, or privacy-adjacent checks. They should never run automatically. The VC clicks "Verify" on a specific tile when they've already decided the company is interesting and want deeper confirmation before reaching out.

| Step | How | Marginal cost |
|---|---|---|
| Full Wayback Machine history | CDX API (free) + Exa for earliest cached mentions | ~$0.02–$0.10 |
| Full review content analysis | Exa with content extraction on G2/Capterra pages | ~$0.05–$0.20 |
| Broader web mention archaeology | 5-10 Exa searches across news, forums, LinkedIn | ~$0.05–$0.30 |
| Secretary of State / company registration lookup | State-specific public databases (free, manual or API) | ~$0 |

The Verify button is also the right UX gate for the VC's own judgment. The system can surface a `contested` company (large claims, new domain, no reviews) — the VC looks at it and decides: *this is interesting enough to spend 3 minutes verifying.* Clicking Verify triggers the deeper layer. The system then comes back with: domain registered 4 months ago (contested), zero G2 reviews (contested), no named team (contested) — and the VC makes the call to archive or reach out with skepticism.

This preserves Launch's most expensive resource: the VC's attention and outreach credibility. One email to a fraudulent or wildly overstating company costs more in reputation than any API call.

---

## What Changes in the Scoring Output Card

The deal flow card gains one new field:

```
[CRITICAL] — Company / Founder Handle
─────────────────────────────────────────────
Traction:       $X MRR (+Y% MoM) | stated
Credibility:    contested — domain 3mo, no reviews found, no named team
Score:          X.X / 5.0
Signals:        [...]
Action:         Verify before outreach
```

The `Credibility` field only shows `verified` or `plausible` in green/neutral. `contested` shows in amber with the specific reason. `unverifiable` keeps the company off the main deal flow surface — it goes to the Flagged section described below.

---

## The Unverifiable Tier: Flagged Section

`unverifiable` does not mean fraudulent. It means the system found no independent evidence to confirm or deny the claims. Some real, early-stage companies are `unverifiable` simply because they haven't done any public-facing marketing, have no review presence, and have a founder who doesn't post publicly. Discarding these automatically would miss legitimate companies.

The right home for `unverifiable` companies is a dedicated **Flagged** section, separate from the main deal flow surface, which the VC can check periodically.

**What the Flagged section is:**
- A low-priority queue, not a trash bin
- Accessible from the main nav but clearly separated from CRITICAL/HIGH/MEDIUM deal flow
- Each entry shows: the company name, what the system found, and what it could not find
- One-click access to the Verify button, which is the primary intended action for flagged companies

**What the Flagged section is not:**
- An automatic discard — nothing is deleted from here without VC action
- A signal that the company is bad — it's a signal that the system ran out of independent evidence
- A reason not to reach out — some of the best pre-discovery companies have no public footprint yet

**The workflow for flagged companies:**
1. Company surfaces in scan with `unverifiable` credibility
2. System routes it to Flagged rather than main deal flow
3. VC glances at Flagged periodically (weekly or per-scan)
4. For any company that looks interesting based on the description alone, VC clicks Verify
5. Verify layer runs and returns whatever independent evidence it finds
6. VC either promotes to deal flow manually or archives

**UX placement:** A "Flagged" tab in the main navigation, between Themes and Watchlist, with a count badge. The count should be visually distinct from the CRITICAL/HIGH counts — a grey badge rather than a colored one — to communicate that this is a holding queue, not urgent pipeline.

**Auto-expiry:** Flagged entries older than 30 days with no VC action auto-archive. If a company is genuinely interesting, the VC will have acted on it. If it sat untouched for a month, it's effectively a pass.
