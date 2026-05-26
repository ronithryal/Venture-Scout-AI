# Deal Flow Preservation Logic

## Overview
Companies in Deal Flow that have no outcome decision (Interested/Pass/Flag) now persist across scan runs. This prevents undecided companies from disappearing when they're not found in a subsequent scan.

## How It Works

### 1. On App Initialization
When the app starts, the `restoreUntouchedCompanies()` function:
- Scans all saved companies: opportunities, flagged, and decidedOpps
- Identifies companies with NO outcome decision recorded
- Restores them to the opportunities array in Deal Flow
- Logs: `[init] Restored {n} undecided companies to deal flow`

### 2. During Scan Start
When a new scan begins:
- Before scanning starts, all current deal flow opportunities are checked
- Companies with NO outcome (`!outcomes[opp.id]`) are preserved in memory
- Logs: `Preserving {n} undecided companies for next scan...`

### 3. After Scan Completes
Once new opportunities are extracted and verified:
- New scan results are finalized (extraction → verification → scoring)
- Flagged (unverifiable) companies are separated out
- Preserved untouched companies are merged back:
  - Only restore companies NOT found in the new scan
  - Avoids duplicates (companies found in new scan aren't re-added)
- Logs: `→ restored {n} undecided companies from previous scans`

## Result
- **Before**: Companies disappeared if not in new scan + no action taken
- **After**: Undecided companies remain visible until user takes action
- Deal Flow tab shows all:
  - New scan results
  - Companies from previous scans (no action taken)
  - Companies found by newer scan + preserved = no duplicates

## Edge Cases Handled
1. **Same company in old + new scan**: Only appears once (new version takes precedence)
2. **Company marked interested/pass/flagged**: Never preserved (user has decided)
3. **App restart**: Untouched companies restored from database immediately
4. **Multiple scans in sequence**: Each scan preserves → restores cycle maintains continuity
