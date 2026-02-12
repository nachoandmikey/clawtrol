'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, MetricBlock } from '@/components/shared/StatCard';
import { renderMarkdown } from '@/components/shared/MarkdownRenderer';
import { timeAgo } from '@/lib/types';

export default function SessionsModule() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [usageData, setUsageData] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {}
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/usage');
      const data = await res.json();
      setUsageData(data);
    } catch {}
  }, []);

  const openSessionChat = useCallback(async (session: any) => {
    setSelectedSession(session);
    setChatMessages([]);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(session.key)}?limit=50`);
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch {}
    setChatLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  const refreshChat = useCallback(async () => {
    if (!selectedSession) return;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(selectedSession.key)}?limit=50`);
      const data = await res.json();
      setChatMessages(data.messages || []);
    } catch {}
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [selectedSession]);

  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !selectedSession || chatSending) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatSending(true);
    try {
      await fetch('/api/sessions/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: selectedSession.key, message: msg }),
      });
      setChatMessages(prev => [...prev, { role: 'user', text: msg, timestamp: new Date().toISOString() }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      setTimeout(refreshChat, 5000);
    } catch {}
    setChatSending(false);
  }, [chatInput, selectedSession, chatSending, refreshChat]);

  useEffect(() => {
    fetchSessions();
    fetchUsage();
  }, [fetchSessions, fetchUsage]);

  return (
    <div className="animate-fade-in">
      {selectedSession ? (
        <div className="card-base overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
          {/* Chat Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-dim)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSelectedSession(null)}
                className="text-sm shrink-0"
                style={{ color: 'var(--accent-cyan)' }}
              >
                ←
              </button>
              <div className="min-w-0">
                <h2 className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {selectedSession.label}
                </h2>
                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                  {selectedSession.kind} · {selectedSession.messageCount} msgs · {selectedSession.totalTokens ? `${(selectedSession.totalTokens / 1000).toFixed(0)}k tokens` : ''}
                  {selectedSession.estimatedCost > 0 && <span style={{ color: 'var(--accent-yellow)' }}> · ${selectedSession.estimatedCost.toFixed(2)}</span>}
                  {selectedSession.model && <span> · {selectedSession.model.replace('claude-', '').replace('-20250514', '')}</span>}
                </div>
              </div>
            </div>
            <button onClick={refreshChat} className="text-[10px] px-2 py-1 rounded border" style={{ borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }}>
              ↻
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-3" style={{ height: 'calc(100% - 110px)', background: '#08080e' }}>
            {chatLoading && (
              <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                <span className="animate-pulse-glow">Loading messages...</span>
              </div>
            )}
            {chatMessages.map((msg: any, i: number) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-lg px-3 py-2"
                  style={{
                    background: msg.role === 'user' ? 'rgba(0,255,200,0.1)' : 'var(--bg-card)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(0,255,200,0.2)' : 'var(--border-dim)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: msg.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-green)' }}>
                      {msg.role === 'user' ? 'you' : 'assistant'}
                    </span>
                    {msg.timestamp && (
                      <span className="text-[8px]" style={{ color: 'var(--text-dim)' }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] leading-relaxed break-words" style={{ color: 'var(--text-primary)' }}>
                    {renderMarkdown(msg.text)}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--border-accent)', background: '#0c0c14' }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
              placeholder="Send a message..."
              disabled={chatSending}
              className="flex-1 bg-transparent border-none outline-none text-[13px]"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)', caretColor: 'var(--accent-cyan)' }}
              autoFocus
            />
            <button
              onClick={sendChatMessage}
              disabled={chatSending || !chatInput.trim()}
              className="px-3 py-1.5 rounded text-[11px] tracking-wider font-medium border transition-all disabled:opacity-30"
              style={{ borderColor: 'var(--border-accent)', color: 'var(--accent-cyan)', background: 'rgba(0,255,200,0.05)' }}
            >
              {chatSending ? '···' : 'SEND'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {usageData?.totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MetricBlock label="TOTAL COST" value={`$${usageData.totals.totalCost.toFixed(2)}`} accent="var(--accent-yellow)" />
              <MetricBlock label="API CALLS" value={`${usageData.totals.apiCalls.toLocaleString()}`} accent="var(--accent-cyan)" />
              <MetricBlock label="TOKENS" value={`${(usageData.totals.totalTokens / 1_000_000).toFixed(1)}M`} accent="var(--accent-purple)" />
              <MetricBlock label="CACHE COST" value={`$${usageData.totals.cacheCost.toFixed(2)}`} sub={`${((usageData.totals.cacheCost / usageData.totals.totalCost) * 100).toFixed(0)}% of total`} accent="var(--accent-orange)" />
            </div>
          )}
          <Card title="SESSIONS" actions={
            <button onClick={() => { fetchSessions(); fetchUsage(); }} className="text-[10px] tracking-wider transition-colors" style={{ color: 'var(--text-dim)' }}>
              ↻ REFRESH
            </button>
          }>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 min-w-0">
              {sessions.map((session) => {
                const lastActivityDate = new Date(session.lastActivity);
                const now = Date.now();
                const hourAgo = now - 60 * 60 * 1000;
                const dayAgo = now - 24 * 60 * 60 * 1000;

                let activityColor = 'var(--text-dim)';
                if (lastActivityDate.getTime() > hourAgo) activityColor = 'var(--accent-green)';
                else if (lastActivityDate.getTime() > dayAgo) activityColor = 'var(--accent-yellow)';

                return (
                  <div
                    key={session.key}
                    className="card-base p-3 min-w-0 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
                    style={{ borderColor: 'var(--border-dim)' }}
                    onClick={() => openSessionChat(session)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: activityColor, boxShadow: activityColor === 'var(--accent-green)' ? '0 0 6px rgba(0,255,106,0.5)' : undefined }} />
                          <h3 className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {session.label}
                          </h3>
                        </div>
                        <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                          {(() => {
                            const usage = usageData?.sessions?.find((u: any) => u.key === session.key);
                            const cost = usage?.totalCost || 0;
                            const calls = usage?.apiCalls || 0;
                            return <>
                              {session.messageCount} msgs{calls > 0 && ` · ${calls} API calls`}
                              {cost > 0 && <span style={{ color: cost > 10 ? 'var(--accent-red)' : cost > 1 ? 'var(--accent-yellow)' : 'var(--accent-green)' }}> · ${cost.toFixed(2)}</span>}
                            </>;
                          })()}
                        </div>
                      </div>
                      <div className="text-[9px] shrink-0" style={{ color: 'var(--text-dim)' }}>
                        {timeAgo(session.lastActivity)}
                      </div>
                    </div>

                    {session.lastMessages && session.lastMessages.length > 0 && (
                      <div className="mt-2 p-2 rounded text-[10px]" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="truncate" style={{ color: 'var(--text-secondary)' }}>
                          <span style={{ color: session.lastMessages[session.lastMessages.length - 1]?.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-green)' }}>
                            {session.lastMessages[session.lastMessages.length - 1]?.role === 'user' ? 'you: ' : 'assistant: '}
                          </span>
                          {session.lastMessages[session.lastMessages.length - 1]?.text?.slice(0, 100)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {sessions.length === 0 && (
              <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                <div className="text-2xl mb-2">◉</div>
                <div>No active sessions</div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
