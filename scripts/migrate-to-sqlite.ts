import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getDecidedOpps, saveDecidedOpp,
  getDecisions, insertDecision,
  saveOutcome,
  saveOpportunities,
  addSeenUrl, pruneSeenUrls,
  saveThemes,
  getMeta, setMeta,
} from '../src/db.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dir, '..', 'data');
const SEEN_TTL_MS = 3 * 24 * 60 * 60 * 1000;

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    console.warn(`⚠️  Failed to read ${path.basename(filePath)}`);
    return null;
  }
}

async function migrate() {
  console.log('🚀 Starting SQLite migration...\n');

  // Step 1: decided.json → decided_opps (HIGHEST PRIORITY)
  console.log('📥 1. Migrating decided.json (Shortlist/Pass list)...');
  const decidedData = await readJsonFile<Record<string, any>>(path.join(DATA_DIR, 'decided.json'));
  let decidedCount = 0;
  if (decidedData) {
    for (const [id, opp] of Object.entries(decidedData)) {
      try {
        saveDecidedOpp(opp, undefined, undefined);
        decidedCount++;
      } catch (err) {
        console.warn(`   ⚠️  Failed to save decided_opp ${id}: ${err}`);
      }
    }
  }
  console.log(`   ✓ Saved ${decidedCount} decided opportunities\n`);

  // Step 2: decisions.json → decisions (CRITICAL for learning loop)
  console.log('📥 2. Migrating decisions.json (feedback log)...');
  const decisionsData = await readJsonFile<Array<any>>(path.join(DATA_DIR, 'decisions.json'));
  let decisionsCount = 0;
  let decisionsWithNotes = 0;
  if (Array.isArray(decisionsData)) {
    for (const entry of decisionsData) {
      try {
        insertDecision({
          company: entry.company,
          tier: entry.tier,
          score: entry.score,
          decision: entry.decision,
          note: entry.note || '',
          timestamp: entry.timestamp,
        });
        decisionsCount++;
        if (entry.note && entry.note.trim()) decisionsWithNotes++;
      } catch (err) {
        console.warn(`   ⚠️  Failed to save decision for ${entry.company}: ${err}`);
      }
    }
  }
  const feedbackActive = decisionsWithNotes >= 3 ? '✓ feedback digest active' : 'feedback digest below threshold';
  console.log(`   ✓ Saved ${decisionsCount} decisions (${decisionsWithNotes} with non-empty notes — ${feedbackActive})\n`);

  // Step 3: outcomes.json → outcomes
  console.log('📥 3. Migrating outcomes.json...');
  const outcomesData = await readJsonFile<{
    outcomes: Record<string, string>;
    outcomeTimes: Record<string, string>;
    outcomeNotes: Record<string, string>;
  }>(path.join(DATA_DIR, 'outcomes.json'));
  let outcomesCount = 0;
  if (outcomesData && outcomesData.outcomes) {
    for (const [id, outcome] of Object.entries(outcomesData.outcomes)) {
      try {
        const decidedAt = outcomesData.outcomeTimes?.[id] || new Date().toISOString();
        const note = outcomesData.outcomeNotes?.[id];
        saveOutcome(id, outcome, decidedAt, note);
        outcomesCount++;
      } catch (err) {
        console.warn(`   ⚠️  Failed to save outcome for ${id}: ${err}`);
      }
    }
  }
  console.log(`   ✓ Saved ${outcomesCount} outcomes\n`);

  // Step 4: seen.json → seen_urls (with TTL filter)
  console.log('📥 4. Migrating seen.json (with TTL prune)...');
  const seenData = await readJsonFile<{ entries: Array<{ url: string; ts: number }> }>(
    path.join(DATA_DIR, 'seen.json')
  );
  let seenCount = 0;
  let seenPruned = 0;
  if (seenData && Array.isArray(seenData.entries)) {
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const entry of seenData.entries) {
      if (entry.ts > cutoff) {
        try {
          addSeenUrl(entry.url, entry.ts);
          seenCount++;
        } catch (err) {
          console.warn(`   ⚠️  Failed to save seen URL ${entry.url}: ${err}`);
        }
      } else {
        seenPruned++;
      }
    }
  }
  console.log(`   ✓ Saved ${seenCount} seen URLs (${seenPruned} pruned by TTL)\n`);

  // Step 5: themes.json → themes
  console.log('📥 5. Migrating themes.json...');
  const themesData = await readJsonFile<Array<any>>(path.join(DATA_DIR, 'themes.json'));
  let themesCount = 0;
  if (Array.isArray(themesData)) {
    try {
      saveThemes(themesData);
      themesCount = themesData.length;
    } catch (err) {
      console.warn(`   ⚠️  Failed to save themes: ${err}`);
    }
  }
  console.log(`   ✓ Saved ${themesCount} themes\n`);

  // Step 6: opps.json → opportunities
  console.log('📥 6. Migrating opps.json...');
  const oppsData = await readJsonFile<{
    opportunities: Array<any>;
    flagged: Array<any>;
    lastScanned: string | null;
  }>(path.join(DATA_DIR, 'opps.json'));
  let oppCount = 0;
  let flaggedCount = 0;
  let lastScanned: string | null = null;
  if (oppsData) {
    try {
      const opportunities = oppsData.opportunities || [];
      const flagged = oppsData.flagged || [];
      lastScanned = oppsData.lastScanned || null;
      saveOpportunities(opportunities, flagged, lastScanned);
      oppCount = opportunities.length;
      flaggedCount = flagged.length;
    } catch (err) {
      console.warn(`   ⚠️  Failed to save opportunities: ${err}`);
    }
  }
  console.log(`   ✓ Saved ${oppCount + flaggedCount} opportunities (${oppCount} deal flow, ${flaggedCount} flagged)\n`);

  // Rename original JSON files to .bak
  console.log('💾 Renaming original JSON files to .bak...');
  const filesToBackup = ['decided.json', 'decisions.json', 'outcomes.json', 'seen.json', 'themes.json', 'opps.json'];
  for (const file of filesToBackup) {
    const oldPath = path.join(DATA_DIR, file);
    const backupPath = path.join(DATA_DIR, `${file}.bak`);
    try {
      await fs.rename(oldPath, backupPath);
      console.log(`   ✓ ${file} → ${file}.bak`);
    } catch (err) {
      console.warn(`   ⚠️  Failed to backup ${file}: ${err}`);
    }
  }

  console.log('\n✅ Migration complete');
  console.log(`   decided_opps:  ${decidedCount} rows`);
  console.log(`   decisions:     ${decisionsCount} rows (${decisionsWithNotes} with non-empty notes — ${feedbackActive})`);
  console.log(`   outcomes:      ${outcomesCount} rows`);
  console.log(`   seen_urls:     ${seenCount} rows (after TTL prune)`);
  console.log(`   themes:        ${themesCount} rows`);
  console.log(`   opportunities: ${oppCount + flaggedCount} rows (${oppCount} deal flow, ${flaggedCount} flagged)`);
  console.log('\n✨ SQLite database is ready at data/venture-scout.db');
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
