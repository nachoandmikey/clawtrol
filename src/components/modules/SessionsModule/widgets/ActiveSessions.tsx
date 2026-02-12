'use client';

import { useState, useEffect, useCallback } from 'react';
import { timeAgo } from '@/lib/types';

export default function ActiveSessionsWidget() {
  const [sessions, setSessions] = useState<any[]>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions((data.sessions || []).slice(0, 5));
    } catch {}
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  if (!sessions.length && !sessions) return <div className="animate-pulse space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>;

  if (sessions.length === 0) {
    return <div className="text-center py-4 text-[11px]" style={{ color: 'var(--text-dim)' }}>No active sessions</div>;
  }

  return (
    <div className="space-y-2">
      {sessions.map(session => {
        const lastActivity = new Date(session.lastActivity);
        const isRecent = Date.now() - lastActivity.getTime() < 3600000;
        const model = session.model?.replace('claude-', '').replace(/-\d+$/, '') || '';

        return (
          <div key={session.key} className="p-2 rounded border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border-dim)' }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isRecent ? 'var(--accent-green)' : 'var(--text-dim)' }} />
              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{session.label}</span>
              <span className="text-[8px] ml-auto shrink-0" style={{ color: 'var(--text-dim)' }}>{timeAgo(session.lastActivity)}</span>
            </div>
            <div className="flex items-center gap-2 text-[9px]" style={{ color: 'var(--text-dim)' }}>
              {model && <span className="px-1 py-0.5 rounded" style={{ background: 'rgba(136,71,255,0.1)', color: 'var(--accent-purple)' }}>{model}</span>}
              <span>{session.messageCount} msgs</span>
              {session.lastMessages?.[session.lastMessages.length - 1]?.text && (
                <span className="truncate max-w-[120px]" style={{ color: 'var(--text-secondary)' }}>
                  {session.lastMessages[session.lastMessages.length - 1].text.slice(0, 60)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
