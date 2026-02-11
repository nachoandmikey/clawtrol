import type { ClawtrolConfig } from './src/lib/config';

const config: ClawtrolConfig = {
  // Display name shown in the header
  title: 'Clawtrol',

  // Which modules to enable (comment out to disable)
  modules: [
    'overview',    // System info: CPU, RAM, disk, uptime, weather
    'screen',      // Remote screen viewer with click interaction
    'terminal',    // Web terminal (ttyd PTY)
    'files',       // File browser with read/zip
    'sessions',    // OpenClaw session viewer & chat
    'tasks',       // Kanban task board
    'memory',      // Memory/markdown file browser
    'cron',        // Cron job manager
    'logs',        // Gateway log viewer
    'network',     // Tailscale peers & processes
    'subagents',   // Sub-agent management
  ],

  // Theme configuration
  theme: {
    // 'dark' | 'light' | 'system'
    mode: 'dark',
    // Accent color (any valid CSS color or tailwind color name)
    accent: '#3b82f6', // blue-500
  },

  // OpenClaw configuration
  openclaw: {
    // Path to OpenClaw config (auto-detected if not set)
    // configPath: '~/.openclaw/config.json',

    // Gateway port (default: auto-detect from config)
    // gatewayPort: 3000,
  },

  // Dashboard port
  port: 3001,
};

export default config;
