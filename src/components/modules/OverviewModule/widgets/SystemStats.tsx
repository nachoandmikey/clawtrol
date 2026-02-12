'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatBytes, formatUptime } from '@/lib/types';
import type { SystemInfo } from '@/lib/types';

export default function SystemStatsWidget() {
  const [system, setSystem] = useState<SystemInfo | null>(null);

  const fetchSystem = useCallback(async () => {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      setSystem(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchSystem();
    const interval = setInterval(fetchSystem, 5000);
    return () => clearInterval(interval);
  }, [fetchSystem]);

  if (!system) return <div className="animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>;

  const mainDisk = system.disk.find(d => d.mount === '/' || d.mount.includes('Data'));
  const metrics = [
    { label: 'CPU', value: `${system.cpu.load.toFixed(1)}%`, color: system.cpu.load > 80 ? 'var(--accent-red)' : system.cpu.load > 50 ? 'var(--accent-yellow)' : 'var(--accent-cyan)' },
    { label: 'RAM', value: `${system.memory.usedPercent.toFixed(1)}%`, sub: formatBytes(system.memory.used), color: system.memory.usedPercent > 85 ? 'var(--accent-red)' : 'var(--accent-purple)' },
    { label: 'DISK', value: mainDisk ? `${mainDisk.usedPercent.toFixed(0)}%` : '—', sub: mainDisk ? `${formatBytes(mainDisk.available)} free` : undefined, color: 'var(--accent-yellow)' },
    { label: 'UPTIME', value: formatUptime(system.uptime), color: 'var(--accent-green)' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map(m => (
        <div key={m.label} className="p-2 rounded" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-dim)' }}>{m.label}</div>
          <div className="text-lg font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
          {m.sub && <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{m.sub}</div>}
        </div>
      ))}
    </div>
  );
}
