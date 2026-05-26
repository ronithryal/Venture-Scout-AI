import type { DealFlowOpportunity } from './types.js';
import { exaSearch, exaContents } from './signals.js';

// Step 1: Domain age via RDAP (free public API, no key required)
export async function checkDomainAge(url: string): Promise<number | null> {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const res = await fetch(`https://rdap.org/domain/${hostname}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const events: any[] = data.events || [];
    const reg = events.find((e: any) => e.eventAction === 'registration');
    if (!reg?.eventDate) return null;
    const regDate = new Date(reg.eventDate);
    return Math.floor((Date.now() - regDate.getTime()) / 86_400_000);
  } catch { return null; }
}

// Step 3: Review platform cross-reference (3 targeted Exa searches)
export async function checkReviewPlatforms(companyName: string): Promise<{ hits: string[]; urls: Record<string, string> }> {
  const platforms = [
    { name: 'producthunt', domain: 'producthunt.com' },
    { name: 'g2',          domain: 'g2.com' },
    { name: 'trustpilot',  domain: 'trustpilot.com' },
    { name: 'capterra',    domain: 'capterra.com' },
  ];
  const hits: string[] = [];
  const urls: Record<string, string> = {};
  await Promise.allSettled(platforms.map(async ({ name, domain }) => {
    const rs = await exaSearch(`"${companyName}"`, {
      includeDomains: [domain], numResults: 2,
    });
    if (rs.length > 0) {
      hits.push(name);
      if (rs[0].url) urls[name] = rs[0].url;
    }
  }));
  return { hits, urls };
}

// Extract an HN item URL from signal strings
export function extractHnUrlFromSignals(signals: string[]): { url: string; id: string } | null {
  for (const s of signals) {
    const m = s.match(/https:\/\/news\.ycombinator\.com\/item\?id=(\d+)/);
    if (m) return { url: m[0], id: m[1] };
  }
  return null;
}

// Funding disqualification check — runs live Exa searches
export async function checkFundingStatus(companyName: string): Promise<{ funded: boolean; reason: string }> {
  const name = companyName.replace(/[^\w\s]/g, '').trim();
  if (!name) return { funded: false, reason: '' };

  // Check 1: YC company directory — the most reliable single signal
  const ycHits = await exaSearch(name, {
    includeDomains: ['ycombinator.com'],
    numResults: 3,
  });
  const ycDirectoryHit = ycHits.find(r => {
    if (!r.url?.includes('ycombinator.com/companies')) return false;
    try {
      const urlObj = new URL(r.url);
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      const companiesIdx = pathSegments.indexOf('companies');
      if (companiesIdx !== -1 && pathSegments.length > companiesIdx + 1) {
        const companySlug = pathSegments[companiesIdx + 1].toLowerCase();
        const kebabName = name.toLowerCase().replace(/\s+/g, '-');
        return companySlug === kebabName || new RegExp(`^${kebabName}-\\d+$`).test(companySlug);
      }
    } catch {}
    return false;
  });
  if (ycDirectoryHit) {
    return { funded: true, reason: `found in YC company directory: ${ycDirectoryHit.url}` };
  }

  // Check 2: Funding announcement search
  const fundingHits = await exaSearch(
    `"${name}" (funded OR "Y Combinator" OR "Techstars" OR "Series A" OR "seed round" OR "angel round" OR "raised $")`,
    { numResults: 5 }
  );
  const FUNDING_SIGNALS = [
    'y combinator', 'yc batch', 'yc w2', 'yc s2', 'techstars', 'series a', 'series b',
    'seed round', 'angel round', 'raised $', 'secured funding', 'venture backed',
  ];
  const FUNDING_KEYWORDS = [
    'raised', 'closed', 'announced', 'funding', 'round', 'raise', 'investment', 'invests', 'invested', 'funded'
  ];
  const nameLower = name.toLowerCase();
  const hits = fundingHits.filter(r => {
    const text = ((r.title || '') + ' ' + (r.snippet || '')).toLowerCase();
    if (!FUNDING_SIGNALS.some(s => text.includes(s))) return false;
    if (!FUNDING_KEYWORDS.some(k => text.includes(k))) return false;
    const nameIdx = text.indexOf(nameLower);
    if (nameIdx === -1) return false;
    return FUNDING_SIGNALS.some(sig => {
      const sigIdx = text.indexOf(sig);
      return sigIdx !== -1 && Math.abs(sigIdx - nameIdx) <= 200;
    });
  });
  if (hits.length >= 3) {
    return { funded: true, reason: `funding signals found: "${hits[0].title}"` };
  }

  return { funded: false, reason: '' };
}

// Step 4: Team verifiability via LinkedIn Exa search
export async function checkTeamVerifiable(companyName: string, founderHint?: string): Promise<boolean> {
  const q = founderHint
    ? `"${founderHint}" "${companyName}" founder`
    : `"${companyName}" founder CEO`;
  const rs = await exaSearch(q, { includeDomains: ['linkedin.com'], numResults: 2 });
  return rs.length > 0;
}

// Funding-mention vocabulary scanned for on the company's homepage
export const HOMEPAGE_FUNDING_FLAGS = [
  'y combinator', 'ycombinator', 'backed by yc', 'yc w2', 'yc s2', 'yc batch',
  'sequoia', 'andreessen horowitz', 'a16z', 'techstars', 'first round capital',
  'lightspeed', 'accel', 'benchmark', 'greylock', 'kleiner perkins',
  'index ventures', 'bessemer', 'general catalyst', 'founders fund',
  'our investors', 'series a', 'series b', 'series c',
  'raised $', 'closed a $', 'seed round led by', 'pre-seed round',
  'backed by sequoia capital', 'backed by a16z', 'our investors include',
  'raised our seed', 'closed our seed',
  'investors include', 'with funding from', 'backed by leading investors',
];

// Fetches a company's homepage and scans for funding-disclosure language
export async function checkHomepageFunding(homepageUrl: string): Promise<{ flags: string[]; fetched: boolean }> {
  if (!homepageUrl || !/^https?:\/\//.test(homepageUrl)) return { flags: [], fetched: false };
  let root: string;
  try { root = new URL(homepageUrl).origin; } catch { return { flags: [], fetched: false }; }
  const candidates = [
    homepageUrl,
    `${root}/about`, `${root}/team`, `${root}/investors`, `${root}/press`,
  ];
  const pages = await exaContents(candidates);
  if (pages.length === 0) return { flags: [], fetched: false };
  const combined = pages.map(p => p.text).join('\n').toLowerCase();
  const flags = HOMEPAGE_FUNDING_FLAGS.filter(f => combined.includes(f));
  return { flags: [...new Set(flags)], fetched: true };
}

// Credibility scoring: runs passive (from synthesis) + active checks for CRITICAL/HIGH
export async function runCredibilityChecks(
  opp: DealFlowOpportunity,
  passiveCredibility: string,
  passiveReason: string,
): Promise<{ credibility: import('./types.js').CredibilityTier; credibilityReason: string; credibilityChecks: import('./types.js').CredibilityChecks }> {
  const urlFromSignals = (() => {
    if (opp.homepageUrl) return opp.homepageUrl;
    for (const s of (opp.signals || [])) {
      const m = s.match(/https?:\/\/[^\s)'"]+/);
      if (m) return m[0].replace(/[)'".,]+$/, '');
    }
    return null;
  })();

  const searchName = (opp.companyName || opp.title || opp.id.replace(/[-_]/g, ' ')).trim();

  const domainAgeDays = urlFromSignals ? await checkDomainAge(urlFromSignals) : null;
  const { hits: reviewHits, urls: reviewPlatformUrls } = await checkReviewPlatforms(searchName);
  const teamVerifiable = await checkTeamVerifiable(searchName);

  const checks: import('./types.js').CredibilityChecks = {
    domainAgeDays: domainAgeDays ?? undefined,
    namedClaimsFound: passiveCredibility === 'verified' || passiveCredibility === 'plausible',
    reviewPlatformHits: reviewHits,
    reviewPlatformUrls,
    teamVerifiable,
    contactFunctional: passiveReason ? !passiveReason.includes('contact') : true,
  };

  let tier: import('./types.js').CredibilityTier = passiveCredibility as any || 'unverifiable';
  const reasons: string[] = [];

  if (domainAgeDays !== null) {
    if (domainAgeDays < 180) {
      reasons.push(`fresh domain (${domainAgeDays}d) — recent ship, positive`);
    } else if (domainAgeDays > 1095 && reviewHits.length === 0 && !teamVerifiable) {
      reasons.push(`stale domain (${domainAgeDays}d) + no review/LinkedIn evidence — possible dormant/rebranded`);
      if (tier === 'verified') tier = 'plausible';
      else if (tier === 'plausible') tier = 'contested';
    } else {
      reasons.push(`domain ${domainAgeDays}d old`);
    }
  }
  if (reviewHits.length > 0) {
    reasons.push(`found on: ${reviewHits.join(', ')}`);
    if (tier === 'contested') tier = 'plausible';
  }
  if (!teamVerifiable) {
    reasons.push('no named team on LinkedIn');
    if (tier === 'verified') tier = 'plausible';
  }

  if (passiveCredibility === 'unverifiable') {
    tier = (reviewHits.length > 0 || teamVerifiable) ? 'contested' : 'unverifiable';
  }

  const credibilityReason = reasons.length > 0 ? reasons.join('; ') : (passiveReason || 'signals consistent');
  return { credibility: tier, credibilityReason, credibilityChecks: checks };
}
