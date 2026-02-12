export type ModuleId =
  | 'overview'
  | 'screen'
  | 'terminal'
  | 'files'
  | 'sessions'
  | 'tasks'
  | 'memory'
  | 'cron'
  | 'logs'
  | 'network'
  | 'subagents';

export interface WidgetConfig {
  module: string;
  widget: string;
  size: 'sm' | 'md' | 'lg';
}

import type { ThemePresetId } from './themes';

export interface ClawtrolConfig {
  title?: string;
  modules?: ModuleId[];
  widgets?: WidgetConfig[];
  plugins?: string[];
  theme?: {
    mode?: 'dark' | 'light' | 'system';
    preset?: ThemePresetId;
    accent?: string;
  };
  openclaw?: {
    configPath?: string;
    gatewayPort?: number;
  };
  port?: number;
}

export const defaultConfig: ClawtrolConfig = {
  title: 'Clawtrol',
  modules: [
    'overview',
    'screen',
    'terminal',
    'files',
    'sessions',
    'tasks',
    'memory',
    'cron',
    'logs',
    'network',
    'subagents',
  ],
  theme: {
    mode: 'dark',
    preset: 'nova',
    accent: '#3b82f6',
  },
  port: 4781,
};

// Module metadata for the setup wizard and tab rendering
export const MODULE_META: Record<ModuleId, { label: string; icon: string; description: string }> = {
  overview:  { label: 'Overview',    icon: '', description: 'System info — CPU, RAM, disk, uptime, weather' },
  screen:    { label: 'Screen',      icon: '', description: 'Remote screen viewer with click interaction' },
  terminal:  { label: 'Terminal',    icon: '', description: 'Web terminal via ttyd PTY' },
  files:     { label: 'Files',       icon: '', description: 'File browser with read & zip' },
  sessions:  { label: 'Sessions',    icon: '', description: 'OpenClaw session viewer & chat' },
  tasks:     { label: 'Tasks',       icon: '', description: 'Kanban task board' },
  memory:    { label: 'Memory',      icon: '', description: 'Memory & markdown file browser' },
  cron:      { label: 'Cron',        icon: '', description: 'Cron job manager' },
  logs:      { label: 'Logs',        icon: '', description: 'Gateway log viewer' },
  network:   { label: 'Network',     icon: '', description: 'Tailscale peers & processes' },
  subagents: { label: 'Sub-agents',  icon: '', description: 'Sub-agent management' },
};
