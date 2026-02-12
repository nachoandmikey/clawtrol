'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/shared/StatCard';
import { timeAgo } from '@/lib/types';

export default function CronModule() {
  const [cronJobs, setCronJobs] = useState<any[]>([]);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const fetchCron = useCallback(async () => {
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      setCronJobs(data.jobs || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCron();
  }, [fetchCron]);

  const toggleCronJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', id: jobId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionResult(data.message);
        fetchCron();
        setTimeout(() => setActionResult(null), 3000);
      }
    } catch {}
  };

  const triggerCronJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger', id: jobId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionResult(data.message);
        fetchCron();
        setTimeout(() => setActionResult(null), 3000);
      }
    } catch {}
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {actionResult && (
        <div className="text-[10px] px-3 py-1.5 rounded animate-pulse-glow" style={{ background: 'rgba(0,255,106,0.15)', color: 'var(--accent-green)' }}>
          {actionResult}
        </div>
      )}
      <Card title="SCHEDULED JOBS" actions={
        <button onClick={fetchCron} className="text-[10px] tracking-wider transition-colors" style={{ color: 'var(--text-dim)' }}>
          ↻ REFRESH
        </button>
      }>
        <div className="space-y-3">
          {cronJobs.map((job) => {
            const nextRun = job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs) : null;
            const lastRun = job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs) : null;

            return (
              <div key={job.id} className="card-base p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: job.enabled ? 'var(--accent-green)' : 'var(--accent-red)',
                          boxShadow: job.enabled ? 'var(--glow-green)' : 'var(--glow-red)'
                        }}
                      />
                      <h3 className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                        {job.name}
                      </h3>
                    </div>

                    <div className="text-[9px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Schedule: {job.schedule?.expr} ({job.schedule?.tz || 'UTC'})
                    </div>

                    <div className="text-[8px] space-y-1" style={{ color: 'var(--text-dim)' }}>
                      {lastRun && (
                        <div>Last run: {timeAgo(lastRun.toISOString())}</div>
                      )}
                      {nextRun && (
                        <div>Next run: {nextRun.toLocaleString()}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCronJob(job.id)}
                      className="px-2 py-1 rounded text-[9px] border transition-colors"
                      style={{
                        borderColor: job.enabled ? 'rgba(255,59,92,0.3)' : 'rgba(0,255,106,0.3)',
                        color: job.enabled ? 'var(--accent-red)' : 'var(--accent-green)',
                        background: job.enabled ? 'rgba(255,59,92,0.05)' : 'rgba(0,255,106,0.05)'
                      }}
                    >
                      {job.enabled ? 'DISABLE' : 'ENABLE'}
                    </button>

                    <button
                      onClick={() => triggerCronJob(job.id)}
                      className="px-2 py-1 rounded text-[9px] border transition-colors"
                      style={{
                        borderColor: 'rgba(0,255,200,0.3)',
                        color: 'var(--accent-cyan)',
                        background: 'rgba(0,255,200,0.05)'
                      }}
                    >
                      TRIGGER
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {cronJobs.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
            <div className="text-2xl mb-2">◷</div>
            <div>No scheduled jobs</div>
          </div>
        )}
      </Card>
    </div>
  );
}
