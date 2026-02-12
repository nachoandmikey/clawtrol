'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, MetricBlock, ProgressBar } from '@/components/shared/StatCard';
import { formatBytes } from '@/lib/types';
import type { SystemInfo, ProcessInfo } from '@/lib/types';

export default function MemoryModule() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [allProcesses, setAllProcesses] = useState<ProcessInfo[]>([]);
  const [processFilter, setProcessFilter] = useState('');
  const [killing, setKilling] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [processSort, setProcessSort] = useState<{ key: 'rss' | 'cpuPercent' | 'name'; dir: 'asc' | 'desc' }>({ key: 'rss', dir: 'desc' });

  const fetchSystem = useCallback(async () => {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      setSystem(data);
    } catch {}
  }, []);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch('/api/processes/all');
      const data = await res.json();
      setAllProcesses(data.processes || []);
    } catch {}
  }, []);

  const killProcess = async (pid: string, signal = 'TERM') => {
    if (!confirm(`Kill PID ${pid} with SIG${signal}?`)) return;
    setKilling(pid);
    try {
      const res = await fetch('/api/processes/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, signal }),
      });
      const data = await res.json();
      setActionResult(data.message || data.error);
      setTimeout(() => setActionResult(null), 3000);
      setTimeout(fetchProcesses, 500);
    } catch {}
    setKilling(null);
  };

  useEffect(() => {
    fetchSystem();
    fetchProcesses();
    const sysInterval = setInterval(fetchSystem, 5000);
    const procInterval = setInterval(fetchProcesses, 10000);
    return () => { clearInterval(sysInterval); clearInterval(procInterval); };
  }, [fetchSystem, fetchProcesses]);

  return (
    <div className="space-y-3">
      {actionResult && (
        <div className="text-[10px] px-3 py-1.5 rounded animate-pulse-glow" style={{ background: 'rgba(0,255,106,0.15)', color: 'var(--accent-green)' }}>
          {actionResult}
        </div>
      )}

      {/* Memory Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 animate-fade-in">
        <MetricBlock label="TOTAL RAM" value={system ? formatBytes(system.memory.total) : '—'} accent="var(--accent-purple)" />
        <MetricBlock
          label="USED"
          value={system ? formatBytes(system.memory.used) : '—'}
          sub={system ? `${system.memory.usedPercent.toFixed(1)}%` : undefined}
          accent={system && system.memory.usedPercent > 85 ? 'var(--accent-red)' : 'var(--accent-orange)'}
        />
        <MetricBlock label="FREE" value={system ? formatBytes(system.memory.free) : '—'} accent="var(--accent-green)" />
        <div className="card-base p-3 flex flex-col justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>PROCESSES</div>
            <div className="text-xl font-semibold font-mono" style={{ color: 'var(--accent-cyan)' }}>{allProcesses.length}</div>
          </div>
          <button
            onClick={async () => {
              setActionResult('Running cleanup...');
              try {
                const res = await fetch('/api/actions/cleanup', { method: 'POST' });
                const data = await res.json();
                setActionResult(data.output?.split('\n').pop() || 'Cleanup done');
                setTimeout(() => { setActionResult(null); fetchSystem(); fetchProcesses(); }, 5000);
              } catch { setActionResult('Cleanup failed'); }
            }}
            className="mt-2 px-2 py-1 rounded text-[10px] tracking-wider border transition-colors"
            style={{ borderColor: 'rgba(255,59,92,0.3)', color: 'var(--accent-red)', background: 'rgba(255,59,92,0.05)' }}
          >
            ✕ CLEANUP
          </button>
        </div>
      </div>

      {/* Memory Bar */}
      {system && (
        <Card className="animate-fade-in-1">
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-secondary)' }}>Memory Breakdown</span>
              <span style={{ color: system.memory.usedPercent > 80 ? 'var(--accent-red)' : system.memory.usedPercent > 60 ? 'var(--accent-yellow)' : 'var(--accent-green)' }}>
                {system.memory.usedPercent.toFixed(1)}%
              </span>
            </div>
            <div className="h-4 rounded-sm overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {system.memory.wired != null && (
                <div className="h-full transition-all duration-500" title={`Wired: ${formatBytes(system.memory.wired)}`}
                  style={{ width: `${(system.memory.wired / system.memory.total) * 100}%`, background: 'var(--accent-red)' }} />
              )}
              {system.memory.active != null && (
                <div className="h-full transition-all duration-500" title={`Active: ${formatBytes(system.memory.active)}`}
                  style={{ width: `${(system.memory.active / system.memory.total) * 100}%`, background: 'var(--accent-orange)' }} />
              )}
              {system.memory.inactive != null && (
                <div className="h-full transition-all duration-500" title={`Cache: ${formatBytes(system.memory.inactive)}`}
                  style={{ width: `${(system.memory.inactive / system.memory.total) * 100}%`, background: 'rgba(0,255,200,0.2)' }} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]" style={{ color: 'var(--text-dim)' }}>
              {system.memory.wired != null && (
                <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'var(--accent-red)' }} />Wired: {formatBytes(system.memory.wired)}</span>
              )}
              {system.memory.active != null && (
                <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'var(--accent-orange)' }} />Active: {formatBytes(system.memory.active)}</span>
              )}
              {system.memory.inactive != null && (
                <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'rgba(0,255,200,0.2)' }} />Cache: {formatBytes(system.memory.inactive)}</span>
              )}
              <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'rgba(255,255,255,0.05)' }} />Free: {formatBytes(system.memory.rawFree || system.memory.free)}</span>
            </div>
            <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-dim)' }}>
              <span>{formatBytes(system.memory.used)} used</span>
              <span>{formatBytes(system.memory.free)} available</span>
              <span>{formatBytes(system.memory.total)} total</span>
            </div>
          </div>
        </Card>
      )}

      {/* Process List */}
      <Card title="PROCESSES" actions={
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value)}
            placeholder="Filter..."
            className="rounded px-2 py-0.5 text-[10px] w-28"
          />
          <button onClick={fetchProcesses} className="text-[10px] transition-colors" style={{ color: 'var(--text-dim)' }}>↻</button>
        </div>
      } className="animate-fade-in-2">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border-dim)' }}>
                <th className="text-left py-2 pr-3 cursor-pointer select-none hover:opacity-80" onClick={() => setProcessSort(s => ({ key: 'name', dir: s.key === 'name' && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                  PROCESS {processSort.key === 'name' ? (processSort.dir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="text-right py-2 px-3 cursor-pointer select-none hover:opacity-80" onClick={() => setProcessSort(s => ({ key: 'rss', dir: s.key === 'rss' && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                  MEM {processSort.key === 'rss' ? (processSort.dir === 'desc' ? '↓' : '↑') : ''}
                </th>
                <th className="text-right py-2 px-3">%MEM</th>
                <th className="text-right py-2 px-3 cursor-pointer select-none hover:opacity-80" onClick={() => setProcessSort(s => ({ key: 'cpuPercent', dir: s.key === 'cpuPercent' && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                  %CPU {processSort.key === 'cpuPercent' ? (processSort.dir === 'desc' ? '↓' : '↑') : ''}
                </th>
                <th className="text-right py-2 px-3">PID</th>
                <th className="text-right py-2 pl-3">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {allProcesses
                .filter(p => !processFilter || p.name.toLowerCase().includes(processFilter.toLowerCase()) || p.command.toLowerCase().includes(processFilter.toLowerCase()))
                .sort((a, b) => {
                  const dir = processSort.dir === 'asc' ? 1 : -1;
                  if (processSort.key === 'name') return dir * a.name.localeCompare(b.name);
                  return dir * (a[processSort.key] - b[processSort.key]);
                })
                .map((p, i) => (
                  <tr key={`${p.pid}-${i}`} className="border-b hover:bg-[rgba(0,255,200,0.02)] transition-colors" style={{ borderColor: 'var(--border-dim)' }}>
                    <td className="py-1.5 pr-3">
                      <div className="font-mono truncate max-w-[200px] md:max-w-[300px]" title={p.command} style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                    </td>
                    <td className="text-right py-1.5 px-3 font-mono" style={{ color: 'var(--text-secondary)' }}>{formatBytes(p.rss)}</td>
                    <td className="text-right py-1.5 px-3">
                      <span style={{ color: p.memPercent > 10 ? 'var(--accent-red)' : p.memPercent > 5 ? 'var(--accent-yellow)' : 'var(--text-dim)' }}>
                        {p.memPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right py-1.5 px-3">
                      <span style={{ color: p.cpuPercent > 50 ? 'var(--accent-red)' : p.cpuPercent > 10 ? 'var(--accent-yellow)' : 'var(--text-dim)' }}>
                        {p.cpuPercent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right py-1.5 px-3 font-mono" style={{ color: 'var(--text-dim)' }}>{p.pid}</td>
                    <td className="text-right py-1.5 pl-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => killProcess(p.pid)}
                          disabled={killing === p.pid}
                          className="px-2 py-0.5 rounded text-[10px] border transition-colors disabled:opacity-50"
                          title="SIGTERM"
                          style={{ borderColor: 'rgba(255,138,0,0.3)', color: 'var(--accent-orange)', background: 'rgba(255,138,0,0.05)' }}
                        >
                          {killing === p.pid ? '···' : 'STOP'}
                        </button>
                        <button
                          onClick={() => killProcess(p.pid, 'KILL')}
                          disabled={killing === p.pid}
                          className="px-2 py-0.5 rounded text-[10px] border transition-colors disabled:opacity-50"
                          title="SIGKILL"
                          style={{ borderColor: 'rgba(255,59,92,0.3)', color: 'var(--accent-red)', background: 'rgba(255,59,92,0.05)' }}
                        >
                          KILL
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
