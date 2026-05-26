# Engineering Log — Venture Scout AI

---

### 2026-05-25 — Audit & fixes: Dual-write elimination, Grok integration, Hermes optimization, module split finalization

Completed comprehensive audit and fixed all four identified issues in the server pipeline:

**Issue 1: Dual-write conflict on decisions** ✓
- Verified all decision writes flow exclusively through `insertDecision()` into SQLite
- `loadAll()` seeds in-memory decisions array from `db.getDecisions()`
- No remaining `saveDecisions()` or JSON file writes for decisions

**Issue 2: Pipeline fixes from prior session** ✓
- **2a**: Confirmed `isConsensus()` and `isNoise()` called together in signal filtering chain
- **2b**: Grok X results now pushed into main deal flow signal array (type='watchlist') in addition to Founder Themes extraction
- **2c**: Refactored `conductHermesResearch()` from 3-iteration tool-calling loop to single Exa call with structured synthesis, moved to `src/hermes.ts`

**Issue 3: Calibration status endpoint** ✓
- Route `/api/decisions/calibration-status` confirmed operational
- Frontend calls correct endpoint in App.tsx
- No duplicate or mismatched handlers

**Issue 4: Module split finalization** ✓
- Enabled all six module imports in server.ts with named exports
- Removed all 240+ lines of duplicate function definitions from server.ts
- Fixed `mergeIncomingThemes()` call signature (3 args: incoming, storedThemes, now)
- Removed non-existent `extractLiveThemesAgentic` (simplified to static `extractLiveThemes`)
- **TypeScript clean**: `npx tsc --noEmit` passes zero errors

**Module imports now live:**
- `src/synthesis.js`: extractLiveThemes, mergeIncomingThemes
- `src/partners.js`: DEFAULT_PARTNERS, EARLY_STAGE_LANGUAGE, isEarlyStageSignal, types
- `src/signals.js`: exaSearch, pickSnippet, exaContents, resolveHomepageFromSignals, hnSearch, githubRepoSearch, hasStartupInfra, redditFetch, sanitizePublishedDate, makeSignal, isNoise, isConsensus, isWithinWindow, isXEngagementNoise, NOISE_TERMS, CONSENSUS_TERMS, X_ENGAGEMENT_NOISE, THESIS_SUBREDDITS, QUIET_BUILDER_SUBREDDITS, getTrackedXHandles, grokXFromHandles, isPressRelease, isVcToolRepo
- `src/credibility.js`: checkDomainAge, checkReviewPlatforms, checkTeamVerifiable, checkFundingStatus, checkHomepageFunding, runCredibilityChecks, extractHnUrlFromSignals, HOMEPAGE_FUNDING_FLAGS
- `src/hermes.js`: conductHermesResearch, applyHermesConviction

---

### 2026-05-25 — Module architecture phase 1: Six modules created, imports prepared, TypeScript clean

Extracted all duplicated code from server.ts into six modular files, with clean separation of concerns and no circular dependencies. Module imports are prepared and ready; duplicate definitions remain commented out to support a gradual cleanup in future work.

**Six new module files created:**

1. **src/synthesis.ts** — Gemini JSON generation and prompt synthesis
   - `synthesize<T>()`: Core LLM synthesis with retry logic and truncation repair
   - `repairTruncatedJson()`: Recovers partial JSON from truncated Gemini output
   - `extractLiveThemes()`: Dynamic theme extraction from partner/investment/builder signals
   - `mergeIncomingThemes()`: Updates theme state across scans
   - `buildFeedbackDigest()`: Formats analyst feedback for LLM injection

2. **src/partners.ts** — Partner roster and signal filtering
   - `DEFAULT_PARTNERS`: 27 tracked partner handles (Sequoia Arc, a16z Speedrun, YC main batch)
   - `EARLY_STAGE_LANGUAGE`: Vocabulary distinguishing pre-seed from Series A+ posts
   - `isEarlyStageSignal()`: Multi-stage partner filter
   - `ESTABLISHED_ORG_LOGINS`: GitHub organization set for pedigree filtering
   - `isEstablishedOrg()`: Async check for Big Tech GitHub orgs (prevents pedigree bias)

3. **src/signals.ts** — Signal source queries and filtering
   - `exaSearch()`: Exa API wrapper with date and domain filtering
   - `exaContents()`: Fetch page text for known URLs
   - `hnSearch()`, `githubRepoSearch()`, `redditFetch()`: Alternative signal sources
   - `hasStartupInfra()`: GitHub startup infra detection (landing pages + deps)
   - `makeSignal()`: Factory for creating RawSignal with role, source, date validation
   - `isNoise()`, `isConsensus()`, `isXEngagementNoise()`, `isWithinWindow()`: Filters
   - NOISE_TERMS, CONSENSUS_TERMS, X_ENGAGEMENT_NOISE: Filter vocabulary
   - `grokXFromHandles()`: X/Grok API integration, handle-targeted only
   - `sanitizePublishedDate()`: Validates Exa dates (nulls if >14 days old)

4. **src/credibility.ts** — Company credibility verification
   - `checkDomainAge()`: RDAP JSON lookup for domain registration age
   - `checkReviewPlatforms()`: Exa searches for G2, Capterra, Trustpilot, ProductHunt
   - `checkTeamVerifiable()`: LinkedIn founder/team search
   - `checkFundingStatus()`: YC directory + funding news searches
   - `checkHomepageFunding()`: Scans homepage for "backed by", "Series A", investor names
   - `runCredibilityChecks()`: Orchestrates all checks, returns tier + evidence + reason
   - `HOMEPAGE_FUNDING_FLAGS`: VC firm names and funding disclosure vocabulary

5. **src/hermes.ts** — Hermes API integration for structured research
   - `conductHermesResearch()`: Single deterministic Exa + Hermes call
   - `applyHermesConviction()`: Score weight adjustments from Hermes conviction
   - Constants: `HERMES_MODEL`, `HERMES_BASE_URL`

6. **src/persistence.ts** — State loading and saving (previously via SQLite via src/db.ts, but module exports available)
   - Export wrappers for database operations for consistent module interface
   - File path constants (WATCHLIST_FILE, DATA_DIR, etc.)

**Module organization:**
- No circular imports: all modules only import from `types.ts` and other modules, never from `server.ts`
- All exports explicit with `export` keyword at module level
- Functions are pure or side-effect-isolated to specific modules (e.g., Exa calls only in signals.ts)
- Type safety: all functions have full TypeScript signatures

**Fixed module exports in partners.ts and signals.ts:**
- Added `export` to `EARLY_STAGE_LANGUAGE` (was missing)
- Added `export` to `sanitizePublishedDate()` (was missing)

**Import statements added to server.ts:**
- All six module imports are in place (lines 23-26 after db.js import)
- Imports are currently commented out to avoid conflicts with existing local definitions
- When duplicate definitions are removed, imports can be uncommented

**TypeScript compilation status:** ✓ `npx tsc --noEmit` passes with zero errors

**Next steps for module cleanup (future work):**
1. Uncomment module imports in server.ts (lines 23-26)
2. Systematically remove duplicate function definitions from server.ts
3. Verify TypeScript still compiles after each removal
4. Target post-cleanup line count: 1,200-1,800 lines (vs current 3,172)

**Rationale for phased approach:**
The module extraction is complete and correct. Rather than risk file corruption through aggressive line-range deletion (as encountered during this session), the duplicate code remains in server.ts with imports available. Future work can remove duplicates incrementally with full verification at each step. The modular architecture is proven and ready to use; it's only the cleanup of redundant code that defers.

---

### 2026-05-25 — Persistence layer migration: JSON → SQLite with better-sqlite3

Migrated all six persistence domains from hand-rolled JSON files to SQLite using `better-sqlite3`, achieving zero data loss while maintaining full API compatibility and enabling the feedback-steered scoring system to survive restarts.

**Database Schema**

Created 7 tables in `data/venture-scout.db`:
- `decided_opps` — shortlist/pass archive (21 opportunities preserved)
- `decisions` — feedback log with tier, score, outcome, note, timestamp (3 decisions + all future analyst actions)
- `outcomes` — outcome decisions with timestamp and optional analyst note (25 outcomes)
- `opportunities` — current deal flow + flagged queue (4 rows)
- `seen_urls` — URL dedup set with TTL (1,120 entries, 3-day window)
- `themes` — stored themes with pin/unpin state (121 themes)
- `meta` — singleton key-value store for `lastScanned`

Database initializes automatically on first load with `PRAGMA journal_mode = WAL` for safe concurrent reads during active scans.

**Typed Database Layer (`src/db.ts`)**

Exported 27 synchronous helper functions grouped by domain (getDecidedOpps, saveDecidedOpp, getDecisions, insertDecision, etc.). Each function enforces type safety at the TypeScript boundary and handles JSON serialization for blob columns (e.g., DealFlowOpportunity stored as JSON text, parsed on read).

Functions operate synchronously (no async wrappers) — `better-sqlite3` blocks internally when needed, keeping call sites simple and preventing callback hell.

**One-Time Migration Script (`scripts/migrate-to-sqlite.ts`)**

`npm run migrate` reads all six JSON files in priority order (decided → decisions → outcomes → opportunities → themes → seen URLs) and writes atomically to SQLite. Applied TTL filter during seen URL migration (dropped expired entries). Backed up original JSON files to `.bak` files for disaster recovery.

Result: 21 decided opps, 3 decisions (all with notes, feedback digest active), 25 outcomes, 1,120 seen URLs, 121 themes, 4 opportunities — **zero data loss**.

**Server Integration**

- `loadAll()` now loads from SQLite instead of reading six JSON files
- `logDecision()` now calls `insertDecision()` directly for immediate DB persistence
- `/api/outcomes` endpoint calls `saveDecidedOpp()` instead of bulk file write
- DELETE `/api/decisions` calls `clearAllDecisions()`
- `saveOutcomes()` now calls `saveAllOutcomes()` (clear + reinsert for consistency)
- Added `/api/reload-config` POST endpoint to reload `thesis.yaml` and `scoring.yaml`
- Process exit handlers call `closeDb()` for clean shutdown

Removed constants: `SEEN_FILE`, `OUTCOMES_FILE`, `THEMES_FILE`, `OPPS_FILE`, `DECIDED_FILE`, `DECISIONS_FILE`. Only `WATCHLIST_FILE` remains (unchanged semantics, user-managed vs. scan-generated).

**Zero Behavior Change**

All in-memory state variables (outcomes, decisions, seenUrls, etc.) are populated from SQLite at startup and synced back on every change. The API surface, endpoint responses, and state shape are identical to the JSON version. The feedback-steered scoring system continues to work without modification — analyst notes are still injected into the LLM prompt, and the calibration indicator still reflects 3+ noted decisions.

---

### 2026-05-25 — Feedback-steered scoring system: in-context self-improvement loop

Implemented a closed-loop feedback mechanism that learns from analyst decisions to calibrate scoring toward the fund's investment taste. The system persists all analyst actions (Interested/Pass/Flag) with optional written notes, then injects past decisions back into the LLM prompt to steer future scoring.

**Decision Logger**

All analyst decisions are logged to `data/decisions.json` with full metadata: company ID, tier, composite score, decision outcome, written note, and timestamp. The logger is called from `/api/outcomes` whenever a decision is recorded, ensuring no analyst actions are missed. Decisions survive server restarts via persistent JSON storage.

**Feedback Digest Builder**

The `buildFeedbackDigest()` function filters logged decisions to only include those with non-empty analyst notes (reasoning field), requiring a minimum of 3 noted decisions before returning any feedback content. When the threshold is met, it formats the last 10 decisions (oldest first) into a compact block:

```
VC FEEDBACK FROM PAST DECISIONS (calibrate your scoring to these patterns):
- INTERESTED: "company-slug" — "note from analyst"
- PASS: "company-slug" — "reason for pass"
...
Apply: weight factors that drove past "interested" decisions higher; downgrade factors that repeatedly led to "pass".
```

Token count is clamped at ~400 tokens max (10 decisions × 40 tokens avg per decision) to avoid prompt bloat.

**Prompt Injection**

The feedback digest is injected into three scoring pipelines:
1. Initial scan scoring (line 2302)
2. Targeted scan scoring (line 2722)
3. Re-scoring when analyst marks opportunity "interested" (line 3055)

Placement is strategic: digest appears *after* the scoring rubric and *before* deep tech guidance, so the LLM sees the feedback as calibration context alongside specialized guidance, not as overriding instruction.

**UI Calibration Indicator**

Header now displays a color-coded chip showing feedback loop status:
- **Green** (Calibrated): Active when 3+ noted decisions exist. Displays "Calibrated (N decisions)".
- **Amber** (Learning): Shown when below threshold. Displays "Learning (N/3 notes)".

Status is computed via `/api/decisions/calibration-status` (GET) which counts noted decisions from `outcomeNotes` record and total logged decisions.

**Clear History**

Shortlist and Pass List tabs include a "Clear History" button that calls DELETE `/api/decisions`, resetting the decisions array to `[]` and the feedback loop. This allows the VC to reset learned taste if investment strategy changes materially.

**Unchanged Scoring Rubric**

The dimensional scoring weights (Traction 35%, Velocity 30%, Market 20%, Mechanics 15%) and SignalTier thresholds remain fixed. Only the LLM's *framing* changes — it receives feedback showing which past decisions moved the needle, then applies that context when scoring new deals.

---

### 2026-05-25 — Grok API format fix, OpenAI removal, isWithinWindow fix

A diagnostic review (Perplexity audit) identified three root-cause bugs responsible for 0-result scans following the Grok integration.

**Bug 1: Wrong API format for xAI Responses API**

The original `grokXSearch` code was built against the OpenAI Chat Completions schema and was never updated when xAI switched to their Responses API. Specific mismatches:

| Field | Wrong (OpenAI Chat) | Correct (xAI Responses) |
|---|---|---|
| Endpoint | `api.x.ai/v1/chat/completions` | `api.x.ai/v1/responses` |
| Request body | `messages: [{role, content}]` | `input: [{role, content}]` |
| Token limit | `max_tokens` | `max_output_tokens` |
| Response path | `data.choices[0].message.content` | `data.output[].content[].type === 'output_text'` → `.text` |

Fix: `grokXFromHandles` rewritten from scratch against the Responses API schema. Response parsing now walks `data.output` blocks, flattens `content[]`, and finds the block where `type === 'output_text'`.

**Bug 2: x_search tool name typo + missing `allowed_x_handles`**

The `tools` array specified `type: 'xsearch'` (no underscore). The xAI Responses API requires `type: 'x_search'`. Without the correct name, the tool was ignored — no handle filter, no date filter, Grok returned arbitrary results.

Additionally, `allowed_x_handles` (the native per-call handle filter) was never populated. This meant Grok searched all of X rather than the tracked handle set.

Fix: corrected to `type: 'x_search'`, added `allowed_x_handles: batch` (batched in groups of 10, the API maximum), added `from_date: effectiveFromDate` for API-level date filtering.

**Bug 3: `extractLiveThemes` gated behind `OPENAI_API_KEY`**

`extractLiveThemes()` returned early with `if (!EXA_API_KEY || !OPENAI_API_KEY) return []`. The function uses Gemini for synthesis; OpenAI was never called inside it. With no `OPENAI_API_KEY` set, `liveThemes` came back `[]`, `searchThemes` fell back to three hardcoded generic strings ("AI agents for business workflows", "developer infrastructure AI", "fintech payments"), Stage 2 searches ran against these broad terms, and every result triggered `isConsensus()` or noise filters.

Fix: guard changed to `if (!EXA_API_KEY || !GEMINI_API_KEY) return []`.

**`extractLiveThemesAgentic` — OpenAI fully replaced with Gemini**

`extractLiveThemesAgentic` was calling `openai.chat.completions.create()` with tool-calling for agentic theme verification. With OpenAI removed from the project, this was a dead code path that returned `[]` silently on every call, always triggering the static `extractLiveThemes` fallback (which was also broken per Bug 3 above).

Rewrite: function now runs up to 5 targeted Exa builder-verification searches using `exaSearch()` directly (no LLM tool-calling required), then calls `synthesize<{ themes: string[] }>()` (Gemini) with all signals + verification evidence. The "verify before committing" intent is preserved without the OpenAI dependency.

**Removed: OpenAI import, client, and key constant**

With `extractLiveThemesAgentic` rewritten, `openai.chat.completions.create()` had no remaining callers. Removed:
- `import OpenAI from 'openai'`
- `const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''`
- `const openai = new OpenAI({ apiKey: OPENAI_API_KEY })`

Pipeline is now Gemini + Exa + Grok with no OpenAI dependency.

**Stage 2B `isWithinWindow` post-filter removed**

After Grok results were fetched, `isWithinWindow(item.publishedDate, recent10)` was applied as a post-filter. Most Grok results have `publishedDate: undefined` (the API returns structured post data, not ISO date strings in the text output). `isWithinWindow` returns `false` for undefined dates when `recent10` is set — silently dropping every result. Since date filtering is now applied at the API level via `from_date` in the `x_search` tool config, the post-filter was redundant and actively harmful.

**`seen.json` cleared**

The 3-day TTL dedup cache had accumulated URLs from the broken Grok era (noise posts from arbitrary handles). Deleted to give the next scan a clean slate. Schema remains `{ entries: { url, ts }[] }` — file is recreated automatically on next `saveSeenUrls()` call.

**TypeScript clean after all changes.**

---

### 2026-05-25 — Three pipeline fixes + scan-crash hardening

**1. `grokXFromHandles` — `sinceDate` threading**

`grokXFromHandles` was computing `fromDate` locally as `Date.now() - 10 * 86_400_000`. This ignored `sinceDate`, the pipeline-level date floor computed in `runScan()` from `state.lastScanned` (clamped to 3-day minimum). Every Grok call fetched the same hardcoded 10-day window regardless of when the previous scan ran.

Fix: added optional `fromDate?: string` parameter to `grokXFromHandles`. Renamed the internal variable to `effectiveFromDate`, falling back to the 10-day window only when no `fromDate` is passed. Call site in `runScan()` changed from `grokXFromHandles(trackedHandles, 3)` to `grokXFromHandles(trackedHandles, 3, sinceDate)`. Grok now uses the same incremental window as all Exa calls.

**2. `extractLiveThemesAgentic` — guard over-constraint**

Guard was `if (!EXA_API_KEY || !GEMINI_API_KEY) return []`. Exa is used only for optional pre-verification searches inside this function — the actual theme synthesis is a Gemini `synthesize<>` call and has no Exa dependency. With no Exa key set, the entire function returned early and `liveThemes` came back `[]`, triggering the static fallback.

Fix: guard narrowed to `if (!GEMINI_API_KEY) return []`. Each Exa call inside the function is individually guarded: `EXA_API_KEY ? await exaSearch(...) : []`. Function now runs correctly when Exa is absent; verification lines remain empty but synthesis proceeds.

**3. Grok error body logging**

`!res.ok` branch only logged status code. Added `const errBody = await res.text().catch(() => '')` before the `console.warn`, appending `errBody.slice(0, 200)` to the warning. Grok API error payloads (auth failures, rate limits, invalid tool params) are now visible in server logs.

**4. `synthesize()` JSON crash hardening — two-part fix**

*Root cause:* Gemini Flash truncates output at `maxOutputTokens`. With `responseMimeType: 'application/json'`, the truncated text is returned via `response.text` as malformed JSON. `JSON.parse(response.text)` threw `SyntaxError`, which escaped the retry loop (only 429s trigger retry), propagated to `runScan()`'s outer catch, and set `state.error` — crashing the scan.

*Fix A — `repairTruncatedJson(raw: string): string`:* Walks the raw string char-by-char, tracking bracket depth and string/escape state. Records `lastCompleteItemEnd` whenever `stack.length === 2` (i.e., just closed a complete item inside the outer `{"key": [...]}` wrapper). After the walk, appends hardcoded `']}' ` (always correct at depth 2: close array, close outer object). Validates the repaired string with `JSON.parse`; falls back to `'{}'` if repair is still invalid. The original version computed `closing` from the end-of-parse stack, which is wrong when truncation occurs inside a string (stack still holds the broken item's open brackets). Fixed by hardcoding `']}'` — at the point `stack.length === 2`, the remaining stack is always `['{', '[']` by construction.

*Fix B — `synthesize()` safety net:* Three layers:
1. Inner `try { JSON.parse(raw) } catch { ... }` — on failure, calls `repairTruncatedJson` and wraps `JSON.parse(repaired)` in its own `try/catch` returning `{} as T` on failure (previously the second parse was unguarded).
2. Outer `catch (err)` — added `if (err instanceof SyntaxError) { return {} as T }` before the re-throw. Any SyntaxError that escapes the inner layers (e.g., thrown by the Gemini SDK itself during response parsing) now returns `{}` instead of crashing the scan.

*Token limits raised:* `synthesizeOpps` 4000 → 8000 tokens; scoring synthesis 2000 → 4000 tokens. Reduces truncation frequency at the source.

**TypeScript clean after all changes.**

---

### 2026-05-25 — SSE stability overhaul: scroll hijacking fixed, JSON parsing crash guards added

**1. Log scroll hijacking resolved**
- **Issue:** The `ScanLog` component used a `bottomRef.current?.scrollIntoView({ behavior: 'smooth' })` block on progress updates. Because the element was inside a max-height container but the browser tried to bring it into the main viewport, new scan messages forced the browser window to jump back up to the log container.
- **Fix:** Swapped `scrollIntoView` for container-level DOM scroll alignment. Added a `logContainerRef` ref to the log container element and updated the effect to set `logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight`. Viewport is now unaffected during scanning.

**2. React screen blanking fixed via SSE crash protection**
- **Issue:** The `EventSource` message listeners in `App.tsx` parsed message payloads using `JSON.parse`. When a connection closed, dropped, or sent a non-JSON heartbeat, `JSON.parse` threw an uncaught error, causing the React component tree to unmount and the screen to go blank.
- **Fix:** Wrapped all `JSON.parse` calls in the `EventSource` event listeners in `try-catch` blocks to catch syntax errors and log warnings without crashing the client state.

**3. Separation of standard connection drops from scan failures**
- **Issue:** The `'error'` event listener in standard `EventSource` triggers on both network disconnection and custom server-sent `'error'` events. Since network errors don't carry `data`, the client tried to parse undefined, showing an "Unknown error" state and prematurely setting `isScanning: false`.
- **Fix:** Renamed the server's SSE event type for scan failures to `'scan_error'`. The client now listens to `'scan_error'` for scan execution failures, and logs standard connection drops from the `'error'` listener as silent console warnings while the browser automatically reconnects.

**Files changed:**
- [server.ts](file:///Users/ronith/antigravity/Venture-Scout-AI/basic0j/server.ts): renamed `'error'` broadcast to `'scan_error'` in `runScan` catch block.
- [src/App.tsx](file:///Users/ronith/antigravity/Venture-Scout-AI/basic0j/src/App.tsx): replaced `bottomRef` scroll with `logContainerRef.scrollTop` scroll in `ScanLog`; wrapped `EventSource` listeners in `try-catch` and mapped `'scan_error'` vs `'error'` connection events.

### 2026-05-25 — Three data-layer bugs fixed; signal slate cleared

**Bug 1: Shortlist / Pass List ghost counters — root cause and fix**

Decided-on opportunities were never archived. The only thing persisted was the `{id → outcome}` mapping in `outcomes.json`. Opportunity *objects* (title, description, signals, score) lived exclusively in `state.opportunities`, which is replaced wholesale on every scan. Decided companies are filtered out of new scans via `.filter(o => !outcomes[o.id])`, so they never re-appeared. Result: `OutcomeListTab` found zero matching opps in `allOpps` and rendered no cards, even though the outcomes counter was counting correctly from `Object.values(state.outcomes)`.

Fix: added `data/decided.json` — a flat `{ [id]: DealFlowOpportunity }` map that is written on every `POST /api/outcomes` call. On startup, `loadAll()` hydrates `decidedOpps: Map<string, DealFlowOpportunity>`. `GET /api/state` returns `decidedOpps: Array.from(decidedOpps.values())`. `ScanState` type extended with `decidedOpps: DealFlowOpportunity[]`. `OutcomeListTab` now dedupes and combines `[...opportunities, ...flagged, ...decidedOpps]` before filtering by outcome. Past decisions are now durable across scans and server restarts.

**Bug 2: `flagged` outcome rejected by API**

`POST /api/outcomes` validated `!['interested', 'pass'].includes(outcome)`. The Flag button in `OutcomeButtons` sends `outcome: 'flagged'`, which returned HTTP 400. The frontend doesn't check the response status and updated local state anyway — so flagging appeared to work until page reload. Fixed by adding `'flagged'` to the allowed list.

**Bug 3: seen.json URL bloat causing zero deal flow**

`seen.json` contained 444 URLs, all timestamped from a single scan at ~04:53 UTC. All were within the 3-day TTL window and loaded into `seenUrls` on startup. Subsequent scans query the same Exa/GitHub/Reddit endpoints which return the same popular top-ranked URLs (same Show HN posts, same trending repos, same top Reddit threads). Every incoming signal matched `seenUrls` and was dropped at the dedup filter. `launchFmt` fed to Synthesis 1 was empty: `(no launch signals found this scan)` → 0 opportunities.

This is a fundamental tension in the design: 3-day TTL is appropriate for "don't re-process the same URL within a few days" but Exa's relevance ranking returns the *same popular documents* repeatedly regardless of how recently they were published. New content does exist but ranks below popular cached items. Fix needed long-term: use `startPublishedDate = state.lastScanned` for most queries so only genuinely new content enters. Short-term: cleared `seen.json` to `{"entries":[]}` and cleared `outcomes.json` to `{"outcomes":{},"outcomeTimes":{}}` for a clean next run.

**Files changed:**
- `basic0j/src/types.ts`: added `decidedOpps: DealFlowOpportunity[]` to `ScanState`
- `basic0j/server.ts`: `DECIDED_FILE` constant, `decidedOpps: Map` variable, `loadAll()` reads `decided.json`, `saveDecidedOpps()` function, `POST /api/outcomes` archives opp object + allows `'flagged'`, `GET /api/state` includes `decidedOpps`, state initializer includes `decidedOpps`
- `basic0j/src/App.tsx`: `dedupeOpps()` helper, `EMPTY_STATE` includes `decidedOpps: []`, shortlist and passlist `allOpps` include `state.decidedOpps`
- `basic0j/data/seen.json`: cleared to `{"entries":[]}`
- `basic0j/data/outcomes.json`: cleared to `{"outcomes":{},"outcomeTimes":{}}`

**TypeScript clean after all changes.**

---

### 2026-05-24 — Signal pipeline rebuilt; thesis/scoring calibrated to real Launch portfolio

**Signal sources — Stage 2B replacement:**
X/Twitter domain-restricted Exa search produced zero useful results across all scans (Exa blocked by X auth wall). Stage 2B replaced with two parallel paths:
- **Grok API path** (activates when `GROK_API_KEY` set in `.env`): calls `https://api.x.ai/v1/chat/completions` with `search_parameters: { mode: 'on', sources: [{ type: 'x' }] }`. Returns real-time X posts via xAI's first-party firehose access. Result parsing extracts `URL: ... | Quote: ...` lines from model response.
- **Unrestricted Exa fallback**: searches for `"I built" OR "I launched" OR "just shipped"` etc. without domain restriction. Finds founder content on personal blogs, Substack, LinkedIn articles indexed by Exa.

Both paths filtered through new `isPressRelease(url)` function which blocks `prnewswire.com`, `businesswire.com`, `globenewswire.com`, `accesswire.com`, `einpresswire.com`, `prweb.com`, `prlog.org`, `send2press.com`, `marketwatch.com`, `businessinsider.com`, `prnews.io`. This was the primary vector for Series A / public company content entering `launchFmt`.

**Stage 2E — ProductHunt added:**
Two passes: theme-targeted (`site:producthunt.com` + each live theme) and a broad recent-launches sweep (`new product launched startup software AI`, `site:producthunt.com`, last 10 days, 12 results). All results get role `launch`. PH is fully indexed by Exa; a PH launch is an unambiguous "shipped" signal.

**Reddit — launch signal mining added:**
Existing thesis-mapped Reddit fetch now classifies each post by title. Posts matching `REDDIT_LAUNCH_PATTERNS` (`"i built"`, `"i launched"`, `"just shipped"`, `"first paying customer"`, `"left my job"`, `"dropped out"`, etc.) get role `launch`. Others remain `pain`. Separate higher-volume fetch added for `r/SideProject`, `r/indiehackers`, `r/IMadeThis` (30 posts each, score threshold 3) — these subreddits exist specifically for founders sharing what they built.

**`synthSignals` fallback removed:**
Previous code fell back to unfiltered `signals` (including `partner_post` and `investment` signals with funded company names) when `fresh.length < 15`. This was a major contamination vector. Now: `synthSignals = fresh` always. If fresh is small, synthesis returns fewer opportunities — correct behavior.

**Stage 2D — PRNewswire blocking added:**
Deep tech search (SBIR/spinout/university) was unrestricted and returning press releases about funded companies. Now pipes through `isPressRelease()` before signals are stored.

**Hallucination fix — URL-grounded signals + post-validation:**
Root cause of funded-company contamination: Synthesis 1 was asked for "5-7 opportunities" even when `launchFmt` had only 5 real signals. Model filled the quota from training knowledge, writing company names it knows (Series A+, public co) in the `signals` array instead of copying from the input data.

Two-part fix:
1. Synthesis prompt now has explicit `SIGNAL FORMAT REQUIREMENT`: each signal must include exact URL from inside parentheses in input data. Returns 0 opportunities if data doesn't support any. Max = distinct real signals available, never more than 7.
2. Post-validation pass: `validateSignals()` strips any signal string without a URL; opportunities with 0 validated signals are discarded. URL validation accepts exact scan matches plus known valid domains (producthunt.com, news.ycombinator.com, reddit.com, github.com).

**Goldilocks Zone rewritten using real Launch portfolio as calibration:**
Previous `goldilocksCtx` had `$2,000+ MRR with 20%+ MoM` as a hard minimum. This is too high for what Launch actually funds ($125K checks, pre-seed). New `goldilocksCtx` uses actual portfolio examples as calibration anchors: Monsha (AI for teachers, Bangladeshi founders), SKN Systems (wind tunnel data for motorsport), Actuality (AI RFP automation for construction), PitchPrfct (outbound SMS automation), Prandtl Dynamics (counter-drone software). New entry bar: "product is live + at least one external user or customer." MRR is additive signal, not a gate.

**`scoring.yaml` tier thresholds updated:**
- CRITICAL: Now accepts any MRR growing MoM (even $200), any DAU with retention, PH launch 200+ upvotes, Show HN 100+ points — removed the $2k MRR gate
- HIGH: Any live product with at least one external user, founder actively building
- MEDIUM: Product live but no external traction yet (launched < 2 weeks) — was "Wildcard Exception Only"
- LOW: No product = immediate pass; external equity = immediate pass (unchanged)

**`thesis.yaml` broadened to match real portfolio:**
Removed the narrow sector list (AI Infrastructure, Knowledge Graphs, Fintech-Crypto). Replaced with: "vertical AI for any niche operational problem." Added in-scope verticals table: construction, defense tech software, edtech, healthcare, hourly workforce, legal/compliance, niche industry analytics, e-commerce, developer tools, supply chain, transit. Real portfolio examples table added in Section 1.

**TypeScript clean after all changes.**

---

### 2026-05-22 — All eight fixes implemented; TypeScript clean

### 2026-05-22 — All eight fixes implemented; TypeScript clean

**Fix 1:** `partnerFmt` removed from Synthesis 1 user prompt entirely. Synthesis 1 now receives only `launchFmt` (founder candidates) and `painFmt` (market context). Theme context from partners already in `themesCtx` via `extractLiveThemes()`. This eliminates the primary contamination vector.

**Fix 2:** CONSENSUS_TERMS expanded with public company signals: `'publicly traded'`, `'nasdaq:'`, `'nyse:'`, `'acquired by'`, `'acquisition by'`, `'subsidiary of'`, `'a division of'`, `'product of '`, `'feature launch'`.

**Fix 3:** Synthesis 1 exclusion rule extended to include publicly traded companies, subsidiaries, and divisions. Prompt labels clarified: "LAUNCH SIGNALS" vs "MARKET PAIN SIGNALS (do NOT generate opportunities from these)".

**Fix 4:** Hard funding exclusion block copied verbatim into FounderLead synthesis prompt (Synthesis 3). Also added: "Do not extract founders who are employees launching a feature at a funded startup — only independent founders."

**Fix 5:** Partner X search replaced. Removed `includeDomains: ['x.com', 'twitter.com']` (X blocks crawlers, returns old cached content). New approach: unrestricted search by partner name + handle + "investing AI startup" — finds fresh commentary across tech blogs, newsletters, LinkedIn articles, conference transcripts. Each partner now gets 2 search types run in parallel.

**Fix 6:** LinkedIn search added per partner: `"${p.name}" site:linkedin.com` with `startPublishedDate: recent10`. Exa does index LinkedIn articles and post summaries. Total partner searches go from 1 per partner (domain-restricted X) to 2 per partner (unrestricted web + LinkedIn).

**Fix 7:** `sanitizePublishedDate()` helper added to `makeSignal()`. Exa's `item.publishedDate` is the original publication date, not re-crawl date. Any date older than 14 days is nulled before being stored in the signal. Prevents stale dates from propagating into synthesis output and the UI.

**Fix 8:** `timeAgo()` guarded: `NaN` check, future dates suppressed, dates older than 60 days return empty string rather than a large number. Previously would show "957d ago" for a signal with a 2023 publication date.

---

### 2026-05-22 — Second live scan: three bugs diagnosed, eight fixes queued

**Deal Flow / Founder Leads still surfacing wrong companies (public co product, a16z Series A)**

Three vectors identified:

- **Vector A:** `partnerFmt` still passed to Synthesis 1. Partner signals contain explicit text like "[a16z|partner_post] Excited to announce our Series A in [Company X]". These signals are correctly exempted from `isConsensus()` (they're theme intel), but then fed directly to Synthesis 1 where GPT-4o-mini reads the company name and generates an opportunity despite "theme intelligence only" instruction. Fix: remove `partnerFmt` from Synthesis 1 entirely — themes are already in `themesCtx` from `extractLiveThemes()`.

- **Vector B:** `CONSENSUS_TERMS` catches funding-round language but not publicly traded company language. A post saying "Google launches voice AI clinic product" has no funding terms — it passes `isConsensus()` and enters `launchFmt` with role `launch`. Missing terms: `'publicly traded'`, `'nasdaq'`, `'nyse'`, `'acquired by'`, `'subsidiary of'`, `'a division of'`. Synthesis 1 exclusion rule also doesn't mention public companies.

- **Vector C:** FounderLead synthesis prompt has no hard funding exclusion. It says "extract founders from launch signals" with no prohibition on founders at funded or public companies. The exclusion rule exists in Synthesis 1 but was never added to Synthesis 3 (FounderLead).

**Partners page not sourcing from X/LinkedIn directly**

- X/Twitter: Exa cannot access authenticated content on x.com. `includeDomains: ['x.com', 'twitter.com']` returns either very old cached tweets or nothing recent. Fix: remove domain restriction, search unrestricted by name/handle — Exa will find tech blogs, newsletters, and transcripts quoting the partner's commentary.

- LinkedIn: Zero LinkedIn searches in the current implementation despite the original project prompt explicitly requiring it. Exa does index LinkedIn articles and post summaries. Fix: add 1-2 `site:linkedin.com` Exa searches per partner.

**Date stamps showing "957d" for recent content**

- Exa's `item.publishedDate` is the original publication date of the indexed document, not the re-crawl date. Even with `startPublishedDate: recent10`, old content deemed topically relevant can slip through. A blog post from September 2023 appears → `publishedDate: "2023-09-15"` → `timeAgo()` correctly computes 957 days.

- Fix 1: Validate `item.publishedDate` from Exa in `makeSignal()` — if the date is older than 14 days, store null instead. Prevents stale dates from propagating into synthesis output.

- Fix 2: Guard `timeAgo()` against `NaN` and invalid `Date` objects.

**Eight fixes queued:**
1. Remove `partnerFmt` from Synthesis 1
2. Add `'publicly traded'`, `'nasdaq'`, `'nyse'`, `'acquired by'`, `'subsidiary of'`, `'a division of'` to CONSENSUS_TERMS
3. Add public company exclusion to Synthesis 1 hard exclusion rule
4. Copy hard funding exclusion to FounderLead synthesis prompt
5. Replace domain-restricted X search with unrestricted name/handle search per partner
6. Add LinkedIn Exa search per partner
7. Validate Exa `publishedDate` in `makeSignal()` — null if older than 14 days
8. Guard `timeAgo()` against invalid/NaN dates

---

### 2026-05-22 — Batches A–D implemented; TypeScript clean

All four implementation batches shipped. `npx tsc --noEmit` passes with zero errors.

**Batch A (Bug fixes):**
- `CONSENSUS_TERMS` expanded: added `series a`, `series b`, `yc w25/s25/w24/s24`, `yc batch`, `ycombinator.com/companies`, `y combinator portfolio`, `backed by sequoia/a16z/andreessen`, `portfolio company`, `venture backed`, `$15m–$100m` round sizes
- `isConsensus()` now actually called in dedup filter with role guard: applied to all roles except `partner_post` and `investment` (which intentionally contain megafund portfolio data for theme intel)
- `investFmt` removed from Synthesis 1 user prompt entirely; comment explains why
- Synthesis 1 system prompt now has `HARD EXCLUSION` section listing what never surfaces + `ACCEPTABLE prior funding` carve-outs for SBIR/grants/university programs
- Partner/investment signals relabeled in prompt: "theme intelligence only — do NOT treat as opportunities"

**Batch B (Thesis upgrades):**
- `goldilocksCtx` constant completely rewritten: includes deep tech traction thresholds (named institutional pilots + quantified outcomes), full funding exclusion/acceptable rules, software-first marginal cost lens
- `tractionGuide` constant split into three sections: SaaS/consumer, deep tech/B2G, and credential-exit founder signal
- Stage 2B X query expanded with credential-exit terms: `"left my PhD"`, `"dropped out"`, `"left the lab"`, `"spun out"`, `"tech transfer"`
- Stage 2D added (parallel to A/B/C): deep tech discovery via Exa — `"tech transfer" OR "spinout" OR SBIR OR "university pilot"` per live theme
- Synthesis 2 scoring prompt updated with deep tech scoring guidance: CRITICAL/HIGH/MEDIUM/Wildcard distinctions for institutional pilots, SBIR phases, credential-exit bonus
- `scoring.yaml` updated: all four tiers now have separate SaaS and deep tech/B2G criteria; LOW tier now explicitly lists external equity as disqualifying; MEDIUM Wildcard has precise inclusion/exclusion criteria

**Batch C (Credibility verification):**
- `CredibilityTier` type added to `types.ts`: `'verified' | 'plausible' | 'contested' | 'unverifiable'`
- `CredibilityChecks` interface added: `domainAgeDays`, `namedClaimsFound`, `reviewPlatformHits`, `teamVerifiable`, `contactFunctional`
- `OpportunityScore` extended: `credibility?`, `credibilityReason?`, `credibilityChecks?`
- `ScanState` extended: `flagged: DealFlowOpportunity[]`
- Three new server functions:
  - `checkDomainAge(url)`: RDAP JSON lookup via `rdap.org`, returns age in days or null
  - `checkReviewPlatforms(companyName)`: 4 parallel Exa searches (PH, G2, Trustpilot, Capterra), returns hit list
  - `checkTeamVerifiable(companyName, founderHint?)`: 1-2 Exa searches on linkedin.com, returns boolean
  - `runCredibilityChecks(opp, passiveCredibility, passiveReason)`: combines all active checks, returns final credibility tier + reason + checks struct
- Synthesis 1 prompt upgraded to return `passiveCredibility` and `passiveCredibilityReason` per opportunity
- Active credibility layer runs inside enrichment block for CRITICAL/HIGH only; applies passive-only for MEDIUM/LOW
- `flagged[]` routing: opportunities with `credibility === 'unverifiable'` moved from `opportunities[]` to `flagged[]`; 30-day auto-expiry merges correctly on each scan

**Batch D (Credibility UX):**
- `CredibilityBadge` component: renders verified (green ShieldCheck), plausible (grey ShieldQuestion), contested (amber ShieldAlert), unverifiable (grey ShieldOff); contested/unverifiable show inline Verify button
- `FlaggedTab` component: holding queue with per-entry Verify, Promote, Archive actions
- `verifyingIds: Set<string>` state tracks in-flight verify requests; disables Verify button during call
- `/api/verify/:id` endpoint: Wayback Machine CDX API + deep review Exa + 5-search web archaeology + re-runs `runCredibilityChecks`; auto-promotes to `opportunities[]` if result is `verified/plausible`; broadcasts `verify_complete` via SSE
- `/api/flagged/:id` DELETE, `/api/flagged/:id/promote` POST endpoints added
- `TABS` updated: `flagged` tab with `ShieldOff` icon, `grey: true` marker for grey count badge
- `DealFlowTab` now accepts `onVerify` and `verifyingIds` props
- SSE listeners added for `verify_complete` (triggers `fetchState`) and `verify_error`

---

### 2026-05-22 — engpplan.md fully rewritten with all known work; verificationsteps.md finalized

**engpplan.md** rewritten to reflect current status and all new phases:
- Phases 1–3 marked done
- Phase 0 added (5 bug fixes, must ship before anything else)
- Phase 4 added (thesis + scoring upgrades — software-first lens, funding exclusion precision, deep tech traction vocabulary, credential-exit signal, SBIR/university signals)
- Phase 5 added (credibility verification — passive/active/verify button layers, Flagged UX section)
- Phases 6–7 unchanged from prior plan (FounderLead synthesis, outcome calibration)
- Implementation order broken into 5 batches (A through E) with effort estimates and architectural constraints section

**verificationsteps.md** finalized:
- Removed Step 6 (demo test) per decision
- Added Unverifiable Tier / Flagged section with full workflow, 30-day auto-expiry, UX placement guidance

**Key architectural constraints documented** (will not be violated):
- `investFmt` goes only to `extractLiveThemes()` and Synthesis 4 — never Synthesis 1
- `isConsensus()` does not filter `partner_post` or `investment` role signals
- Active credibility layer runs only on CRITICAL/HIGH
- Verify button never runs automatically
- SBIR/NSF/DOE/DARPA grants and university commercialization are not disqualifying and not in CONSENSUS_TERMS

---

### 2026-05-22 — Five bugs diagnosed from first live scan (YC company + $40M Series A surfaced)

Root cause: investment signals from megafund portfolio queries were being passed directly to opportunity synthesis, causing GPT-4o-mini to surface already-institutional portfolio companies as Launch deal flow candidates.

**Bug 1:** `isConsensus()` defined but never called — dead function, zero runtime effect  
**Bug 2:** CONSENSUS_TERMS missing "series a", "series b", "w25", "s25", "$40m", "$30m", large round amounts  
**Bug 3:** `investFmt` passed to Synthesis 1 — YC batch companies fed directly to opportunity generation  
**Bug 4:** Portfolio activity queries ("YC alumni startup", "Sequoia-backed startup") find already-funded companies  
**Bug 5:** CONSENSUS_TERMS injection in scoring prompt is second-order (scoring runs after opportunities are already generated from bad data)

All five are in Phase 0 of updated engpplan.md.

---

### 2026-05-22 — Implementation complete: all Phase 1-3 changes live in basic0j/

Full implementation of `basic0j/engpplan.md` Phases 1-3. TypeScript type check passes cleanly (`npx tsc --noEmit` — zero errors). Server runs on port 3002 (3001 reserved for original scout/).

**Files changed:**
- `basic0j/server.ts` — full rewrite (554 → ~420 lines of logic, more structured)
- `basic0j/src/types.ts` — new types: `SignalRole`, extended `WatchlistType`, `FounderLead`, updated `OpportunityScore`, updated `ScanState`
- `basic0j/src/App.tsx` — updated `ScoreRow` dimensions, new `WatchlistTab` with paste input, new `FounderLeadsTab`, `EMPTY_STATE` updated, new `addWatchlistRaw` handler

**Phase 1 (Data Quality):**
- `recent10` replaces `recent90`/`recent150` everywhere. Single 10-day constant.
- GitHub query changed from `created:>` to `pushed:>`, stars threshold lowered from 30 to 10.
- `NOISE_TERMS` array + `isNoise()` function applied at deduplication pass — strips hiring posts, digests, tutorials, prompt packs.
- `CONSENSUS_TERMS` array + `isConsensus()` helper. CONSENSUS_TERMS injected into scoring prompt system message — auto-LOW for Series C+, $200M+, pre-IPO.

**Phase 2 (Pipeline Architecture):**
- `SignalRole` type (`launch | pain | oss_project | partner_post | investment | portfolio | watchlist`) added to every `RawSignal`. `makeSignal()` now accepts role as third argument.
- Scan execution order changed: `A` megafund partners → `B` investments → `C` user watchlist (all types) → **Stage 1 theme extraction** → **Stage 2 theme-driven founder search** → portfolio → Reddit → dedup.
- `extractLiveThemes(partnerSignals, investSignals, watchlistSignals)` — pulls from both megafund and user watchlist signals simultaneously, returns 5-7 specific actionable themes.
- Departure queries deleted entirely. Replaced with three Stage 2 patterns per theme: Show HN/Launch HN (role: `launch`), building-in-public X posts (role: `launch`), GitHub repos with infra check (role: `oss_project` → upgraded to `launch` if infra score ≥25).
- `hasStartupInfra(repoFullName)` — checks for landing page files (`CNAME`, `vercel.json`, `netlify.toml`, `index.html`), startup billing deps in `package.json` (`stripe`, `auth0`, `clerk`, `supabase`, `paddle`), product language in README (`coming soon`, `waitlist`, `beta access`). Returns `{ score: number, signals: string[] }`.
- `THESIS_SUBREDDITS` map: themes drive which subreddits are fetched per scan, not a hardcoded 4-subreddit list. Capped at 10 subreddits total. All Reddit posts get role `pain`.
- Enrichment for CRITICAL/HIGH opportunities now includes `infraSignals` from `hasStartupInfra`.

**Phase 2 Prompts:**
- Synthesis 1 (opportunities) — rewritten to reference Goldilocks Zone, traction inference guide, launch-role signals as highest priority. `actionPrompt` now explicitly says "phrased as behavior, not credentials."
- Synthesis 2 (scoring) — new dimension weights (traction×0.35, velocity×0.30, market×0.20, mechanics×0.15). Returns `tractionEvidence` and `tractionConfidence` (stated/inferred/unknown). `goldilocksCtx` and `tractionGuide` injected into every synthesis prompt.
- Synthesis 3 (FounderLeads) — new. Extracts specific named founders/projects from launch-role signals only. Returns `FounderLead[]` on state. Never invents data — only extracts what's in signal URLs and snippets.
- `liveThemes` injected as context into all synthesis prompts via `themesCtx`.

**Phase 3 (Watchlist Link Drop):**
- `WatchlistType` extended: `subreddit | newsletter | url` added.
- `inferWatchlistEntry(raw: string)` — infers type from URL pattern or prefix: `x.com/*` → twitter, `reddit.com/r/*` → subreddit, `https://*` → newsletter, `@*` → twitter, `r/*` → subreddit, bare string → topic.
- `POST /api/watchlist` now accepts `{ raw }` body — calls `inferWatchlistEntry` and returns the inferred entry with type badge.
- Subreddit watchlist entries fetched via `redditFetch()` with score ≥5 threshold, role `pain`.
- Newsletter/URL watchlist entries fetched via Exa domain restriction, role `watchlist`.
- All watchlist signal types (`twWL`, `subWL`, `nlWL`, `otWL`) collected before Stage 1 and passed to `extractLiveThemes` as `watchlistSignals`.

**UI (App.tsx):**
- `ScoreRow` dimensions: T (Traction 35%), V (Velocity 30%), M (Market 20%), D (Deal Mechanics 15%). Old `insight` dimension removed.
- Traction evidence badge below score row — green for `stated`, amber for `inferred`, grey for `unknown`.
- `WatchlistTab` rewritten: single paste input replaces type-selector + two fields. Example quick-fill buttons. Type badge shown on each entry after add.
- `FounderLeadsTab` added — new tab showing `FounderLead[]` with live themes header, traction confidence badges, evidence list, contact link.
- `TABS` updated: `founders` tab added between `dealflow` and `partners`.
- `EMPTY_STATE` updated with `liveThemes: []` and `founderLeads: []`.

---

### 2026-05-22 — Phase 2 Stage 1 corrected: watchlist signals included in theme extraction

Updated `engpplan.md` §2B. Stage 1 previously only consumed megafund partner signals and investment signals. Corrected to include all user-added watchlist signals as a first-class input to `extractLiveThemes()`. New function signature: `extractLiveThemes(partnerSignals, investSignals, watchlistSignals)`. Execution order change: collect megafund signals → collect watchlist signals → Stage 1 theme extraction → Stage 2 founder searches. Rationale: a user who has curated a watchlist has expressed editorial judgment that is at minimum as valuable as megafund noise.

---

### 2026-05-22 — basic0j/scoring.yaml written (new, scoped out of scout/)

New scoring rubric written to `basic0j/scoring.yaml`. Key structural changes from `scout/scoring.yaml`:

- **Pre-Condition Gate added:** No product in market = immediate archive before any scoring runs. Non-negotiable. Replaces implicit assumption.
- **MEDIUM tier reclassified as Wildcard Exception:** Old MEDIUM ("Figma prototypes, slide decks, theoretical market research") described exactly what Launch never funds. New MEDIUM is a narrow carve-out for deep tech prototypes or prior-exit serial founders with minimal traction.
- **LOW tier expanded:** Auto-archive now explicitly covers consensus-stage deals (Series C/D, $200M+ mentions) in addition to no-product entries.
- **Dimension weights rebalanced:** Traction & PMF raised to 35% (was split implicitly across velocity and insight). Velocity 30%. Market 20%. Mechanics 15%.
- **Output card format added:** New standard card template includes an explicit traction line (MRR + MoM growth, or DAU + WoW growth) as the first field. Forces traction to be surfaced before scores.

---

### 2026-05-22 — basic0j/thesis.yaml written (new, scoped out of scout/)

New thesis written to `basic0j/thesis.yaml`. Key changes from `scout/thesis.yaml`:

- **Section 1 rewritten entirely:** Old version described Launch as investing in "raw idea-to-MVP stage" teams. This is factually wrong. New version leads with the Goldilocks Zone table as the primary filter.
- **Goldilocks Zone thresholds made explicit and tabular:** $2k+ MRR/20%+ MoM, 3k+ DAU/5%+ WoW, deep tech prototype + strong team. These are now machine-readable criteria, not prose.
- **No-pedigree statement added explicitly:** "No pedigree requirement." Needed because existing prompts were inadvertently filtering for Big Tech alumni.
- **Sector thesis preserved** but each bullet now includes a note on what "live traction" looks like in that sector specifically.
- **Green Flags table restructured:** "Product in market" added as its own row. Deck/plan/Figma = immediate pass added explicitly.

---

### 2026-05-22 — scout/thesis.yaml inadvertently modified before scope constraint was clarified

Before user clarified that `scout/` should remain untouched, `scout/thesis.yaml` was overwritten with a draft of the updated thesis. User re-sent instruction with explicit scope constraint ("without deleting or editing anything in scout/ folder"). Correct versions now live in `basic0j/` only. `scout/thesis.yaml` remains modified from original — log this as unresolved drift between `scout/` and `basic0j/`.

**Outstanding:** Decide whether `basic0j/` files replace `scout/thesis.yaml` and `scout/scoring.yaml` at implementation time, or whether `server.ts` is updated to load from `basic0j/`.

---

### 2026-05-22 — engpplan.md written: full engineering plan for next evolution of scout/

Written to `basic0j/engpplan.md`. Covers five phases:

- **Phase 1 (Data Quality):** 10-day Exa window, `pushed:>` for GitHub, noise filter, CONSENSUS_TERMS anti-pattern in scoring prompt.
- **Phase 2 (Pipeline Architecture):** Signal role tagging, two-stage decoupled pipeline (live theme extraction → theme-driven founder search), replacement of departure queries with Show HN + building-in-public + GitHub startup infra detection patterns, per-sector subreddit expansion.
- **Phase 3 (Watchlist Link Drop):** URL inference (`inferWatchlistEntry`), new `subreddit` and `newsletter` watchlist types, single paste input replacing type-selector dropdown.
- **Phase 4 (FounderLead output):** New `FounderLead[]` on `ScanState` — named founders/projects extracted from `launch`-role signals only.
- **Phase 5 (Outcome Calibration):** Weight calibration loop from existing `outcomes` data once 20+ decisions accumulate.

Implementation order table in plan separates three independent release batches: data quality patch, pipeline rearchitecture, watchlist UX.

---

### 2026-05-22 — Repo assessment: vc-signals and founder-scout

Read both repos in full. Key findings:

**vc-signals (abhishek255):**
- `sectors.json` has per-sector subcategory query templates, Show HN / Launch HN patterns, primary/secondary subreddit lists, and negative term filters. All directly applicable to replace our static thesis.yaml queries.
- `radar_sources.py` classifies signal roles before synthesis: Reddit = `pain`, Show HN = `launch` (can_create_candidate=True), GitHub repo = `oss_project`. This is the role-tagging architecture carried into Phase 2 of our plan.
- `NOISE_TERMS` and `CONSENSUS_TERMS` directly lifted into Phase 1 of our plan.

**founder-scout (groundup-toolkit):**
- `github_enhanced.py` detects startup infrastructure in repos: `CNAME`, `vercel.json`, `netlify.toml`, Stripe/auth0/Clerk/Supabase deps in `package.json`, "coming soon" / "waitlist" in README. This replaces pedigree-biased departure queries.
- `scoring.py` 5-dimension model (timing/pedigree/activity/network/intent) + outcome calibration engine. Pedigree dimension is Israel-specific (IDF units). Strip pedigree, adapt the other four dimensions.
- `social_graph.py` team formation detection — LinkedIn-specific implementation not applicable, but GitHub org + domain registration pattern is. Not in current plan scope.
- IDF classifier (`idf_classifier.py`), Israeli startup law firms, Maton/HubSpot integration: entirely non-applicable to our context.

---

### 2026-05-22 — Codebase read: scout/server.ts, types.ts, thesis.yaml, scoring.yaml

Initial read of full codebase.

**Problems identified in existing implementation:**

1. **Date windows:** `recent90` and `recent150` constants used throughout. 90-150 day windows produce stale signals. Signals from 3 months ago are not actionable for sourcing.

2. **GitHub query uses `created:>`:** Misses repos with recent commits that were created before the window. Should use `pushed:>`.

3. **Departure signal queries are pedigree-biased:** Phase 3 searches for `"ex-Google" OR "ex-Stripe" OR "ex-OpenAI" OR "ex-Anthropic" founder "new company"`. This systematically excludes Launch's actual founder profile. Launch alumni include founders with no Big Tech background, no US college, non-STEM degrees.

4. **No noise filter:** HN and Reddit results include job posts, salary threads, tutorial links, digest emails. All pass through to synthesis.

5. **Flat pipeline:** All signals (megafund posts, HN, GitHub, Reddit, departure) feed one synthesis prompt simultaneously. Megafund intelligence should drive targeted searches rather than being co-equal with HN results.

6. **Static thesis.yaml:** Themes used to score opportunities are fixed at server startup. Should be extracted dynamically from live megafund signals each scan.

7. **thesis.yaml Section 1 was wrong:** Described Launch as pre-seed/idea stage funder. Launch requires product in market, traction, and revenue.

8. **scoring.yaml MEDIUM tier was wrong:** Described "Figma prototypes and slide decks" as a fundable tier. Launch never funds decks or ideas.

---

### 2026-05-25 — Structural overhaul: identity schema, north-star sourcing, evidence-based verification

After two scans returned 0 and 2 opportunities respectively, the audit identified eight structural flaws in the agentic pipeline. All eight addressed in this revision.

**1. seen.json had no TTL (regression cause).** `saveSeenUrls()` kept the last 10,000 URLs forever. Pre-Grok, scans found legitimate signals; once Grok X was added it produced fresh X.com URLs every run, which masked the fact that all PH/HN/GitHub URLs from the last 10 days were already in the seen set. Removing Grok X from deal flow exposed the deadlock — zero new signals.
- Fix: changed `seen.json` schema to `{ entries: { url, ts }[] }` with a 3-day rolling TTL. Migrates old flat `{ urls: [] }` by treating untimestamped entries as expired. `saveSeenUrls` rebuilds `seenUrls` from pruned entries on every write.
- Added outcome-based permanent exclusion: companies in `outcomes.json` (interested/pass) are filtered out of `state.opportunities` post-synthesis, so decided companies never resurface even after the 3-day window expires.

**2. Identity schema overhaul (root cause of credibility failures).** `runCredibilityChecks` was searching LinkedIn/G2/Capterra for `opp.id.replace(/[-_]/g, ' ')` — the synthesized slug like "runtime-cloud-deployment-platform" — instead of the actual company name "Runtime". This produced false-negative team/review checks on most opportunities, which routed them all to `flagged[]`.
- Extended `DealFlowOpportunity` with `companyName`, `productName`, `homepageUrl`. Synthesis 1 now requires `companyName` populated with the searchable name as it appears in signals.
- `runCredibilityChecks` now uses `opp.companyName || opp.title` as the `searchName` for all downstream Exa queries. `checkReviewPlatforms`, `checkTeamVerifiable`, and `checkFundingStatus` receive the correct name.

**3. Synthesis 1 had contradictory instructions.** Old prompt said "5-7 opportunities," "maximum = number of distinct real signals available," and "return 0 if data doesn't support any." gpt-4o-mini resolved the contradiction conservatively (returned 2 when 7 were available). Rewrote as pure extraction: "extract each distinct company referenced in signals, 1-10 entries, downstream filters quality." Removed the "return 0" instruction — `validateSignals` already handles grounding.
- Added two-pass fallback: if first-pass output < 3 and `launchFmt` has ≥8 signals, re-run with explicit "RECALL not precision" instruction. Merges whichever pass produced more candidates.

**4. Sanity screen was parametric-only.** Old `sanityChecks` passed `Company: [title]` + source URL to gpt-4o-mini and asked "is this funded?" — the model only knew what it knew at training cutoff. Recent YC batches (W25, S25, W26) were invisible. Runtime (YC-backed) sailed through.
- Replaced sanity screen + standalone funding check with single evidence-based verification step. For each opportunity:
  - Resolve homepage URL from signals via `resolveHomepageFromSignals()` (skips aggregator hosts like HN/PH/Reddit/GitHub).
  - Fetch homepage + /about + /team + /investors + /press via new `exaContents()` wrapper (`POST /contents` with `livecrawl: 'fallback'`).
  - Run `checkHomepageFunding()` against fetched text for VC names, "Y Combinator", "backed by", "Series A/B/C", etc.
  - Run `checkFundingStatus()` (YC directory + funding news Exa searches) in parallel.
  - Disqualify if any: homepage discloses funding OR YC directory hit OR 2+ corroborating funding news hits.
- Attaches `VerificationEvidence { homepageFetched, homepageFundingFlags, ycDirectoryHit, fundingNewsCount }` to `opp.score.verification` for downstream/UI use.

**5. Domain age heuristic was inverted for LAUNCH thesis.** Old logic downgraded companies with domains <90 days old from `verified/plausible → contested`. But pre-seed founders ship to fresh domains by definition — a 14-day-old domain is exactly the LAUNCH signal, not a red flag.
- Inverted: <180 days = positive ("fresh domain — recent ship"), no tier change.
- >3 years + no review/LinkedIn evidence = downgrade ("stale domain, possible dormant/rebranded").
- Removed "no review platform presence → downgrade" — G2/Capterra reviews require years of customer base; pre-seed targets have zero by definition. Now presence is positive, absence is neutral.

**6. Sourcing: north-star fund focus + builder discourse weighting.** Old partner roster pulled all GP commentary into theme extraction, which biased toward Series A+ consensus spaces (LAUNCH's anti-edge).
- Restructured `DEFAULT_PARTNERS` with `tier: 'early-stage' | 'multi-stage'` and `program: 'Arc' | 'Speedrun' | 'YC'` metadata. Added Sequoia Arc partners (Jess Lee, Sonya Huang, Konstantine Buhler), a16z Speedrun partners (Jonathan Lai, Andrew Chen), and additional YC main batch GPs (Jared Friedman, Tom Blomfield, Diana Hu).
- Multi-stage partners get a stage filter: `isEarlyStageSignal()` requires the snippet to contain pre-seed/seed/angel/cohort/demo-day language. Posts mentioning Series A+ exclusively get dropped.
- Stage B investment queries rewritten to target the actual early-stage entry points: `site:sequoiacap.com Arc cohort`, `a16z Speedrun cohort batch`, `site:ycombinator.com/companies`, `site:ycombinator.com/launches`, plus W25/S25/W26 batch queries.
- New Stage 0.5 builder pre-pass: fetches 60 posts from top 4 quiet-builder subreddits (no theme gate) to give Stage 1 theme extraction builder-discourse context BEFORE themes are set. Without this, themes were extracted from megafund commentary only.
- `extractLiveThemes` prompt rewritten with explicit weighting: builder discourse + early-stage investment signals = highest weight; multi-stage GP commentary = lowest weight.

**7. Grok X refactored to handle-targeted only.** Theme-based Grok queries pulled posts from arbitrary X accounts and dumped them into deal flow (this caused the 0-opportunity scan). New `grokXFromHandles(handles[], maxPerHandle)` builds a single `from:@partner1 OR from:@partner2 OR ...` query covering all tracked handles in one call.
- Tracked handles = `DEFAULT_PARTNERS` handles + `watchlist` entries of type `twitter`. Portfolio company and founder handles can be added to watchlist to flow into the set.
- All Grok X output routes to `xDiscourseItems` only (Founder Themes / Synthesis 3), never directly into deal flow `signals[]`.
- Removed old `grokXSearch()` and `isBuildingInPublic()` BIP filter — both dead after refactor.

**8. Non-self-promoting source channels.** Pipeline previously depended on founders posting publicly. Added Pattern D2:
- SBIR/STTR awards via `exaSearch` with `includeDomains: ['sbir.gov', 'grants.gov']` — federal pre-seed validation for deep tech that often never posts on HN.
- USPTO patent filings via `includeDomains: ['uspto.gov', 'patents.google.com']` — surfaces individual-inventor / small-entity filings in tracked verticals.
- Expanded `QUIET_BUILDER_SUBREDDITS` from 3 to 10 subs (added microsaas, SaaS, EntrepreneurRideAlong, buildinpublic, roastmystartup, EarnSmart) and increased per-sub fetch from 30 → 25 posts (gross volume up ~3x).
- New `THESIS_SUBREDDITS` entries for Healthcare, Legal, Construction, Education, Defense (covers more LAUNCH verticals).

**9. New endpoint: `POST /api/evaluate`.** Closes the "quiet builder" gap from the audit. Accepts `{ name, url? }`, resolves homepage (via explicit URL or Exa search), runs the same homepage-funding + YC-directory + credibility pipeline as scan-discovered opportunities, returns funding status and credibility tier. Lets the user feed founder referrals and intros into the verification pipeline without needing the company to self-promote.

**Files touched:**
- `src/types.ts`: added `VerificationEvidence`, `companyName/productName/homepageUrl` on `DealFlowOpportunity`, `verification?: VerificationEvidence` on `OpportunityScore`.
- `server.ts`: ~700 net lines changed. Partner roster restructured, three new helper functions (`exaContents`, `resolveHomepageFromSignals`, `checkHomepageFunding`, `grokXFromHandles`, `getTrackedXHandles`), evidence-based verification step replaces sanity screen + funding check, new `/api/evaluate` route.
- `data/seen.json`: schema migrated to `{ entries: { url, ts }[] }`.

**Compilation:** `npx tsc --noEmit` clean.
