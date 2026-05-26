import type { Firm } from './types.js';

export type PartnerTier = 'early-stage' | 'multi-stage';
export type PartnerProgram = 'Arc' | 'Speedrun' | 'YC' | undefined;

export interface PartnerRosterEntry {
  firm: Firm;
  name: string;
  handle: string;
  tier: PartnerTier;
  program?: PartnerProgram;
}

export const DEFAULT_PARTNERS: PartnerRosterEntry[] = [
  // ── Sequoia ──
  // Arc (pre-seed program) — early-stage tier, no stage filter
  { firm: 'Sequoia', name: 'Jess Lee',          handle: 'jesskah',        tier: 'early-stage', program: 'Arc' },
  { firm: 'Sequoia', name: 'Sonya Huang',       handle: 'sonyatweetybird', tier: 'early-stage', program: 'Arc' },
  { firm: 'Sequoia', name: 'Konstantine Buhler', handle: 'kbuhler',        tier: 'early-stage', program: 'Arc' },
  // General Sequoia partners — multi-stage, filtered to pre-seed/seed language
  { firm: 'Sequoia', name: 'Roelof Botha',    handle: 'RoelofBotha',    tier: 'multi-stage' },
  { firm: 'Sequoia', name: 'Alfred Lin',       handle: 'alfredly',       tier: 'multi-stage' },
  { firm: 'Sequoia', name: 'Shaun Maguire',   handle: 'shaun_maguire',  tier: 'multi-stage' },
  { firm: 'Sequoia', name: 'Pat Grady',        handle: 'patgrady',       tier: 'multi-stage' },

  // ── a16z ──
  // Speedrun (consumer/games accelerator) — early-stage tier
  { firm: 'a16z', name: 'Jonathan Lai',  handle: 'AsiaBets',  tier: 'early-stage', program: 'Speedrun' },
  { firm: 'a16z', name: 'Andrew Chen',   handle: 'andrewchen', tier: 'early-stage', program: 'Speedrun' },
  // General a16z partners — multi-stage, filtered
  { firm: 'a16z', name: 'Marc Andreessen',  handle: 'pmarca',         tier: 'multi-stage' },
  { firm: 'a16z', name: 'Ben Horowitz',      handle: 'bhorowitz',      tier: 'multi-stage' },
  { firm: 'a16z', name: 'Chris Dixon',       handle: 'cdixon',         tier: 'multi-stage' },
  { firm: 'a16z', name: 'Sriram Krishnan',  handle: 'sriramk',        tier: 'multi-stage' },
  { firm: 'a16z', name: 'Martin Casado',    handle: 'martin_casado',  tier: 'multi-stage' },

  // ── YC ── (all YC partners are early-stage by definition — main batch is pre-seed)
  { firm: 'YC', name: 'Garry Tan',         handle: 'garrytan',  tier: 'early-stage', program: 'YC' },
  { firm: 'YC', name: 'Dalton Caldwell',  handle: 'daltonc',   tier: 'early-stage', program: 'YC' },
  { firm: 'YC', name: 'Michael Seibel',   handle: 'mwseibel',  tier: 'early-stage', program: 'YC' },
  { firm: 'YC', name: 'Gustaf Alströmer', handle: 'gustaf',    tier: 'early-stage', program: 'YC' },
  { firm: 'YC', name: 'Jared Friedman',   handle: 'snowmaker', tier: 'early-stage', program: 'YC' },
  { firm: 'YC', name: 'Tom Blomfield',    handle: 'tomblomfield', tier: 'early-stage', program: 'YC' },
  { firm: 'YC', name: 'Diana Hu',         handle: 'sandiway',  tier: 'early-stage', program: 'YC' },
];

// Vocabulary signalling that a megafund partner post is about pre-seed/seed-stage activity
// (not Series A+ commentary). Used to filter multi-stage partners' signals.
export const EARLY_STAGE_LANGUAGE = [
  'pre-seed', 'preseed', 'pre seed', 'seed round', 'seed funding', 'seed check',
  'first check', 'first money in', 'angel round', 'angel check',
  'just funded', 'just backed', 'led seed', 'led pre-seed', 'led preseed',
  'invested in', 'backing', 'thrilled to back', 'excited to back',
  'arc cohort', 'sequoia arc', 'speedrun cohort', 'a16z speedrun',
  'yc batch', 'yc w2', 'yc s2', 'demo day', 'launching',
  'early stage', 'early-stage', 'pre-product', 'pre-revenue',
];

export function isEarlyStageSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return EARLY_STAGE_LANGUAGE.some(t => lower.includes(t));
}

// Repos owned by VC firms, enterprises, or large research orgs look like startup
// product repos to the infra checker (docs sites have CNAME, vercel.json, etc.)
// but they are not founding teams seeking investment. Filter them before infra check.
export const ESTABLISHED_ORG_LOGINS = new Set([
  // VC firms
  'paradigmxyz', 'a16z', 'andreessen-horowitz', 'sequoiacap', 'ycombinator',
  'dragonfly-xyz', 'multicoin-capital', 'polychain', 'pantera-capital',
  'coinbase-ventures', 'general-catalyst', 'lightspeedhq', 'khoslaventures',
  'benchmark', 'firstround', 'bessemer', 'greylock', 'accel',
  // Big tech
  'google', 'googleresearch', 'googleapis', 'microsoft', 'apple', 'meta',
  'facebook', 'amazon', 'aws', 'amazon-science', 'netflix', 'uber',
  'airbnb', 'stripe', 'shopify', 'atlassian', 'salesforce', 'oracle',
  // Major crypto projects
  'ethereum', 'bitcoin', 'solana-labs', 'openai', 'anthropics', 'anthropic',
  'coinbase', 'binance',
]);

// For any GitHub Organization (not a personal user account), check size
// A startup founder typically has 1 org with < 10 repos and < 200 followers
export async function isEstablishedOrg(ownerLogin: string, ownerType: string): Promise<boolean> {
  const GITHUB_TOKEN = process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN || '';
  const login = ownerLogin.toLowerCase();

  // Hard blocklist: instant, no API call
  if (ESTABLISHED_ORG_LOGINS.has(login)) return true;

  // For any GitHub Organization (not a personal user account), check size
  if (ownerType === 'Organization') {
    try {
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
      if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
      const res = await fetch(
        `https://api.github.com/orgs/${ownerLogin}`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        if ((data.public_repos || 0) > 20) return true;   // established org by repo count
        if ((data.followers  || 0) > 500)  return true;   // well-known org by followers
      }
    } catch { /* non-critical — err on the side of inclusion */ }
  }

  return false;
}
