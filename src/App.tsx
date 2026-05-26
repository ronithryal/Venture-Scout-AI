import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Telescope, RefreshCw, TrendingUp, Users, BarChart3,
  Target, ExternalLink, ChevronRight, ArrowUpRight, Plus, X,
  CheckCircle2, AlertCircle, Clock, Zap, Twitter, Building2,
  User, Hash, Loader2, Activity, GitFork, MessageSquare, ShieldCheck,
  ShieldAlert, ShieldQuestion, ShieldOff, Search, Bookmark, Archive, Flag,
  Pin, Database, ChevronDown,
} from 'lucide-react';
import type {
  ScanState, DealFlowOpportunity, FounderTheme, PartnerSummary,
  Theme, StoredTheme, Firm, WatchlistEntry, WatchlistType, OutcomeTier, SignalTier,
  OpportunityScore, OpportunityEnrichment, CredibilityTier, CredibilityChecks,
} from './types';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const FIRM: Record<Firm, { label: string; dot: string; badge: string; text: string }> = {
  Sequoia: { label: 'Sequoia', dot: 'bg-emerald-400', badge: 'bg-emerald-950 border-emerald-800 text-emerald-300', text: 'text-emerald-300' },
  a16z:    { label: 'a16z',    dot: 'bg-violet-400',  badge: 'bg-violet-950 border-violet-800 text-violet-300',   text: 'text-violet-300'  },
  YC:      { label: 'YC',      dot: 'bg-orange-400',  badge: 'bg-orange-950 border-orange-800 text-orange-300',   text: 'text-orange-300'  },
  Custom:  { label: 'Custom',  dot: 'bg-zinc-400',    badge: 'bg-zinc-900 border-zinc-700 text-zinc-400',         text: 'text-zinc-400'    },
};

const MOMENTUM: Record<string, { label: string; cls: string }> = {
  accelerating: { label: 'Accelerating', cls: 'bg-emerald-950 border-emerald-700 text-emerald-300' },
  emerging:     { label: 'Emerging',     cls: 'bg-amber-950 border-amber-700 text-amber-300' },
  established:  { label: 'Established',  cls: 'bg-sky-950 border-sky-700 text-sky-300' },
  rising:       { label: 'Rising',       cls: 'bg-emerald-950 border-emerald-700 text-emerald-300' },
  stable:       { label: 'Stable',       cls: 'bg-zinc-900 border-zinc-700 text-zinc-400' },
};

const TIER: Record<SignalTier, { label: string; border: string; headerBg: string; badge: string }> = {
  CRITICAL: { label: '🚨 Critical', border: 'border-red-700/60',   headerBg: 'bg-red-950/30',   badge: 'bg-red-950 border-red-800 text-red-300' },
  HIGH:     { label: '📈 High',     border: 'border-amber-700/50', headerBg: 'bg-amber-950/20', badge: 'bg-amber-950 border-amber-800 text-amber-300' },
  MEDIUM:   { label: '⏳ Medium',   border: 'border-blue-800/40',  headerBg: '',                badge: 'bg-blue-950 border-blue-800 text-blue-300' },
  LOW:      { label: '🛑 Low',      border: 'border-zinc-800',     headerBg: '',                badge: 'bg-zinc-900 border-zinc-700 text-zinc-500' },
};

function normalizeTier(raw?: string): SignalTier {
  if (!raw) return 'MEDIUM';
  const upper = raw.toUpperCase();
  if (upper.includes('CRITICAL')) return 'CRITICAL';
  if (upper.includes('HIGH'))     return 'HIGH';
  if (upper.includes('LOW'))      return 'LOW';
  if (upper.includes('MEDIUM'))   return 'MEDIUM';
  return 'MEDIUM';
}

function TierBadge({ tier }: { tier: SignalTier }) {
  const t = TIER[normalizeTier(tier)];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${t.badge}`}>{t.label}</span>;
}

const CRED: Record<CredibilityTier, { label: string; cls: string; Icon: any }> = {
  verified:      { label: 'Verified',      cls: 'bg-emerald-950 border-emerald-800 text-emerald-400', Icon: ShieldCheck },
  plausible:     { label: 'Plausible',     cls: 'bg-zinc-900 border-zinc-700 text-zinc-400',          Icon: ShieldQuestion },
  contested:     { label: 'Contested',     cls: 'bg-amber-950 border-amber-800 text-amber-400',       Icon: ShieldAlert },
  unverifiable:  { label: 'Unverifiable',  cls: 'bg-zinc-900 border-zinc-800 text-zinc-600',          Icon: ShieldOff },
};

function CredibilityBadge({ credibility, reason, onVerify, verifying }: {
  credibility: CredibilityTier;
  reason?: string;
  onVerify?: () => void;
  verifying?: boolean;
}) {
  const c = CRED[credibility];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${c.cls}`} title={reason}>
        <c.Icon className="w-3 h-3" />
        {c.label}
        {reason && <span className="text-[10px] opacity-70 max-w-48 truncate">{reason}</span>}
      </span>
      {(credibility === 'contested' || credibility === 'unverifiable') && onVerify && (
        <button
          onClick={onVerify}
          disabled={verifying}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
        >
          {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          {verifying ? 'Verifying...' : 'Verify'}
        </button>
      )}
    </div>
  );
}

function ScoreRow({ score }: { score: OpportunityScore }) {
  const dims = [
    { k: 'T', v: score.traction,  title: 'Traction & PMF (35%) — anchored to Goldilocks Zone' },
    { k: 'V', v: score.velocity,  title: 'Velocity & Agency (30%)' },
    { k: 'M', v: score.market,    title: 'Market Potential (20%)' },
    { k: 'D', v: score.mechanics, title: 'Deal Mechanics (15%)' },
  ];
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/40 text-xs">
      <span className="font-bold text-zinc-100 tabular-nums">{score.composite.toFixed(1)}<span className="text-zinc-600 font-normal">/5</span></span>
      <div className="w-px h-3 bg-zinc-700" />
      {dims.map(({ k, v, title }) => (
        <span key={k} title={title} className="flex items-center gap-1 text-zinc-500">
          {k}<span className="text-zinc-300 font-medium">{v}</span>
        </span>
      ))}
      {score.thesisArea && (
        <><div className="w-px h-3 bg-zinc-700" /><span className="text-zinc-400 italic truncate max-w-32">{score.thesisArea}</span></>
      )}
    </div>
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  producthunt: 'PH',
  g2: 'G2',
  trustpilot: 'TP',
  capterra: 'CA',
};

function renderSignalText(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s)>\]]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0, match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const raw = match[1].replace(/[.,;)]+$/, '');
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <a key={match.index} href={raw} target="_blank" rel="noopener noreferrer"
         className="text-zinc-400 underline underline-offset-2 decoration-zinc-600 hover:text-zinc-200 break-all">
        {raw}
      </a>
    );
    last = match.index + match[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function EnrichmentRow({ enrichment, credChecks, signalHnUrl }: {
  enrichment?: OpportunityEnrichment;
  credChecks?: CredibilityChecks;
  signalHnUrl?: string;
}) {
  const hasContent = enrichment?.github || enrichment?.hn || (credChecks?.reviewPlatformHits?.length ?? 0) > 0;
  if (!hasContent) return null;
  const hnUrl = signalHnUrl || enrichment?.hn?.url;
  return (
    <div className="flex items-center gap-4 mt-2 flex-wrap">
      {enrichment?.github && (
        <a href={enrichment.github.url} target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <GitFork className="w-3 h-3" />
          <span>★ {enrichment.github.stars.toLocaleString()}</span>
          {enrichment.github.language && <span className="text-zinc-700">· {enrichment.github.language}</span>}
        </a>
      )}
      {enrichment?.hn && hnUrl && (
        <a href={hnUrl} target="_blank" rel="noopener noreferrer"
           className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <span className="font-semibold text-orange-600">HN</span>
          <span>▲ {enrichment.hn.points}</span>
          <MessageSquare className="w-3 h-3" />
          <span>{enrichment.hn.comments}</span>
        </a>
      )}
      {credChecks?.reviewPlatformHits?.map(name => {
        const url = credChecks.reviewPlatformUrls?.[name];
        const label = PLATFORM_LABELS[name] ?? name.slice(0, 2).toUpperCase();
        return url ? (
          <a key={name} href={url} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
             title={name}>
            <span className="font-semibold text-zinc-400">{label}</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        ) : (
          <span key={name} className="text-xs text-zinc-600" title={name}>{label}</span>
        );
      })}
    </div>
  );
}

function OutcomeButtons({ id, outcome, note, onOutcome, onNote }: {
  id: string;
  outcome?: OutcomeTier;
  note?: string;
  onOutcome: (id: string, o: OutcomeTier) => void;
  onNote: (id: string, note: string) => void;
}) {
  const [draft, setDraft] = useState(note ?? '');
  const [showNote, setShowNote] = useState(false);

  // When outcome is first set, open the note input
  const handleClick = (o: OutcomeTier) => {
    onOutcome(id, o);
    if (outcome !== o) setShowNote(true);
  };

  const commitNote = () => {
    onNote(id, draft);
    setShowNote(false);
  };

  return (
    <div className="flex flex-col gap-1.5 items-end">
      <div className="flex gap-1.5">
        <button onClick={() => handleClick('interested')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
            outcome === 'interested'
              ? 'bg-emerald-900 border-emerald-700 text-emerald-300'
              : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
          }`}>Interested</button>
        <button onClick={() => handleClick('pass')}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
            outcome === 'pass'
              ? 'bg-red-950 border-red-800 text-red-400'
              : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
          }`}>Pass</button>
        <button onClick={() => handleClick('flagged')}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
            outcome === 'flagged'
              ? 'bg-amber-950 border-amber-700 text-amber-300'
              : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
          }`}>
          <Flag className="w-3 h-3" />
          Flag
        </button>
        {outcome && !showNote && (
          <button onClick={() => setShowNote(true)}
            className="px-2 py-1 rounded text-xs border border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors"
            title={note ? `Note: ${note}` : 'Add note'}>
            {note ? '✎' : '+'}
          </button>
        )}
      </div>
      {showNote && outcome && (
        <div className="flex gap-1.5 w-full">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitNote(); if (e.key === 'Escape') setShowNote(false); }}
            onBlur={commitNote}
            placeholder="Why? (optional — helps improve future scoring)"
            className="flex-1 px-2.5 py-1 rounded text-xs bg-zinc-900 border border-zinc-700 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 min-w-0"
          />
        </div>
      )}
      {note && !showNote && (
        <p className="text-[11px] text-zinc-600 italic max-w-xs text-right truncate" title={note}>"{note}"</p>
      )}
    </div>
  );
}

const WATCHLIST_TYPES: { type: WatchlistType; label: string; icon: any; placeholder: string }[] = [
  { type: 'twitter',  label: 'X/Twitter',  icon: Twitter,   placeholder: '@handle or name' },
  { type: 'founder',  label: 'Founder',    icon: User,      placeholder: 'Full name' },
  { type: 'company',  label: 'Company',    icon: Building2, placeholder: 'Company name' },
  { type: 'topic',    label: 'Topic',      icon: Hash,      placeholder: 'Topic or keyword' },
];

const EMPTY_STATE: ScanState = {
  lastScanned: null, isScanning: false, progress: [],
  liveThemes: [], opportunities: [], flagged: [], decidedOpps: [], founderThemes: [],
  partnerActivity: [], investments: [],
  themes: [], storedThemes: [], signalCount: 0, watchlist: [], outcomes: {}, outcomeTimes: {}, outcomeNotes: {},
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function dedupeOpps(opps: DealFlowOpportunity[]): DealFlowOpportunity[] {
  const seen = new Set<string>();
  return opps.filter(o => !seen.has(o.id) && seen.add(o.id));
}

function isValidUrl(url: string) {
  try { return Boolean(new URL(url)); } catch { return false; }
}

function safeUrl(url: string, fallback?: string): string | undefined {
  if (url && isValidUrl(url)) return url;
  if (fallback && isValidUrl(fallback)) return fallback;
  return undefined;
}

function domain(url: string) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

function timeAgo(iso: string) {
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return '';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 0 || mins > 60 * 24 * 60) return ''; // future or > 60 days: suppress
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// ─── Primitives ────────────────────────────────────────────────────────────────
function FirmBadge({ firm }: { firm: Firm | string }) {
  const s = FIRM[firm as Firm];
  if (!s) return <span className="px-2 py-0.5 rounded text-xs border bg-zinc-900 border-zinc-700 text-zinc-400">{firm}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function MoBadge({ m }: { m: string }) {
  const s = MOMENTUM[m] ?? MOMENTUM.stable;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${s.cls}`}>
      <TrendingUp className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function SourceLink({ url, label }: { url?: string; label?: string }) {
  if (!url) return <span className="text-xs text-zinc-600 italic">No source</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors group"
    >
      <ExternalLink className="w-3 h-3 group-hover:text-zinc-300" />
      {label || domain(url)}
    </a>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold text-zinc-100 tabular-nums">{value}</span>
      <span className="text-xs text-zinc-500 mt-0.5">{label}</span>
    </div>
  );
}

// ─── Scan log ──────────────────────────────────────────────────────────────────
function ScanLog({ progress, isScanning }: { progress: string[]; isScanning: boolean }) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress.length]);
  if (!progress.length) return null;
  return (
    <div className="mb-6 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
        {isScanning
          ? <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
        <span className="text-xs font-medium text-zinc-300">
          {isScanning ? 'Scan running...' : 'Scan complete'}
        </span>
        {isScanning && <Activity className="w-3.5 h-3.5 text-zinc-600 ml-auto animate-pulse" />}
      </div>
      <div ref={logContainerRef} className="p-3 max-h-36 overflow-y-auto font-mono bg-zinc-950/50">
        {progress.map((m, i) => (
          <p key={i} className="text-xs text-zinc-500 leading-relaxed">
            <span className="text-zinc-700">{String(i + 1).padStart(2, '0')} </span>{m}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Opportunity card (shared: Deal Flow, Shortlist, Pass List) ────────────────
function OpportunityCard({ opp, index, outcomes, outcomeNotes, onOutcome, onNote, onVerify, verifyingIds, addedAt }: {
  opp: DealFlowOpportunity;
  index: number;
  outcomes: Record<string, OutcomeTier>;
  outcomeNotes: Record<string, string>;
  onOutcome: (id: string, o: OutcomeTier) => void;
  onNote: (id: string, note: string) => void;
  onVerify: (id: string) => void;
  verifyingIds: Set<string>;
  addedAt?: string;
}) {
  const tier = normalizeTier(opp.score?.tier);
  const t = TIER[tier];
  return (
    <div className={`rounded-xl border ${t.border} ${t.headerBg} bg-zinc-900/40 p-5 transition-colors hover:brightness-110`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <TierBadge tier={tier} />
              <h3 className="font-semibold text-zinc-100 text-sm leading-snug">{opp.title}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700">{opp.category}</span>
              <MoBadge m={opp.momentum} />
              {opp.firms?.map(f => <FirmBadge key={f} firm={f} />)}
            </div>
          </div>
        </div>
        {addedAt && (
          <span className="text-xs text-zinc-600 shrink-0">{timeAgo(addedAt)}</span>
        )}
      </div>

      {opp.score && (
        <div className="ml-10 mb-3 space-y-1.5">
          <ScoreRow score={opp.score} />
          {opp.score.credibility && (
            <CredibilityBadge
              credibility={opp.score.credibility}
              reason={opp.score.credibilityReason}
              onVerify={() => onVerify(opp.id)}
              verifying={verifyingIds.has(opp.id)}
            />
          )}
          {opp.score.tractionEvidence && (
            <p className={`text-xs px-2.5 py-1 rounded border inline-flex items-center gap-1.5 ${
              opp.score.tractionConfidence === 'stated'
                ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-400'
                : opp.score.tractionConfidence === 'inferred'
                  ? 'bg-amber-950/40 border-amber-800/50 text-amber-400'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}>
              <span className="font-medium uppercase tracking-wider text-[10px]">
                {opp.score.tractionConfidence === 'stated' ? 'stated' : opp.score.tractionConfidence === 'inferred' ? 'inferred' : 'no traction data'}
              </span>
              {opp.score.tractionEvidence}
            </p>
          )}
        </div>
      )}

      {opp.score?.takeaway && (
        <p className="ml-10 text-xs text-zinc-400 italic mb-3 leading-relaxed">{opp.score.takeaway}</p>
      )}

      <p className="text-sm text-zinc-300 leading-relaxed mb-4 ml-10">{opp.description}</p>

      {opp.signals?.length > 0 && (
        <div className="ml-10 mb-4">
          <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium mb-2">Signal evidence</p>
          <ul className="space-y-1">
            {opp.signals.map((s, si) => (
              <li key={si} className="flex items-start gap-2 text-sm text-zinc-400">
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                <span>{renderSignalText(s)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ml-10 flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-900/40 mb-3">
        <ArrowUpRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-200/90">{opp.actionPrompt}</p>
      </div>

      <div className="ml-10 flex items-center justify-between flex-wrap gap-2">
        <EnrichmentRow
          enrichment={opp.enrichment}
          credChecks={opp.score?.credibilityChecks}
          signalHnUrl={opp.signals?.flatMap(s => {
            const m = s.match(/https:\/\/news\.ycombinator\.com\/item\?id=\d+/);
            return m ? [m[0]] : [];
          })[0]}
        />
        <OutcomeButtons id={opp.id} outcome={outcomes[opp.id]} note={outcomeNotes[opp.id]} onOutcome={onOutcome} onNote={onNote} />
      </div>
    </div>
  );
}

// ─── Tab: Deal Flow ─────────────────────────────────────────────────────────────
function DealFlowTab({ opps, outcomes, outcomeNotes, onOutcome, onNote, onVerify, verifyingIds }: {
  opps: DealFlowOpportunity[];
  outcomes: Record<string, OutcomeTier>;
  outcomeNotes: Record<string, string>;
  onOutcome: (id: string, o: OutcomeTier) => void;
  onNote: (id: string, note: string) => void;
  onVerify: (id: string) => void;
  verifyingIds: Set<string>;
}) {
  const [filter, setFilter] = useState<string>('all');
  const active = opps.filter(o => outcomes[o.id] !== 'flagged');
  const tierFilters: { k: string; label: string }[] = [
    { k: 'all', label: `All (${active.length})` },
    { k: 'CRITICAL', label: '🚨 Critical' },
    { k: 'HIGH',     label: '📈 High' },
    { k: 'MEDIUM',   label: '⏳ Medium' },
    { k: 'LOW',      label: '🛑 Low' },
  ];
  const shown = filter === 'all' ? active : active.filter(o => (o.score?.tier ?? 'MEDIUM') === filter);

  if (!opps.length) return <EmptyTab icon={Target} msg="Run a scan to surface thesis-aligned opportunities from Sequoia, a16z, and YC signals." />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {tierFilters.map(({ k, label }) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === k ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}>{label}</button>
        ))}
      </div>
      <div className="space-y-4">
        {shown.map((opp, i) => (
          <OpportunityCard
            key={opp.id}
            opp={opp}
            index={i}
            outcomes={outcomes}
            outcomeNotes={outcomeNotes}
            onOutcome={onOutcome}
            onNote={onNote}
            onVerify={onVerify}
            verifyingIds={verifyingIds}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Shortlist / Pass List ─────────────────────────────────────────────────
function OutcomeListTab({ allOpps, outcomes, outcomeNotes, outcomeTimes, targetOutcome, onOutcome, onNote, onVerify, verifyingIds, onClearDecisions }: {
  allOpps: DealFlowOpportunity[];
  outcomes: Record<string, OutcomeTier>;
  outcomeNotes: Record<string, string>;
  outcomeTimes: Record<string, string>;
  targetOutcome: OutcomeTier;
  onOutcome: (id: string, o: OutcomeTier) => void;
  onNote: (id: string, note: string) => void;
  onVerify: (id: string) => void;
  verifyingIds: Set<string>;
  onClearDecisions?: () => void;
}) {
  const listed = allOpps
    .filter(o => outcomes[o.id] === targetOutcome)
    .sort((a, b) => (outcomeTimes[b.id] ?? '').localeCompare(outcomeTimes[a.id] ?? ''));

  if (!listed.length) {
    return targetOutcome === 'interested'
      ? <EmptyTab icon={Bookmark} msg="No startups shortlisted yet. Mark opportunities as Interested from the Deal Flow tab." />
      : <EmptyTab icon={Archive} msg="No startups passed on yet. Mark opportunities as Pass from the Deal Flow tab." />;
  }

  const badgeColor = targetOutcome === 'interested' ? 'bg-emerald-950 border-emerald-800 text-emerald-300' : targetOutcome === 'pass' ? 'bg-red-950 border-red-800 text-red-300' : 'bg-amber-950 border-amber-800 text-amber-300';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-500">
          {listed.length} {targetOutcome === 'interested' ? 'shortlisted' : targetOutcome === 'pass' ? 'passed' : 'flagged'}
        </div>
        {onClearDecisions && (
          <button
            onClick={onClearDecisions}
            className="px-2.5 py-1 rounded text-xs bg-zinc-900 border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
          >
            Clear History
          </button>
        )}
      </div>
      {listed.map((opp, i) => (
        <OpportunityCard
          key={opp.id}
          opp={opp}
          index={i}
          outcomes={outcomes}
          outcomeNotes={outcomeNotes}
          onOutcome={onOutcome}
          onNote={onNote}
          onVerify={onVerify}
          verifyingIds={verifyingIds}
          addedAt={outcomeTimes[opp.id]}
        />
      ))}
    </div>
  );
}

// ─── Tab: Partners ──────────────────────────────────────────────────────────────
function PartnersTab({ partners }: { partners: PartnerSummary[] }) {
  if (!partners.length) return <EmptyTab icon={Users} msg="Run a scan to load partner activity from X/Twitter." />;

  const byFirm = (['Sequoia', 'a16z', 'YC'] as Firm[])
    .map(f => ({ firm: f, list: partners.filter(p => p.firm === f) }))
    .filter(g => g.list.length > 0);

  return (
    <div className="space-y-8">
      {byFirm.map(({ firm, list }) => (
        <div key={firm}>
          <div className="flex items-center gap-2 mb-3">
            <FirmBadge firm={firm} />
            <span className="text-xs text-zinc-600">{list.length} partner{list.length > 1 ? 's' : ''} tracked</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map(p => {
              const profileUrl = `https://x.com/${p.handle}`;
              return (
                <div key={p.partner} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${FIRM[firm]?.badge || ''}`}>
                      {p.partner.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-100 text-sm truncate">{p.partner}</p>
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1"
                      >
                        @{p.handle} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  {p.topics?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.topics.map((t, ti) => (
                        <span key={ti} className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {p.recentPosts?.length > 0 ? (
                    <div className="space-y-2">
                      {p.recentPosts.slice(0, 2).map((post, pi) => {
                        const url = safeUrl(post.url, profileUrl);
                        return (
                          <a
                            key={pi}
                            href={url || profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/40 hover:border-zinc-600 transition-colors group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-zinc-300 group-hover:text-zinc-100 transition-colors line-clamp-2 leading-relaxed">
                                {post.snippet || post.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <SourceLink url={url} label={url ? domain(url) : 'x.com'} />
                                {post.date && <span className="text-xs text-zinc-700">{timeAgo(post.date)}</span>}
                              </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 shrink-0 mt-0.5 transition-colors" />
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <a
                      href={profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View posts on X →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Themes ───────────────────────────────────────────────────────────────
function ThemesTab({ themes }: { themes: Theme[] }) {
  if (!themes.length) return <EmptyTab icon={BarChart3} msg="Run a scan to identify investment themes." />;
  return (
    <div className="grid gap-4">
      {themes.map((t, i) => (
        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition-colors">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="font-semibold text-zinc-100">{t.name}</h3>
            <MoBadge m={t.momentum} />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {t.firms?.map(f => <FirmBadge key={f} firm={f as Firm} />)}
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed mb-4">{t.description}</p>
          {t.evidence?.length > 0 && (
            <ul className="space-y-1">
              {t.evidence.map((e, ei) => (
                <li key={ei} className="flex items-start gap-2 text-sm text-zinc-400">
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Theme Library (persistent DB with pinning) ───────────────────────────
function ThemesDBTab({ themes, onPin, onDelete }: {
  themes: StoredTheme[];
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pinningId, setPinningId] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handlePin = async (id: string) => {
    setPinningId(id);
    onPin(id);
    setTimeout(() => setPinningId(null), 600);
  };

  if (!themes.length) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <Database className="w-8 h-8 text-zinc-700" />
      <p className="text-sm text-zinc-600 max-w-xs">
        No themes saved yet. Run a scan — themes accumulate here across every run.
      </p>
    </div>
  );

  const pinned   = themes.filter(t => t.pinned);
  const unpinned = themes.filter(t => !t.pinned);

  const Row = ({ t }: { t: StoredTheme }) => {
    const isExpanded = expanded.has(t.id);
    const isPinning  = pinningId === t.id;
    return (
      <div className={`border-b border-zinc-800/60 last:border-0 transition-colors ${
        t.pinned ? 'bg-amber-950/10 border-l-2 border-l-amber-600/60' : 'hover:bg-zinc-900/30'
      }`}>
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3 group">
          {/* Pin button */}
          <button
            onClick={() => handlePin(t.id)}
            title={t.pinned ? 'Unpin theme' : 'Pin theme'}
            className={`shrink-0 p-1 rounded transition-all ${
              t.pinned
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-zinc-700 hover:text-zinc-400 opacity-0 group-hover:opacity-100'
            } ${isPinning ? 'scale-125' : ''}`}
          >
            <Pin className={`w-3.5 h-3.5 ${t.pinned ? 'fill-amber-400' : ''}`} />
          </button>

          {/* Theme name + expand */}
          <button
            onClick={() => toggle(t.id)}
            className="flex-1 flex items-center gap-2 text-left min-w-0"
          >
            <span className={`text-sm font-medium truncate ${t.pinned ? 'text-amber-100' : 'text-zinc-200'}`}>
              {t.name}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>

          {/* Momentum */}
          <div className="shrink-0 w-24 hidden sm:block">
            <MoBadge m={t.momentum} />
          </div>

          {/* Firms */}
          <div className="shrink-0 hidden md:flex gap-1">
            {t.firms?.map(f => <FirmBadge key={f} firm={f as Firm} />)}
          </div>

          {/* Scan count */}
          <div className="shrink-0 w-14 text-right hidden lg:block">
            <span className="text-xs text-zinc-500 tabular-nums">
              {t.scanCount} {t.scanCount === 1 ? 'scan' : 'scans'}
            </span>
          </div>

          {/* Last seen */}
          <div className="shrink-0 w-16 text-right">
            <span className="text-xs text-zinc-600 tabular-nums">{timeAgo(t.lastSeenAt)}</span>
          </div>

          {/* Delete */}
          <button
            onClick={() => onDelete(t.id)}
            className="shrink-0 p-1 rounded text-zinc-800 hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Expanded: description + evidence */}
        {isExpanded && (
          <div className="px-10 pb-4 space-y-3">
            <p className="text-sm text-zinc-400 leading-relaxed">{t.description}</p>
            {t.evidence?.length > 0 && (
              <ul className="space-y-1">
                {t.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                    <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0 mt-0.5" />{e}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-4 text-xs text-zinc-700 pt-1">
              <span>First seen {timeAgo(t.firstSeenAt) || t.firstSeenAt.slice(0, 10)}</span>
              <span>·</span>
              <span>{t.scanCount} appearance{t.scanCount > 1 ? 's' : ''}</span>
              {t.pinnedAt && <><span>·</span><span className="text-amber-600/70">Pinned {timeAgo(t.pinnedAt)}</span></>}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">
          {themes.length} theme{themes.length > 1 ? 's' : ''} accumulated across scans
          {pinned.length > 0 && ` · ${pinned.length} pinned`}
        </p>
        <p className="text-xs text-zinc-700 hidden sm:block">Click a theme to expand · hover to pin</p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-xs font-medium text-zinc-600 uppercase tracking-wider">
          <div className="w-5.5 shrink-0" />
          <div className="flex-1">Theme</div>
          <div className="w-24 hidden sm:block">Momentum</div>
          <div className="w-32 hidden md:block">Firms</div>
          <div className="w-14 text-right hidden lg:block">Scans</div>
          <div className="w-16 text-right">Last seen</div>
          <div className="w-5.5 shrink-0" />
        </div>

        {/* Pinned section */}
        {pinned.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-amber-950/20 border-b border-amber-900/30">
              <span className="text-[10px] font-semibold text-amber-600/80 uppercase tracking-wider">Pinned</span>
            </div>
            {pinned.map(t => <Row key={t.id} t={t} />)}
          </div>
        )}

        {/* Unpinned section */}
        {unpinned.length > 0 && (
          <div>
            {pinned.length > 0 && (
              <div className="px-4 py-1.5 bg-zinc-900/60 border-b border-zinc-800/60">
                <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">All themes</span>
              </div>
            )}
            {unpinned.map(t => <Row key={t.id} t={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Type badge for watchlist entries ──────────────────────────────────────────
const TYPE_LABELS: Record<WatchlistType, { label: string; cls: string }> = {
  twitter:    { label: '@',         cls: 'bg-sky-950 border-sky-800 text-sky-400' },
  founder:    { label: 'founder',   cls: 'bg-violet-950 border-violet-800 text-violet-400' },
  company:    { label: 'company',   cls: 'bg-emerald-950 border-emerald-800 text-emerald-400' },
  topic:      { label: 'topic',     cls: 'bg-zinc-900 border-zinc-700 text-zinc-400' },
  subreddit:  { label: 'r/',        cls: 'bg-orange-950 border-orange-800 text-orange-400' },
  newsletter: { label: 'newsletter',cls: 'bg-amber-950 border-amber-800 text-amber-400' },
  url:        { label: 'url',       cls: 'bg-zinc-900 border-zinc-700 text-zinc-400' },
};

// ─── Tab: Watchlist ─────────────────────────────────────────────────────────────
function WatchlistTab({
  entries,
  onAddRaw,
  onRemove,
}: {
  entries: WatchlistEntry[];
  onAddRaw: (raw: string) => Promise<WatchlistEntry | null>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [raw, setRaw] = useState('');
  const [adding, setAdding] = useState(false);
  const [lastAdded, setLastAdded] = useState<WatchlistEntry | null>(null);

  const handleAdd = async () => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setAdding(true);
    const entry = await onAddRaw(trimmed);
    if (entry) setLastAdded(entry);
    setRaw('');
    setAdding(false);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-100 mb-1">Custom sources & signals</h2>
        <p className="text-xs text-zinc-500 mb-5">
          Paste any link or handle — X accounts, Reddit communities, newsletters, founder profiles, company URLs.
          The system infers the type and routes it in every scan alongside Sequoia, a16z, and YC.
          These sources also feed the live theme extraction in Stage 1.
        </p>

        {/* Single paste input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="@handle, r/subreddit, https://newsletter.com, or any keyword..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
          <button
            onClick={handleAdd}
            disabled={!raw.trim() || adding}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </button>
        </div>

        {lastAdded && (
          <p className="mt-2 text-xs text-emerald-500">
            Added as <span className="font-semibold">{lastAdded.type}</span>: {lastAdded.label}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {(['@pmarca', 'r/LocalLLaMA', 'https://www.nfx.com/post', 'voice AI healthcare', 'r/SideProject'].map(ex => (
            <button
              key={ex}
              onClick={() => setRaw(ex)}
              className="px-2 py-1 rounded text-xs bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
            >
              {ex}
            </button>
          )))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No custom sources yet.</p>
          <p className="text-xs mt-1">Paste an X handle, Reddit URL, newsletter, or keyword above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const typeMeta = TYPE_LABELS[entry.type] ?? TYPE_LABELS.url;
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${typeMeta.cls}`}>
                    {typeMeta.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 font-medium truncate">{entry.label}</p>
                    <p className="text-xs text-zinc-600 truncate">{entry.value}</p>
                  </div>
                </div>
                <button
                  onClick={() => onRemove(entry.id)}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <p className="mt-4 text-xs text-zinc-600">
          {entries.length} source{entries.length > 1 ? 's' : ''} — included in next scan and Stage 1 theme extraction.
        </p>
      )}
    </div>
  );
}

// ─── Tab: Flagged ──────────────────────────────────────────────────────────────
function FlaggedTab({ flagged, manuallyFlagged, onVerify, verifyingIds, onPromote, onArchive, onUnflag }: {
  flagged: DealFlowOpportunity[];
  manuallyFlagged: DealFlowOpportunity[];
  onVerify: (id: string) => void;
  verifyingIds: Set<string>;
  onPromote: (id: string) => void;
  onArchive: (id: string) => void;
  onUnflag: (id: string) => void;
}) {
  const totalCount = flagged.length + manuallyFlagged.length;
  if (!totalCount) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <Flag className="w-8 h-8 text-zinc-700" />
      <p className="text-sm text-zinc-600 max-w-xs">No flagged companies. Use Flag on any Deal Flow card to hold it here for review.</p>
    </div>
  );
  return (
    <div>
      {manuallyFlagged.length > 0 && (
        <div className="mb-8">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-3">Manually flagged</p>
          <div className="space-y-3">
            {manuallyFlagged.map(opp => (
              <div key={opp.id} className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-medium text-zinc-200 text-sm">{opp.title}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{opp.category}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => onVerify(opp.id)} disabled={verifyingIds.has(opp.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-xs border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40">
                      {verifyingIds.has(opp.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      Verify
                    </button>
                    <button onClick={() => onUnflag(opp.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs border border-amber-800/60 bg-zinc-900 text-amber-400/80 hover:text-amber-300 hover:border-amber-700 transition-colors">
                      <Flag className="w-3 h-3" />
                      Unflag
                    </button>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">{opp.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {flagged.length > 0 && (
        <div>
          {manuallyFlagged.length > 0 && (
            <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-3">Unverifiable (auto-flagged)</p>
          )}
          <p className="text-xs text-zinc-600 mb-3">
            No independently verifiable claims — not discarded. Use Verify to dig deeper, or Promote if satisfied.
          </p>
          <div className="space-y-3">
            {flagged.map(opp => (
              <div key={opp.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-medium text-zinc-200 text-sm">{opp.title}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{opp.category}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => onVerify(opp.id)} disabled={verifyingIds.has(opp.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-xs border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40">
                      {verifyingIds.has(opp.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      Verify
                    </button>
                    <button onClick={() => onPromote(opp.id)}
                      className="px-2.5 py-1 rounded text-xs border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-emerald-400 hover:border-emerald-800 transition-colors">
                      Promote
                    </button>
                    <button onClick={() => onArchive(opp.id)}
                      className="px-2.5 py-1 rounded text-xs border border-zinc-800 bg-zinc-950 text-zinc-600 hover:text-red-400 hover:border-red-900 transition-colors">
                      Archive
                    </button>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed mb-2">{opp.description}</p>
                {opp.score?.credibilityReason && (
                  <p className="text-xs text-zinc-600 italic">Not verified: {opp.score.credibilityReason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Founder Themes ────────────────────────────────────────────────────────
const PLATFORM_STYLE: Record<string, string> = {
  X:        'bg-zinc-900 border-zinc-700 text-zinc-300',
  Reddit:   'bg-orange-950/50 border-orange-800/50 text-orange-400',
  LinkedIn: 'bg-sky-950/50 border-sky-800/50 text-sky-400',
};

function FounderThemesTab({ themes }: { themes: FounderTheme[] }) {
  if (!themes.length) return (
    <EmptyTab icon={User} msg="Run a scan to surface what builders and thought leaders are discussing on X, Reddit, and LinkedIn." />
  );

  return (
    <div className="space-y-3">
      {themes.map(theme => (
        <div key={theme.id} className={`rounded-xl border p-4 bg-zinc-900/40 ${
          theme.signalStrength === 'strong' ? 'border-emerald-800/40' : 'border-zinc-800'
        }`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {theme.signalStrength === 'strong' && (
                <span className="px-2 py-0.5 rounded text-xs bg-emerald-950 border border-emerald-800 text-emerald-400 font-medium">Strong signal</span>
              )}
              <span className="font-medium text-zinc-100 text-sm">{theme.theme}</span>
            </div>
            <div className="flex gap-1 shrink-0 flex-wrap justify-end">
              {(theme.platforms ?? []).map(p => (
                <span key={p} className={`px-2 py-0.5 rounded text-[10px] font-medium border ${PLATFORM_STYLE[p] ?? 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}>{p}</span>
              ))}
            </div>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed mb-3">{theme.summary}</p>

          {theme.notableVoices?.length > 0 && (
            <p className="text-xs text-zinc-500 mb-2">
              Voices: <span className="text-zinc-300">{theme.notableVoices.join(', ')}</span>
            </p>
          )}

          {theme.keyInsights?.length > 0 && (
            <ul className="space-y-1 mt-2">
              {theme.keyInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                  <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0 mt-0.5" />{insight}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyTab({ icon: Icon, msg }: { icon: any; msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <Icon className="w-8 h-8 text-zinc-700" />
      <p className="text-sm text-zinc-600 max-w-xs">{msg}</p>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
type Tab = 'dealflow' | 'shortlist' | 'passlist' | 'founders' | 'partners' | 'themes' | 'themesdb' | 'flagged' | 'watchlist';

const TABS: { id: Tab; label: string; icon: any; grey?: boolean }[] = [
  { id: 'dealflow',  label: 'Deal Flow',      icon: Target },
  { id: 'shortlist', label: 'Shortlist',      icon: Bookmark },
  { id: 'passlist',  label: 'Pass List',      icon: Archive },
  { id: 'founders',  label: 'Founder Themes', icon: User },
  { id: 'partners',  label: 'Partners',       icon: Users },
  { id: 'themes',    label: 'Themes',         icon: BarChart3 },
  { id: 'themesdb',  label: 'Theme Library',  icon: Database },
  { id: 'flagged',   label: 'Flagged',        icon: ShieldOff, grey: true },
  { id: 'watchlist', label: 'Watchlist',      icon: Zap },
];

export default function App() {
  const [state, setState] = useState<ScanState>(EMPTY_STATE);
  const [tab, setTab] = useState<Tab>('dealflow');
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());
  const [calibrationStatus, setCalibrationStatus] = useState<{ calibrated: boolean; notedDecisions: number; totalDecisions: number } | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) setState(await res.json());
      const calRes = await fetch('/api/decisions/calibration-status');
      if (calRes.ok) setCalibrationStatus(await calRes.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchState();
    const es = new EventSource('/api/events');
    esRef.current = es;
    es.addEventListener('progress', e => {
      try {
        const { message } = JSON.parse((e as MessageEvent).data);
        if (message) {
          setState(prev => ({ ...prev, isScanning: true, progress: [...prev.progress, message] }));
        }
      } catch (err) {
        console.error('Error parsing progress event:', err);
      }
    });
    es.addEventListener('complete', () => fetchState());
    es.addEventListener('verify_complete', () => fetchState());
    es.addEventListener('verify_error', (e) => {
      console.warn('verify_error', (e as MessageEvent).data);
      try {
        const { id } = JSON.parse((e as MessageEvent).data);
        if (id) setVerifyingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      } catch (err) {
        console.error('Error parsing verify_error event:', err);
      }
    });
    es.addEventListener('scan_error', e => {
      try {
        const msg = JSON.parse((e as MessageEvent).data || '{}').message || 'Unknown error';
        setState(prev => ({ ...prev, isScanning: false, error: msg }));
      } catch (err) {
        console.error('Error parsing scan_error event:', err);
      }
    });
    es.addEventListener('error', e => {
      // Standard connection errors are handled silently, as browser automatically reconnects.
      console.warn('EventSource connection lost or reconnecting...');
    });
    return () => es.close();
  }, [fetchState]);

  const startScan = async () => {
    setState(prev => ({ ...prev, isScanning: true, progress: [], error: undefined }));
    await fetch('/api/scan', { method: 'POST' });
  };

  const handleOutcome = async (id: string, outcome: OutcomeTier) => {
    const current = state.outcomes[id];
    if (current === outcome) {
      // toggle off
      await fetch(`/api/outcomes/${id}`, { method: 'DELETE' });
      setState(prev => { const o = { ...prev.outcomes }; delete o[id]; return { ...prev, outcomes: o }; });
    } else {
      await fetch('/api/outcomes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, outcome }) });
      setState(prev => ({ ...prev, outcomes: { ...prev.outcomes, [id]: outcome } }));
    }
  };

  const handleNote = async (id: string, note: string) => {
    await fetch(`/api/outcomes/${id}/note`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
    setState(prev => ({ ...prev, outcomeNotes: { ...prev.outcomeNotes, [id]: note } }));
  };

  const handleVerify = async (id: string) => {
    setVerifyingIds(prev => new Set(prev).add(id));
    await fetch(`/api/verify/${id}`, { method: 'POST' });
    // Result comes back via SSE verify_complete → fetchState()
    // Remove from verifying set after a timeout fallback
    setTimeout(() => setVerifyingIds(prev => { const s = new Set(prev); s.delete(id); return s; }), 30000);
  };

  const handlePromote = async (id: string) => {
    await fetch(`/api/flagged/${id}/promote`, { method: 'POST' });
    setState(prev => {
      const opp = (prev.flagged || []).find(o => o.id === id);
      if (!opp) return prev;
      return {
        ...prev,
        flagged: prev.flagged.filter(o => o.id !== id),
        opportunities: [opp, ...prev.opportunities],
      };
    });
  };

  const handleArchiveFlagged = async (id: string) => {
    await fetch(`/api/flagged/${id}`, { method: 'DELETE' });
    setState(prev => ({ ...prev, flagged: (prev.flagged || []).filter(o => o.id !== id) }));
  };

  const clearDecisions = async () => {
    if (window.confirm('Clear all decision history? This cannot be undone.')) {
      await fetch('/api/decisions', { method: 'DELETE' });
      setCalibrationStatus({ calibrated: false, notedDecisions: 0, totalDecisions: 0 });
    }
  };

  const addWatchlistRaw = async (raw: string): Promise<WatchlistEntry | null> => {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (res.ok) {
      const entry: WatchlistEntry = await res.json();
      setState(prev => ({ ...prev, watchlist: [...prev.watchlist, entry] }));
      return entry;
    }
    return null;
  };

  const removeWatchlist = async (id: string) => {
    await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
    setState(prev => ({ ...prev, watchlist: prev.watchlist.filter(e => e.id !== id) }));
  };

  const pinTheme = async (id: string) => {
    const res = await fetch(`/api/themes/${id}/pin`, { method: 'POST' });
    if (res.ok) {
      const updated: StoredTheme = await res.json();
      setState(prev => {
        const themes = (prev.storedThemes ?? []).map(t => t.id === id ? updated : t);
        themes.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
        });
        return { ...prev, storedThemes: themes };
      });
    }
  };

  const deleteTheme = async (id: string) => {
    await fetch(`/api/themes/${id}`, { method: 'DELETE' });
    setState(prev => ({ ...prev, storedThemes: (prev.storedThemes ?? []).filter(t => t.id !== id) }));
  };

  const counts: Record<Tab, number> = {
    dealflow:  state.opportunities.length,
    shortlist: dedupeOpps([...state.opportunities, ...(state.flagged ?? []), ...(state.decidedOpps ?? [])]).filter(o => state.outcomes[o.id] === 'interested').length,
    passlist:  dedupeOpps([...state.opportunities, ...(state.flagged ?? []), ...(state.decidedOpps ?? [])]).filter(o => state.outcomes[o.id] === 'pass').length,
    founders:  state.founderThemes?.length ?? 0,
    partners:  state.partnerActivity.length,
    themes:    state.themes.length,
    themesdb:  state.storedThemes?.length ?? 0,
    flagged:   (state.flagged?.length ?? 0) + Object.values(state.outcomes).filter(o => o === 'flagged').length,
    watchlist: state.watchlist.length,
  };

  const hasData = Boolean(state.lastScanned);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Header ── */}
      <header className="border-b border-zinc-800 sticky top-0 z-20 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-zinc-800">
                <Telescope className="w-4 h-4 text-zinc-300" />
              </div>
              <div>
                <span className="text-sm font-semibold text-zinc-100">Venture Scout</span>
                <div className="flex items-center gap-1.5 mt-px">
                  {(['Sequoia', 'a16z', 'YC'] as Firm[]).map(f => (
                    <span key={f} className={`inline-flex items-center gap-1 text-xs ${FIRM[f].text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${FIRM[f].dot}`} />
                      {FIRM[f].label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Status + actions */}
            <div className="flex items-center gap-4">
              {state.error && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {state.error.slice(0, 60)}
                </div>
              )}
              {state.signalCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Zap className="w-3.5 h-3.5" />
                  {state.signalCount} signals
                </div>
              )}
              {state.lastScanned && (
                <div className="flex items-center gap-1 text-xs text-zinc-600">
                  <Clock className="w-3.5 h-3.5" />
                  {timeAgo(state.lastScanned)}
                </div>
              )}
              {calibrationStatus && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border ${
                  calibrationStatus.calibrated
                    ? 'bg-emerald-950/40 border-emerald-900/60 text-emerald-400'
                    : 'bg-amber-950/40 border-amber-900/60 text-amber-400'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${calibrationStatus.calibrated ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {calibrationStatus.calibrated
                    ? `Calibrated (${calibrationStatus.notedDecisions} decisions)`
                    : `Learning (${calibrationStatus.notedDecisions}/3 notes)`}
                </div>
              )}
              <button
                onClick={startScan}
                disabled={state.isScanning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${state.isScanning ? 'animate-spin' : ''}`} />
                {state.isScanning ? 'Scanning...' : 'Scan Now'}
              </button>
            </div>
          </div>

          {/* Stats bar — visible after first scan */}
          {hasData && (
            <div className="flex items-center gap-8 py-3 border-t border-zinc-800/60 flex-wrap">
              <Stat value={state.signalCount} label="signals" />
              {(['CRITICAL','HIGH','MEDIUM','LOW'] as const).map(tier => {
                const n = state.opportunities.filter(o => (o.score?.tier ?? 'MEDIUM') === tier).length;
                if (!n) return null;
                return <Stat key={tier} value={n} label={tier.toLowerCase()} />;
              })}
              <Stat value={state.partnerActivity.length} label="partners" />
{state.watchlist.length > 0 && <Stat value={state.watchlist.length} label="watchlist" />}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-0.5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-zinc-100 text-zinc-100'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {counts[t.id] > 0 && (
                  <span className={`text-xs px-1.5 rounded-full font-mono ${
                    t.grey
                      ? 'bg-zinc-900 text-zinc-600'
                      : tab === t.id ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-900 text-zinc-600'
                  }`}>
                    {counts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <ScanLog progress={state.progress} isScanning={state.isScanning} />

        {/* Pre-scan landing */}
        {!hasData && !state.isScanning && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
              <Telescope className="w-7 h-7 text-zinc-600" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">Ready to scout</h2>
            <p className="text-sm text-zinc-500 max-w-sm mb-2">
              Pulls live signals from Sequoia, a16z, and YC partner feeds, recent investments, and partner activity.
            </p>
            <p className="text-xs text-zinc-700 mb-8">~2 min scan · powered by Exa + GPT-4o mini</p>
            <button
              onClick={startScan}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-100 text-zinc-900 text-sm font-semibold hover:bg-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Run First Scan
            </button>
            {state.watchlist.length > 0 && (
              <p className="mt-4 text-xs text-zinc-600">
                + {state.watchlist.length} custom account{state.watchlist.length > 1 ? 's' : ''} from your watchlist
              </p>
            )}
          </div>
        )}

        {/* Tab content */}
        {(hasData || state.isScanning) && tab !== 'watchlist' && tab !== 'flagged' && tab !== 'shortlist' && tab !== 'passlist' && tab !== 'themesdb' && (
          <>
            {tab === 'dealflow'  && <DealFlowTab opps={state.opportunities} outcomes={state.outcomes} outcomeNotes={state.outcomeNotes ?? {}} onOutcome={handleOutcome} onNote={handleNote} onVerify={handleVerify} verifyingIds={verifyingIds} />}
            {tab === 'founders'  && <FounderThemesTab themes={state.founderThemes ?? []} />}
            {tab === 'partners'  && <PartnersTab partners={state.partnerActivity} />}
            {tab === 'themes'    && <ThemesTab themes={state.themes} />}
          </>
        )}

        {/* Theme Library — always accessible (persists across scans) */}
        {tab === 'themesdb' && (
          <ThemesDBTab
            themes={state.storedThemes ?? []}
            onPin={pinTheme}
            onDelete={deleteTheme}
          />
        )}

        {/* Founder Themes tab accessible before scan */}
        {!hasData && !state.isScanning && tab === 'founders' && (
          <FounderThemesTab themes={[]} />
        )}

        {/* Shortlist — always accessible */}
        {tab === 'shortlist' && (
          <OutcomeListTab
            allOpps={dedupeOpps([...state.opportunities, ...(state.flagged ?? []), ...(state.decidedOpps ?? [])])}
            outcomes={state.outcomes}
            outcomeNotes={state.outcomeNotes ?? {}}
            outcomeTimes={state.outcomeTimes ?? {}}
            targetOutcome="interested"
            onOutcome={handleOutcome}
            onNote={handleNote}
            onVerify={handleVerify}
            verifyingIds={verifyingIds}
            onClearDecisions={clearDecisions}
          />
        )}

        {/* Pass List — always accessible */}
        {tab === 'passlist' && (
          <OutcomeListTab
            allOpps={dedupeOpps([...state.opportunities, ...(state.flagged ?? []), ...(state.decidedOpps ?? [])])}
            outcomes={state.outcomes}
            outcomeNotes={state.outcomeNotes ?? {}}
            outcomeTimes={state.outcomeTimes ?? {}}
            targetOutcome="pass"
            onOutcome={handleOutcome}
            onNote={handleNote}
            onVerify={handleVerify}
            verifyingIds={verifyingIds}
            onClearDecisions={clearDecisions}
          />
        )}

        {/* Flagged — always accessible */}
        {tab === 'flagged' && (
          <FlaggedTab
            flagged={state.flagged ?? []}
            manuallyFlagged={state.opportunities.filter(o => state.outcomes[o.id] === 'flagged')}
            onVerify={handleVerify}
            verifyingIds={verifyingIds}
            onPromote={handlePromote}
            onArchive={handleArchiveFlagged}
            onUnflag={(id) => handleOutcome(id, 'flagged')}
          />
        )}

        {/* Watchlist always accessible */}
        {tab === 'watchlist' && (
          <WatchlistTab
            entries={state.watchlist}
            onAddRaw={addWatchlistRaw}
            onRemove={removeWatchlist}
          />
        )}
      </main>
    </div>
  );
}
