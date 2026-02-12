'use client';

import { useState, useEffect, useCallback } from 'react';
import { timeAgo } from '@/lib/types';

export default function NextJobsWidget() {
  const [jobs, setJobs] = useState<any[]>([]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 30000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  if (!jobs.length) {
    return <div className="text-center py-4 text-[11px]" style={{ color: 'var(--text-dim)' }}>No scheduled jobs</div>;
  }

  const sortedJobs = [...jobs]
    .filter(j => j.enabled && j.state?.nextRunAtMs)
    .sort((a, b) => (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0))
    .slice(0, 5);

  return (
    <div className="space-y-2">
      {sortedJobs.map(job => {
        const nextRun = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs) : null;
        const lastRun = job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs) : null;
        return (
          <div key={job.id} className="flex items-center gap-2 p-2 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: job.enabled ? 'var(--accent-green)' : 'var(--accent-red)' }} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{job.name}</div>
              <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                {nextRun && <>Next: {nextRun.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
                {lastRun && <> · Last: {timeAgo(lastRun.toISOString())}</>}
              </div>
            </div>
            <span className="text-[8px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}>
              {job.schedule?.expr}
            </span>
          </div>
        );
      })}
      {jobs.length > 0 && sortedJobs.length === 0 && (
        <div className="text-center py-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>All jobs disabled</div>
      )}
    </div>
  );
}
