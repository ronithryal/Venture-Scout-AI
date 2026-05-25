import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import type {
  RawSignal, SignalRole, ScanState, DealFlowOpportunity, FounderTheme,
  PartnerSummary, Investment, Theme, StoredTheme, Firm, WatchlistEntry, WatchlistType,
  OpportunityScore, OpportunityEnrichment, OutcomeTier, SignalTier,
} from './src/types.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const __dir = path.dirname(fileURLToPath(import.meta.url));
const EXA_API_KEY    = process.env.EXA_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GITHUB_TOKEN   = process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN || '';
const GROK_API_KEY    = process.env.GROK_API_KEY || '';
const HERMES_API_KEY  = process.env.HERMES_API_KEY || '';
const HERMES_BASE_URL = process.env.HERMES_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const HERMES_MODEL    = 'NousResearch/Hermes-3-Llama-3.1-70B-FP8';
const GEMINI_MODEL    = 'gemini-3.5-flash';
const PORT            = 3002;   // 3001 reserved for scout/
const isDev          = process.env.NODE_ENV !== 'production';

const DATA_DIR       = path.join(__dir, 'data');
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
const SEEN_FILE      = path.join(DATA_DIR, 'seen.json');
const OUTCOMES_FILE  = path.join(DATA_DIR, 'outcomes.json');
const THEMES_FILE    = path.join(DATA_DIR, 'themes.json');
const OPPS_FILE      = path.join(DATA_DIR, 'opps.json');
const DECIDED_FILE   = path.join(DATA_DIR, 'decided.json');
const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.json');

const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ─── Gemini JSON synthesis (replaces gpt-4o-mini for all synthesis passes) ────

// Repairs a JSON string that was truncated mid-output (e.g. due to maxOutputTokens).
// Finds the last complete array item at depth 2 (inside outer `{"key":[...]}`)
// and closes the remaining open brackets. Returns '{}' if no complete item is found.
function repairTruncatedJson(raw: string): string {
  try { JSON.parse(raw); return raw; } catch {}
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastCompleteItemEnd = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); continue; }
    if (ch === '}' || ch === ']') {
      stack.pop();
      if (stack.length === 2) lastCompleteItemEnd = i; // closed one complete top-level array item
    }
  }
  if (lastCompleteItemEnd < 0) return '{}';
  // closing is always ']}'  — at depth 2 the stack is always ['{', '[']
  const repaired = raw.slice(0, lastCompleteItemEnd + 1) + ']}';
  try { JSON.parse(repaired); return repaired; } catch { return '{}'; }
}

async function synthesize<T>(system: string, user: string, maxTokens = 2000): Promise<T> {
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: user }] }],
        config: {
          systemInstruction: `Respond only with valid JSON. ${system}`,
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const raw = response.text ?? '{}';
      try {
        return JSON.parse(raw) as T;
      } catch {
        const repaired = repairTruncatedJson(raw);
        console.warn(`[synthesize] JSON repair: ${raw.length} → ${repaired.length} chars`);
        try {
          return JSON.parse(repaired) as T;
        } catch {
          console.warn('[synthesize] repair failed — returning empty object');
          return {} as T;
        }
      }
    } catch (err: any) {
      const is429 = err?.status === 429 || String(err?.message || '').includes('429')
        || String(err?.message || '').toLowerCase().includes('rate limit')
        || String(err?.message || '').toLowerCase().includes('quota');
      if (err instanceof SyntaxError) {
        console.warn(`[synthesize] unrecoverable JSON error: ${err.message} — returning empty object`);
        return {} as T;
      }
      if (is429 && attempt < MAX_RETRIES - 1) {
        // Exponential backoff: 4s, 8s, 16s
        const wait = Math.pow(2, attempt + 2) * 1000;
        console.warn(`[synthesize] 429 rate limit — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error('synthesize: max retries exceeded');
}

// ─── Persistence ───────────────────────────────────────────────────────────────
let watchlist:         WatchlistEntry[]            = [];
let seenUrls:          Set<string>                 = new Set();
// Tracks when each URL was first seen (ms). Used for 3-day rolling dedup window.
let seenUrlTimes:      Map<string, number>          = new Map();
const SEEN_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
let outcomes:          Record<string, OutcomeTier> = {};
let outcomeTimes:      Record<string, string>      = {};
let outcomeNotes:      Record<string, string>      = {};
let storedThemes:      StoredTheme[]               = [];
let savedOpportunities: DealFlowOpportunity[]       = [];
let savedFlagged:       DealFlowOpportunity[]       = [];
let savedLastScanned:   string | null               = null;
let decidedOpps: Map<string, DealFlowOpportunity>  = new Map();
let decisions:         Array<{ company: string; tier?: SignalTier; score?: number; decision: OutcomeTier; note: string; timestamp: string }> = [];
let thesisText  = '';
let scoringText = '';

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadAll() {
  await ensureDataDir();
  try { watchlist   = JSON.parse(await fs.readFile(WATCHLIST_FILE, 'utf-8')); }  catch { watchlist = []; }
  try {
    const d = JSON.parse(await fs.readFile(SEEN_FILE, 'utf-8'));
    const cutoff = Date.now() - SEEN_TTL_MS;
    seenUrls = new Set();
    seenUrlTimes = new Map();
    if (Array.isArray(d.entries)) {
      // New format: { entries: { url, ts }[] } — prune entries older than TTL
      for (const e of d.entries) {
        if (e.ts && e.ts > cutoff) {
          seenUrls.add(e.url);
          seenUrlTimes.set(e.url, e.ts);
        }
      }
    } else if (Array.isArray(d.urls)) {
      // Old flat format: treat all existing URLs as having ts=0 → already expired → don't load
      // This clears the bloated legacy seen set on first boot of new format.
    }
  } catch { seenUrls = new Set(); seenUrlTimes = new Map(); }
  try {
    const raw = JSON.parse(await fs.readFile(OUTCOMES_FILE, 'utf-8'));
    // Support both old flat format {id: outcome} and new {outcomes, outcomeTimes}
    if (raw.outcomes) {
      outcomes      = raw.outcomes;
      outcomeTimes  = raw.outcomeTimes || {};
      outcomeNotes  = raw.outcomeNotes || {};
    } else {
      outcomes      = raw;
      outcomeTimes  = {};
      outcomeNotes  = {};
    }
  } catch { outcomes = {}; outcomeTimes = {}; outcomeNotes = {}; }
  try { storedThemes = JSON.parse(await fs.readFile(THEMES_FILE, 'utf-8')); } catch { storedThemes = []; }
  try {
    const d = JSON.parse(await fs.readFile(OPPS_FILE, 'utf-8'));
    savedOpportunities = d.opportunities || [];
    savedFlagged       = d.flagged       || [];
    savedLastScanned   = d.lastScanned   || null;
  } catch { savedOpportunities = []; savedFlagged = []; savedLastScanned = null; }
  try {
    const raw = JSON.parse(await fs.readFile(DECIDED_FILE, 'utf-8'));
    decidedOpps = new Map(Object.entries(raw));
  } catch { decidedOpps = new Map(); }
  try { decisions = JSON.parse(await fs.readFile(DECISIONS_FILE, 'utf-8')); } catch { decisions = []; }
  try { thesisText  = await fs.readFile(path.join(__dir, 'thesis.yaml'), 'utf-8'); }  catch {}
  try { scoringText = await fs.readFile(path.join(__dir, 'scoring.yaml'), 'utf-8'); } catch {}
}

const saveWatchlist   = () => fs.writeFile(WATCHLIST_FILE, JSON.stringify(watchlist, null, 2));
const saveOutcomes    = () => fs.writeFile(OUTCOMES_FILE, JSON.stringify({ outcomes, outcomeTimes, outcomeNotes }, null, 2));
const saveDecisions   = () => fs.writeFile(DECISIONS_FILE, JSON.stringify(decisions, null, 2));
const saveDecidedOpps = () => fs.writeFile(DECIDED_FILE, JSON.stringify(Object.fromEntries(decidedOpps)));
const saveThemesFile  = () => fs.writeFile(THEMES_FILE, JSON.stringify(storedThemes, null, 2));
const saveOpps        = () => fs.writeFile(OPPS_FILE, JSON.stringify({
  opportunities: state.opportunities,
  flagged:       state.flagged,
  lastScanned:   state.lastScanned,
}, null, 2));

// Strip trailing slashes so URL variants match in dedup sets
const normalizeUrl = (u: string) => u.replace(/\/+$/, '');

// Coerce model-generated tier strings to valid SignalTier values
function normalizeTierServer(raw?: string): SignalTier {
  if (!raw) return 'MEDIUM';
  const u = raw.toUpperCase();
  if (u.includes('CRITICAL')) return 'CRITICAL';
  if (u.includes('HIGH'))     return 'HIGH';
  if (u.includes('LOW'))      return 'LOW';
  return 'MEDIUM';
}

function sortStoredThemes() {
  storedThemes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });
}

const VALID_FIRM_SET = new Set<string>(['Sequoia', 'a16z', 'YC', 'Custom']);
function cleanFirms(firms: string[]): Firm[] {
  return firms.filter(f => VALID_FIRM_SET.has(f)) as Firm[];
}

function mergeIncomingThemes(incoming: Theme[], now: string) {
  for (const theme of incoming) {
    const key = theme.name.toLowerCase().trim();
    const existing = storedThemes.find(t => t.name.toLowerCase().trim() === key);
    if (existing) {
      existing.lastSeenAt  = now;
      existing.scanCount  += 1;
      existing.description = theme.description;
      existing.firms       = [...new Set([...cleanFirms(existing.firms), ...cleanFirms(theme.firms)])];
      existing.momentum    = theme.momentum;
      existing.evidence    = theme.evidence;
    } else {
      storedThemes.push({
        id: crypto.randomUUID(),
        ...theme,
        firms: cleanFirms(theme.firms),
        firstSeenAt: now,
        lastSeenAt:  now,
        scanCount:   1,
        pinned:      false,
      });
    }
  }
  sortStoredThemes();
}
async function saveSeenUrls() {
  const cutoff = Date.now() - SEEN_TTL_MS;
  const entries = [...seenUrlTimes.entries()]
    .filter(([, ts]) => ts > cutoff)
    .map(([url, ts]) => ({ url, ts }))
    .slice(-10000);
  // Rebuild seenUrls from the pruned entries so the in-memory set stays consistent
  seenUrls = new Set(entries.map(e => e.url));
  await fs.writeFile(SEEN_FILE, JSON.stringify({ entries }));
}

await loadAll();

// ─── Partner roster ────────────────────────────────────────────────────────────
// tier = how this partner's signals are weighted in the pipeline:
//   'early-stage'  → tracked at full volume; all signals enter pool
//   'multi-stage'  → tracked but FILTERED to only pre-seed/seed-stage language
//                    (drops Series A+ commentary that would skew theme extraction)
// program = optional sub-fund within the firm focused on pre-seed/seed:
//   Sequoia Arc, a16z Speedrun, YC main batch — these are the LAUNCH-stage entry points
type PartnerTier = 'early-stage' | 'multi-stage';
type PartnerProgram = 'Arc' | 'Speedrun' | 'YC' | undefined;
interface PartnerRosterEntry {
  firm: Firm;
  name: string;
  handle: string;
  tier: PartnerTier;
  program?: PartnerProgram;
}
const DEFAULT_PARTNERS: PartnerRosterEntry[] = [
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
const EARLY_STAGE_LANGUAGE = [
  'pre-seed', 'preseed', 'pre seed', 'seed round', 'seed funding', 'seed check',
  'first check', 'first money in', 'angel round', 'angel check',
  'just funded', 'just backed', 'led seed', 'led pre-seed', 'led preseed',
  'invested in', 'backing', 'thrilled to back', 'excited to back',
  'arc cohort', 'sequoia arc', 'speedrun cohort', 'a16z speedrun',
  'yc batch', 'yc w2', 'yc s2', 'demo day', 'launching',
  'early stage', 'early-stage', 'pre-product', 'pre-revenue',
];
function isEarlyStageSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return EARLY_STAGE_LANGUAGE.some(t => lower.includes(t));
}

// ─── Subreddits per thesis area ────────────────────────────────────────────────
const THESIS_SUBREDDITS: Record<string, string[]> = {
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

// Builder-discourse subreddits — the long tail of quiet-builder venues. These are
// fetched in addition to thesis-mapped subs to surface founders who don't market.
const QUIET_BUILDER_SUBREDDITS = [
  'SideProject', 'indiehackers', 'IMadeThis', 'microsaas', 'SaaS', 'startups',
  'EntrepreneurRideAlong', 'buildinpublic', 'roastmystartup', 'EarnSmart',
];

// ─── X engagement-bait filter ─────────────────────────────────────────────────
// Posts containing these terms are social engagement content, not builder signals.
// Applied to all Grok X results before they enter any pipeline.
const X_ENGAGEMENT_NOISE = [
  'like ', ' likes', 'comment', 'follow ', 'following', 'postia',
  'retweet', 'rt @', 'please follow', 'share this', 'click like',
  'drop a like', 'hit follow', 'turn on notif',
];
function isXEngagementNoise(text: string): boolean {
  const lower = text.toLowerCase();
  return X_ENGAGEMENT_NOISE.some(t => lower.includes(t));
}

// ─── Date window helper ────────────────────────────────────────────────────────
// Compares a signal's publishedDate (ISO string or YYYY-MM-DD) against a cutoff.
// Returns true if within the window OR if the date is unknown (trust the source).
function isWithinWindow(publishedDate: string | undefined, cutoffYMD: string): boolean {
  if (!publishedDate) return true;
  return publishedDate.slice(0, 10) >= cutoffYMD;
}

// ─── Noise filter ──────────────────────────────────────────────────────────────
const NOISE_TERMS = [
  '[hiring]', 'hiring:', 'job -', 'jobs thread', 'salary survey', 'review my resume',
  'resume review', 'roast my resume', 'daily digest', 'weekly digest', 'news roundup',
  'tutorial', 'beginner guide', 'how to learn', 'free course', 'coding bootcamp',
  'awesome list', 'prompt collection', 'statistics of the week', 'bounty:',
  'share your', 'share a ', 'changed my workflow forever', 'mind blowing', 'game changer',
];

// These indicate the deal is already discovered/priced — too late for Launch's edge
// NOTE: 'y combinator' and 'yc' alone are NOT here — they appear in partner/investment signals
// used for theme intelligence. Only batch/portfolio identifiers are flagged.
const CONSENSUS_TERMS = [
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

function isNoise(title: string, snippet: string): boolean {
  const text = (title + ' ' + snippet).toLowerCase();
  return NOISE_TERMS.some(t => text.includes(t));
}

function isConsensus(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSENSUS_TERMS.some(t => lower.includes(t));
}


// ─── State ─────────────────────────────────────────────────────────────────────
let state: ScanState = {
  lastScanned: savedLastScanned, isScanning: false, progress: [],
  liveThemes: [], opportunities: savedOpportunities, flagged: savedFlagged,
  decidedOpps: Array.from(decidedOpps.values()),
  founderThemes: [], partnerActivity: [], investments: [],
  themes: [], storedThemes, signalCount: 0, watchlist, outcomes, outcomeTimes, outcomeNotes,
};

// ─── SSE ───────────────────────────────────────────────────────────────────────
let sseClients: Response[] = [];
function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(c => { try { c.write(payload); return true; } catch { return false; } });
}
function log(msg: string) {
  if (state.progress.length >= 80) state.progress = state.progress.slice(-60);
  state.progress.push(msg);
  broadcast('progress', { message: msg });
  console.log(`[scan] ${msg}`);
}

// ─── Exa ───────────────────────────────────────────────────────────────────────
async function exaSearch(
  query: string,
  opts: { includeDomains?: string[]; numResults?: number; startPublishedDate?: string } = {}
): Promise<any[]> {
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

function pickSnippet(r: any): string {
  const hl = Array.isArray(r.highlights)
    ? (typeof r.highlights[0] === 'string' ? r.highlights[0] : r.highlights[0]?.text ?? '')
    : '';
  return (hl || r.text || '').slice(0, 280).trim();
}

// ─── Exa /contents — fetch page text for known URLs (used for homepage verification) ──
async function exaContents(urls: string[]): Promise<Array<{ url: string; text: string }>> {
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

// ─── Source-URL hosts that are NEVER the company's own homepage ──────────────
// When resolving a company's website from signal URLs, skip these aggregator/
// social hosts — they're discovery surfaces, not the company itself.
const SOURCE_AGGREGATOR_HOSTS = new Set([
  'news.ycombinator.com', 'producthunt.com', 'www.producthunt.com',
  'reddit.com', 'www.reddit.com', 'old.reddit.com', 'github.com', 'www.github.com',
  'linkedin.com', 'www.linkedin.com', 'x.com', 'twitter.com', 'mobile.twitter.com',
  'betalist.com', 'www.betalist.com', 'indiehackers.com', 'www.indiehackers.com',
  'medium.com', 'substack.com', 'youtube.com', 'youtu.be',
  'sbir.gov', 'grants.gov', 'uspto.gov', 'patents.google.com',
  'ycombinator.com', 'www.ycombinator.com',
]);

// Resolves a company's homepage URL from the opportunity's signal URLs.
// Returns the first URL whose hostname is NOT an aggregator — that's most likely the
// company's own site (e.g. founder linked runtime.io in their Show HN post).
function resolveHomepageFromSignals(signalStrings: string[], explicitHomepage?: string): string | null {
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

// Funding-mention vocabulary scanned for on the company's homepage / about pages.
// Hits here are HIGH-CONFIDENCE disqualifying signals — the company is telling you
// itself that it's funded.
const HOMEPAGE_FUNDING_FLAGS = [
  'y combinator', 'ycombinator', 'backed by yc', 'yc w2', 'yc s2', 'yc batch',
  'sequoia', 'andreessen horowitz', 'a16z', 'techstars', 'first round capital',
  'lightspeed', 'accel', 'benchmark', 'greylock', 'kleiner perkins',
  'index ventures', 'bessemer', 'general catalyst', 'founders fund',
  'our investors', 'series a', 'series b', 'series c',
  'raised $', 'closed a $', 'seed round led by', 'pre-seed round',
  'backed by sequoia capital', 'backed by a16z', 'our investors include',
  'raised our seed', 'closed our seed',
  // Specific patterns for investor disclosures often in footers / about
  'investors include', 'with funding from', 'backed by leading investors',
];

// Fetches a company's homepage (and optionally /about, /team, /investors) and scans
// for funding-disclosure language. Returns the flags found.
async function checkHomepageFunding(homepageUrl: string): Promise<{ flags: string[]; fetched: boolean }> {
  if (!homepageUrl || !/^https?:\/\//.test(homepageUrl)) return { flags: [], fetched: false };
  // Build URL variants — root + common funding-disclosure paths
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

// ─── HN Algolia ────────────────────────────────────────────────────────────────
async function hnSearch(query: string, n = 5): Promise<any[]> {
  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${n}`
    );
    if (!res.ok) return [];
    return (await res.json()).hits || [];
  } catch { return []; }
}

// ─── GitHub ────────────────────────────────────────────────────────────────────
async function githubRepoSearch(query: string, n = 6): Promise<any[]> {
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

// ─── GitHub startup infra detection ───────────────────────────────────────────
// Adapted from founder-scout/modules/github_enhanced.py
// A repo that has landing page files + startup billing infra = someone building a product.
const LANDING_PAGE_FILES = ['index.html', 'cname', 'vercel.json', 'netlify.toml', '_redirects'];
const STARTUP_INFRA_DEPS = ['stripe', '@stripe/', 'auth0', '@auth0/', 'clerk', '@clerk/', 'supabase', '@supabase/', 'lemon_squeezy', 'paddle'];
const LANDING_PATTERNS   = ['coming soon', 'join the waitlist', 'sign up for beta', 'early access', 'join the beta', 'request access'];

async function hasStartupInfra(repoFullName: string): Promise<{ score: number; signals: string[] }> {
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
async function redditFetch(subreddit: string, limit = 15): Promise<any[]> {
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
// publishedDate from Exa is original publication date, not re-crawl date.
// We null it out if it's older than 14 days to prevent stale dates propagating
// into synthesis output and the UI (e.g. "957d ago" for a recent signal).
const MAX_DATE_AGE_MS = 14 * 86_400_000;

function sanitizePublishedDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const ms = new Date(raw).getTime();
    if (isNaN(ms)) return undefined;
    if (Date.now() - ms > MAX_DATE_AGE_MS) return undefined;
    return raw;
  } catch { return undefined; }
}

function makeSignal(
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

// ─── Watchlist URL inference ───────────────────────────────────────────────────
function inferWatchlistEntry(raw: string): { type: WatchlistType; value: string; label: string } {
  const s = raw.trim();

  if (/^https?:\/\/(www\.)?(x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/?$/.test(s)) {
    const handle = s.split('/').filter(Boolean).pop() || s;
    return { type: 'twitter', value: handle, label: `@${handle}` };
  }
  if (/^https?:\/\/(www\.)?reddit\.com\/r\/([A-Za-z0-9_]+)\/?$/.test(s)) {
    const sub = s.match(/\/r\/([A-Za-z0-9_]+)/)?.[1] || s;
    return { type: 'subreddit', value: sub, label: `r/${sub}` };
  }
  if (/^https?:\/\//.test(s)) {
    try {
      const domain = new URL(s).hostname.replace(/^www\./, '');
      return { type: 'newsletter', value: s, label: domain };
    } catch {
      return { type: 'url', value: s, label: s };
    }
  }
  if (s.startsWith('@')) {
    const handle = s.slice(1);
    return { type: 'twitter', value: handle, label: s };
  }
  if (s.startsWith('r/')) {
    const sub = s.slice(2);
    return { type: 'subreddit', value: sub, label: `r/${sub}` };
  }
  return { type: 'topic', value: s, label: s };
}

// ─── Credibility verification functions ───────────────────────────────────────

// Step 1: Domain age via RDAP (free public API, no key required)
async function checkDomainAge(url: string): Promise<number | null> {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const res = await fetch(`https://rdap.org/domain/${hostname}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // RDAP events: look for registration date
    const events: any[] = data.events || [];
    const reg = events.find((e: any) => e.eventAction === 'registration');
    if (!reg?.eventDate) return null;
    const regDate = new Date(reg.eventDate);
    return Math.floor((Date.now() - regDate.getTime()) / 86_400_000);
  } catch { return null; }
}

// Step 3: Review platform cross-reference (3 targeted Exa searches)
async function checkReviewPlatforms(companyName: string): Promise<{ hits: string[]; urls: Record<string, string> }> {
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

// Extract an HN item URL from signal strings (e.g. "...https://news.ycombinator.com/item?id=12345...")
function extractHnUrlFromSignals(signals: string[]): { url: string; id: string } | null {
  for (const s of signals) {
    const m = s.match(/https:\/\/news\.ycombinator\.com\/item\?id=(\d+)/);
    if (m) return { url: m[0], id: m[1] };
  }
  return null;
}

// Funding disqualification check — runs live Exa searches so we catch funding that
// postdates the model's training cutoff (e.g. recent YC batches the LLM doesn't know about).
// Returns { funded: true, reason } if disqualifying evidence is found.
async function checkFundingStatus(companyName: string): Promise<{ funded: boolean; reason: string }> {
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
        // Check for exact match or kebab-case name with numeric suffixes (like -2)
        return companySlug === kebabName || new RegExp(`^${kebabName}-\\d+$`).test(companySlug);
      }
    } catch {}
    return false;
  });
  if (ycDirectoryHit) {
    return { funded: true, reason: `found in YC company directory: ${ycDirectoryHit.url}` };
  }

  // Check 2: Funding announcement search — catches VC rounds, Techstars, angels.
  // Proximity guard: require funding language to appear within 200 chars of the company
  // name in the result text, preventing false positives from articles that mention the
  // company alongside a funded competitor (co-occurrence without causality).
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
    // Funding signal must appear in the text
    if (!FUNDING_SIGNALS.some(s => text.includes(s))) return false;
    // An actual fundraising keyword must also appear in the text
    if (!FUNDING_KEYWORDS.some(k => text.includes(k))) return false;
    // And the company name must appear within 200 chars of any funding signal occurrence
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
async function checkTeamVerifiable(companyName: string, founderHint?: string): Promise<boolean> {
  const q = founderHint
    ? `"${founderHint}" "${companyName}" founder`
    : `"${companyName}" founder CEO`;
  const rs = await exaSearch(q, { includeDomains: ['linkedin.com'], numResults: 2 });
  return rs.length > 0;
}

// Credibility scoring: runs passive (from synthesis) + active checks for CRITICAL/HIGH
async function runCredibilityChecks(
  opp: DealFlowOpportunity,
  passiveCredibility: string,
  passiveReason: string,
): Promise<{ credibility: import('./src/types.js').CredibilityTier; credibilityReason: string; credibilityChecks: import('./src/types.js').CredibilityChecks }> {
  // Prefer the resolved homepage URL for domain-age (it's the actual company site,
  // not the HN/PH source URL). Fall back to first signal URL if no homepage resolved.
  const urlFromSignals = (() => {
    if (opp.homepageUrl) return opp.homepageUrl;
    for (const s of (opp.signals || [])) {
      const m = s.match(/https?:\/\/[^\s)'"]+/);
      if (m) return m[0].replace(/[)'".,]+$/, '');
    }
    return null;
  })();

  // Use the actual companyName for all credibility searches. The id slug is a
  // synthesized concatenation (e.g. "runtime-cloud-deployment-platform") and yields
  // false-negative LinkedIn/review-platform searches. Use the real company name.
  const searchName = (opp.companyName || opp.title || opp.id.replace(/[-_]/g, ' ')).trim();

  const domainAgeDays = urlFromSignals ? await checkDomainAge(urlFromSignals) : null;
  const { hits: reviewHits, urls: reviewPlatformUrls } = await checkReviewPlatforms(searchName);
  const teamVerifiable = await checkTeamVerifiable(searchName);

  const checks: import('./src/types.js').CredibilityChecks = {
    domainAgeDays: domainAgeDays ?? undefined,
    namedClaimsFound: passiveCredibility === 'verified' || passiveCredibility === 'plausible',
    reviewPlatformHits: reviewHits,
    reviewPlatformUrls,
    teamVerifiable,
    contactFunctional: passiveReason ? !passiveReason.includes('contact') : true,
  };

  // Start from passive assessment; active checks can downgrade OR upgrade
  let tier: import('./src/types.js').CredibilityTier = passiveCredibility as any || 'unverifiable';
  const reasons: string[] = [];

  // Domain-age heuristic INVERTED for LAUNCH thesis:
  //   Pre-seed founders ship to fresh domains. A 14-day-old domain is the signal,
  //   not a red flag. Only flag DORMANT domains (>3 years + no other evidence) as
  //   credibility issues — those look like rebranded/abandoned shells.
  if (domainAgeDays !== null) {
    if (domainAgeDays < 180) {
      reasons.push(`fresh domain (${domainAgeDays}d) — recent ship, positive`);
      // No tier change — fresh domain is neutral-to-positive for LAUNCH targets
    } else if (domainAgeDays > 1095 && reviewHits.length === 0 && !teamVerifiable) {
      reasons.push(`stale domain (${domainAgeDays}d) + no review/LinkedIn evidence — possible dormant/rebranded`);
      if (tier === 'verified') tier = 'plausible';
      else if (tier === 'plausible') tier = 'contested';
    } else {
      reasons.push(`domain ${domainAgeDays}d old`);
    }
  }
  // Review platforms (G2/Capterra/Trustpilot) are NEUTRAL for pre-seed:
  // by definition LAUNCH targets won't have years of customer reviews yet.
  // Presence is positive; absence is uninformative — not a downgrade signal.
  if (reviewHits.length > 0) {
    reasons.push(`found on: ${reviewHits.join(', ')}`);
    if (tier === 'contested') tier = 'plausible';
  }
  if (!teamVerifiable) {
    reasons.push('no named team on LinkedIn');
    if (tier === 'verified') tier = 'plausible';
  }

  // For unverifiable: only keep that rating if active checks also found nothing.
  // If active found review hits or a team, elevate to contested (some evidence, but passive had none).
  if (passiveCredibility === 'unverifiable') {
    tier = (reviewHits.length > 0 || teamVerifiable) ? 'contested' : 'unverifiable';
  }

  const credibilityReason = reasons.length > 0 ? reasons.join('; ') : (passiveReason || 'signals consistent');
  return { credibility: tier, credibilityReason, credibilityChecks: checks };
}

// ─── Hermes agentic conviction check ──────────────────────────────────────────
// Adapted from root src/lib/modelRouter.ts conductAgenticResearch().
// Runs for CRITICAL/HIGH after scoring: uses Exa tool-calling to verify signal
// claims before issuing a conviction assessment. Capped at 3 Exa searches.
// Falls back to gpt-4o-mini structured synthesis when HERMES_API_KEY is absent.
async function conductHermesResearch(opp: DealFlowOpportunity): Promise<{
  conviction: 'strong' | 'moderate' | 'weak' | 'pass';
  reasoning: string;
  keySignals: string[];
  riskFlags: string[];
} | null> {
  // No key → skip entirely; existing scoring pipeline is sufficient without Hermes
  if (!HERMES_API_KEY) return null;

  const EXA_TOOL = {
    type: 'function',
    function: {
      name: 'exa_search',
      description: 'Search the web to verify a specific claim about an opportunity. Use to confirm product existence, check for undisclosed equity funding, or find recent press. Write the query as a natural-language description of the page you want to find — not as keywords.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural-language description of the page to find' },
        },
        required: ['query'],
      },
    },
  };

  const systemPrompt = `You are Hermes, an elite venture research agent for LAUNCH Accelerator ($125K pre-seed checks). Analyze an early-stage startup opportunity and return a structured conviction assessment.

You have access to exa_search. Use it to verify product existence, check for undisclosed equity funding, or find recent press. Limit to 3 searches max; make each targeted and purposeful.

Think step by step:
1. Parse the signals for authenticity and recency
2. Use exa_search to verify specific claims needing external confirmation
3. Identify conviction indicators (live product, traction evidence, velocity)
4. Surface risk flags (undisclosed funding, no live product, crowded market)
5. Return a conviction JSON

HARD RULES:
- If signals suggest ANY undisclosed equity financing (VC, angel, convertible note), set conviction: "pass" immediately.
- If fewer than 2 independently corroborating signals exist, set conviction: "pass".
- Prefer "pass" over "weak" when signals are thin — a false "moderate" wastes analyst time.
- ACCEPTABLE funding: SBIR grants, university commercialization, revenue from pilots. These do NOT trigger pass.

Return ONLY valid JSON:
{
  "conviction": "strong" | "moderate" | "weak" | "pass",
  "reasoning": "2-3 sentence synthesis of why this conviction level was assigned",
  "keySignals": ["up to 3 strongest corroborating signals"],
  "riskFlags": ["up to 3 risk flags, empty array if none"]
}`;

  const userPrompt = `Opportunity: ${opp.title}
Description: ${opp.description}
Category: ${opp.category}
Score tier: ${opp.score?.tier} (composite ${opp.score?.composite?.toFixed(1)}, traction ${opp.score?.traction}, velocity ${opp.score?.velocity})
Traction evidence: ${opp.score?.tractionEvidence || 'not stated'}
Traction confidence: ${opp.score?.tractionConfidence || 'unknown'}

Signals:
${(opp.signals || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Perform agentic analysis and return the conviction assessment JSON.`;

  if (HERMES_API_KEY) {
    try {
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ];
      const MAX_TOOL_ITERS = 3;
      let iters = 0;

      while (iters < MAX_TOOL_ITERS) {
        const res = await fetch(`${HERMES_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${HERMES_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: HERMES_MODEL, messages,
            tools: [EXA_TOOL], tool_choice: 'auto',
            temperature: 0.2, max_tokens: 1024,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) { console.warn(`[Hermes] API returned ${res.status}`); break; }

        const data = await res.json();
        const choice = data.choices?.[0];
        const msg = choice?.message;
        if (!msg) break;
        messages.push(msg);

        if (choice.finish_reason === 'tool_calls' && msg.tool_calls?.length > 0) {
          for (const tc of msg.tool_calls) {
            if (tc.function.name === 'exa_search') {
              let query = '';
              try { query = JSON.parse(tc.function.arguments).query; } catch { query = tc.function.arguments; }
              console.log(`[Hermes] Exa search: "${query.slice(0, 80)}"`);
              const results = await exaSearch(query, { numResults: 5 });
              const resultText = results.length > 0
                ? results.map((r: any) => `${r.title}\n${r.url}\n${pickSnippet(r)}`).join('\n\n---\n\n').slice(0, 3000)
                : 'No results found.';
              messages.push({ role: 'tool', tool_call_id: tc.id, content: resultText });
            }
          }
          iters++;
        } else {
          // No more tool calls — parse final conviction JSON
          const text = msg.content || '{}';
          return JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, '').trim());
        }
      }

      // Hit max iterations — request final answer without tools
      const finalRes = await fetch(`${HERMES_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HERMES_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: HERMES_MODEL,
          messages: [...messages, { role: 'user', content: 'Now provide your final conviction assessment JSON based on all research gathered.' }],
          temperature: 0.2, max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (finalRes.ok) {
        const text = (await finalRes.json()).choices?.[0]?.message?.content || '{}';
        return JSON.parse(text);
      }
    } catch (err) {
      console.error('[Hermes] Agentic research failed:', err);
    }
  }

  // Fallback: gpt-4o-mini structured synthesis (no tool calling)
  try {
    return await synthesize<{
      conviction: 'strong' | 'moderate' | 'weak' | 'pass';
      reasoning: string;
      keySignals: string[];
      riskFlags: string[];
    }>(systemPrompt, userPrompt, 600);
  } catch { return null; }
}

// Applies a Hermes conviction result to an opportunity's score.
// pass  → downgrade tier to LOW (not enough corroborating signals)
// weak  → downgrade one tier (CRITICAL→HIGH, HIGH→MEDIUM, MEDIUM→LOW)
// moderate/strong → annotate takeaway only, no tier change
function applyHermesConviction(
  opp: DealFlowOpportunity,
  result: { conviction: string; reasoning: string; riskFlags: string[] } | null
): void {
  if (!result || !opp.score) return;
  const note = `[Hermes: ${result.conviction}${result.reasoning ? ' — ' + result.reasoning.slice(0, 120) : ''}]`;
  opp.score.takeaway = ((opp.score.takeaway || '') + ' ' + note).trim();
  if (result.conviction === 'pass') {
    opp.score.tier = 'LOW';
  } else if (result.conviction === 'weak') {
    const downgrade: Record<string, string> = { CRITICAL: 'HIGH', HIGH: 'MEDIUM', MEDIUM: 'LOW' };
    if (downgrade[opp.score.tier]) opp.score.tier = downgrade[opp.score.tier] as any;
  }
}

// ─── GitHub established-org filter ────────────────────────────────────────────
// Repos owned by VC firms, enterprises, or large research orgs look like startup
// product repos to the infra checker (docs sites have CNAME, vercel.json, etc.)
// but they are not founding teams seeking investment. Filter them before infra check.

const ESTABLISHED_ORG_LOGINS = new Set([
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

async function isEstablishedOrg(ownerLogin: string, ownerType: string): Promise<boolean> {
  const login = ownerLogin.toLowerCase();

  // Hard blocklist: instant, no API call
  if (ESTABLISHED_ORG_LOGINS.has(login)) return true;

  // For any GitHub Organization (not a personal user account), check size
  // A startup founder typically has 1 org with < 10 repos and < 200 followers
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

// Catches github.com/<vc-org>/<repo> URLs arriving via Exa/HN/PH (not the GitHub API
// path), where isEstablishedOrg() never runs. A Paradigm-authored repo is VC tooling,
// not a startup — filter at the signal level regardless of how the URL was surfaced.
function isVcToolRepo(url: string): boolean {
  const m = url.match(/(?:https?:\/\/)?github\.com\/([^/]+)\//i);
  if (!m) return false;
  return ESTABLISHED_ORG_LOGINS.has(m[1].toLowerCase());
}

// ─── Press-release domain blocker ─────────────────────────────────────────────
// Unrestricted Exa searches can return press release sites full of funded-company
// announcements. Block them before signals reach the pipeline.
const PRESS_RELEASE_DOMAINS = [
  'prnewswire.com', 'businesswire.com', 'globenewswire.com', 'accesswire.com',
  'einpresswire.com', 'prweb.com', 'prlog.org', 'send2press.com',
  'marketwatch.com', 'businessinsider.com', 'prnews.io',
];

function isPressRelease(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return PRESS_RELEASE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return false; }
}

// ─── Grok X: handle-targeted search ────────────────────────────────────────────
// Only fetches posts FROM specific tracked handles (fund partners, portfolio company
// accounts, portfolio founder accounts). This replaces the previous theme-based Grok
// search, which dumped posts from arbitrary X spam accounts into the deal flow.
// Tracked handles are the curated north-star signal source: what the people we care
// about are actually saying right now.
async function grokXFromHandles(
  handles: string[],
  maxPerHandle = 3,
  fromDate?: string,
): Promise<Array<{ url: string; title: string; snippet: string; publishedDate?: string; handle: string }>> {
  if (!GROK_API_KEY || handles.length === 0) return [];
  const cleanHandles = handles.map(h => h.replace(/^@/, '').trim()).filter(Boolean);
  if (cleanHandles.length === 0) return [];

  // x_search supports allowed_x_handles with a max of 10 per call — batch accordingly
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
            type: 'x_search',            // was "xsearch" — underscore is required
            allowed_x_handles: batch,    // native handle filter, max 10 per call
            from_date: effectiveFromDate, // API-level date filter — more reliable than post-filtering
          }],
          max_output_tokens: 2000,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.warn(`[Grok] API error ${res.status} for batch [${batch.slice(0, 3).join(',')}...]: ${errBody.slice(0, 200)}`);
        continue; // skip batch, don't throw — let other batches succeed
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
      // never let a single batch failure throw — always return partial results
    }
  }

  return allResults;
}

// Resolves the set of X handles we actively track: partner handles + watchlist twitter
// entries. Portfolio company / founder handles can be added to the user watchlist as
// type: 'twitter' to flow into this set.
function getTrackedXHandles(): string[] {
  const partnerHandles = DEFAULT_PARTNERS.map(p => p.handle);
  const watchlistHandles = watchlist
    .filter(e => e.type === 'twitter')
    .map(e => e.value.replace(/^@/, ''));
  return [...new Set([...partnerHandles, ...watchlistHandles])];
}

// ─── Stage 1: Live theme extraction ───────────────────────────────────────────
// Synthesizes themes from megafund signals + user watchlist signals combined.
// Output drives all Stage 2 searches instead of static thesis.yaml.
async function extractLiveThemes(
  partnerSignals: RawSignal[],
  investSignals: RawSignal[],
  watchlistSignals: RawSignal[],
  builderSignals: RawSignal[] = []
): Promise<string[]> {
  if (!EXA_API_KEY || !GEMINI_API_KEY) return [];
  const fmt = (s: RawSignal) =>
    `[${s.firm}|${s.type}] ${s.title.slice(0, 60)} — ${s.snippet.slice(0, 100)}`;
  try {
    const result = await synthesize<{ themes: string[] }>(
      `You are a pre-seed VC intelligence analyst for LAUNCH Accelerator (writes $125K first checks).
Extract 5-7 specific investment themes signaled by these sources RIGHT NOW.

CRITICAL: LAUNCH's edge is pre-CONSENSUS deals. Themes must reflect emerging spaces where:
  • Founders are actively building (validated by builder discourse signals below)
  • North-star early-stage funds (Sequoia Arc, a16z Speedrun, YC main batch) are placing first checks
  • The space is NOT yet Series B+ consensus

Weighting rule:
  • BUILDER DISCOURSE + EARLY-STAGE INVESTMENT signals get HIGHEST weight — these are pre-consensus
  • MEGAFUND PARTNER posts (general GPs) get LOWEST weight — they often reflect consensus stage
  • USER WATCHLIST signals reflect user conviction — moderate-high weight

Return {"themes": ["concise theme phrase", ...]}. Each theme must be specific enough to drive
a search query (e.g. "voice AI agents for healthcare scheduling", not "AI"). EXCLUDE spaces
that are already clearly Series B+ consensus (Cursor, Harvey, Perplexity-style spaces).`,
      `NORTH-STAR EARLY-STAGE INVESTMENT SIGNALS (Sequoia Arc / a16z Speedrun / YC batches — highest weight):\n${investSignals.slice(0, 20).map(fmt).join('\n')}\n\nBUILDER DISCOURSE SIGNALS (Reddit + Indie Hackers + niche communities — highest weight):\n${builderSignals.slice(0, 25).map(fmt).join('\n')}\n\nUSER WATCHLIST SIGNALS (user-curated conviction — moderate-high weight):\n${watchlistSignals.slice(0, 20).map(fmt).join('\n')}\n\nMEGAFUND PARTNER SIGNALS (general GP commentary — lowest weight, may include Series A+ noise):\n${partnerSignals.slice(0, 15).map(fmt).join('\n')}`
    );
    return (result.themes || []).filter((t: any) => typeof t === 'string' && t.length > 5);
  } catch { return []; }
}

// ─── Stage 1: Agentic live theme extraction ───────────────────────────────────
// Pre-runs targeted Exa builder-verification searches (up to 5), then calls
// synthesize<> (Gemini) with all the evidence. Removes the OpenAI dependency while
// preserving the "verify before committing" intent.
// Falls back to the static extractLiveThemes() if this returns empty.
async function extractLiveThemesAgentic(
  partnerSignals: RawSignal[],
  investSignals: RawSignal[],
  watchlistSignals: RawSignal[],
  builderSignals: RawSignal[] = []
): Promise<string[]> {
  if (!GEMINI_API_KEY) return [];

  const fmt = (s: RawSignal) =>
    `[${s.firm}|${s.type}] ${s.title.slice(0, 60)} — ${s.snippet.slice(0, 100)}`;

  // Extract candidate theme hints from the highest-signal sources and run targeted
  // Exa searches to verify builder activity exists (approximates the agentic loop
  // without requiring OpenAI tool-calling).
  const candidateHints = [...investSignals, ...builderSignals]
    .slice(0, 10)
    .map(s => s.title.replace(/^\[.*?\]\s*/, '').trim().slice(0, 50))
    .filter(t => t.length > 10);

  const verificationLines: string[] = [];
  await Promise.allSettled(
    candidateHints.slice(0, 5).map(async hint => {
      const rs = EXA_API_KEY ? await exaSearch(
        `indie hackers founders building "${hint}" OR Show HN "${hint}" startup launch`,
        { numResults: 3 }
      ) : [];
      if (rs.length > 0) {
        verificationLines.push(`Builder evidence for "${hint}": ${rs.map(r => r.title).join(' | ')}`);
      } else {
        verificationLines.push(`No builder evidence found for "${hint}" — theme may be VC-commentary-only`);
      }
    })
  );
  console.log(`[themes-agent] ${verificationLines.length} pre-verification searches completed`);

  try {
    const result = await synthesize<{ themes: string[] }>(
      `You are a pre-seed VC intelligence analyst for LAUNCH Accelerator ($125K first checks).
Extract 5-7 VERIFIED investment themes that are pre-consensus right now.

SIGNAL WEIGHTING:
- HIGHEST: themes corroborated by both builder discourse AND north-star fund investment signals
- HIGH: builder discourse only (Reddit/IH/HN founders shipping)
- MEDIUM: north-star fund signals only (Arc/Speedrun/YC)
- LOW: megafund GP posts only — these often reflect consensus, not emergence

PROCESS: Use the pre-verification evidence below to confirm builder activity before including a theme.
Drop any theme where the verification shows no builder evidence.

Hard rules:
- A theme without independent builder evidence (beyond VC posts) gets dropped
- Return ONLY valid JSON: {"themes": ["specific theme phrase", ...]}
- Each theme must be specific enough to drive a search (e.g. "voice AI for healthcare scheduling" not "AI health")
- EXCLUDE spaces already at Series B+ consensus`,
      `PRE-VERIFICATION RESULTS (Exa builder-evidence searches):\n${verificationLines.join('\n') || '(no verification available)'}

NORTH-STAR EARLY-STAGE INVESTMENT SIGNALS (Sequoia Arc/a16z Speedrun/YC — high weight):\n${investSignals.slice(0, 20).map(fmt).join('\n')}

BUILDER DISCOURSE SIGNALS (Reddit/IH/SideProject — high weight):\n${builderSignals.slice(0, 25).map(fmt).join('\n')}

WATCHLIST SIGNALS (user-curated conviction — moderate weight):\n${watchlistSignals.slice(0, 20).map(fmt).join('\n')}

MEGAFUND GP SIGNALS (general partner posts — low weight, may reflect consensus):\n${partnerSignals.slice(0, 15).map(fmt).join('\n')}

Return the final themes JSON based on all signals and pre-verification evidence above.`
    );
    return (result.themes || []).filter((t: any) => typeof t === 'string' && t.length > 5);
  } catch (err) {
    console.error('[themes-agent] Gemini extraction failed:', err);
    return [];
  }
}

// ─── Feedback digest for self-improvement ──────────────────────────────────────
// Builds a compact summary of past VC decisions with notes to inject into scoring.
// Only returns content when 3+ noted decisions exist — less than that is noise.
function buildFeedbackDigest(): string {
  const noted = Object.entries(outcomeNotes).filter(([, note]) => note.trim().length > 0);
  if (noted.length < 3) return '';
  const lines = noted.slice(-10).map(([id, note]) => {
    const tier = outcomes[id];
    const label = tier === 'interested' ? 'INTERESTED' : tier === 'pass' ? 'PASS' : 'FLAGGED';
    return `- ${label}: "${id}" — "${note.trim()}"`;
  });
  return `\nVC FEEDBACK FROM PAST DECISIONS (calibrate your scoring to these patterns):\n${lines.join('\n')}\nApply: weight factors that drove past "interested" decisions higher; downgrade factors that repeatedly led to "pass".\n`;
}

// Logs a decision to the persistent decisions array with full metadata
function logDecision(
  companyId: string,
  tier: SignalTier | undefined,
  score: number | undefined,
  decision: OutcomeTier,
  note: string,
) {
  const entry = {
    company: companyId,
    tier,
    score,
    decision,
    note: note.trim(),
    timestamp: new Date().toISOString(),
  };
  decisions.push(entry);
}

// ─── Pipeline ──────────────────────────────────────────────────────────────────
async function runScan() {
  if (state.isScanning) return;
  state.isScanning = true;
  state.progress   = [];
  state.error      = undefined;

  const signals: RawSignal[] = [];
  const now    = new Date().toISOString();
  const msDay  = 86_400_000;
  // recent10: fallback window for theme/partner queries and first-ever scan
  // recent30: extended window for slow-moving sources (SBIR, BetaList, new domains)
  const recent10 = new Date(Date.now() - 10 * msDay).toISOString().slice(0, 10);
  const recent30 = new Date(Date.now() - 30 * msDay).toISOString().slice(0, 10);
  // sinceDate: floor for deal-flow Exa queries — uses lastScanned so each scan only
  // fetches content published after the previous run. Clamped to a 14-day minimum so a
  // same-day re-scan (or a manual seen.json clear) still gets a full 14-day content window.
  const recent14 = new Date(Date.now() - 14 * msDay).toISOString().slice(0, 10);
  const sinceDate = (() => {
    if (!state.lastScanned) return recent10;
    const lastDate = state.lastScanned.slice(0, 10);
    // If lastScanned is within the last 14 days, use the 14-day floor instead
    if (lastDate > recent14) return recent14;
    // Otherwise use lastScanned, but never go back more than 30 days
    return lastDate > recent30 ? lastDate : recent30;
  })();

  try {
    // ── A: Megafund partner activity — X (unrestricted) + LinkedIn, parallel ──
    // X/Twitter blocks most crawlers. Domain-restricted searches return old cached
    // content or nothing. Instead: unrestricted name+handle search finds fresh
    // quotes, commentary, and summaries of what partners are saying across tech
    // blogs, newsletters, conference transcripts, and LinkedIn articles.
    // Early-stage partners (Sequoia Arc, a16z Speedrun, YC main batch) → full volume.
    // Multi-stage partners (general GPs) → filtered to pre-seed/seed-language signals only,
    // so their Series A+ commentary doesn't dominate theme extraction.
    log('Scanning megafund partner activity (early-stage prioritized, multi-stage filtered)...');
    const partnerFetches = await Promise.allSettled(
      DEFAULT_PARTNERS.flatMap(p => {
        // Early-stage partners get a query biased toward seed/pre-seed activity
        const q = p.tier === 'early-stage'
          ? `"${p.name}" OR "@${p.handle}" (seed OR "pre-seed" OR backed OR invested OR cohort OR batch OR demo day)`
          : `"${p.name}" OR "@${p.handle}" (seed OR "pre-seed" OR "first check" OR angel)`;
        return [
          exaSearch(q, { startPublishedDate: recent10, numResults: 4 })
            .then(rs => ({ p, rs, source: 'web' })),
          exaSearch(`"${p.name}" site:linkedin.com`, { startPublishedDate: recent10, numResults: 2 })
            .then(rs => ({ p, rs, source: 'linkedin' })),
        ];
      })
    );
    const partnerSignals: RawSignal[] = [];
    let partnerDropped = 0;
    for (const r of partnerFetches) {
      if (r.status !== 'fulfilled') continue;
      const { p, rs } = r.value;
      for (const item of rs) {
        const combined = (item.title || '') + ' ' + pickSnippet(item);
        // Multi-stage partner stage filter: drop signals lacking pre-seed/seed language
        if (p.tier === 'multi-stage' && !isEarlyStageSignal(combined)) {
          partnerDropped++;
          continue;
        }
        const sig = makeSignal(p.firm, 'partner_post', 'partner_post', item.url,
          item.title || `${p.name}`, pickSnippet(item), now, p.name, item.publishedDate);
        if (sig) { signals.push(sig); partnerSignals.push(sig); }
      }
    }
    log(`  → ${partnerSignals.length} partner signals (${partnerDropped} dropped by stage filter)`);

    // ── B: North-star fund EARLY-STAGE investment signals ────────────────────
    // Focused on the actual pre-seed/seed entry points at each fund:
    //   Sequoia Arc, a16z Speedrun, YC main batch directory.
    // Generic "Sequoia Capital 2026" queries previously pulled their Series A+ activity,
    // which then poisoned theme extraction with consensus-stage themes.
    log('Fetching north-star fund early-stage investment signals (Arc / Speedrun / YC batch)...');
    const investQueries: { firm: Firm; q: string; domains?: string[] }[] = [
      // Sequoia Arc — Sequoia's dedicated pre-seed program
      { firm: 'Sequoia', q: 'Sequoia Arc cohort batch founder backed' },
      { firm: 'Sequoia', q: 'site:sequoiacap.com Arc cohort' },
      { firm: 'Sequoia', q: '"Sequoia Arc" OR "Arc cohort" seed startup 2026' },
      // a16z Speedrun — a16z's accelerator (games, consumer, AI)
      { firm: 'a16z', q: 'a16z Speedrun cohort batch portfolio' },
      { firm: 'a16z', q: 'site:a16z.com speedrun OR seed' },
      { firm: 'a16z', q: '"a16z Speedrun" OR "Speedrun cohort" startup 2026' },
      // YC main batch directory — the authoritative pre-seed list
      { firm: 'YC', q: 'site:ycombinator.com/companies' },
      { firm: 'YC', q: 'Y Combinator W26 OR S26 OR W25 OR S25 batch launch' },
      { firm: 'YC', q: 'site:ycombinator.com/launches' },
    ];
    const investSignals: RawSignal[] = [];
    const invResults = await Promise.allSettled(
      investQueries.map(({ firm, q, domains }) =>
        exaSearch(q, {
          startPublishedDate: recent30,
          numResults: 7,
          ...(domains ? { includeDomains: domains } : {}),
        }).then(rs => ({ firm, rs }))
      )
    );
    for (const r of invResults) {
      if (r.status !== 'fulfilled') continue;
      const { firm, rs } = r.value;
      for (const item of rs) {
        const sig = makeSignal(firm, 'investment', 'investment', item.url,
          item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) { signals.push(sig); investSignals.push(sig); }
      }
    }
    log(`  → ${investSignals.length} north-star early-stage investment signals`);

    // ── C: User watchlist — all types ─────────────────────────────────────────
    const watchlistSignals: RawSignal[] = [];

    const twWL   = watchlist.filter(e => e.type === 'twitter');
    const subWL  = watchlist.filter(e => e.type === 'subreddit');
    const nlWL   = watchlist.filter(e => e.type === 'newsletter' || e.type === 'url');
    const otWL   = watchlist.filter(e => ['founder', 'company', 'topic'].includes(e.type));

    if (twWL.length) {
      log(`Scanning ${twWL.length} custom X accounts...`);
      for (const entry of twWL) {
        const handle = entry.value.replace('@', '');
        const rs = await exaSearch(`"${entry.label || handle}" OR "@${handle}"`, {
          includeDomains: ['x.com', 'twitter.com'], startPublishedDate: recent10, numResults: 4,
        });
        for (const item of rs) {
          const sig = makeSignal('Custom', 'watchlist', 'watchlist', item.url,
            item.title || `@${handle}`, pickSnippet(item), now, entry.label || handle, item.publishedDate);
          if (sig) { signals.push(sig); watchlistSignals.push(sig); }
        }
      }
    }

    if (subWL.length) {
      log(`Fetching ${subWL.length} custom subreddits...`);
      for (const entry of subWL) {
        const posts = await redditFetch(entry.value, 20);
        for (const post of posts) {
          if (!post.url || post.score < 5) continue;
          const sig = makeSignal('Custom', 'reddit', 'pain',
            `https://reddit.com${post.permalink}`, post.title || '',
            `r/${entry.value} ▲${post.score} — ${post.title || ''}`,
            now, entry.label, new Date(post.created_utc * 1000).toISOString());
          if (sig) { signals.push(sig); watchlistSignals.push(sig); }
        }
      }
    }

    if (nlWL.length) {
      log(`Fetching ${nlWL.length} newsletters/sites...`);
      for (const entry of nlWL) {
        try {
          const domain = new URL(entry.value).hostname;
          const rs = await exaSearch(`site:${domain}`, {
            includeDomains: [domain], startPublishedDate: recent10, numResults: 5,
          });
          for (const item of rs) {
            const sig = makeSignal('Custom', 'watchlist', 'watchlist', item.url,
              item.title || domain, pickSnippet(item), now, entry.label, item.publishedDate);
            if (sig) { signals.push(sig); watchlistSignals.push(sig); }
          }
        } catch { /* skip malformed URL */ }
      }
    }

    if (otWL.length) {
      log(`Scanning ${otWL.length} custom founders/companies/topics...`);
      for (const entry of otWL) {
        const q = entry.type === 'founder' ? `"${entry.value}" founder startup building shipped`
                : entry.type === 'company' ? `"${entry.value}" product launch traction revenue`
                :                            `${entry.value} startup product traction`;
        const rs = await exaSearch(q, { startPublishedDate: recent10, numResults: 4 });
        for (const item of rs) {
          const sig = makeSignal('Custom', 'watchlist', 'watchlist', item.url,
            item.title || entry.value, pickSnippet(item), now, entry.label || entry.value, item.publishedDate);
          if (sig) { signals.push(sig); watchlistSignals.push(sig); }
        }
      }
    }

    log(`  → Watchlist: ${watchlistSignals.length} signals from ${watchlist.length} entries`);

    // ── STAGE 0.5: Builder discourse pre-pass (un-themed, drives theme weighting) ─
    // Themes must reflect what builders are actually working on, not just what
    // megafund partners post about. Fetch a small batch from quiet-builder subs
    // (no theme gate) so the theme extractor has builder context from the start.
    log('Stage 0.5: builder discourse pre-pass for theme weighting...');
    const preThemeBuilderSignals: RawSignal[] = [];
    try {
      const preBuilderSubs = QUIET_BUILDER_SUBREDDITS.slice(0, 4);
      const preBuilderPosts = (await Promise.all(preBuilderSubs.map(sub => redditFetch(sub, 15)))).flat();
      for (const post of preBuilderPosts) {
        if (!post.url || post.score < 3) continue;
        const sig = makeSignal('Custom', 'reddit', 'launch',
          `https://reddit.com${post.permalink}`, post.title || '',
          `r/${post.subreddit} ▲${post.score} — ${post.title || ''}`,
          now, undefined, new Date(post.created_utc * 1000).toISOString());
        if (sig) preThemeBuilderSignals.push(sig);
      }
    } catch { /* non-critical: theme extraction proceeds without builder context */ }
    log(`  → ${preThemeBuilderSignals.length} builder discourse signals for theme input`);

    // ── STAGE 1: Live theme extraction (agentic) ─────────────────────────────
    // Tries agentic extraction first: model can call exa_search to verify that
    // each candidate theme has actual builder evidence before committing.
    // Falls back to the static synthesize() path if agentic returns empty.
    log('Stage 1: extracting live themes (agentic verification)...');
    let liveThemes = await extractLiveThemesAgentic(
      partnerSignals, investSignals, watchlistSignals, preThemeBuilderSignals
    );
    if (liveThemes.length === 0) {
      log('  → agentic empty or unavailable — falling back to static extraction...');
      liveThemes = await extractLiveThemes(
        partnerSignals, investSignals, watchlistSignals, preThemeBuilderSignals
      );
    }
    state.liveThemes = liveThemes;
    log(`  → ${liveThemes.length} live themes: ${liveThemes.slice(0, 3).join(' | ')}${liveThemes.length > 3 ? '...' : ''}`);

    const searchThemes = liveThemes.length > 0 ? liveThemes : [
      'AI agents for business workflows', 'developer infrastructure AI', 'fintech payments',
    ];

    // ── STAGE 2: Theme-driven founder search ──────────────────────────────────
    // Pattern A: Show HN / Launch HN — highest confidence launch signal
    log('Stage 2A: scanning Show HN / Launch HN for each theme...');
    const hnLaunchHits: any[] = [];
    await Promise.allSettled(searchThemes.map(async theme => {
      const rs = await exaSearch(`A Show HN post for a new startup building ${theme}`, {
        includeDomains: ['news.ycombinator.com'],
        startPublishedDate: sinceDate, numResults: 10,
      });
      for (const item of rs) {
        if (!item.url) continue;
        const isShowHN = (item.title || '').toLowerCase().startsWith('show hn') ||
                         (item.title || '').toLowerCase().startsWith('launch hn');
        const sig = makeSignal('Custom', 'hn', isShowHN ? 'launch' : 'watchlist',
          item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) { signals.push(sig); hnLaunchHits.push(item); }
      }
    }));
    // Broad Show HN scan — not theme-gated, catches launches outside current themes
    const broadHN = await exaSearch('A Show HN post for a new startup', {
      includeDomains: ['news.ycombinator.com'],
      startPublishedDate: sinceDate, numResults: 25,
    });
    for (const item of broadHN) {
      if (!item.url) continue;
      const isShowHN = (item.title || '').toLowerCase().startsWith('show hn') ||
                       (item.title || '').toLowerCase().startsWith('launch hn');
      const sig = makeSignal('Custom', 'hn', isShowHN ? 'launch' : 'watchlist',
        item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
      if (sig) { signals.push(sig); hnLaunchHits.push(item); }
    }
    log(`  → ${hnLaunchHits.length} HN launch signals`);

    // Pattern B: Building in public + tracked X handle activity
    // X/Twitter blocks Exa crawlers. Use Grok API for real-time X access when available.
    // Unrestricted Exa fallback finds founder content on personal blogs, Substack, LinkedIn.
    log('Stage 2B: scanning for building-in-public signals (Grok handle-targeted + unrestricted Exa)...');
    const buildHits: any[] = [];

    // 2B-i: Grok real-time X search — HANDLE-TARGETED ONLY.
    // We only fetch posts FROM tracked handles: fund partners + watchlist twitter entries
    // (which is where portfolio company and founder handles live). This is the curated
    // north-star X stream — never arbitrary theme-based search of random accounts.
    // All such posts go to xDiscourseItems (Founder Themes), never directly into deal flow.
    const xDiscourseItems: Array<{ url: string; title: string; snippet: string; publishedDate?: string }> = [];
    if (GROK_API_KEY) {
      const trackedHandles = getTrackedXHandles();
      if (trackedHandles.length > 0) {
        const grokResults = await grokXFromHandles(trackedHandles, 3, sinceDate);
        for (const item of grokResults) {
          if (!item.url || isPressRelease(item.url)) continue;
          const combined = item.title + ' ' + item.snippet;
          if (isXEngagementNoise(combined)) continue;
          // Date filtering is now done at the API level via from_date in x_search tool config.
          // Removing the isWithinWindow post-filter here — it silently dropped every result
          // whose publishedDate was undefined (which is most Grok results).
          xDiscourseItems.push(item);
          buildHits.push(item);
        }
        log(`  → ${buildHits.length} Grok X signals from ${trackedHandles.length} tracked handles (discourse only)`);
      } else {
        log(`  → Grok X skipped (no tracked handles configured)`);
      }
    }

    // 2B-ii: Unrestricted Exa — finds founder posts on blogs, Substack, personal sites
    // Excludes press release domains. Not domain-restricted to X (which Exa can't index).
    const exaBuildHits: any[] = [];
    await Promise.allSettled(searchThemes.map(async theme => {
      const q = `A post or page by a founder sharing a product they built, launched, or shipped about ${theme}`;
      const rs = await exaSearch(q, { startPublishedDate: sinceDate, numResults: 10 });
      for (const item of rs) {
        if (!item.url || isPressRelease(item.url)) continue;
        const sig = makeSignal('Custom', 'watchlist', 'launch',
          item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) { signals.push(sig); exaBuildHits.push(item); }
      }
    }));
    log(`  → ${exaBuildHits.length} unrestricted Exa build signals`);

    // Pattern D: Deep tech — university spinouts, SBIR, institutional pilots
    // Domain-blocked from press release sites to prevent funded-company contamination.
    log('Stage 2D: scanning for deep tech / university spinout signals...');
    const deepTechHits: any[] = [];
    await Promise.allSettled(searchThemes.map(async theme => {
      const q = `A university spinout, tech transfer announcement, or pilot deployment in ${theme}`;
      const rs = await exaSearch(q, { startPublishedDate: sinceDate, numResults: 7 });
      for (const item of rs) {
        if (!item.url || isPressRelease(item.url)) continue;
        const sig = makeSignal('Custom', 'hn', 'launch',
          item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) { signals.push(sig); deepTechHits.push(item); }
      }
    }));
    log(`  → ${deepTechHits.length} deep tech / spinout signals`);

    // Pattern D2: SBIR/STTR awards + USPTO patent filings — non-self-promoting sources
    // Surface founders who shipped but never post on HN/PH/Reddit. SBIR awards are
    // government-validated deep tech evidence; USPTO assignee searches catch
    // founder-led patent filings in tracked verticals.
    log('Stage 2D2: scanning SBIR/STTR + USPTO patents (non-self-promoting channels)...');
    const govHits: any[] = [];
    await Promise.allSettled(searchThemes.map(async theme => {
      // SBIR/STTR Phase I/II awards — federal pre-seed for deep tech
      const sbirRs = await exaSearch(`An SBIR or STTR grant award announcement for ${theme}`, {
        includeDomains: ['sbir.gov', 'grants.gov'],
        startPublishedDate: recent30, numResults: 5,
      });
      for (const item of sbirRs) {
        if (!item.url || isPressRelease(item.url)) continue;
        const sig = makeSignal('Custom', 'hn', 'launch',
          item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) { signals.push(sig); govHits.push(item); }
      }
      // USPTO patent filings by individual inventors / small entities in this vertical
      const patentRs = await exaSearch(`A USPTO patent application by a small entity for ${theme}`, {
        includeDomains: ['uspto.gov', 'patents.google.com'],
        startPublishedDate: recent30, numResults: 4,
      });
      for (const item of patentRs) {
        if (!item.url) continue;
        const sig = makeSignal('Custom', 'hn', 'launch',
          item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) { signals.push(sig); govHits.push(item); }
      }
    }));
    log(`  → ${govHits.length} SBIR/USPTO non-self-promoting signals`);

    // Pattern E: ProductHunt — recent launches, the clearest public "shipped" signal
    // PH is fully indexed by Exa. A PH launch with 200+ upvotes = strong builder evidence.
    log('Stage 2E: scanning ProductHunt for recent launches...');
    const phHits: any[] = [];
    await Promise.allSettled(searchThemes.map(async theme => {
      const rs = await exaSearch(`A Product Hunt launch for a startup building ${theme}`, {
        includeDomains: ['producthunt.com'],
        startPublishedDate: sinceDate, numResults: 8,
      });
      for (const item of rs) {
        if (!item.url) continue;
        const sig = makeSignal('Custom', 'hn', 'launch',
          item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) { signals.push(sig); phHits.push(item); }
      }
    }));
    // Also fetch recent PH launches broadly (not theme-restricted)
    const broadPH = await exaSearch('A Product Hunt launch for a new software product or AI startup', {
      includeDomains: ['producthunt.com'],
      startPublishedDate: sinceDate, numResults: 30,
    });
    for (const item of broadPH) {
      if (!item.url) continue;
      const sig = makeSignal('Custom', 'hn', 'launch',
        item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
      if (sig) { signals.push(sig); phHits.push(item); }
    }
    log(`  → ${phHits.length} ProductHunt launch signals`);

    // Pattern F: BetaList + recently indexed startup sites (proxy for new domain registrations)
    // Date gates: deal flow ≤ 30 days (recent30), trends ≤ 10 days (filtered in builderFmt).
    // BetaList tracks pre-launch and just-launched startups. The fresh-site search catches
    // company homepages indexed within the window — high signal for very early founders.
    log('Stage 2F: scanning BetaList and recently-registered startup sites...');
    const newDomainHits: any[] = [];

    const blResults = await exaSearch('A BetaList submission for a new startup or product tool', {
      includeDomains: ['betalist.com'],
      startPublishedDate: recent30, numResults: 15,
    });
    for (const item of blResults) {
      if (!item.url) continue;
      const sig = makeSignal('Custom', 'hn', 'launch',
        item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
      if (sig) { signals.push(sig); newDomainHits.push(item); }
    }

    // Fresh founder-built product launches — since last scan
    const freshSiteResults = await exaSearch(
      'A homepage or launch announcement where a founder introduces a new startup or tool they built',
      { startPublishedDate: sinceDate, numResults: 15 }
    );
    for (const item of freshSiteResults) {
      if (!item.url || isPressRelease(item.url)) continue;
      const sig = makeSignal('Custom', 'watchlist', 'launch',
        item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
      if (sig) { signals.push(sig); newDomainHits.push(item); }
    }
    log(`  → ${newDomainHits.length} BetaList + new domain signals (30d deal flow window)`);

    // Pattern G: Indie Hackers — primary venue for founders sharing what they built
    // Not indexed by Exa's domain-restricted search, so use broad queries targeting IH content
    log('Stage 2G: scanning Indie Hackers for founder launches...');
    const ihHits: any[] = [];
    const ihResults = await exaSearch(
      'A post on Indie Hackers about a founder who launched or shipped a new product',
      { startPublishedDate: sinceDate, numResults: 20 }
    );
    const ihDomainResults = await exaSearch('A milestone or launch page for a new product on Indie Hackers', {
      includeDomains: ['indiehackers.com'],
      startPublishedDate: sinceDate, numResults: 20,
    });
    for (const item of [...ihResults, ...ihDomainResults]) {
      if (!item.url || isPressRelease(item.url)) continue;
      const sig = makeSignal('Custom', 'watchlist', 'launch',
        item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
      if (sig) { signals.push(sig); ihHits.push(item); }
    }
    log(`  → ${ihHits.length} Indie Hackers founder launch signals`);

    // Pattern C: GitHub repos with startup infra detection
    log('Stage 2C: scanning GitHub + startup infra detection...');
    const ghProductRepos: any[] = [];
    const themeGhResults = await Promise.allSettled(
      searchThemes.map(theme =>
        githubRepoSearch(`${theme} pushed:>${recent10} stars:>5`, 5).then(rs => ({ theme, rs }))
      )
    );
    // Also run a broad recent-activity search
    const broadGhResults = await githubRepoSearch(
      `topic:ai-agents pushed:>${recent10} stars:>10`, 6
    );

    const allGhRepos = [
      ...themeGhResults.flatMap(r => r.status === 'fulfilled' ? r.value.rs : []),
      ...broadGhResults,
    ];
    const seenRepos = new Set<string>();

    await Promise.allSettled(allGhRepos.map(async repo => {
      if (!repo.html_url || seenRepos.has(repo.html_url)) return;
      seenRepos.add(repo.html_url);

      // Skip repos from established orgs — VC firms, big tech, large research orgs.
      // These can pass infra checks (docs sites have CNAME, vercel.json) but are not startups.
      const ownerLogin = repo.owner?.login || '';
      const ownerType  = repo.owner?.type  || 'User';
      if (await isEstablishedOrg(ownerLogin, ownerType)) return;

      const infra = await hasStartupInfra(repo.full_name);
      const role: SignalRole = infra.score >= 25 ? 'launch' : 'oss_project';
      const snippet = `★${repo.stargazers_count} ${repo.language || ''} — ${repo.description || ''}${infra.signals.length ? ' | ' + infra.signals.join(', ') : ''}`;
      const sig = makeSignal('Custom', 'github', role,
        repo.html_url, repo.full_name || '', snippet, now, undefined, repo.pushed_at);
      if (sig) { signals.push(sig); if (infra.score >= 25) ghProductRepos.push(repo); }
    }));
    log(`  → ${ghProductRepos.length} GitHub product repos (infra score ≥25) of ${allGhRepos.length} scanned`);

    // ── Portfolio activity ────────────────────────────────────────────────────
    log('Scanning portfolio activity...');
    const portQueries: { firm: Firm; q: string }[] = [
      { firm: 'Sequoia', q: 'Sequoia-backed startup product launch growth 2026' },
      { firm: 'a16z',    q: 'a16z portfolio company launch traction 2026' },
      { firm: 'YC',      q: 'YC alumni startup launch growth revenue 2026' },
    ];
    for (const { firm, q } of portQueries) {
      const rs = await exaSearch(q, { startPublishedDate: recent10, numResults: 6 });
      for (const item of rs) {
        const sig = makeSignal(firm, 'portfolio_activity', 'portfolio',
          item.url, item.title || '', pickSnippet(item), now, undefined, item.publishedDate);
        if (sig) signals.push(sig);
      }
    }

    // ── Reddit: thesis-mapped subreddits (pain signals) ───────────────────────
    log('Fetching Reddit pain signals...');
    const activeThemeAreas = liveThemes.map(t => {
      for (const [area] of Object.entries(THESIS_SUBREDDITS)) {
        if (t.toLowerCase().includes(area.toLowerCase().split(' ')[0])) return area;
      }
      return 'Default';
    });
    const subredditsToFetch = [
      ...new Set([
        ...activeThemeAreas.flatMap(a => THESIS_SUBREDDITS[a] || THESIS_SUBREDDITS['Default']),
        'SideProject', 'startups',
      ]),
    ].slice(0, 10);

    const redditResults = await Promise.all(subredditsToFetch.map(sub => redditFetch(sub, 20)));
    const redditPosts = redditResults.flat();

    // Title patterns that indicate a founder sharing what they built (role: launch)
    // vs. someone asking about or complaining about a problem (role: pain)
    const REDDIT_LAUNCH_PATTERNS = [
      'i made', 'i built', 'i launched', 'i shipped', 'i created', 'i developed',
      'we launched', 'we built', 'we shipped', 'just launched', 'just shipped',
      'show reddit', 'show hn', 'my project', 'my app', 'my tool', 'my product',
      'side project', 'finally launched', 'after months', 'after years', 'feedback on',
      'i quit my job', 'dropped out', 'left my job', 'first paying customer',
    ];

    let redditLaunchCount = 0;
    for (const post of redditPosts) {
      if (!post.url || post.score < 5) continue;
      const titleLower = (post.title || '').toLowerCase();
      const isLaunch = REDDIT_LAUNCH_PATTERNS.some(p => titleLower.includes(p));
      const role: SignalRole = isLaunch ? 'launch' : 'pain';
      if (role === 'pain' && post.score < 10) continue; // higher bar for pain signals
      const sig = makeSignal('Custom', 'reddit', role,
        `https://reddit.com${post.permalink}`, post.title || '',
        `r/${post.subreddit} ▲${post.score} — ${post.title || ''}`,
        now, undefined, new Date(post.created_utc * 1000).toISOString());
      if (sig) { signals.push(sig); if (isLaunch) redditLaunchCount++; }
    }
    log(`  → ${redditPosts.length} Reddit posts (${redditLaunchCount} launch, ${redditPosts.length - redditLaunchCount} pain)`);

    // ── Reddit quiet-builder dedicated launch scan ────────────────────────────
    // QUIET_BUILDER_SUBREDDITS = expanded long-tail of founder-sharing venues.
    // These surface quiet builders who never post on HN/PH but do share in subs.
    log('Fetching Reddit quiet-builder launch signals (expanded long-tail)...');
    const spResults = await Promise.all(QUIET_BUILDER_SUBREDDITS.map(sub => redditFetch(sub, 25)));
    let spLaunchCount = 0;
    for (const post of spResults.flat()) {
      if (!post.url || post.score < 3) continue;
      const sig = makeSignal('Custom', 'reddit', 'launch',
        `https://reddit.com${post.permalink}`, post.title || '',
        `r/${post.subreddit} ▲${post.score} — ${post.title || ''}`,
        now, undefined, new Date(post.created_utc * 1000).toISOString());
      if (sig) { signals.push(sig); spLaunchCount++; }
    }
    log(`  → ${spLaunchCount} SideProject/IMadeThis launch signals`);

    // ── Deduplication + noise + consensus filter ──────────────────────────────
    // isConsensus() is deliberately NOT applied to partner_post or investment role signals —
    // those intentionally contain megafund portfolio data used only for theme intelligence.
    // It is applied to all signals competing for the opportunity surface (launch, oss_project,
    // watchlist, pain, portfolio roles).
    const beforeDedup = signals.length;
    const fresh = signals.filter(s => {
      if (seenUrls.has(s.url)) return false;
      if (isNoise(s.title, s.snippet)) return false;
      const isThemeIntelOnly = s.role === 'partner_post' || s.role === 'investment';
      if (!isThemeIntelOnly && isConsensus(s.title + ' ' + s.snippet)) return false;
      if (!isThemeIntelOnly && isVcToolRepo(s.url)) return false;
      return true;
    });
    const nowMs = Date.now();
    fresh.forEach(s => { seenUrls.add(s.url); seenUrlTimes.set(s.url, nowMs); });
    await saveSeenUrls();
    log(`Dedup + noise filter: ${beforeDedup} total → ${fresh.length} clean signals`);

    // Never fall back to unfiltered signals — that exposes funded company data.
    // If fresh is small, synthesis will return fewer opportunities (by design — min 0).
    const synthSignals = fresh;
    const totalSignals = signals.length;

    // ── Format helpers ────────────────────────────────────────────────────────
    const fmt = (s: RawSignal) =>
      `[${s.firm}|${s.type}|${s.role}${s.partner ? '|' + s.partner : ''}] ${s.title.slice(0, 70)} — ${s.snippet.slice(0, 250)} (${s.url})`;

    const good         = synthSignals.filter(s => s.snippet.length > 20);

    // Per-source bucketed cap: each source type gets a dedicated slot allocation so
    // HN posts can't crowd out PH, Reddit, GitHub, and SBIR signals entirely.
    // Total cap is 80 (up from 30), which fits comfortably in Gemini 2.5 Flash context.
    const launchSignals = good.filter(s => s.role === 'launch');
    const bucketBy = (signals: RawSignal[], predicate: (u: string) => boolean, cap: number) =>
      signals.filter(s => predicate(s.url.toLowerCase())).slice(0, cap);
    const hnBucket      = bucketBy(launchSignals, u => u.includes('news.ycombinator.com'), 20);
    const phBucket      = bucketBy(launchSignals, u => u.includes('producthunt.com'), 20);
    const redditBucket  = bucketBy(launchSignals, u => u.includes('reddit.com'), 15);
    const ghBucket      = bucketBy(launchSignals, u => u.includes('github.com'), 10);
    const govBucket     = bucketBy(launchSignals, u => u.includes('sbir.gov') || u.includes('patents.google.com') || u.includes('uspto.gov'), 5);
    const ihBucket      = bucketBy(launchSignals, u => u.includes('indiehackers.com') || u.includes('betalist.com'), 5);
    const otherBucket   = launchSignals.filter(s => {
      const u = s.url.toLowerCase();
      return !u.includes('news.ycombinator.com') && !u.includes('producthunt.com') &&
             !u.includes('reddit.com') && !u.includes('github.com') &&
             !u.includes('sbir.gov') && !u.includes('patents.google.com') &&
             !u.includes('uspto.gov') && !u.includes('indiehackers.com') && !u.includes('betalist.com');
    }).slice(0, 5);
    const launchFmt = [
      ...hnBucket, ...phBucket, ...redditBucket, ...ghBucket,
      ...govBucket, ...ihBucket, ...otherBucket,
    ].map(fmt).join('\n');

    const partnerFmt   = good.filter(s => s.role === 'partner_post').slice(0, 20).map(fmt).join('\n');
    const investFmt    = good.filter(s => s.role === 'investment').slice(0, 15).map(fmt).join('\n');
    const portfolioFmt = good.filter(s => s.role === 'portfolio').slice(0, 15).map(fmt).join('\n');
    const painFmt      = good.filter(s => s.role === 'pain').slice(0, 15).map(fmt).join('\n');
    const allFmt       = good.slice(0, 80).map(fmt).join('\n');
    // Builder discourse for Founder Themes (Synthesis 3):
    //   • Watchlist, pain, Reddit launch signals — no date gate (already fresh via Exa window)
    //   • Pattern F new-domain launches within 10 days — tighter window for trend relevance
    //   • Grok X discourse within 10 days (already gated upstream in Stage 2B-i)
    const xDiscurseFmt = xDiscourseItems.length > 0
      ? `\nX DISCOURSE (founder context — not deal flow candidates):\n${xDiscourseItems.map(i =>
          `[Custom|x_discourse|watchlist] ${i.title.slice(0, 70)} — ${i.snippet.slice(0, 120)} (${i.url})`
        ).join('\n')}`
      : '';
    const builderFmt   = [
      good.filter(s =>
        s.role === 'watchlist' ||
        s.role === 'pain' ||
        (s.role === 'launch' && s.type === 'reddit') ||
        // Pattern F new-domain signals within 10 days feed Founder Themes as trend context
        (s.role === 'launch' && (s.type === 'hn' || s.type === 'watchlist') &&
          !s.url.includes('x.com') && !s.url.includes('twitter.com') &&
          isWithinWindow(s.publishedDate, recent10))
      ).slice(0, 40).map(fmt).join('\n'),
      xDiscurseFmt,
    ].filter(Boolean).join('\n');

    const thesisCtx  = thesisText.slice(0, 2000);
    const scoringCtx = scoringText.slice(0, 2500);
    const themesCtx  = liveThemes.length > 0 ? `LIVE THEMES THIS SCAN:\n${liveThemes.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : '';

    const goldilocksCtx = `
LAUNCH ACCELERATOR — WHAT THEY ACTUALLY FUND

LAUNCH writes $125,000 checks. They are pre-seed. The real entry bar is much lower than
institutional investors. Their actual portfolio includes: AI lesson planning for teachers
(Monsha), wind tunnel data for motorsport (SKN Systems), AI RFP automation for construction
(Actuality), counter-drone acoustic software (Prandtl Dynamics), clinical documentation for
behavioral health (NextVisit), hourly workforce hiring (HeyHire), outbound SMS sales
automation (PitchPrfct), AI software delivery for US defense (Argonath).

REAL ENTRY CRITERIA (any ONE of these qualifies):
- Product is live and at least one external person is actually using it
- Founder has shipped a working demo or product and can show it working
- For B2G/institutional: any named organization has seen or tested the product
- For deep tech: working prototype + founder has deep domain expertise

TRACTION IS ADDITIVE, NOT A GATE:
Any paying customer, any recurring user, any named pilot partner = strong positive signal.
$2k+ MRR = excellent. $500 MRR = very good. One paying customer = acceptable. Zero revenue
but 50 active free users = acceptable. The trajectory matters more than the number.

SECTOR PATTERN — "Vertical AI for any niche operational problem":
LAUNCH funds software applied to any specific vertical where a smart operator-founder can
build a capital-efficient solution. Verticals include (not exhaustive):
- Construction (RFP automation, project management, estimating)
- Defense tech software (AI for defense workflows, drone tech, intelligence tools)
- Education (teacher tools, EdTech, tutoring, curriculum)
- Healthcare (clinical documentation, behavioral health, prior auth, scheduling)
- Hourly/frontline workforce (hiring, scheduling, training, retention)
- Legal, finance, compliance automation
- Motorsport, agriculture, niche industry analytics
- E-commerce, consumer products, media tools
- Transit, logistics, supply chain software
- Developer tools, AI infrastructure, data platforms
The vertical being served can be hard — the product must be software.

FUNDING EXCLUSION (hard):
DISQUALIFYING: VC investment, angel investment, equity-taking accelerators (YC, Techstars),
convertible notes from investors, any disclosed funding round at any size.

ACCEPTABLE (does NOT disqualify):
- University commercialization programs (CREATE-X, GT hub, MIT TLO, Stanford OTL)
- Government grants: SBIR, STTR, NSF, NIH, DOE, DARPA, ARPA-E, DOD
- Revenue from pilots — earned revenue, not equity
- No funding at all = positive signal (company not yet discovered)

NEVER fund: decks only, plans without product, ideas without a working demo.`;

    const tractionGuide = `
TRACTION INFERENCE GUIDE:

FOR SAAS / CONSUMER / DEVELOPER TOOLS (when explicit MRR/DAU not stated):
- HN comment pull: "how do I pay?", "we use this at [company]" — strong pull signal
- GitHub star velocity: 100+ stars in 10 days on a niche tool ≈ thousands of active users
- Pricing page with real tiers (not "contact us") = someone is paying
- Customer logos or testimonials with verifiable names on landing page
- Job postings for CS/Sales roles = company has paying customers to support
- Product Hunt listing with "I've been using this" comments = live traction
- Integration marketplace listings (Slack App Directory, Stripe marketplace) = cleared review bar
- Press with specific customer counts or revenue figures
- No pricing page is NOT automatically negative — common for early pre-revenue SaaS

FOR DEEP TECH / B2G / INFRASTRUCTURE (institutional customers, no self-serve):
- Named institutional pilot partner + quantified outcome metric = STRONGEST signal
  ("66% ridership growth/month with MARTA" is harder evidence than any pricing page)
- Multiple named pilots across diverse institution types = technology generalizes
- SBIR Phase II = government validated both technical merit AND commercial potential
- Named LOI or MOU from government or enterprise entity
- University tech transfer agreement = IP validated and commercialization underway
- Government/municipal procurement announcement or press release
- Absence of pricing page = normal for B2G (institutions use RFPs, not self-serve checkout)
- Quantified performance improvement vs. incumbent = deployment is real and measurable

FOUNDER SIGNAL — CREDENTIAL EXIT (positive signal, not pedigree):
A founder who stopped accumulating institutional credentials to build is making a high-conviction
bet. Flag this when signals show:
- "PhD (Discontinued)" or "PhD candidate" who is now founding
- Researcher leaving a lab to commercialize their own work ("spinout", "tech transfer")
- "Left [university]" or "dropped out" language paired with a founding announcement
This is EARNED DOMAIN INSIGHT — the founder was solving the problem before the company existed.

Always flag: STATED traction (founder said the number) vs. INFERRED (proxy evidence).`;

    // ── Synthesis 1: Opportunities + passive credibility ─────────────────────
    // investFmt intentionally excluded — megafund portfolio data is theme intel only.
    // Synthesis 1 task: EXTRACT each distinct company appearing in the launch signals.
    // Downstream stages (validateSignals, sanity screen, funding check, credibility) handle
    // quality filtering — synthesis should not gatekeep. Permissive extraction, strict downstream.
    log('AI: extracting distinct companies from launch signals...');
    const synthesizeOpps = async (systemPrompt: string) =>
      synthesize<{ opportunities: Array<DealFlowOpportunity & { passiveCredibility?: string; passiveCredibilityReason?: string; companyName?: string; productName?: string; homepageUrl?: string }> }>(
        systemPrompt,
        `${themesCtx}\n\nLAUNCH SIGNALS (extract distinct companies from these — include their source URLs):\n${launchFmt || '(no launch signals found this scan)'}\n\nMARKET PAIN SIGNALS (context only — do NOT generate opportunities from these):\n${painFmt}`,
        8000
      );

    const synthesisPrompt = `You are a LAUNCH Accelerator sourcing analyst. Your job is to EXTRACT each distinct company that appears in the launch signals below. Return JSON {"opportunities": [...]} with 1-10 entries — one per distinct company you find evidence of.

${goldilocksCtx}

${tractionGuide}

${thesisCtx}

EXTRACTION RULES — be PERMISSIVE here, downstream stages will filter:
- One opportunity per distinct company referenced in the LAUNCH SIGNALS
- If a signal hints at a company (even briefly), extract it — downstream verification will check
- Do NOT skip a company because evidence is thin; downstream checks will assess that
- Do NOT invent companies that aren't in the signals
- Each opportunity must include at least 1 signal URL copied verbatim from the input

HARD EXCLUSION — only discard at this stage if signals make it OBVIOUS:
- Signals explicitly state Series A/B/C/D or $15M+ rounds
- Signals explicitly state acquisition by / subsidiary of named established company
- VC-firm own R&D tooling (Paradigm/a16z/Sequoia GitHub repos)
- Publicly traded companies (NASDAQ:/NYSE: prefix)

ACCEPTABLE prior funding (does NOT disqualify):
- University commercialization programs (CREATE-X, GT, MIT TLO, Stanford OTL)
- Government grants: SBIR Phase I/II, STTR, NSF, NIH, DOE, DARPA, ARPA-E, DOD
- Revenue from pilots — earned revenue, not investor money

SIGNAL FORMAT REQUIREMENT — mandatory:
Each entry in the signals array MUST contain the exact source URL from the input data.
Copy URLs verbatim from the (parentheses) at the end of each input line. Do NOT modify URLs.
Format each signal as: "[title or description] (https://exact-url-from-input)"

Each opportunity MUST include these fields:
- id: kebab-case slug derived from companyName (e.g. "runtime", "actuality-rfp")
- companyName: the ACTUAL company name as it appears in signals (e.g. "Runtime", NOT "Runtime Cloud Deployment Platform"). Used by downstream LinkedIn/YC-directory checks — must be the real searchable name.
- productName: distinct product/tool name if different from companyName (optional)
- homepageUrl: the company's own website URL if visible in signals (NOT the HN/PH/Reddit source URL). Optional — leave null if unknown; downstream will resolve.
- title: opportunity headline (concise, descriptive)
- description: 2 sentences — what exists today from the signals
- category: thesis area
- firms: array (typically ["Custom"])
- momentum: "accelerating" | "emerging" | "established"
- signals: 1-4 strings, each containing a real URL from the input
- actionPrompt: 1 sentence on founder behavior to seek — velocity and traction, no credentials
- passiveCredibility: "verified" | "plausible" | "contested" | "unverifiable"
  verified = named customers/pilots with verifiable identities
  plausible = claims anonymous but consistent with company maturity
  contested = large claims outpace evidence
  unverifiable = no independent evidence found
- passiveCredibilityReason: one sentence`;

    let oppResult = await synthesizeOpps(synthesisPrompt);

    // Two-pass fallback: if first synthesis returned thin output despite plentiful signals,
    // re-run with a more permissive prompt explicitly asking the model to be exhaustive.
    const launchSignalCount = good.filter(s => s.role === 'launch').length;
    if ((oppResult.opportunities?.length || 0) < 3 && launchSignalCount >= 8) {
      log(`  → first-pass output thin (${oppResult.opportunities?.length || 0} opps, ${launchSignalCount} signals); running permissive second pass...`);
      const fallbackPrompt = synthesisPrompt + `

IMPORTANT — SECOND PASS: The first extraction was too conservative. You missed companies.
Re-examine ALL signals and extract EVERY distinct company referenced, however briefly.
Downstream verification (homepage check, YC directory, funding news, credibility checks) will
filter quality — your job here is RECALL, not precision. Target 5-10 opportunities.`;
      const secondPass = await synthesizeOpps(fallbackPrompt);
      // Merge: prefer second-pass if it produced more candidates
      if ((secondPass.opportunities?.length || 0) > (oppResult.opportunities?.length || 0)) {
        oppResult = secondPass;
        log(`  → second pass produced ${secondPass.opportunities?.length || 0} opportunities`);
      }
    }
    // Build a normalized set of all real URLs from the scan for post-validation.
    // Normalization: strip trailing slash so "reddit.com/r/x/" and "reddit.com/r/x" match.
    // normalizeUrl is also used by targeted-scan; defined at module scope below.
    const scanUrls     = new Set(good.map(s => normalizeUrl(s.url)));

    // Validate that each signal string contains a real URL from the scan.
    // Strips minor trailing-slash differences before checking — Gemini sometimes drops
    // the trailing slash the Reddit API returns, causing false misses.
    // Any URL whose normalized form is not in scanUrls was hallucinated.
    function validateSignals(signals: string[]): string[] {
      return (signals || []).filter(sig => {
        const urlMatch = sig.match(/https?:\/\/[^\s)'"]+/);
        if (!urlMatch) return false;
        const url = normalizeUrl(urlMatch[0].replace(/[)'".,]+$/, ''));
        return scanUrls.has(url);
      });
    }

    state.opportunities = (oppResult.opportunities || [])
      .map((o: any) => {
        const validatedSignals = validateSignals(o.signals);
        return {
          ...o,
          id: o.id || crypto.randomUUID(),
          signals: validatedSignals,
          // Preserve new identity fields; ensure companyName falls back to title if model omitted
          companyName: (o.companyName || o.title || '').trim() || undefined,
          productName: o.productName || undefined,
          homepageUrl: o.homepageUrl || undefined,
        };
      })
      .filter((o: any) => (o.signals || []).length >= 1)
      // Never resurface companies already decided on — outcomes are permanent
      .filter((o: any) => !outcomes[o.id]) as DealFlowOpportunity[];

    log(`  → ${state.opportunities.length} extracted opportunities (signals validated against scan URLs)`);

    // ── Quick sanity screen: "are these cos serious?" ─────────────────────────
    // Evidence-based verification: resolve homepage, fetch its content, query YC
    // directory + funding news. Pass actual evidence (not just company name) to LLM.
    // Replaces the previous parametric-only sanity screen and standalone funding check.
    log('Evidence-based verification (homepage fetch + YC directory + funding news)...');
    const verificationResults = await Promise.all(state.opportunities.map(async (opp) => {
      const companyName = opp.companyName || opp.title;
      // 1. Resolve homepage URL (skips aggregator hosts like HN/PH/Reddit)
      const homepageUrl = opp.homepageUrl || resolveHomepageFromSignals(opp.signals || []);
      if (homepageUrl) opp.homepageUrl = homepageUrl;
      // 2. Run all three checks in parallel
      const [homepageResult, fundingResult] = await Promise.all([
        homepageUrl ? checkHomepageFunding(homepageUrl) : Promise.resolve({ flags: [], fetched: false }),
        checkFundingStatus(companyName),
      ]);
      // 3. Disqualifying conditions (any of):
      //    a) Homepage explicitly discloses VC funding
      //    b) Company appears in YC directory
      //    c) Funding news has 2+ corroborating hits
      const funded = homepageResult.flags.length > 0 || fundingResult.funded;
      const reasonParts: string[] = [];
      if (homepageResult.flags.length > 0) {
        reasonParts.push(`homepage discloses: ${homepageResult.flags.slice(0, 3).join(', ')}`);
      }
      if (fundingResult.funded) reasonParts.push(fundingResult.reason);
      const reason = reasonParts.join('; ');
      const verification = {
        homepageFetched: homepageResult.fetched,
        homepageFundingFlags: homepageResult.flags,
        ycDirectoryHit: fundingResult.reason.includes('YC company directory')
          ? fundingResult.reason.replace(/^.*?: /, '') : undefined,
        fundingNewsCount: fundingResult.funded ? 1 : 0,
      };
      return { keep: !funded, reason, verification };
    }));
    const beforeVerify = state.opportunities.length;
    // Apply: drop disqualified, attach verification evidence to survivors
    state.opportunities = state.opportunities.filter((opp, i) => {
      const v = verificationResults[i];
      if (!v.keep) {
        log(`  ✗ Verification dropped "${opp.title}" — ${v.reason}`);
        return false;
      }
      // Stash verification for later attachment after scoring populates opp.score
      (opp as any)._verification = v.verification;
      return true;
    });
    log(`  → ${state.opportunities.length} passed verification (${beforeVerify - state.opportunities.length} dropped as funded/disqualified)`);

    // Store passive credibility assessments for later active-layer use
    const passiveCredMap = new Map(
      (oppResult.opportunities || []).map((o: any) => [
        o.id || '',
        { credibility: o.passiveCredibility || 'unverifiable', reason: o.passiveCredibilityReason || '' },
      ])
    );

    // ── Synthesis 2: Scoring pass ─────────────────────────────────────────────
    log('AI: scoring against LAUNCH rubric...');
    const feedbackDigest = buildFeedbackDigest();
    const scoreResult = await synthesize<{ scored: Array<{ id: string } & OpportunityScore> }>(
      `You are a LAUNCH Accelerator analyst scoring deal flow.

${goldilocksCtx}

${tractionGuide}

SCORING RUBRIC:
${scoringCtx}
${feedbackDigest}
DEEP TECH SCORING GUIDANCE:
- Deep tech CRITICAL: Named institutional pilots with quantified outcomes across 2+ diverse contexts
- Deep tech HIGH: Active deployment with at least one named institutional pilot + quantified metric, or SBIR Phase II
- Deep tech MEDIUM (Wildcard): Working prototype + SBIR Phase I, or research spinout with working code and named institution
- Credential-exit founder (PhD discontinued, researcher-turned-founder) = boost traction score by 0.5 for deep tech

Return JSON {"scored": [{
  id,
  tier ("CRITICAL"|"HIGH"|"MEDIUM"|"LOW"),
  composite (traction×0.35 + velocity×0.30 + market×0.20 + mechanics×0.15, round to 1dp),
  traction (1-5),
  velocity (1-5),
  market (1-5),
  mechanics (1-5),
  takeaway (1-2 punchy sentences with traction evidence),
  thesisArea (specific thesis area or null),
  tractionEvidence (exact stated metric or inferred proxy — e.g. "stated: 66% ridership growth at MARTA" or "inferred: pricing page + 3 logos + HN 200pts"),
  tractionConfidence ("stated"|"inferred"|"unknown")
}]}.

AUTO-ASSIGN LOW tier immediately if any signal mentions: ${CONSENSUS_TERMS.slice(0, 8).join(', ')}, or any VC/institutional equity funding.
AUTO-ASSIGN LOW if no product in market is evidenced — decks, plans, prototypes without deployment are always LOW.`,
      `${themesCtx}\n\nOPPORTUNITIES TO SCORE:\n${JSON.stringify(state.opportunities.map(o => ({ id: o.id, title: o.title, description: o.description, category: o.category, signals: o.signals })))}`,
      4000
    );

    const scoreMap = new Map((scoreResult.scored || []).map((s: any) => [s.id, s]));
    state.opportunities = state.opportunities
      .map(o => {
        const s = scoreMap.get(o.id) as any;
        const verification = (o as any)._verification;
        delete (o as any)._verification;
        if (!s) return verification ? { ...o, score: { ...(o.score || {}), verification } as any } : o;
        return {
          ...o,
          score: {
            tier: s.tier, composite: s.composite,
            traction: s.traction, velocity: s.velocity, market: s.market, mechanics: s.mechanics,
            takeaway: s.takeaway, thesisArea: s.thesisArea,
            tractionEvidence: s.tractionEvidence, tractionConfidence: s.tractionConfidence || 'unknown',
            ...(verification ? { verification } : {}),
          },
        };
      })
      .sort((a, b) => {
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const diff = (order[a.score?.tier || 'MEDIUM'] ?? 2) - (order[b.score?.tier || 'MEDIUM'] ?? 2);
        return diff !== 0 ? diff : (b.score?.composite || 0) - (a.score?.composite || 0);
      });

    // ── Enrichment + active credibility layer ────────────────────────────────
    // CRITICAL/HIGH: full enrichment + active credibility checks
    // MEDIUM: enrichment only (GitHub + HN) — no active credibility (cost/time not justified
    // at that tier), but enrichment data can surface traction signals the snippet missed
    const highOps   = state.opportunities.filter(o => o.score?.tier === 'CRITICAL' || o.score?.tier === 'HIGH');
    const mediumOps = state.opportunities.filter(o => o.score?.tier === 'MEDIUM');

    if (highOps.length) {
      log(`Enriching + credibility-checking ${highOps.length} CRITICAL/HIGH opportunities...`);
      await Promise.allSettled(highOps.map(async opp => {
        const hnInSignals = extractHnUrlFromSignals(opp.signals || []);
        const [ghItems, hnItems] = await Promise.all([
          githubRepoSearch(`${opp.title} in:name,description`, 3),
          hnInSignals
            ? fetch(`https://hn.algolia.com/api/v1/items/${hnInSignals.id}`).then(r => r.ok ? r.json().then((d: any) => [d]) : Promise.resolve([])).catch(() => [])
            : hnSearch(opp.title, 3),
        ]);
        const enrichment: OpportunityEnrichment = {};
        if (ghItems.length) {
          const r = ghItems[0];
          const infra = await hasStartupInfra(r.full_name);
          enrichment.github = {
            stars: r.stargazers_count, url: r.html_url,
            language: r.language, pushedAt: r.pushed_at,
            infraSignals: infra.signals,
          };
        }
        if (hnItems.length) {
          const top = hnInSignals
            ? hnItems[0]
            : hnItems.reduce((a: any, b: any) => (a.points || 0) >= (b.points || 0) ? a : b);
          if ((top.points || 0) > 0) {
            enrichment.hn = {
              points: top.points || 0,
              comments: hnInSignals ? (top.children?.length || 0) : (top.num_comments || 0),
              url: hnInSignals ? hnInSignals.url : `https://news.ycombinator.com/item?id=${top.objectID}`,
              title: top.title,
            };
          }
        }
        if (Object.keys(enrichment).length) opp.enrichment = enrichment;

        // Active credibility + Hermes conviction — run in parallel (both verify different aspects)
        const passive = passiveCredMap.get(opp.id) || { credibility: 'unverifiable', reason: '' };
        const [credResult, hermesResult] = await Promise.all([
          runCredibilityChecks(opp, passive.credibility, passive.reason),
          conductHermesResearch(opp),
        ]);
        if (opp.score) {
          opp.score.credibility = credResult.credibility;
          opp.score.credibilityReason = credResult.credibilityReason;
          opp.score.credibilityChecks = credResult.credibilityChecks;
        }
        applyHermesConviction(opp, hermesResult);
      }));
    }

    // MEDIUM enrichment — GitHub + HN only, no active credibility checks
    if (mediumOps.length) {
      log(`Enriching ${mediumOps.length} MEDIUM opportunities (GitHub + HN)...`);
      await Promise.allSettled(mediumOps.map(async opp => {
        const hnInSignals = extractHnUrlFromSignals(opp.signals || []);
        const [ghItems, hnItems] = await Promise.all([
          githubRepoSearch(`${opp.title} in:name,description`, 2),
          hnInSignals
            ? fetch(`https://hn.algolia.com/api/v1/items/${hnInSignals.id}`).then(r => r.ok ? r.json().then((d: any) => [d]) : Promise.resolve([])).catch(() => [])
            : hnSearch(opp.title, 2),
        ]);
        const enrichment: OpportunityEnrichment = {};
        if (ghItems.length) {
          const r = ghItems[0];
          if (!await isEstablishedOrg(r.owner?.login || '', r.owner?.type || 'User')) {
            enrichment.github = { stars: r.stargazers_count, url: r.html_url, language: r.language, pushedAt: r.pushed_at };
          }
        }
        if (hnItems.length) {
          const top = hnInSignals
            ? hnItems[0]
            : hnItems.reduce((a: any, b: any) => (a.points || 0) >= (b.points || 0) ? a : b);
          if ((top.points || 0) > 0) {
            enrichment.hn = {
              points: top.points || 0,
              comments: hnInSignals ? (top.children?.length || 0) : (top.num_comments || 0),
              url: hnInSignals ? hnInSignals.url : `https://news.ycombinator.com/item?id=${top.objectID}`,
              title: top.title,
            };
          }
        }
        if (Object.keys(enrichment).length) opp.enrichment = enrichment;
      }));
    }

    // Post-enrichment tier upgrade gate — fixes the chicken-and-egg problem where
    // thin initial snippets score a company MEDIUM, but enrichment reveals CRITICAL
    // traction signals (HN 100+ pts, strong GitHub + infra). Upgrade tier, annotate
    // takeaway, then run active credibility on upgraded ops exactly as CRITICAL/HIGH.
    const upgradedFromMedium: DealFlowOpportunity[] = [];
    for (const opp of mediumOps) {
      if (!opp.score) continue;
      const hn = opp.enrichment?.hn;
      const gh = opp.enrichment?.github;

      // HN 100+ = community pull = CRITICAL traction per scoring rubric
      if (hn && hn.points >= 100) {
        opp.score.tier = 'CRITICAL';
        opp.score.takeaway = (opp.score.takeaway || '') +
          ` [Upgraded from MEDIUM: HN ${hn.points} pts — community pull signal meets CRITICAL threshold]`;
        upgradedFromMedium.push(opp);
      // GitHub 200★ + ≥2 startup-infra signals = deployed product with user base
      } else if (gh && gh.stars >= 200 && (gh.infraSignals?.length || 0) >= 2) {
        opp.score.tier = 'HIGH';
        opp.score.takeaway = (opp.score.takeaway || '') +
          ` [Upgraded from MEDIUM: ${gh.stars}★ GitHub + ${gh.infraSignals?.length} infra signals]`;
        upgradedFromMedium.push(opp);
      }
    }

    if (upgradedFromMedium.length) {
      const nCrit = upgradedFromMedium.filter(o => o.score?.tier === 'CRITICAL').length;
      const nHigh = upgradedFromMedium.filter(o => o.score?.tier === 'HIGH').length;
      log(`Post-enrichment upgrades: ${nCrit} → CRITICAL, ${nHigh} → HIGH. Running active credibility + Hermes...`);
      await Promise.allSettled(upgradedFromMedium.map(async opp => {
        const passive = passiveCredMap.get(opp.id) || { credibility: 'unverifiable', reason: '' };
        const [credResult, hermesResult] = await Promise.all([
          runCredibilityChecks(opp, passive.credibility, passive.reason),
          conductHermesResearch(opp),
        ]);
        if (opp.score) {
          opp.score.credibility = credResult.credibility;
          opp.score.credibilityReason = credResult.credibilityReason;
          opp.score.credibilityChecks = credResult.credibilityChecks;
        }
        applyHermesConviction(opp, hermesResult);
      }));
      // Re-sort opportunities now that tiers have changed
      state.opportunities.sort((a, b) => {
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const diff = (order[a.score?.tier || 'MEDIUM'] ?? 2) - (order[b.score?.tier || 'MEDIUM'] ?? 2);
        return diff !== 0 ? diff : (b.score?.composite || 0) - (a.score?.composite || 0);
      });
    }

    // Apply passive credibility to MEDIUM/LOW (no active checks at these tiers)
    state.opportunities
      .filter(o => o.score?.tier === 'MEDIUM' || o.score?.tier === 'LOW')
      .forEach(opp => {
        const passive = passiveCredMap.get(opp.id);
        if (passive && opp.score) {
          opp.score.credibility = passive.credibility as any;
          opp.score.credibilityReason = passive.reason;
        }
      });

    // ── Route unverifiable opportunities to flagged[] ─────────────────────────
    // Flagged = holding queue (not trash). VC can review and click Verify.
    const allOpps = [...state.opportunities];
    state.opportunities = allOpps.filter(o => o.score?.credibility !== 'unverifiable');
    const newFlagged = allOpps.filter(o => o.score?.credibility === 'unverifiable');

    // Merge with existing flagged, preserving 30-day auto-expiry
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const existingFlagged = (state.flagged || []).filter(o => (o as any).flaggedAt > thirtyDaysAgo);
    state.flagged = [
      ...newFlagged.map(o => ({ ...o, flaggedAt: now } as any)),
      ...existingFlagged.filter(e => !newFlagged.some(n => n.id === e.id)),
    ];
    log(`  → ${state.opportunities.length} opportunities · ${state.flagged.length} flagged (unverifiable)`);

    // ── Synthesis 3: Founder Themes from builder discourse (X, Reddit, LinkedIn) ────
    log('AI: extracting founder themes from builder discourse...');
    const founderThemeResult = await synthesize<{ themes: FounderTheme[] }>(
      `You are a venture intelligence analyst tracking what BUILDERS and THOUGHT LEADERS are discussing — not VCs, not investors.

A builder is: an independent founder, indie developer, technical researcher, or thought leader actively building or shipping — NOT a VC partner commenting on deals.

Identify 4-6 recurring THEMES from the signals below. Each theme is a narrative, frustration, insight, or mental model that builders are actively discussing. Return JSON {"themes": [...]}.

ONLY use what is explicitly in the signal data. Do NOT invent handles, names, or platforms.

EXCLUDE:
- VC investor opinions or fund announcements
- Company product launches (those belong in Deal Flow)
- Anything sourced only from megafund partner posts

Each theme: id (uuid slug), theme (concise 3-8 word title), summary (2 sentences: what builders are saying + why it matters now), platforms (array of "X", "Reddit", "LinkedIn" — only include platforms actually in the signals), notableVoices (up to 3 handles/names of non-VC builders explicitly mentioned, else []), keyInsights (2-3 specific observations grounded in the signal data), signalStrength ("strong" if theme appears across multiple signals or platforms, "moderate" if single source).`,
      `${themesCtx}\n\nBUILDER DISCOURSE SIGNALS (X, Reddit, LinkedIn — what builders are discussing):\n${builderFmt || painFmt || '(no builder discourse signals this scan)'}`
    );
    state.founderThemes = ((founderThemeResult.themes || []) as any[])
      .map((t: any) => ({ ...t, id: t.id || crypto.randomUUID() })) as FounderTheme[];
    log(`  → ${state.founderThemes.length} founder themes extracted`);

    // ── Synthesis 4: Partner activity ─────────────────────────────────────────
    log('AI: summarizing partner activity...');
    const partnerResult = await synthesize<{ partnerActivity: PartnerSummary[] }>(
      'You are a venture intelligence analyst. Return JSON {"partnerActivity": [...]}. For each VC partner with data, return: partner (full name), firm ("Sequoia"|"a16z"|"YC"), handle (no @), topics (3-5 strings), recentPosts (up to 2: url — use exact URL from signals, title, snippet, date). Use exact URLs from the signal data.',
      `PARTNER SIGNALS:\n${partnerFmt}`
    );
    state.partnerActivity = (partnerResult.partnerActivity || []) as PartnerSummary[];

    // ── Synthesis 5: Investments ───────────────────────────────────────────────
    log('AI: extracting portfolio companies...');
    const invResult = await synthesize<{ investments: Investment[] }>(
      'Return JSON {"investments": [...]} with portfolio companies explicitly named in signals. Max 12. Each: firm, company (exact name), description (1 sentence), url (exact from signals), date (or null), sector. Only include companies clearly mentioned by name.',
      `INVESTMENT SIGNALS:\n${investFmt}\n\nPORTFOLIO SIGNALS:\n${portfolioFmt}`
    );
    state.investments = (invResult.investments || []) as Investment[];

    // ── Synthesis 6: Themes ────────────────────────────────────────────────────
    log('AI: identifying investment themes...');
    const themeResult = await synthesize<{ themes: Theme[] }>(
      `You are a LAUNCH Accelerator analyst. Return JSON {"themes": [...]} with 4-5 investment themes emerging from the signals. Each theme: name, description (2 sentences — what exists today and why the timing is now), firms (array of which VC firms' signals drove this theme — ONLY use values from this exact set: ["Sequoia","a16z","YC","Custom"]), momentum ("rising"|"stable"), evidence (3 specific signal strings from the data).

IMPORTANT: firms must contain ONLY values from ["Sequoia","a16z","YC","Custom"]. Do NOT put company names, startup names, or any other values there.

${goldilocksCtx}`,
      `${themesCtx}\n\nALL SIGNALS:\n${allFmt}`
    );
    const VALID_FIRMS = new Set<string>(['Sequoia', 'a16z', 'YC', 'Custom']);
    state.themes = (themeResult.themes || []).map((t: any) => ({
      ...t,
      firms: (t.firms || []).filter((f: string) => VALID_FIRMS.has(f)),
    })) as Theme[];

    mergeIncomingThemes(state.themes, now);
    await saveThemesFile();

    state.signalCount  = totalSignals;
    state.lastScanned  = now;
    state.watchlist    = watchlist;
    state.outcomes     = outcomes;
    state.outcomeTimes = outcomeTimes;
    state.outcomeNotes = outcomeNotes;
    state.storedThemes = storedThemes;

    const critCount = state.opportunities.filter(o => o.score?.tier === 'CRITICAL').length;
    const highCount = state.opportunities.filter(o => o.score?.tier === 'HIGH').length;
    log(`Done — ${critCount} CRITICAL · ${highCount} HIGH · ${state.opportunities.length} opps · ${state.founderThemes.length} founder themes · ${state.investments.length} companies · ${state.themes.length} themes`);
    await saveOpps();
    broadcast('complete', { lastScanned: state.lastScanned });

  } catch (err: any) {
    console.error('[scan] error', err);
    state.error = err?.message || 'Scan failed';
    log(`Error: ${state.error}`);
    broadcast('scan_error', { message: state.error });
  } finally {
    state.isScanning = false;
  }
}

// ─── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/api/state', (_req, res: Response) =>
  res.json({ ...state, watchlist, outcomes, outcomeTimes, outcomeNotes, storedThemes, decidedOpps: Array.from(decidedOpps.values()) })
);

app.post('/api/scan', (_req, res: Response) => {
  if (state.isScanning) { res.json({ status: 'already_scanning' }); return; }
  res.json({ status: 'started' });
  runScan();
});

// ─── Targeted rescan: fetch + score a specific list of companies ───────────────
// Takes { targets: [{name, url?}] }, runs each through Exa → extract → score →
// enrich → credibility, then merges into state.opportunities.
app.post('/api/targeted-scan', async (req: Request, res: Response) => {
  if (state.isScanning) { res.status(409).json({ error: 'scan already running' }); return; }
  const targets: { name: string; url?: string }[] = req.body?.targets || [];
  if (!targets.length) { res.status(400).json({ error: 'targets[] required' }); return; }
  res.json({ status: 'started', count: targets.length });

  (async () => {
    state.isScanning = true;
    broadcast('scan_start', {});
    try {
      log(`[Targeted] Recovering ${targets.length} companies: ${targets.map(t => t.name).join(', ')}`);

      // ── Step 1: Exa searches — one targeted query per company ─────────────────
      // Build per-company signal blocks so the model knows which signals belong to which co.
      const companyBlocks: Array<{ name: string; signals: string }> = [];

      await Promise.all(targets.map(async ({ name, url }) => {
        const queries = [
          `"${name}"`,
          url ? `site:${(() => { try { return new URL(url).hostname; } catch { return ''; } })()}` : `"${name}" site:news.ycombinator.com OR site:github.com OR site:producthunt.com`,
        ].filter(Boolean);

        const rows: string[] = [];
        if (url) rows.push(`Homepage: ${url}`);

        const results = await Promise.all(
          queries.map(q => exaSearch(q, { numResults: 5 }).catch(() => []))
        );
        for (const r of results.flat()) {
          if (r.url) rows.push(`${r.title || name} (${r.url})\n${pickSnippet(r)}`);
        }

        log(`  → ${name}: ${rows.length} signals`);
        companyBlocks.push({ name, signals: rows.join('\n\n') });
      }));

      const anySignals = companyBlocks.some(b => b.signals.trim().length > 0);
      if (!anySignals) {
        log('[Targeted] No signals found — check EXA_API_KEY');
        state.isScanning = false;
        broadcast('complete', { lastScanned: state.lastScanned });
        return;
      }

      const signalPayload = companyBlocks
        .map(b => `=== ${b.name} ===\n${b.signals || '(no signals found)'}`)
        .join('\n\n');

      // ── Step 2: Extraction — one card per named company ───────────────────────
      log('[Targeted] AI: extracting opportunities...');
      const extraction = await synthesize<{ opportunities: any[] }>(
        `You are a LAUNCH Accelerator sourcing analyst. Below are signals fetched for specific named companies. Create exactly one opportunity card per company name listed — even if signals are thin.

LAUNCH writes $125K pre-seed checks. Entry bar: product is live and someone is using it.

For each company, return:
- id: slug from company name (lowercase, hyphens)
- title: company name or product name
- description: 2-3 sentences on what they build and evidence of traction
- category: sector
- firms: ["Custom"]
- momentum: "emerging"|"accelerating"|"established"
- signals: array — include the source URL(s) from the signals below, verbatim
- actionPrompt: one concrete next step for a VC
- companyName, productName, homepageUrl (if known)

Return JSON {"opportunities": [...]}. One entry per company. Do NOT skip any named company.`,
        `COMPANIES AND THEIR SIGNALS:\n\n${signalPayload}`,
        8000
      );

      // ── Step 3: Keep all extracted opps (no strict URL validation — we control inputs)
      // Only drop: already decided, or no signals at all
      let opps: DealFlowOpportunity[] = (extraction.opportunities || [])
        .map((o: any) => ({
          ...o,
          id: (o.id || o.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || crypto.randomUUID(),
          firms: ['Custom'] as Firm[],
          signals: (o.signals || []).filter((s: any) => typeof s === 'string' && s.length > 0),
          companyName: (o.companyName || o.title || '').trim() || undefined,
        }))
        .filter((o: any) => !outcomes[o.id]) as DealFlowOpportunity[];

      log(`[Targeted] ${opps.length} extracted`);
      if (!opps.length) {
        state.isScanning = false;
        broadcast('complete', { lastScanned: state.lastScanned });
        return;
      }

      // ── Step 4: Scoring ───────────────────────────────────────────────────────
      log('[Targeted] AI: scoring...');
      const feedbackDigest = buildFeedbackDigest();
      const scoreResult = await synthesize<{ scored: Array<{ id: string } & OpportunityScore> }>(
        `You are a LAUNCH Accelerator analyst scoring deal flow.

${scoringText.slice(0, 2500)}
${feedbackDigest}
Return JSON {"scored": [{id, tier ("CRITICAL"|"HIGH"|"MEDIUM"|"LOW"), composite (0-5 float), traction (1-5), velocity (1-5), market (1-5), mechanics (1-5), takeaway, thesisArea, tractionEvidence, tractionConfidence ("stated"|"inferred"|"unknown")}]}.`,
        `OPPORTUNITIES TO SCORE:\n${JSON.stringify(opps.map(o => ({ id: o.id, title: o.title, description: o.description, category: o.category, signals: o.signals })))}`,
        3000
      );

      const scoreMap = new Map((scoreResult.scored || []).map((s: any) => [s.id, s]));
      opps = opps.map(o => {
        const s = scoreMap.get(o.id) as any;
        if (!s) return o;
        return {
          ...o,
          score: {
            tier: normalizeTierServer(s.tier),
            composite: s.composite, traction: s.traction, velocity: s.velocity,
            market: s.market, mechanics: s.mechanics, takeaway: s.takeaway,
            thesisArea: s.thesisArea, tractionEvidence: s.tractionEvidence,
            tractionConfidence: s.tractionConfidence || 'unknown',
          } as OpportunityScore,
        };
      });

      // ── Step 5: GitHub + HN enrichment ────────────────────────────────────────
      log('[Targeted] Enriching...');
      await Promise.all(opps.map(async opp => {
        const hnInSignals = extractHnUrlFromSignals(opp.signals || []);
        const [ghItems, hnItems] = await Promise.all([
          githubRepoSearch(`${opp.companyName || opp.title} in:name,description`, 3).catch(() => []),
          hnInSignals
            ? fetch(`https://hn.algolia.com/api/v1/items/${hnInSignals.id}`).then(r => r.ok ? r.json().then((d: any) => [d]) : Promise.resolve([])).catch(() => [])
            : hnSearch(opp.title, 3).catch(() => []),
        ]);
        const enrichment: OpportunityEnrichment = {};
        if (ghItems.length) {
          const r = ghItems[0];
          if (!await isEstablishedOrg(r.owner?.login || '', r.owner?.type || 'User')) {
            const infra = await hasStartupInfra(r.full_name);
            enrichment.github = { stars: r.stargazers_count, url: r.html_url, language: r.language, pushedAt: r.pushed_at, infraSignals: infra.signals };
          }
        }
        if (hnItems.length) {
          const top = hnInSignals
            ? hnItems[0]
            : hnItems.reduce((a: any, b: any) => (a.points || 0) >= (b.points || 0) ? a : b);
          if ((top.points || 0) > 0)
            enrichment.hn = { points: top.points, comments: hnInSignals ? (top.children?.length || 0) : (top.num_comments || 0), url: hnInSignals ? hnInSignals.url : `https://news.ycombinator.com/item?id=${top.objectID}`, title: top.title };
        }
        if (Object.keys(enrichment).length) opp.enrichment = enrichment;
      }));

      // ── Step 6: Credibility ───────────────────────────────────────────────────
      log('[Targeted] Running credibility checks...');
      await Promise.all(opps.map(async opp => {
        if (!opp.score) return;
        const passive = (opp.score.tier === 'CRITICAL' || opp.score.tier === 'HIGH') ? 'unverifiable' : 'plausible';
        const cred = await runCredibilityChecks(opp, passive, '').catch(() => null);
        if (cred && opp.score) {
          opp.score.credibility = cred.credibility;
          opp.score.credibilityReason = cred.credibilityReason;
          opp.score.credibilityChecks = cred.credibilityChecks;
        }
      }));

      // ── Step 7: Merge into deal flow, sorted by tier ──────────────────────────
      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const existing = state.opportunities.filter(o => !opps.find(n => n.id === o.id));
      const merged = [...opps, ...existing];
      merged.sort((a, b) => {
        const diff = (order[a.score?.tier ?? 'MEDIUM'] ?? 2) - (order[b.score?.tier ?? 'MEDIUM'] ?? 2);
        return diff !== 0 ? diff : (b.score?.composite || 0) - (a.score?.composite || 0);
      });
      state.opportunities = merged;
      await saveOpps();

      log(`[Targeted] Done — ${opps.length} companies added to Deal Flow`);
      broadcast('complete', { lastScanned: state.lastScanned });
    } catch (err: any) {
      log(`[Targeted] Error: ${err?.message}`);
      broadcast('scan_error', { message: err?.message });
    } finally {
      state.isScanning = false;
    }
  })();
});

// ─── Evaluate-on-demand: given a company name (+ optional URL), run verification ──
// Closes the "quiet builder" gap from Point 7: founder referrals and intros can be fed
// into the same verification pipeline. Returns funding status, homepage flags, YC
// directory hit, and credibility tier — without requiring the company to self-promote.
app.post('/api/evaluate', async (req: Request, res: Response) => {
  const name: string = (req.body?.name || '').trim();
  const explicitUrl: string | undefined = req.body?.url || undefined;
  if (!name) { res.status(400).json({ error: 'missing required field: name' }); return; }
  try {
    const homepageUrl = explicitUrl ||
      resolveHomepageFromSignals([], explicitUrl) ||
      (await exaSearch(`"${name}" official site`, { numResults: 3 }))
        .map((r: any) => r.url)
        .find((u: string) => {
          try { return !SOURCE_AGGREGATOR_HOSTS.has(new URL(u).hostname.replace(/^www\./, '')); }
          catch { return false; }
        }) || null;
    const [homepageResult, fundingResult] = await Promise.all([
      homepageUrl ? checkHomepageFunding(homepageUrl) : Promise.resolve({ flags: [], fetched: false }),
      checkFundingStatus(name),
    ]);
    const stubOpp: DealFlowOpportunity = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60),
      title: name, description: '', category: '', firms: ['Custom'] as Firm[],
      momentum: 'emerging', signals: homepageUrl ? [`(${homepageUrl})`] : [],
      actionPrompt: '', companyName: name, homepageUrl: homepageUrl || undefined,
    };
    const credibility = await runCredibilityChecks(stubOpp, 'unverifiable', '');
    res.json({
      name,
      homepageUrl,
      funded: homepageResult.flags.length > 0 || fundingResult.funded,
      verification: {
        homepageFetched: homepageResult.fetched,
        homepageFundingFlags: homepageResult.flags,
        fundingNewsHit: fundingResult.funded,
        fundingNewsReason: fundingResult.reason || undefined,
      },
      credibility: credibility.credibility,
      credibilityReason: credibility.credibilityReason,
      credibilityChecks: credibility.credibilityChecks,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'evaluation failed' });
  }
});

app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

// Watchlist — supports raw URL paste (infers type) or explicit type/value
app.get('/api/watchlist', (_req, res: Response) => res.json(watchlist));
app.post('/api/watchlist', async (req: Request, res: Response) => {
  let type: WatchlistType, value: string, label: string;
  if (req.body.raw) {
    const inferred = inferWatchlistEntry(req.body.raw);
    type = inferred.type; value = inferred.value; label = inferred.label;
  } else {
    type = req.body.type; value = req.body.value; label = req.body.label || req.body.value;
  }
  if (!type || !value) { res.status(400).json({ error: 'type and value required, or raw URL/handle' }); return; }
  const entry: WatchlistEntry = {
    id: crypto.randomUUID(), type, value: value.trim(),
    label: (label || value).trim(), addedAt: new Date().toISOString(),
  };
  watchlist.push(entry);
  await saveWatchlist();
  res.json(entry);
});
app.delete('/api/watchlist/:id', async (req: Request, res: Response) => {
  watchlist = watchlist.filter(e => e.id !== req.params.id);
  await saveWatchlist();
  res.json({ ok: true });
});

// Flagged — promote or archive
app.get('/api/flagged', (_req, res: Response) => res.json(state.flagged || []));
app.delete('/api/flagged/:id', async (_req: Request, res: Response) => {
  state.flagged = (state.flagged || []).filter(o => o.id !== _req.params.id);
  await saveOpps();
  res.json({ ok: true });
});
app.post('/api/flagged/:id/promote', async (req: Request, res: Response) => {
  const opp = (state.flagged || []).find(o => o.id === req.params.id);
  if (!opp) { res.status(404).json({ error: 'not found' }); return; }
  state.flagged = state.flagged.filter(o => o.id !== req.params.id);
  state.opportunities.unshift(opp);
  await saveOpps();
  res.json({ ok: true });
});

// Verify button — runs deep credibility checks for a specific opportunity
app.post('/api/verify/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const opp = [...state.opportunities, ...(state.flagged || [])].find(o => o.id === id);
  if (!opp) { res.status(404).json({ error: 'opportunity not found' }); return; }
  res.json({ status: 'started', id });

  try {
    // Wayback Machine CDX API: find earliest cache of domain
    // Signals are formatted "[title] (https://url)" — extract via regex
    const verifyUrl = (() => {
      for (const s of (opp.signals || [])) {
        const m = s.match(/https?:\/\/[^\s)'"]+/);
        if (m) return m[0].replace(/[)'".,]+$/, '');
      }
      return null;
    })();
    let waybackOldest: string | null = null;
    if (verifyUrl) {
      try {
        const hostname = new URL(verifyUrl).hostname;
        const waybackRes = await fetch(
          `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(hostname)}&output=json&limit=1&fl=timestamp&from=20100101&to=20261231&fastLatest=true`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (waybackRes.ok) {
          const data = await waybackRes.json();
          if (Array.isArray(data) && data.length > 1) waybackOldest = data[1][0];
        }
      } catch { /* non-critical */ }
    }

    // Deep review content: re-run review search with content extraction
    await checkReviewPlatforms(opp.title); // deep re-run before runCredibilityChecks below

    // Broader web archaeology: 5 Exa searches
    const webMentions: string[] = [];
    const archQ = [`"${opp.title}" review`, `"${opp.title}" customer`, `"${opp.title}" users`, `"${opp.title}" funding`, `"${opp.title}" founder`];
    await Promise.allSettled(archQ.map(async q => {
      const rs = await exaSearch(q, { numResults: 3 });
      rs.forEach(r => { if (r.url) webMentions.push(r.url); });
    }));

    // Re-run credibility with expanded evidence
    const passive = opp.score ? { credibility: (opp.score.credibility || 'unverifiable') as string, reason: opp.score.credibilityReason || '' } : { credibility: 'unverifiable', reason: '' };
    const credResult = await runCredibilityChecks(opp, passive.credibility, passive.reason);

    // Apply updated credibility back to opp
    if (opp.score) {
      opp.score.credibility = credResult.credibility;
      opp.score.credibilityReason = [credResult.credibilityReason, waybackOldest ? `wayback oldest: ${waybackOldest}` : '', webMentions.length ? `${webMentions.length} web mentions found` : 'no web mentions'].filter(Boolean).join('; ');
      opp.score.credibilityChecks = credResult.credibilityChecks;
    }

    // If now verified/plausible and was in flagged, auto-promote
    if ((credResult.credibility === 'verified' || credResult.credibility === 'plausible') && state.flagged.some(o => o.id === id)) {
      state.flagged = state.flagged.filter(o => o.id !== id);
      state.opportunities.unshift(opp);
      await saveOpps();
    }

    broadcast('verify_complete', { id, credibility: credResult.credibility, credibilityReason: opp.score?.credibilityReason });
  } catch (err: any) {
    broadcast('verify_error', { id, message: err?.message || 'Verify failed' });
  }
});

// Outcomes — "interested" triggers a background re-enrich + re-score pass
app.post('/api/outcomes', async (req: Request, res: Response) => {
  const { id, outcome, note } = req.body;
  if (!id || !['interested', 'pass', 'flagged'].includes(outcome)) {
    res.status(400).json({ error: 'id and outcome (interested|pass|flagged) required' }); return;
  }
  outcomes[id]     = outcome;
  outcomeTimes[id] = new Date().toISOString();
  if (typeof note === 'string' && note.trim()) outcomeNotes[id] = note.trim();
  state.outcomes     = outcomes;
  state.outcomeTimes = outcomeTimes;
  state.outcomeNotes = outcomeNotes;

  // Archive the opportunity object so shortlist/passlist can render it across scans
  const opp = [...state.opportunities, ...(state.flagged || []), ...Array.from(decidedOpps.values())]
    .find(o => o.id === id);
  if (opp) {
    decidedOpps.set(id, opp);
    state.decidedOpps = Array.from(decidedOpps.values());
    await saveDecidedOpps();
  }

  // Log decision with full metadata for feedback calibration
  logDecision(id, opp?.score?.tier, opp?.score?.composite, outcome, note || '');
  await saveOutcomes();
  await saveDecisions();
  res.json({ ok: true });

  // When a VC marks something "interested", run a deeper enrichment + re-score.
  // This catches cases like Durantic: MEDIUM because the snippet was thin,
  // but the VC knows it's actually CRITICAL. Enrichment surfaces traction signals
  // the model couldn't see, and the re-score updates the tier accordingly.
  if (outcome === 'interested') {
    const opp = [...state.opportunities, ...(state.flagged || [])].find(o => o.id === id);
    if (!opp) return;
    (async () => {
      try {
        // Deeper enrichment: more results, deeper HN search
        const hnInSignals = extractHnUrlFromSignals(opp.signals || []);
        const [ghItems, hnItems] = await Promise.all([
          githubRepoSearch(`${opp.title} in:name,description`, 5),
          hnInSignals
            ? fetch(`https://hn.algolia.com/api/v1/items/${hnInSignals.id}`).then(r => r.ok ? r.json().then((d: any) => [d]) : Promise.resolve([])).catch(() => [])
            : hnSearch(opp.title, 5),
        ]);
        const enrichment: OpportunityEnrichment = opp.enrichment || {};
        if (ghItems.length) {
          const r = ghItems[0];
          if (!await isEstablishedOrg(r.owner?.login || '', r.owner?.type || 'User')) {
            const infra = await hasStartupInfra(r.full_name);
            enrichment.github = { stars: r.stargazers_count, url: r.html_url, language: r.language, pushedAt: r.pushed_at, infraSignals: infra.signals };
          }
        }
        if (hnItems.length) {
          const top = hnInSignals
            ? hnItems[0]
            : hnItems.reduce((a: any, b: any) => (a.points || 0) >= (b.points || 0) ? a : b);
          if ((top.points || 0) > 0) {
            enrichment.hn = {
              points: top.points || 0,
              comments: hnInSignals ? (top.children?.length || 0) : (top.num_comments || 0),
              url: hnInSignals ? hnInSignals.url : `https://news.ycombinator.com/item?id=${top.objectID}`,
              title: top.title,
            };
          }
        }
        if (Object.keys(enrichment).length) opp.enrichment = enrichment;

        // Re-score with enrichment context included
        const enrichmentCtx = [
          enrichment.github ? `GitHub: ★${enrichment.github.stars}, pushed ${enrichment.github.pushedAt}, ${enrichment.github.infraSignals?.join(', ')}` : '',
          enrichment.hn ? `HN: ▲${enrichment.hn.points} points, ${enrichment.hn.comments} comments — "${enrichment.hn.title}"` : '',
        ].filter(Boolean).join(' | ');

        if (enrichmentCtx) {
          const reScoreResult = await synthesize<{ scored: Array<{ id: string; tier: string; composite: number; traction: number; velocity: number; market: number; mechanics: number; takeaway: string; tractionEvidence?: string; tractionConfidence: string }> }>(
            `You are a LAUNCH Accelerator analyst. Re-score this opportunity using enrichment data that was not available during the initial scan. The VC has marked this as "interested" — take that signal seriously.

${scoringText.slice(0, 1500)}
${buildFeedbackDigest()}
Return JSON {"scored": [{id, tier, composite, traction, velocity, market, mechanics, takeaway, tractionEvidence, tractionConfidence}]}.`,
            `OPPORTUNITY: ${JSON.stringify({ id: opp.id, title: opp.title, description: opp.description, category: opp.category, signals: opp.signals })}\n\nENRICHMENT DATA (not available at initial scoring): ${enrichmentCtx}\n\nVC HAS MARKED THIS "INTERESTED" — weight this as a strong positive signal on execution and relevance.`
          );

          const s = reScoreResult.scored?.[0];
          if (s && opp.score) {
            opp.score.tier        = s.tier as any;
            opp.score.composite   = s.composite;
            opp.score.traction    = s.traction;
            opp.score.velocity    = s.velocity;
            opp.score.market      = s.market;
            opp.score.mechanics   = s.mechanics;
            opp.score.takeaway    = s.takeaway;
            if (s.tractionEvidence) opp.score.tractionEvidence = s.tractionEvidence;
            opp.score.tractionConfidence = s.tractionConfidence as any || opp.score.tractionConfidence;
          }
        }

        // Re-sort opportunities after re-score
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        state.opportunities.sort((a, b) => {
          const diff = (order[a.score?.tier || 'MEDIUM'] ?? 2) - (order[b.score?.tier || 'MEDIUM'] ?? 2);
          return diff !== 0 ? diff : (b.score?.composite || 0) - (a.score?.composite || 0);
        });

        broadcast('rescore_complete', { id, tier: opp.score?.tier, composite: opp.score?.composite });
      } catch { /* non-critical — re-score is best-effort */ }
    })();
  }
});
app.delete('/api/outcomes/:id', async (req: Request, res: Response) => {
  delete outcomes[req.params.id];
  delete outcomeTimes[req.params.id];
  delete outcomeNotes[req.params.id];
  state.outcomes     = outcomes;
  state.outcomeTimes = outcomeTimes;
  state.outcomeNotes = outcomeNotes;
  await saveOutcomes();
  res.json({ ok: true });
});

app.patch('/api/outcomes/:id/note', async (req: Request, res: Response) => {
  const { note } = req.body;
  if (!outcomes[req.params.id]) { res.status(404).json({ error: 'outcome not found' }); return; }
  if (typeof note === 'string' && note.trim()) {
    outcomeNotes[req.params.id] = note.trim();
  } else {
    delete outcomeNotes[req.params.id];
  }
  await saveOutcomes();
  res.json({ ok: true });
});

// Stored themes — pin/unpin and delete
app.get('/api/themes', (_req, res: Response) => res.json(storedThemes));

app.post('/api/themes/:id/pin', async (req: Request, res: Response) => {
  const theme = storedThemes.find(t => t.id === req.params.id);
  if (!theme) { res.status(404).json({ error: 'not found' }); return; }
  theme.pinned   = !theme.pinned;
  theme.pinnedAt = theme.pinned ? new Date().toISOString() : undefined;
  sortStoredThemes();
  await saveThemesFile();
  res.json(theme);
});

app.delete('/api/themes/:id', async (req: Request, res: Response) => {
  storedThemes = storedThemes.filter(t => t.id !== req.params.id);
  await saveThemesFile();
  res.json({ ok: true });
});

// Clear all decision history
app.delete('/api/decisions', async (req: Request, res: Response) => {
  decisions = [];
  await saveDecisions();
  res.json({ ok: true });
});

// Get calibration status for dashboard
app.get('/api/decisions/calibration-status', (_req, res: Response) => {
  const noted = Object.entries(outcomeNotes).filter(([, note]) => note.trim().length > 0);
  const calibrated = noted.length >= 3;
  res.json({
    calibrated,
    notedDecisions: noted.length,
    totalDecisions: decisions.length,
  });
});

// Vite dev / static
if (isDev) {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa', root: __dir });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dir, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(__dir, 'dist', 'index.html')));
}

// ─── Auto-scan cadence ─────────────────────────────────────────────────────────
// Mirrors startBackgroundWorkers() from root src/lib/workers.ts.
// SCAN_INTERVAL_MS defaults to 3 hours; override via env for testing (e.g. 600000 = 10 min).
// runScan() already guards against overlap with `if (state.isScanning) return`.
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '', 10) || (3 * 60 * 60 * 1000);

function startAutoScan(): void {
  const intervalMin = Math.round(SCAN_INTERVAL_MS / 60_000);
  console.info(`[AutoScan] Initial scan in 15s, then every ${intervalMin} min`);

  // Initial scan shortly after startup — lets the server finish booting and
  // existing saved opps load into state before the first pipeline run.
  setTimeout(() => {
    runScan().catch(err => console.error('[AutoScan] Initial scan failed:', err));
  }, 15_000);

  setInterval(() => {
    runScan().catch(err => console.error('[AutoScan] Scheduled scan failed:', err));
  }, SCAN_INTERVAL_MS);
}

const server = app.listen(PORT, () => {
  console.log(`\n🔭 Venture Scout (basic0j) → http://localhost:${PORT}\n`);
  startAutoScan();
});

process.on('SIGINT',  () => { server.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); process.exit(0); });
