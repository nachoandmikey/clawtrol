'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatBytes, timeAgo } from '@/lib/types';
import type { SystemInfo } from '@/lib/types';

export default function RecentNotesWidget() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [processes, setProcesses] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [sysRes, procRes] = await Promise.all([
        fetch('/api/system'),
        fetch('/api/processes/all'),
      ]);
      const sysData = await sysRes.json();
      const procData = await procRes.json();
      setSystem(sysData);
      setProcesses((procData.processes || []).sort((a: any, b: any) => b.rss - a.rss).slice(0, 5));
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!system) return <div className="animate-pulse space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] mb-2">
        <span style={{ color: 'var(--text-dim)' }}>RAM {system.memory.usedPercent.toFixed(1)}%</span>
        <span style={{ color: 'var(--text-dim)' }}>{formatBytes(system.memory.used)} / {formatBytes(system.memory.total)}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${system.memory.usedPercent}%`, background: system.memory.usedPercent > 85 ? 'var(--accent-red)' : 'var(--accent-purple)' }} />
      </div>
      <div className="space-y-1 mt-3">
        <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>TOP PROCESSES</div>
        {processes.map((p, i) => (
          <div key={`${p.pid}-${i}`} className="flex items-center justify-between py-1 border-b" style={{ borderColor: 'var(--border-dim)' }}>
            <span className="text-[10px] font-mono truncate max-w-[140px]" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>{formatBytes(p.rss)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
