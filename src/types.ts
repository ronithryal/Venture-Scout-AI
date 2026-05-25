export type Firm = 'Sequoia' | 'a16z' | 'YC' | 'Custom';

// Credibility of claims made on the company's own website/signals.
// Separate from traction confidence (which asks "does traction exist?").
// This asks "are the claims independently verifiable?"
export type CredibilityTier = 'verified' | 'plausible' | 'contested' | 'unverifiable';
export type WatchlistType = 'twitter' | 'founder' | 'company' | 'topic' | 'subreddit' | 'newsletter' | 'url';
export type OutcomeTier = 'interested' | 'pass' | 'flagged';
export type SignalTier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

// Role describes what kind of evidence a signal provides:
// launch      → someone shipped something (Show HN, building-in-public post, GitHub product repo)
// pain        → market pain (Reddit, complaints) — not company evidence, informs theme search
// oss_project → GitHub repo that passed startup infra check
// partner_post → megafund partner X activity
// investment  → portfolio/investment announcement
// portfolio   → portfolio company activity
// watchlist   → user-curated source signal
export type SignalRole =
  | 'launch'
  | 'pain'
  | 'oss_project'
  | 'partner_post'
  | 'investment'
  | 'portfolio'
  | 'watchlist';

export interface WatchlistEntry {
  id: string;
  type: WatchlistType;
  value: string;
  label: string;
  addedAt: string;
}

export interface RawSignal {
  id: string;
  firm: Firm;
  type: 'partner_post' | 'investment' | 'portfolio_activity' | 'watchlist' | 'hn' | 'github' | 'reddit' | 'builder';
  role: SignalRole;
  partner?: string;
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
  fetchedAt: string;
}

export interface CredibilityChecks {
  domainAgeDays?: number;
  namedClaimsFound: boolean;
  reviewPlatformHits: string[];   // e.g. ['producthunt', 'g2']
  reviewPlatformUrls?: Record<string, string>;  // maps platform name → URL of the found page
  teamVerifiable: boolean;
  contactFunctional: boolean;
}

export interface VerificationEvidence {
  homepageFetched: boolean;
  homepageFundingFlags: string[];   // e.g. ["Y Combinator", "Backed by Sequoia"] found on company site
  ycDirectoryHit?: string;          // URL if company appears in YC directory
  fundingNewsCount: number;         // count of funding-related news hits
}

export interface OpportunityScore {
  tier: SignalTier;
  composite: number;
  traction: number;      // 35% weight — anchored to Goldilocks thresholds
  velocity: number;      // 30% weight
  market: number;        // 20% weight
  mechanics: number;     // 15% weight
  takeaway: string;
  thesisArea?: string;
  tractionEvidence?: string;
  tractionConfidence: 'stated' | 'inferred' | 'unknown';
  // Credibility fields — populated by active layer for CRITICAL/HIGH
  credibility?: CredibilityTier;
  credibilityReason?: string;     // e.g. "domain 3mo, zero reviews found, no named team"
  credibilityChecks?: CredibilityChecks;
  // Evidence-based verification (homepage + YC directory + funding news)
  verification?: VerificationEvidence;
}

export interface OpportunityEnrichment {
  github?: { stars: number; url: string; language?: string; pushedAt?: string; infraSignals?: string[] };
  hn?: { points: number; comments: number; url: string; title: string };
}

// Thematic cluster of what builders/thought leaders are discussing (X, Reddit, LinkedIn)
// — NOT individual founder leads, NOT VCs, NOT company cards
export interface FounderTheme {
  id: string;
  theme: string;            // concise theme name (3-8 words)
  summary: string;          // 2-sentence synthesis: what builders are saying + why it matters now
  platforms: string[];      // e.g. ['X', 'Reddit', 'LinkedIn']
  notableVoices: string[];  // handles/names of non-VC builders surfaced in discussion
  keyInsights: string[];    // 2-3 specific insights from the discussion
  signalStrength: 'strong' | 'moderate';
}

export interface DealFlowOpportunity {
  id: string;
  title: string;
  description: string;
  category: string;
  firms: Firm[];
  momentum: 'accelerating' | 'emerging' | 'established';
  signals: string[];
  actionPrompt: string;
  // Actual company/product names — separate from synthesized id/title.
  // Used by downstream credibility/funding checks (LinkedIn, review platforms, YC directory).
  companyName?: string;
  productName?: string;
  homepageUrl?: string;     // resolved company website (not source URL)
  score?: OpportunityScore;
  enrichment?: OpportunityEnrichment;
}

export interface PartnerSummary {
  partner: string;
  firm: Firm;
  handle: string;
  topics: string[];
  recentPosts: { url: string; title: string; snippet: string; date?: string }[];
}

export interface Investment {
  firm: Firm;
  company: string;
  description: string;
  url: string;
  date?: string;
  sector?: string;
}

export interface Theme {
  name: string;
  description: string;
  firms: Firm[];
  momentum: 'rising' | 'stable';
  evidence: string[];
}

export interface StoredTheme extends Theme {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  scanCount: number;
  pinned: boolean;
  pinnedAt?: string;
}

export interface ScanState {
  lastScanned: string | null;
  isScanning: boolean;
  progress: string[];
  liveThemes: string[];
  opportunities: DealFlowOpportunity[];
  flagged: DealFlowOpportunity[];    // unverifiable — holding queue, not trash
  decidedOpps: DealFlowOpportunity[];  // archive of all opps that have been acted on (interested/pass/flagged)
  founderThemes: FounderTheme[];
  partnerActivity: PartnerSummary[];
  investments: Investment[];
  themes: Theme[];
  storedThemes: StoredTheme[];
  signalCount: number;
  watchlist: WatchlistEntry[];
  outcomes: Record<string, OutcomeTier>;
  outcomeTimes: Record<string, string>;  // id → ISO timestamp of when outcome was set
  outcomeNotes: Record<string, string>;  // id → optional VC note explaining the decision
  error?: string;
}
