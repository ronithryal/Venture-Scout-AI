import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR       = path.join(__dir, '..', 'data');
export const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
export const SEEN_FILE      = path.join(DATA_DIR, 'seen.json');
export const OUTCOMES_FILE  = path.join(DATA_DIR, 'outcomes.json');
export const THEMES_FILE    = path.join(DATA_DIR, 'themes.json');
export const OPPS_FILE      = path.join(DATA_DIR, 'opps.json');
export const DECIDED_FILE   = path.join(DATA_DIR, 'decided.json');
export const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.json');

const SEEN_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadAll(): Promise<{
  watchlist: any[];
  seenUrls: Set<string>;
  seenUrlTimes: Map<string, number>;
  outcomes: Record<string, any>;
  outcomeTimes: Record<string, string>;
  outcomeNotes: Record<string, string>;
  storedThemes: any[];
  savedOpportunities: any[];
  savedFlagged: any[];
  savedLastScanned: string | null;
  decidedOpps: Map<string, any>;
  decisions: any[];
  thesisText: string;
  scoringText: string;
}> {
  await ensureDataDir();
  let watchlist = [];
  let seenUrls = new Set<string>();
  let seenUrlTimes = new Map<string, number>();
  let outcomes: Record<string, any> = {};
  let outcomeTimes: Record<string, string> = {};
  let outcomeNotes: Record<string, string> = {};
  let storedThemes: any[] = [];
  let savedOpportunities: any[] = [];
  let savedFlagged: any[] = [];
  let savedLastScanned: string | null = null;
  let decidedOpps = new Map<string, any>();
  let decisions: any[] = [];
  let thesisText = '';
  let scoringText = '';

  try { watchlist   = JSON.parse(await fs.readFile(WATCHLIST_FILE, 'utf-8')); }  catch { watchlist = []; }
  try {
    const d = JSON.parse(await fs.readFile(SEEN_FILE, 'utf-8'));
    const cutoff = Date.now() - SEEN_TTL_MS;
    seenUrls = new Set();
    seenUrlTimes = new Map();
    if (Array.isArray(d.entries)) {
      for (const e of d.entries) {
        if (e.ts && e.ts > cutoff) {
          seenUrls.add(e.url);
          seenUrlTimes.set(e.url, e.ts);
        }
      }
    }
  } catch { seenUrls = new Set(); seenUrlTimes = new Map(); }
  try {
    const raw = JSON.parse(await fs.readFile(OUTCOMES_FILE, 'utf-8'));
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
  try { thesisText  = await fs.readFile(path.join(__dir, '..', 'thesis.yaml'), 'utf-8'); }  catch {}
  try { scoringText = await fs.readFile(path.join(__dir, '..', 'scoring.yaml'), 'utf-8'); } catch {}

  return {
    watchlist, seenUrls, seenUrlTimes, outcomes, outcomeTimes, outcomeNotes,
    storedThemes, savedOpportunities, savedFlagged, savedLastScanned, decidedOpps, decisions,
    thesisText, scoringText
  };
}

export const saveWatchlist   = (watchlist: any[]) => fs.writeFile(WATCHLIST_FILE, JSON.stringify(watchlist, null, 2));
export const saveOutcomes    = (outcomes: any, outcomeTimes: any, outcomeNotes: any) => fs.writeFile(OUTCOMES_FILE, JSON.stringify({ outcomes, outcomeTimes, outcomeNotes }, null, 2));
export const saveDecisions   = (decisions: any[]) => fs.writeFile(DECISIONS_FILE, JSON.stringify(decisions, null, 2));
export const saveDecidedOpps = (decidedOpps: Map<string, any>) => fs.writeFile(DECIDED_FILE, JSON.stringify(Object.fromEntries(decidedOpps)));
export const saveThemesFile  = (storedThemes: any[]) => fs.writeFile(THEMES_FILE, JSON.stringify(storedThemes, null, 2));
export const saveOpps        = (state: { opportunities: any[]; flagged: any[]; lastScanned: string | null }) => fs.writeFile(OPPS_FILE, JSON.stringify({
  opportunities: state.opportunities,
  flagged:       state.flagged,
  lastScanned:   state.lastScanned,
}, null, 2));

export async function saveSeenUrls(seenUrlTimes: Map<string, number>) {
  const cutoff = Date.now() - SEEN_TTL_MS;
  const entries = [...seenUrlTimes.entries()]
    .filter(([, ts]) => ts > cutoff)
    .map(([url, ts]) => ({ url, ts }))
    .slice(-10000);
  const seenUrls = new Set(entries.map(e => e.url));
  await fs.writeFile(SEEN_FILE, JSON.stringify({ entries }));
  return seenUrls;
}
