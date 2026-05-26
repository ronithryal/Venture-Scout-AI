// Global token tracking across a scan
export interface TokenUsage {
  gemini: { input: number; output: number };
  hermes: { input: number; output: number };
  grok: { input: number; output: number };
  exa: { searches: number; contentPages: number };
}

let currentUsage: TokenUsage = {
  gemini: { input: 0, output: 0 },
  hermes: { input: 0, output: 0 },
  grok: { input: 0, output: 0 },
  exa: { searches: 0, contentPages: 0 },
};

export function resetTracking() {
  currentUsage = {
    gemini: { input: 0, output: 0 },
    hermes: { input: 0, output: 0 },
    grok: { input: 0, output: 0 },
    exa: { searches: 0, contentPages: 0 },
  };
}

export function trackGemini(inputTokens: number, outputTokens: number) {
  currentUsage.gemini.input += inputTokens;
  currentUsage.gemini.output += outputTokens;
  console.log(`[Tokens] Gemini: +${inputTokens} in, +${outputTokens} out`);
}

export function trackHermes(inputTokens: number, outputTokens: number) {
  currentUsage.hermes.input += inputTokens;
  currentUsage.hermes.output += outputTokens;
  console.log(`[Tokens] Hermes: +${inputTokens} in, +${outputTokens} out`);
}

export function trackGrok(inputTokens: number, outputTokens: number) {
  currentUsage.grok.input += inputTokens;
  currentUsage.grok.output += outputTokens;
  console.log(`[Tokens] Grok: +${inputTokens} in, +${outputTokens} out`);
}

export function trackExa(searches: number, contentPages: number) {
  currentUsage.exa.searches += searches;
  currentUsage.exa.contentPages += contentPages;
  console.log(`[Tokens] Exa: +${searches} searches, +${contentPages} pages`);
}

export function getUsage(): TokenUsage {
  return structuredClone(currentUsage);
}

export function getCostSummary(usage = currentUsage): { lines: string[]; total: number } {
  // Pricing as of May 2025
  const GEMINI_INPUT = 1.50 / 1_000_000;    // $1.50 per 1M input (paid tier)
  const GEMINI_OUTPUT = 9.00 / 1_000_000;   // $9.00 per 1M output (paid tier)
  const HERMES_INPUT = 0.01 / 1000;         // $0.01 per 1K input (NVIDIA, estimate — using free credits)
  const HERMES_OUTPUT = 0.02 / 1000;        // $0.02 per 1K output (estimate)
  const GROK_INPUT = 1.25 / 1_000_000;      // $1.25 per 1M input (X.AI Grok 4.3)
  const GROK_OUTPUT = 2.50 / 1_000_000;     // $2.50 per 1M output (X.AI Grok 4.3)
  const EXA_SEARCH = 7.00 / 1000;           // $7 per 1K searches (Exa AI)
  const EXA_CONTENT = 1.00 / 1000;          // $1 per 1K pages (Exa AI)

  const costs = {
    gemini: (usage.gemini.input * GEMINI_INPUT) + (usage.gemini.output * GEMINI_OUTPUT),
    hermes: (usage.hermes.input * HERMES_INPUT) + (usage.hermes.output * HERMES_OUTPUT),
    grok: (usage.grok.input * GROK_INPUT) + (usage.grok.output * GROK_OUTPUT),
    exa: (usage.exa.searches * EXA_SEARCH) + (usage.exa.contentPages * EXA_CONTENT),
  };

  const total = costs.gemini + costs.hermes + costs.grok + costs.exa;

  const lines = [
    '═══════════════════════════════════════════',
    '📊 SCAN COST SUMMARY',
    '═══════════════════════════════════════════',
    `Gemini:     ${usage.gemini.input} in,  ${usage.gemini.output} out  → $${costs.gemini.toFixed(4)}`,
    `Hermes:     ${usage.hermes.input} in,  ${usage.hermes.output} out  → $${costs.hermes.toFixed(4)}`,
    `Grok:       ${usage.grok.input} in,   ${usage.grok.output} out   → $${costs.grok.toFixed(4)}`,
    `Exa:        ${usage.exa.searches} searches, ${usage.exa.contentPages} pages    → $${costs.exa.toFixed(4)}`,
    '───────────────────────────────────────────',
    `TOTAL:                                 $${total.toFixed(4)}`,
    '═══════════════════════════════════════════',
  ];

  return { lines, total };
}

export function printCostSummary(usage = currentUsage) {
  const { lines } = getCostSummary(usage);
  lines.forEach(line => console.log(line));
}
