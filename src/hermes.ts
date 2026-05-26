import type { DealFlowOpportunity } from './types.js';

export const HERMES_MODEL = 'NousResearch/Hermes-3-Llama-3.1-70B-FP8';
export const HERMES_BASE_URL = process.env.HERMES_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const HERMES_API_KEY = process.env.HERMES_API_KEY || '';

async function exaSearch(
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

function pickSnippet(r: any): string {
  const hl = Array.isArray(r.highlights)
    ? (typeof r.highlights[0] === 'string' ? r.highlights[0] : r.highlights[0]?.text ?? '')
    : '';
  return (hl || r.text || '').slice(0, 280).trim();
}

// Single-shot structured call: one Exa search + one Hermes call with JSON response format.
// Replaces agentic loop (3+ Exa calls, autonomous query selection) with deterministic interrogation.
export async function conductHermesResearch(opp: DealFlowOpportunity): Promise<{
  conviction: 'strong' | 'moderate' | 'weak' | 'pass';
  reasoning: string;
  keySignals: string[];
  riskFlags: string[];
} | null> {
  // No key → skip entirely; existing scoring pipeline is sufficient without Hermes
  if (!HERMES_API_KEY) return null;

  try {
    // Single targeted Exa search: deterministic query focused on funding + product existence
    const exaQuery = `"${opp.companyName || opp.title}" (funded OR "Y Combinator" OR "Series A" OR "raised" OR "launched" OR "product")`;
    const exaResults = await exaSearch(exaQuery, { numResults: 4 });
    const exaContext = exaResults
      .map(r => `${r.title}\n${r.url}\n${pickSnippet(r)}`)
      .join('\n\n---\n\n')
      .slice(0, 2000);

    const systemPrompt = `You are a venture credibility analyst for LAUNCH Accelerator ($125K pre-seed checks).
You are given a startup opportunity and web search results about it.
Answer exactly three questions and return structured JSON.

HARD RULES:

If ANY evidence of institutional equity funding (VC, angel round, convertible note, YC batch) exists → conviction: "pass"

If fewer than 2 independent signals corroborate the opportunity → conviction: "pass"

SBIR grants, university programs, and pilot revenue do NOT count as disqualifying funding

Return ONLY:
{
  "real": true/false,
  "funded": true/false,
  "matchesDescription": true/false,
  "conviction": "strong"|"moderate"|"weak"|"pass",
  "reasoning": "1-2 sentence synthesis",
  "keySignals": ["up to 3 strongest corroborating signals"],
  "riskFlags": ["up to 3 risk flags, empty array if none"]
}`;

    const userPrompt = `Company: ${opp.companyName || opp.title}
Description: ${opp.description}
Traction claims: ${opp.score?.tractionEvidence || 'not stated'}

WEB SEARCH RESULTS:
${exaContext || '(no results found)'}`;

    const res = await fetch(`${HERMES_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HERMES_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: HERMES_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[Hermes] API returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, '').trim());
  } catch (err) {
    console.error('[Hermes] Research failed:', err);
    return null;
  }
}

// Applies a Hermes conviction result to an opportunity's score.
// pass  → downgrade tier to LOW (not enough corroborating signals)
// weak  → downgrade one tier (CRITICAL→HIGH, HIGH→MEDIUM, MEDIUM→LOW)
// moderate/strong → annotate takeaway only, no tier change
export function applyHermesConviction(
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
