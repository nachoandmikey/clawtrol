'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────
interface SessionMessage {
  role: string;
  text: string;
  timestamp: string;
}

interface Session {
  key: string;
  label: string;
  kind: string;
  chatType: string | null;
  sessionId: string | null;
  model: string | null;
  updatedAt: number;
  lastActivity: string;
  isActive: boolean;
  messageCount: number;
  lastMessages: SessionMessage[];
}

interface DetailedSession {
  key: string;
  sessionId: string | null;
  chatType: string | null;
  model: string | null;
  updatedAt: number;
  lastActivity: string;
  isActive: boolean;
  totalMessages: number;
  messages: SessionMessage[];
}

type KindFilter = 'all' | 'main' | 'telegram' | 'subagent' | 'channel';

// ─── Helpers ────────────────────────────────────────────────────
function timeAgo(isoOrMs: string | number): string {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTimestamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

function kindBadgeColor(kind: string): string {
  switch (kind) {
    case 'main': return 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30';
    case 'telegram': return 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border-[var(--accent-purple)]/30';
    case 'subagent': return 'bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/30';
    case 'channel': return 'bg-[var(--accent-green)]/15 text-[var(--accent-green)] border-[var(--accent-green)]/30';
    default: return 'bg-white/10 text-gray-400 border-white/20';
  }
}

function kindIcon(kind: string): string {
  switch (kind) {
    case 'main': return '🏠';
    case 'telegram': return '📱';
    case 'subagent': return '🤖';
    case 'channel': return '📡';
    default: return '💬';
  }
}

// ─── Session Row Component ──────────────────────────────────────
function SessionRow({ session }: { session: Session }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<DetailedSession | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (detail) return; // Already loaded
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.key)}?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch {
      // Silently fail
    }
    setLoading(false);
  }, [session.key, detail]);

  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    if (newExpanded && !detail) {
      loadDetail();
    }
  };

  const messages = detail?.messages || session.lastMessages || [];

  return (
    <div className="card-base animate-fade-in">
      {/* Session Header */}
      <button
        onClick={handleToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Status indicator */}
        <span className={session.isActive ? 'status-online animate-pulse-glow' : 'status-offline'} style={{ opacity: session.isActive ? 1 : 0.4 }} />

        {/* Icon */}
        <span className="text-lg flex-shrink-0">{kindIcon(session.kind)}</span>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[var(--text-primary)] truncate text-sm">
              {session.label}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider ${kindBadgeColor(session.kind)}`}>
              {session.kind}
            </span>
          </div>
          <div className="text-[11px] text-[var(--text-dim)] font-mono mt-0.5 truncate">
            {session.key}
          </div>
        </div>

        {/* Right side info */}
        <div className="flex-shrink-0 text-right">
          <div className="text-xs text-[var(--text-secondary)]">
            {timeAgo(session.updatedAt)}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] font-mono mt-0.5">
            {session.messageCount > 0 ? `${session.messageCount} msgs` : 'no msgs'}
          </div>
        </div>

        {/* Expand arrow */}
        <svg
          className={`w-4 h-4 text-[var(--text-dim)] transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expanded Messages */}
      {expanded && (
        <div className="border-t border-[var(--border-dim)]">
          {/* Meta info */}
          <div className="px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-dim)] font-mono border-b border-[var(--border-dim)] bg-[var(--bg-secondary)]">
            {session.model && <span>model: {session.model}</span>}
            {session.chatType && <span>type: {session.chatType}</span>}
            {session.sessionId && <span>id: {session.sessionId.slice(0, 8)}</span>}
            {detail && <span>total: {detail.totalMessages} messages</span>}
          </div>

          {/* Messages */}
          <div className="px-4 py-2 space-y-2 max-h-[400px] overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 py-3 text-[var(--text-dim)] text-xs">
                <span className="animate-pulse-glow">◉</span> Loading messages…
              </div>
            )}

            {!loading && messages.length === 0 && (
              <div className="py-3 text-[var(--text-dim)] text-xs text-center">
                No messages in this session
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="flex gap-2 text-xs">
                {/* Role indicator */}
                <div className="flex-shrink-0 mt-0.5">
                  {msg.role === 'user' ? (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] text-[10px] font-bold">
                      U
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] text-[10px] font-bold">
                      A
                    </span>
                  )}
                </div>

                {/* Message content */}
                <div className="flex-1 min-w-0">
                  <div className={`leading-relaxed break-words ${
                    msg.role === 'user' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  }`}>
                    {truncateText(msg.text, 500)}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0 text-[10px] text-[var(--text-dim)] font-mono mt-0.5">
                  {formatTimestamp(msg.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main SessionViewer Component ───────────────────────────────
export default function SessionViewer() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      setError(null);
      setLastFetch(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and every 15s
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 15000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Filter sessions
  const filtered = sessions.filter((s) => {
    if (kindFilter !== 'all' && s.kind !== kindFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.label.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        (s.model || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Counts by kind
  const counts = {
    all: sessions.length,
    main: sessions.filter(s => s.kind === 'main').length,
    telegram: sessions.filter(s => s.kind === 'telegram').length,
    subagent: sessions.filter(s => s.kind === 'subagent').length,
    channel: sessions.filter(s => s.kind === 'channel').length,
  };

  const activeSessions = sessions.filter(s => s.isActive).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]" style={{ fontFamily: 'var(--font-display)' }}>
            Sessions
          </h2>
          <span className="text-[10px] font-mono text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 px-2 py-0.5 rounded border border-[var(--accent-cyan)]/20">
            {activeSessions} active
          </span>
          <span className="text-[10px] font-mono text-[var(--text-dim)]">
            {sessions.length} total
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-dim)] font-mono">
          {lastFetch > 0 && (
            <span>updated {timeAgo(lastFetch)}</span>
          )}
          <button
            onClick={fetchSessions}
            className="px-2 py-1 rounded border border-[var(--border-dim)] hover:border-[var(--accent-cyan)]/30 hover:text-[var(--accent-cyan)] transition-colors"
          >
            ↻ refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Kind filter buttons */}
        <div className="flex gap-1">
          {(['all', 'main', 'telegram', 'subagent', 'channel'] as KindFilter[]).map((kind) => (
            <button
              key={kind}
              onClick={() => setKindFilter(kind)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wide transition-all ${
                kindFilter === kind
                  ? 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30'
                  : 'text-[var(--text-dim)] border border-[var(--border-dim)] hover:border-[var(--border-accent)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {kind === 'all' ? `all (${counts.all})` : `${kindIcon(kind)} ${kind} (${counts[kind]})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[180px]">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search sessions…"
            className="w-full px-3 py-1.5 rounded text-xs font-mono bg-[var(--bg-secondary)] border border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent-cyan)] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="card-base px-4 py-3 border-[var(--accent-red)]/30">
          <span className="text-xs text-[var(--accent-red)]">⚠ {error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card-base px-4 py-8 flex items-center justify-center">
          <span className="text-xs text-[var(--text-dim)] animate-pulse-glow">Loading sessions…</span>
        </div>
      )}

      {/* Session list */}
      {!loading && (
        <div className="space-y-1">
          {filtered.length === 0 && (
            <div className="card-base px-4 py-8 text-center">
              <span className="text-xs text-[var(--text-dim)]">
                {search ? 'No sessions match your search' : 'No sessions found'}
              </span>
            </div>
          )}

          {filtered.map((session) => (
            <SessionRow key={session.key} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
