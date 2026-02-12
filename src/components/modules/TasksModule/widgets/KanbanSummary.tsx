'use client';

import { useState, useEffect, useCallback } from 'react';

const COLUMNS = [
  { key: 'backlog', label: 'BACKLOG', color: 'var(--text-dim)' },
  { key: 'in-progress', label: 'PROGRESS', color: 'var(--accent-cyan)' },
  { key: 'in-review', label: 'REVIEW', color: 'var(--accent-purple)' },
  { key: 'done', label: 'DONE', color: 'var(--accent-green)' },
];

export default function KanbanSummaryWidget() {
  const [tasks, setTasks] = useState<any>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 15000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  if (!tasks) return <div className="animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>;

  const allTasks = tasks.tasks || [];
  const total = allTasks.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{total} tasks total</span>
      </div>
      {COLUMNS.map(col => {
        const count = allTasks.filter((t: any) => t.status === col.key).length;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={col.key}>
            <div className="flex justify-between mb-1">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
              <span className="text-[11px] font-mono font-bold" style={{ color: col.color }}>{count}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: col.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
