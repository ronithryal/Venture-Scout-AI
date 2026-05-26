import { GoogleGenAI } from '@google/genai';

const GEMINI_MODEL = 'gemini-3.5-flash';

// Repairs a JSON string that was truncated mid-output
export function repairTruncatedJson(raw: string): string {
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
      if (stack.length === 2) lastCompleteItemEnd = i;
    }
  }
  if (lastCompleteItemEnd < 0) return '{}';
  const repaired = raw.slice(0, lastCompleteItemEnd + 1) + ']}';
  try { JSON.parse(repaired); return repaired; } catch { return '{}'; }
}

// Gemini JSON synthesis
export async function synthesize<T>(system: string, user: string, maxTokens = 2000): Promise<T> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
  if (!GEMINI_API_KEY) return {} as T;
  const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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

// Extracts live themes from builder and investment signals
export async function extractLiveThemes(
  partnerSignals: any[],
  investSignals: any[],
  watchlistSignals: any[],
  builderSignals: any[] = []
): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY) return [];
  const fmt = (s: any) =>
    `[${s.firm}|${s.type}] ${s.title.slice(0, 60)} — ${s.snippet.slice(0, 100)}`;
  try {
    const result = await synthesize<{ themes: string[] }>(
      `You are a pre-seed VC intelligence analyst for LAUNCH Accelerator ($125K first checks).
Extract 5-7 specific investment themes signaled by these sources RIGHT NOW.
Return {"themes": ["concise theme phrase", ...]}. Each theme must be specific enough to drive a search query.`,
      `NORTH-STAR SIGNALS:\n${investSignals.slice(0, 20).map(fmt).join('\n')}\n\nBUILDER SIGNALS:\n${builderSignals.slice(0, 25).map(fmt).join('\n')}`
    );
    return (result.themes || []).filter((t: any) => typeof t === 'string' && t.length > 5);
  } catch { return []; }
}

// Merges incoming themes with stored themes
export function mergeIncomingThemes(incoming: any[], storedThemes: any[], now: string) {
  for (const theme of incoming) {
    const key = theme.name.toLowerCase().trim();
    const existing = storedThemes.find(t => t.name.toLowerCase().trim() === key);
    if (existing) {
      existing.lastSeenAt  = now;
      existing.scanCount  += 1;
      existing.description = theme.description;
      existing.momentum    = theme.momentum;
      existing.evidence    = theme.evidence;
    }
  }
}

// Builds a feedback digest for past VC decisions
export function buildFeedbackDigest(outcomes: Record<string, string>, outcomeNotes: Record<string, string>): string {
  const noted = Object.entries(outcomeNotes).filter(([, note]) => note.trim().length > 0);
  if (noted.length < 3) return '';
  const lines = noted.slice(-10).map(([id, note]) => {
    const label = outcomes[id] === 'interested' ? 'INTERESTED' : outcomes[id] === 'pass' ? 'PASS' : 'FLAGGED';
    return `- ${label}: "${id}" — "${note.trim()}"`;
  });
  return `\nVC FEEDBACK FROM PAST DECISIONS (calibrate your scoring to these patterns):\n${lines.join('\n')}\n`;
}
