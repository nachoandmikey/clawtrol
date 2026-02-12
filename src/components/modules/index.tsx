import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { ModuleId } from '@/lib/config';

const Loading = () => (
  <div className="flex items-center justify-center py-16">
    <span className="animate-pulse-glow text-sm" style={{ color: 'var(--accent-cyan)' }}>◈ Loading module...</span>
  </div>
);

export const MODULE_COMPONENTS: Record<ModuleId, ComponentType> = {
  overview:   dynamic(() => import('./OverviewModule'),   { loading: Loading }),
  screen:     dynamic(() => import('./ScreenModule'),     { loading: Loading }),
  terminal:   dynamic(() => import('./TerminalModule'),   { loading: Loading }),
  files:      dynamic(() => import('./FilesModule'),      { loading: Loading }),
  sessions:   dynamic(() => import('./SessionsModule'),   { loading: Loading }),
  tasks:      dynamic(() => import('./TasksModule'),      { loading: Loading }),
  memory:     dynamic(() => import('./MemoryModule'),     { loading: Loading }),
  cron:       dynamic(() => import('./CronModule'),       { loading: Loading }),
  logs:       dynamic(() => import('./LogsModule'),       { loading: Loading }),
  network:    dynamic(() => import('./NetworkModule'),    { loading: Loading }),
  subagents:  dynamic(() => import('./SubagentsModule'),  { loading: Loading }),
};

// Register all widget manifests
import './OverviewModule/widgets';
import './MemoryModule/widgets';
import './TasksModule/widgets';
import './SessionsModule/widgets';
import './ScreenModule/widgets';
import './CronModule/widgets';
