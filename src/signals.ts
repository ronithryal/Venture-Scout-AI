import crypto from 'crypto';
import type { RawSignal, SignalRole, Firm } from './types.js';
import { DEFAULT_PARTNERS, ESTABLISHED_ORG_LOGINS } from './partners.js';

// ─── Exa ───────────────────────────────────────────────────────────────────────
export async function exaSearch(
  query: string,
  opts: { includeDomains?: string[]; numResults?: number; startPublishedDate?: string } = {}
): Promise<any[]> {
  const EXA_API_KEY = process.env.EXA_API_KEY || '';
  if (!EXA_API_KEY) return [];
  try {
    const body: any = {
      query, numResults: opts.numResults ?? 6, type: 'auto',
      contents: { text: { maxCharacters: 1000 }, highlights: { numSentences: 2, highlightsPerUrl: 1 } },
    };
    if (opts.includeDomains?.length) body.includeDomains = opts.includeDomains;
    if (opts.startPublishedDate) body.startPublishedDate = opts.startPublishedDate;
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).filter((r: any) => r.url?.startsWith('http'));
  } catch { return []; }
}

export async function exaContents(urls: string[]): Promise<Array<{ url: string; text: string }>> {
  const EXA_API_KEY = process.env.EXA_API_KEY || '';
  if (!EXA_API_KEY || urls.length === 0) return [];
  try {
    const res = await fetch('https://api.exa.ai/contents', {
      method: 'POST',
      headers: { 'x-api-key': EXA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: urls,
        text: { maxCharacters: 4000 },
        livecrawl: 'fallback',
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      url: r.url || '',
      text: (r.text || '').slice(0, 4000),
    }));
  } catch { return []; }
}

export function pickSnippet(r: any): string {
  const hl = Array.isArray(r.highlights)
    ? (typeof r.highlights[0] === 'string' ? r.highlights[0] : r.highlights[0]?.text ?? '')
    : '';
  return (hl || r.text || '').slice(0, 280).trim();
}

// ─── HN Algolia ────────────────────────────────────────────────────────────────
export async function hnSearch(query: string, n = 5): Promise<any[]> {
  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${n}`
    );
    if (!res.ok) return [];
    return (await res.json()).hits || [];
  } catch { return []; }
}

// ─── GitHub ────────────────────────────────────────────────────────────────────
export async function githubRepoSearch(query: string, n = 6): Promise<any[]> {
  const GITHUB_TOKEN = process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN || '';
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${n}`,
      { headers }
    );
    if (!res.ok) return [];
    return (await res.json()).items || [];
  } catch { return []; }
}

// GitHub startup infra detection — adapted from founder-scout/modules/github_enhanced.py
const LANDING_PAGE_FILES = ['index.html', 'cname', 'vercel.json', 'netlify.toml', '_redirects'];
const STARTUP_INFRA_DEPS = ['stripe', '@stripe/', 'auth0', '@auth0/', 'clerk', '@clerk/', 'supabase', '@supabase/', 'lemon_squeezy', 'paddle'];
const LANDING_PATTERNS   = ['coming soon', 'join the waitlist', 'sign up for beta', 'early access', 'join the beta', 'request access'];

export async function hasStartupInfra(repoFullName: string): Promise<{ score: number; signals: string[] }> {
  const GITHUB_TOKEN = process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN || '';
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const signals: string[] = [];
  let score = 0;
  try {
    const treeRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees/HEAD?recursive=0`,
      { headers }
    );
    if (treeRes.ok) {
      const tree = await treeRes.json();
      const files: string[] = (tree.tree || []).map((f: any) => (f.path || '').toLowerCase());
      for (const f of LANDING_PAGE_FILES) {
        if (files.includes(f)) { signals.push(`landing:${f}`); score += 20; }
      }
      if (files.includes('package.json')) {
        try {
          const pkgRes = await fetch(
            `https://api.github.com/repos/${repoFullName}/contents/package.json`,
            { headers }
          );
          if (pkgRes.ok) {
            const pkgData = await pkgRes.json();
            const pkg = JSON.parse(Buffer.from(pkgData.content || '', 'base64').toString());
            const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
            for (const dep of deps) {
              if (STARTUP_INFRA_DEPS.some(d => dep.startsWith(d))) {
                signals.push(`infra:${dep}`); score += 15;
              }
            }
          }
        } catch { /* non-critical */ }
      }
    }
    const readmeRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/readme`,
      { headers }
    );
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json();
      const readme = Buffer.from(readmeData.content || '', 'base64').toString().toLowerCase();
      for (const pattern of LANDING_PATTERNS) {
        if (readme.includes(pattern)) { signals.push(`readme:${pattern}`); score += 25; }
      }
    }
  } catch { /* non-critical */ }
  return { score, signals };
}

// ─── Reddit ────────────────────────────────────────────────────────────────────
export async function redditFetch(subreddit: string, limit = 15): Promise<any[]> {
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`,
      { headers: { 'User-Agent': 'VentureScout/1.0' } }
    );
    if (!res.ok) return [];
    return (await res.json()).data?.children?.map((c: any) => c.data) || [];
  } catch { return []; }
}

// ─── Signal builder ────────────────────────────────────────────────────────────
const MAX_DATE_AGE_MS = 14 * 86_400_000;

export function sanitizePublishedDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const ms = new Date(raw).getTime();
    if (isNaN(ms)) return undefined;
    if (Date.now() - ms > MAX_DATE_AGE_MS) return undefined;
    return raw;
  } catch { return undefined; }
}

export function makeSignal(
  firm: Firm, type: RawSignal['type'], role: SignalRole,
  url: string, title: string, snippet: string,
  now: string, partner?: string, publishedDate?: string
): RawSignal | null {
  if (!url || snippet.length < 20) return null;
  return {
    id: crypto.randomUUID(), firm, type, role, partner, url, title, snippet,
    publishedDate: sanitizePublishedDate(publishedDate),
    fetchedAt: now,
  };
}

// ─── Noise filter ──────────────────────────────────────────────────────────────
export const NOISE_TERMS = [
  '[hiring]', 'hiring:', 'job -', 'jobs thread', 'salary survey', 'review my resume',
  'resume review', 'roast my resume', 'daily digest', 'weekly digest', 'news roundup',
  'tutorial', 'beginner guide', 'how to learn', 'free course', 'coding bootcamp',
  'awesome list', 'prompt collection', 'statistics of the week', 'bounty:',
  'share your', 'share a ', 'changed my workflow forever', 'mind blowing', 'game changer',
];

export const CONSENSUS_TERMS = [
  // Round stages — Series A or later is past Launch's entry point
  'series a', 'series b', 'series c', 'series d',
  // Round sizes implying institutional discovery
  '$15m', '$20m', '$25m', '$30m', '$40m', '$50m', '$75m', '$100m', '$200m', '$500m', '$1b',
  // YC batch/portfolio identifiers — companies already in YC
  'yc w25', 'yc s25', 'yc w24', 'yc s24', 'yc w23', 'yc s23',
  'yc batch', 'ycombinator.com/companies', 'y combinator portfolio',
  // Explicit institutional backing language
  'backed by sequoia', 'backed by a16z', 'backed by andreessen',
  'portfolio company', 'venture backed',
  // Publicly traded / acquired companies — not early-stage founders
  'publicly traded', 'nasdaq:', 'nyse:', 'acquired by', 'acquisition by',
  'subsidiary of', 'a division of', 'product of ', 'feature launch',
  // Late-stage signals
  'unicorn', 'ipo filing', 'pre-ipo', 'consensus pick', 'already funded',
];

export function isNoise(title: string, snippet: string): boolean {
  const text = (title + ' ' + snippet).toLowerCase();
  return NOISE_TERMS.some(t => text.includes(t));
}

export function isConsensus(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSENSUS_TERMS.some(t => lower.includes(t));
}

// ─── X engagement-bait filter ─────────────────────────────────────────────────
export const X_ENGAGEMENT_NOISE = [
  'like ', ' likes', 'comment', 'follow ', 'following', 'postia',
  'retweet', 'rt @', 'please follow', 'share this', 'click like',
  'drop a like', 'hit follow', 'turn on notif',
];

export function isXEngagementNoise(text: string): boolean {
  const lower = text.toLowerCase();
  return X_ENGAGEMENT_NOISE.some(t => lower.includes(t));
}

// ─── Date window helper ────────────────────────────────────────────────────────
export function isWithinWindow(publishedDate: string | undefined, cutoffYMD: string): boolean {
  if (!publishedDate) return true;
  return publishedDate.slice(0, 10) >= cutoffYMD;
}

// ─── Press-release domain blocker ─────────────────────────────────────────────
export const PRESS_RELEASE_DOMAINS = [
  'prnewswire.com', 'businesswire.com', 'globenewswire.com', 'accesswire.com',
  'einpresswire.com', 'prweb.com', 'prlog.org', 'send2press.com',
  'marketwatch.com', 'businessinsider.com', 'prnews.io',
];

export function isPressRelease(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return PRESS_RELEASE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return false; }
}

// ─── VC tool repo filter ──────────────────────────────────────────────────────
export function isVcToolRepo(url: string): boolean {
  const m = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\//i);
  if (!m) return false;
  return ESTABLISHED_ORG_LOGINS.has(m[1].toLowerCase());
}

// ─── Grok X: handle-targeted search ────────────────────────────────────────────
export async function grokXFromHandles(
  handles: string[],
  maxPerHandle = 3,
  fromDate?: string,
): Promise<Array<{ url: string; title: string; snippet: string; publishedDate?: string; handle: string }>> {
  const GROK_API_KEY = process.env.GROK_API_KEY || '';
  if (!GROK_API_KEY || handles.length === 0) return [];
  const cleanHandles = handles.map(h => h.replace(/^@/, '').trim()).filter(Boolean);
  if (cleanHandles.length === 0) return [];

  const BATCH_SIZE = 10;
  const effectiveFromDate = fromDate ?? new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const allResults: Array<{ url: string; title: string; snippet: string; publishedDate?: string; handle: string }> = [];

  const batches: string[][] = [];
  for (let i = 0; i < cleanHandles.length; i += BATCH_SIZE) {
    batches.push(cleanHandles.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const totalWanted = Math.min(batch.length * maxPerHandle, 40);
    try {
      const res = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-3',
          input: [{
            role: 'user',
            content: `Search for the ${totalWanted} most recent substantive posts from the provided handles. Skip retweets, polls, and one-word replies. For each post return:
URL: <url>
Handle: <handle>
Date: <YYYY-MM-DD or unknown>
Quote: <post text>`,
          }],
          tools: [{
            type: 'x_search',
            allowed_x_handles: batch,
            from_date: effectiveFromDate,
          }],
          max_output_tokens: 2000,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.warn(`[Grok] API error ${res.status} for batch [${batch.slice(0, 3).join(',')}...]: ${errBody.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();
      const outputBlocks: any[] = data.output ?? [];
      const textBlock = outputBlocks
        .flatMap((b: any) => b.content ?? [])
        .find((c: any) => c.type === 'output_text');
      const content: string = textBlock?.text ?? '';
      if (!content) continue;

      const lines = content.split('\n').filter(l => l.includes('URL:'));
      for (const line of lines.slice(0, totalWanted)) {
        const urlMatch    = line.match(/URL:\s*(https?:\S+)/);
        const handleMatch = line.match(/Handle:\s*@?(\S+)/);
        const dateMatch   = line.match(/Date:\s*(\d{4}-\d{2}-\d{2}|unknown)/i);
        const quoteMatch  = line.match(/Quote:\s*(.+)/);
        if (!urlMatch) continue;
        const publishedDate = dateMatch?.[1] && dateMatch[1].toLowerCase() !== 'unknown'
          ? dateMatch[1] : undefined;
        allResults.push({
          url: urlMatch[1].trim(),
          handle: handleMatch?.[1] ?? '',
          title: (quoteMatch?.[1]?.trim().slice(0, 80) ?? '') || 'X post',
          snippet: quoteMatch?.[1]?.trim() ?? '',
          publishedDate,
        });
      }
    } catch (err: any) {
      console.warn(`[Grok] Batch failed, skipping:`, err?.message);
    }
  }

  return allResults;
}

// Resolves the set of X handles we actively track
export function getTrackedXHandles(): string[] {
  const partnerHandles = DEFAULT_PARTNERS.map(p => p.handle);
  const watchlistHandles: string[] = []; // watchlist would be passed in from main server
  return [...new Set([...partnerHandles, ...watchlistHandles])];
}

// ─── Subreddit thesis mapping ──────────────────────────────────────────────────
export const THESIS_SUBREDDITS: Record<string, string[]> = {
  'AI Infrastructure':     ['LocalLLaMA', 'MachineLearning', 'mlops', 'LLMDevs'],
  'Agentic Orchestration': ['LocalLLaMA', 'ChatGPTCoding', 'LangChain'],
  'Supply Chain':          ['supplychain', 'logistics', 'manufacturing'],
  'Fintech-Crypto':        ['fintech', 'CryptoTechnology', 'ethereum'],
  'Knowledge Graphs':      ['dataengineering', 'semanticweb'],
  'Developer Tools':       ['ExperiencedDevs', 'devops', 'programming'],
  'Healthcare':            ['medicine', 'healthIT', 'nursing', 'medtech'],
  'Legal':                 ['LawFirm', 'paralegal', 'lawschool'],
  'Construction':          ['Construction', 'civilengineering', 'estimators'],
  'Education':             ['Teachers', 'edtech', 'highereducation'],
  'Defense':               ['DefenseTech', 'military', 'aerospace'],
  'Default':               ['SideProject', 'startups', 'Entrepreneur'],
};

export const QUIET_BUILDER_SUBREDDITS = [
  'SideProject', 'indiehackers', 'IMadeThis', 'microsaas', 'SaaS', 'startups',
  'EntrepreneurRideAlong', 'buildinpublic', 'roastmystartup', 'EarnSmart',
];

// ─── Source-URL hosts that are NEVER the company's own homepage ──────────────
export const SOURCE_AGGREGATOR_HOSTS = new Set([
  'news.ycombinator.com', 'producthunt.com', 'www.producthunt.com',
  'reddit.com', 'www.reddit.com', 'old.reddit.com', 'github.com', 'www.github.com',
  'linkedin.com', 'www.linkedin.com', 'x.com', 'twitter.com', 'mobile.twitter.com',
  'betalist.com', 'www.betalist.com', 'indiehackers.com', 'www.indiehackers.com',
  'medium.com', 'substack.com', 'youtube.com', 'youtu.be',
  'sbir.gov', 'grants.gov', 'uspto.gov', 'patents.google.com',
  'ycombinator.com', 'www.ycombinator.com',
]);

export function resolveHomepageFromSignals(signalStrings: string[], explicitHomepage?: string): string | null {
  if (explicitHomepage && /^https?:\/\//.test(explicitHomepage)) {
    try {
      const h = new URL(explicitHomepage).hostname.replace(/^www\./, '');
      if (!SOURCE_AGGREGATOR_HOSTS.has(h)) return explicitHomepage;
    } catch { /* fall through */ }
  }
  for (const s of signalStrings) {
    const matches = s.match(/https?:\/\/[^\s)'"]+/g) || [];
    for (const raw of matches) {
      const url = raw.replace(/[)'".,]+$/, '');
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        if (!SOURCE_AGGREGATOR_HOSTS.has(host)) return url;
      } catch { /* skip malformed */ }
    }
  }
  return null;
}
