import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { DealFlowOpportunity, StoredTheme, SignalTier, OutcomeTier } from './types.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'venture-scout.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeTables();
  }
  return db;
}

function initializeTables() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS decided_opps (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      outcome TEXT,
      outcome_note TEXT,
      decided_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      tier TEXT,
      score REAL,
      decision TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outcomes (
      id TEXT PRIMARY KEY,
      outcome TEXT NOT NULL,
      decided_at TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      last_scanned TEXT
    );

    CREATE TABLE IF NOT EXISTS seen_urls (
      url TEXT PRIMARY KEY,
      seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ─── decided_opps ──────────────────────────────────────────────────────────

export function getDecidedOpps(): Map<string, DealFlowOpportunity> {
  const database = getDb();
  const stmt = database.prepare('SELECT id, data FROM decided_opps');
  const rows = stmt.all() as Array<{ id: string; data: string }>;
  const map = new Map<string, DealFlowOpportunity>();
  for (const row of rows) {
    try {
      map.set(row.id, JSON.parse(row.data));
    } catch {
      console.warn(`[db] failed to parse decided_opp ${row.id}`);
    }
  }
  return map;
}

export function saveDecidedOpp(opp: DealFlowOpportunity, outcome?: string, note?: string): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO decided_opps (id, data, outcome, outcome_note, decided_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(opp.id, JSON.stringify(opp), outcome || null, note || null);
}

export function deleteDecidedOpp(id: string): void {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM decided_opps WHERE id = ?');
  stmt.run(id);
}

// ─── decisions (self-improving feedback log) ────────────────────────────────

export interface DecisionEntry {
  company: string;
  tier?: SignalTier;
  score?: number;
  decision: OutcomeTier;
  note: string;
  timestamp: string;
}

export function getDecisions(): DecisionEntry[] {
  const database = getDb();
  const stmt = database.prepare('SELECT company, tier, score, decision, note, timestamp FROM decisions ORDER BY id');
  return stmt.all() as DecisionEntry[];
}

export function insertDecision(entry: DecisionEntry): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO decisions (company, tier, score, decision, note, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(entry.company, entry.tier || null, entry.score || null, entry.decision, entry.note, entry.timestamp);
}

export function clearAllDecisions(): void {
  const database = getDb();
  database.prepare('DELETE FROM decisions').run();
}

// ─── outcomes ──────────────────────────────────────────────────────────────

export interface OutcomesData {
  outcomes: Record<string, string>;
  outcomeTimes: Record<string, string>;
  outcomeNotes: Record<string, string>;
}

export function getOutcomes(): OutcomesData {
  const database = getDb();
  const stmt = database.prepare('SELECT id, outcome, decided_at, note FROM outcomes');
  const rows = stmt.all() as Array<{ id: string; outcome: string; decided_at: string | null; note: string | null }>;

  const outcomes: Record<string, string> = {};
  const outcomeTimes: Record<string, string> = {};
  const outcomeNotes: Record<string, string> = {};

  for (const row of rows) {
    outcomes[row.id] = row.outcome;
    if (row.decided_at) outcomeTimes[row.id] = row.decided_at;
    if (row.note) outcomeNotes[row.id] = row.note;
  }

  return { outcomes, outcomeTimes, outcomeNotes };
}

export function saveOutcome(id: string, outcome: string, decidedAt: string, note?: string): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO outcomes (id, outcome, decided_at, note)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, outcome, decidedAt, note || null);
}

export function deleteOutcome(id: string): void {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM outcomes WHERE id = ?');
  stmt.run(id);
}

export function clearAllOutcomes(): void {
  const database = getDb();
  database.prepare('DELETE FROM outcomes').run();
}

export function saveAllOutcomes(outcomesData: OutcomesData): void {
  const database = getDb();
  clearAllOutcomes();
  for (const [id, outcome] of Object.entries(outcomesData.outcomes)) {
    saveOutcome(id, outcome, outcomesData.outcomeTimes[id] || new Date().toISOString(), outcomesData.outcomeNotes[id]);
  }
}

// ─── opportunities ──────────────────────────────────────────────────────────

export function getOpportunities(): DealFlowOpportunity[] {
  const database = getDb();
  const stmt = database.prepare('SELECT data FROM opportunities WHERE is_flagged = 0 ORDER BY rowid');
  const rows = stmt.all() as Array<{ data: string }>;
  return rows.map(r => {
    try {
      return JSON.parse(r.data);
    } catch {
      return null;
    }
  }).filter((o): o is DealFlowOpportunity => o !== null);
}

export function getFlaggedOpps(): DealFlowOpportunity[] {
  const database = getDb();
  const stmt = database.prepare('SELECT data FROM opportunities WHERE is_flagged = 1 ORDER BY rowid');
  const rows = stmt.all() as Array<{ data: string }>;
  return rows.map(r => {
    try {
      return JSON.parse(r.data);
    } catch {
      return null;
    }
  }).filter((o): o is DealFlowOpportunity => o !== null);
}

export function getLastScanned(): string | null {
  const database = getDb();
  const stmt = database.prepare('SELECT value FROM meta WHERE key = ?');
  const row = stmt.get('lastScanned') as { value: string } | undefined;
  return row?.value || null;
}

export function saveOpportunities(opps: DealFlowOpportunity[], flagged: DealFlowOpportunity[], lastScanned: string | null): void {
  const database = getDb();

  // Clear existing opportunities
  database.prepare('DELETE FROM opportunities').run();

  // Insert deal-flow opportunities
  const insertOpp = database.prepare(`
    INSERT INTO opportunities (id, data, is_flagged, last_scanned)
    VALUES (?, ?, 0, ?)
  `);
  for (const opp of opps) {
    insertOpp.run(opp.id, JSON.stringify(opp), lastScanned);
  }

  // Insert flagged opportunities
  for (const opp of flagged) {
    insertOpp.run(opp.id, JSON.stringify(opp), lastScanned);
  }

  // Update lastScanned in meta
  const setMeta = database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  setMeta.run('lastScanned', lastScanned);
}

// ─── seen_urls ────────────────────────────────────────────────────────────

export interface SeenUrlsData {
  seenUrls: Set<string>;
  seenUrlTimes: Map<string, number>;
}

export function getSeenUrls(ttlMs: number): SeenUrlsData {
  const database = getDb();
  const cutoff = Date.now() - ttlMs;
  const stmt = database.prepare('SELECT url, seen_at FROM seen_urls WHERE seen_at > ? ORDER BY seen_at DESC LIMIT 10000');
  const rows = stmt.all(cutoff) as Array<{ url: string; seen_at: number }>;

  const seenUrls = new Set<string>();
  const seenUrlTimes = new Map<string, number>();

  for (const row of rows) {
    seenUrls.add(row.url);
    seenUrlTimes.set(row.url, row.seen_at);
  }

  return { seenUrls, seenUrlTimes };
}

export function addSeenUrl(url: string, ts: number): void {
  const database = getDb();
  const stmt = database.prepare('INSERT OR IGNORE INTO seen_urls (url, seen_at) VALUES (?, ?)');
  stmt.run(url, ts);
}

export function pruneSeenUrls(ttlMs: number): void {
  const database = getDb();
  const cutoff = Date.now() - ttlMs;
  const stmt = database.prepare('DELETE FROM seen_urls WHERE seen_at <= ?');
  stmt.run(cutoff);
}

// ─── themes ────────────────────────────────────────────────────────────────

export function getStoredThemes(): StoredTheme[] {
  const database = getDb();
  const stmt = database.prepare('SELECT data, pinned FROM themes ORDER BY pinned DESC, last_seen_at DESC');
  const rows = stmt.all() as Array<{ data: string; pinned: number }>;
  return rows.map(r => {
    try {
      const theme = JSON.parse(r.data) as StoredTheme;
      theme.pinned = r.pinned === 1;
      return theme;
    } catch {
      return null;
    }
  }).filter((t): t is StoredTheme => t !== null);
}

export function saveThemes(themes: StoredTheme[]): void {
  const database = getDb();

  // Clear existing themes
  database.prepare('DELETE FROM themes').run();

  const stmt = database.prepare(`
    INSERT INTO themes (id, data, pinned, last_seen_at)
    VALUES (?, ?, ?, ?)
  `);

  for (const theme of themes) {
    stmt.run(theme.id, JSON.stringify(theme), theme.pinned ? 1 : 0, theme.lastSeenAt);
  }
}

// ─── meta ──────────────────────────────────────────────────────────────────

export function getMeta(key: string): string | null {
  const database = getDb();
  const stmt = database.prepare('SELECT value FROM meta WHERE key = ?');
  const row = stmt.get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setMeta(key: string, value: string): void {
  const database = getDb();
  const stmt = database.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

// Close database on process exit
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
