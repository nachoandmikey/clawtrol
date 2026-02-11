'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SystemInfo {
  cpu: { model: string; cores: number; speed: number; load: number };
  memory: { total: number; used: number; free: number; usedPercent: number; active?: number; wired?: number; inactive?: number; purgeable?: number; rawFree?: number };
  disk: Array<{ fs: string; size: number; used: number; available: number; usedPercent: number; mount: string }>;
  os: { platform: string; distro: string; release: string; hostname: string; arch: string };
  uptime: number;
  temperature: number | null;
}

interface GatewayStatus {
  running: boolean;
  process: { pid: string; memory: number; cpu: number; uptime: number } | null;
  version: string | null;
}

interface TailscaleStatus {
  self: { ip: string; hostname: string; dnsName: string; os: string; online: boolean };
  peers: Array<{ ip: string; hostname: string; dnsName: string; os: string; online: boolean; lastSeen: string }>;
  magicDNS: string;
}

interface PM2Process {
  name: string; status: string; cpu: number; memory: number; uptime: number; restarts: number; pid: number;
}

interface Weather {
  location: string;
  current: { temp: string; feelsLike: string; humidity: string; description: string; windSpeed: string; uvIndex: string };
  today: { maxTemp: string; minTemp: string; sunrise: string; sunset: string };
}

interface ScreenInfo {
  logicalWidth: number; logicalHeight: number; retina: boolean;
}

interface ProcessInfo {
  pid: string; rss: number; memPercent: number; cpuPercent: number; command: string; name: string;
}

interface TerminalEntry {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getMarkerCategory(markerName: string): string {
  const categories: Record<string, string[]> = {
    'Blood Count (CBC)': ['Hemoglobin', 'Hematocrit', 'MCV', 'MCH', 'MCHC', 'RBC', 'WBC', 'Platelets', 'RDW'],
    'Lipids & Cardiovascular': ['Total Cholesterol', 'LDL', 'HDL', 'Triglycerides', 'ApoB', 'Lp(a)', 'ApoA1'],
    'Metabolic': ['Glucose', 'HbA1c', 'Insulin', 'Uric Acid', 'HOMA-IR'],
    'Hormones': ['Testosterone', 'TSH', 'T3', 'T4', 'Cortisol', 'DHEA-S', 'Estradiol', 'SHBG', 'FSH', 'LH'],
    'Vitamins & Minerals': ['Vitamin D', 'B12', 'Folate', 'Zinc', 'Magnesium', 'Calcium', 'Phosphorus'],
    'Iron Panel': ['Ferritin', 'Iron', 'Transferrin', 'Transferrin Sat', 'TIBC'],
    'Liver & Kidney': ['ALT', 'AST', 'GGT', 'Bilirubin', 'Albumin', 'Creatinine', 'BUN', 'eGFR'],
    'Inflammation': ['CRP', 'hsCRP', 'ESR', 'Homocysteine'],
  };

  for (const [category, markers] of Object.entries(categories)) {
    if (markers.some(marker => markerName.toLowerCase().includes(marker.toLowerCase()))) {
      return category;
    }
  }

  return 'Other';
}

// ─── Markdown Renderer ───────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return parts.map((part, i) => {
    // Code blocks
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const firstNewline = inner.indexOf('\n');
      const code = firstNewline > -1 ? inner.slice(firstNewline + 1) : inner;
      const lang = firstNewline > -1 ? inner.slice(0, firstNewline).trim() : '';
      return (
        <pre key={i} className="my-2 p-3 rounded overflow-x-auto text-[11px]" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-dim)' }}>
          {lang && <div className="text-[9px] mb-1 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>{lang}</div>}
          <code style={{ color: 'var(--accent-cyan)' }}>{code}</code>
        </pre>
      );
    }
    
    // Process inline markdown per line
    const lines = part.split('\n');
    return lines.map((line, li) => {
      // Headers
      const h3 = line.match(/^### (.+)/);
      if (h3) return <div key={`${i}-${li}`} className="text-[13px] font-bold mt-2 mb-1" style={{ color: 'var(--accent-cyan)' }}>{h3[1]}</div>;
      const h2 = line.match(/^## (.+)/);
      if (h2) return <div key={`${i}-${li}`} className="text-[14px] font-bold mt-2 mb-1" style={{ color: 'var(--accent-cyan)' }}>{h2[1]}</div>;
      const h1 = line.match(/^# (.+)/);
      if (h1) return <div key={`${i}-${li}`} className="text-[15px] font-bold mt-2 mb-1" style={{ color: 'var(--accent-cyan)' }}>{h1[1]}</div>;
      
      // List items
      const bullet = line.match(/^(\s*)[•\-\*] (.+)/);
      if (bullet) {
        const indent = Math.min(Math.floor(bullet[1].length / 2), 3);
        return <div key={`${i}-${li}`} style={{ paddingLeft: `${indent * 16 + 8}px`, color: 'var(--text-primary)' }}>• {renderInline(bullet[2])}</div>;
      }
      
      // Empty lines
      if (!line.trim()) return <div key={`${i}-${li}`} className="h-2" />;
      
      // Regular text with inline formatting
      return <div key={`${i}-${li}`}>{renderInline(line)}</div>;
    });
  });
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Process: bold, italic, inline code, links
  const regex = /(\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  
  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    
    if (match[2] || match[3]) {
      // Bold
      nodes.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{match[2] || match[3]}</strong>);
    } else if (match[4]) {
      // Inline code
      nodes.push(<code key={key++} className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}>{match[4]}</code>);
    } else if (match[5] || match[6]) {
      // Italic
      nodes.push(<em key={key++} style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{match[5] || match[6]}</em>);
    } else if (match[7] && match[8]) {
      // Link
      nodes.push(<a key={key++} href={match[8]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'underline' }}>{match[7]}</a>);
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  
  return nodes.length > 0 ? nodes : [text];
}

// ─── Sparkline Component ─────────────────────────────────────────────────────

function Sparkline({ data, color = '#00ffc8', height = 32, width = 120 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M${points.join(' L')}`;
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className="inline-block">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={pathD} className="sparkline-path" stroke={color} />
      {/* Current value dot */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
          r="2"
          fill={color}
          className="animate-pulse-glow"
        />
      )}
    </svg>
  );
}

// ─── Card Components ─────────────────────────────────────────────────────────

function Card({ title, children, className = '', actions, tag }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode; tag?: string }) {
  return (
    <div className={`card-base ${className}`}>
      {(title || actions) && (
        <div className="flex justify-between items-center px-3 py-2 border-b" style={{ borderColor: 'var(--border-dim)' }}>
          <div className="flex items-center gap-2">
            {title && (
              <h2 className="text-[11px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-orbitron)' }}>
                {title}
              </h2>
            )}
            {tag && (
              <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}>
                {tag}
              </span>
            )}
          </div>
          {actions}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

function MetricBlock({ label, value, sub, accent = 'var(--accent-cyan)', sparkData }: { label: string; value: string; sub?: string; accent?: string; sparkData?: number[] }) {
  return (
    <div className="card-base p-3">
      <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-dim)' }}>
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xl font-semibold tabular-nums" style={{ color: accent, fontFamily: 'var(--font-data)' }}>
            {value}
          </div>
          {sub && <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-dim)' }}>{sub}</div>}
        </div>
        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} color={accent} height={28} width={80} />
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ online, label }: { online: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={online ? 'status-online animate-pulse-glow' : 'status-offline'} />
      {label && <span className="text-xs" style={{ color: online ? 'var(--accent-green)' : 'var(--accent-red)' }}>{label}</span>}
    </div>
  );
}

function ProgressBar({ value, color = 'var(--accent-cyan)', height = 4 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="w-full rounded-sm overflow-hidden" style={{ height, background: 'rgba(255,255,255,0.05)' }}>
      <div
        className="h-full rounded-sm transition-all duration-700 ease-out"
        style={{ width: `${Math.min(value, 100)}%`, background: color, boxShadow: `0 0 8px ${color}40` }}
      />
    </div>
  );
}

// ─── Activity Feed ───────────────────────────────────────────────────────────

function LogsView({ logs }: { logs: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs]);
  return (
    <div 
      ref={ref} 
      className="rounded p-3 overflow-y-auto overflow-x-hidden font-mono text-[11px] leading-relaxed" 
      style={{ 
        background: 'var(--bg-secondary)',
        height: 'calc(100dvh - 280px)',
        minHeight: '300px',
        maxHeight: 'calc(100vh - 280px)',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain'
      }}
    >
      <pre className="whitespace-pre-wrap break-all" style={{ color: '#b0bcc8' }}>{logs || 'Loading...'}</pre>
    </div>
  );
}

function ActivityFeed({ logs }: { logs: string }) {
  const feedRef = useRef<HTMLDivElement>(null);
  const lines = logs
    .split('\n')
    .filter(l => l.trim())
    .slice(-20);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [logs]);

  const colorLine = (line: string) => {
    if (line.includes('ERROR') || line.includes('error') || line.includes('ERR')) return 'var(--accent-red)';
    if (line.includes('WARN') || line.includes('warn')) return 'var(--accent-yellow)';
    if (line.includes('INFO') || line.includes('heartbeat') || line.includes('connected')) return 'var(--accent-cyan)';
    return 'var(--text-secondary)';
  };

  return (
    <div ref={feedRef} className="h-48 overflow-auto terminal-log p-2 rounded max-w-full" style={{ background: 'var(--bg-secondary)' }}>
      {lines.length === 0 ? (
        <div style={{ color: 'var(--text-dim)' }}>Waiting for logs...</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="py-0.5 truncate max-w-full" title={line} style={{ color: colorLine(line) }}>
            {line}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Web Terminal ────────────────────────────────────────────────────────────

function WebTerminal() {
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [runningCmd, setRunningCmd] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Interactive commands that need a PTY (will hang in exec)
  const INTERACTIVE_CMDS = ['claude', 'vim', 'nvim', 'nano', 'top', 'htop', 'less', 'more', 'man', 'ssh', 'python3 -i', 'python -i', 'node --', 'irb', 'psql'];

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history, running]);

  const cancelRun = () => {
    if (abortRef.current) abortRef.current.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setHistory(prev => [...prev, {
      command: runningCmd,
      stdout: '',
      stderr: `Cancelled after ${elapsed}s`,
      exitCode: 130,
      timestamp: Date.now(),
    }]);
    setRunning(false);
    setRunningCmd('');
    setElapsed(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const execute = async () => {
    const cmd = input.trim();
    if (!cmd) return;

    // Check for interactive commands
    const baseCmd = cmd.split(/\s+/)[0];
    if (INTERACTIVE_CMDS.some(ic => cmd === ic || baseCmd === ic)) {
      setHistory(prev => [...prev, {
        command: cmd,
        stdout: '',
        stderr: `⚠ "${baseCmd}" is interactive and needs a real terminal (PTY).\nThis web terminal only supports non-interactive commands.\n\nTry running it from the Screen tab instead, or use SSH.`,
        exitCode: 1,
        timestamp: Date.now(),
      }]);
      setInput('');
      return;
    }

    setRunning(true);
    setRunningCmd(cmd);
    setInput('');
    setElapsed(0);
    setCmdHistory(prev => [...prev, cmd]);
    setHistoryIndex(-1);

    // Start elapsed timer
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
        signal: controller.signal,
      });
      const data = await res.json();
      setHistory(prev => [...prev, {
        command: cmd,
        stdout: data.stdout || '',
        stderr: data.stderr || data.error || '',
        exitCode: data.exitCode ?? 1,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setHistory(prev => [...prev, {
          command: cmd,
          stdout: '',
          stderr: `Connection error: ${err}`,
          exitCode: 1,
          timestamp: Date.now(),
        }]);
      }
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    setRunningCmd('');
    setElapsed(0);
    abortRef.current = null;
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      execute();
    } else if (e.key === 'c' && e.ctrlKey && running) {
      e.preventDefault();
      cancelRun();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIndex = historyIndex === -1 ? cmdHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(cmdHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= cmdHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(cmdHistory[newIndex]);
        }
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setHistory([]);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]" onClick={() => inputRef.current?.focus()}>
      {/* Output area */}
      <div ref={outputRef} className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed" style={{ background: '#0c0c12' }}>
        {history.length === 0 && !running && (
          <div style={{ color: 'var(--text-dim)' }}>
            <span style={{ color: 'var(--accent-cyan)', opacity: 0.5 }}>~/home</span> — type a command to get started
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className="mb-4">
            <div className="flex items-center gap-2">
              <span style={{ color: entry.exitCode === 0 ? 'var(--accent-cyan)' : 'var(--accent-red)' }}>❯</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{entry.command}</span>
              {entry.exitCode !== 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,59,92,0.15)', color: 'var(--accent-red)' }}>
                  exit {entry.exitCode}
                </span>
              )}
            </div>
            {entry.stdout && <pre className="mt-1.5 whitespace-pre-wrap pl-5" style={{ color: '#c8d0da' }}>{entry.stdout}</pre>}
            {entry.stderr && <pre className="mt-1.5 whitespace-pre-wrap pl-5" style={{ color: 'var(--accent-red)' }}>{entry.stderr}</pre>}
          </div>
        ))}
        {running && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span style={{ color: 'var(--accent-cyan)' }}>❯</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{runningCmd}</span>
            </div>
            <div className="flex items-center gap-3 mt-2 pl-5">
              <span className="animate-pulse-glow" style={{ color: 'var(--accent-cyan)' }}>⠿</span>
              <span style={{ color: 'var(--text-secondary)' }}>Running{elapsed > 0 ? ` (${elapsed}s)` : '...'}</span>
              <button
                onClick={cancelRun}
                className="px-2 py-0.5 rounded text-[10px] border transition-colors"
                style={{ borderColor: 'rgba(255,59,92,0.3)', color: 'var(--accent-red)', background: 'rgba(255,59,92,0.08)' }}
              >
                ✕ CANCEL
              </button>
              <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>or Ctrl+C</span>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--border-accent)', background: '#08080e' }}>
        <span style={{ color: 'var(--accent-cyan)' }}>❯</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={running ? 'Command running...' : 'Enter command...'}
          disabled={running}
          className="flex-1 bg-transparent border-none outline-none text-[13px]"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)', caretColor: 'var(--accent-cyan)' }}
          autoFocus
        />
        {!running && (
          <div className="flex items-center gap-3 text-[10px] shrink-0" style={{ color: 'var(--text-dim)' }}>
            <span>↑↓ history</span>
            <span>^L clear</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Interactive Screen Component ────────────────────────────────────────────

function InteractiveScreen({ screen, onRefresh, externalScreenInfo }: { screen: string; onRefresh: () => void; externalScreenInfo?: ScreenInfo | null }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [screenInfo, setScreenInfo] = useState<ScreenInfo | null>(null);
  const [clicking, setClicking] = useState(false);
  const [lastClick, setLastClick] = useState<{ x: number; y: number } | null>(null);
  const [interactMode, setInteractMode] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [showTypeBox, setShowTypeBox] = useState(false);
  const [hoverMode, setHoverMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Use external screen info from capture response (always fresh)
  useEffect(() => {
    if (externalScreenInfo) {
      setScreenInfo(externalScreenInfo);
    }
  }, [externalScreenInfo]);

  // Fallback: fetch on mount if no external info
  useEffect(() => {
    if (!externalScreenInfo) {
      fetch('/api/screen/info').then(r => r.json()).then(setScreenInfo).catch(() => {});
    }
  }, [externalScreenInfo]);

  const handleClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!interactMode || !screenInfo || !imgRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = imgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const x = Math.round(relX * screenInfo.logicalWidth);
    const y = Math.round(relY * screenInfo.logicalHeight);
    const isHover = hoverMode || e.shiftKey;

    setClicking(true);
    setLastClick({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    try {
      await fetch('/api/screen/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, type: isHover ? 'hover' : 'click' }),
      });
      if (!isHover) {
        setTimeout(() => hiddenInputRef.current?.focus(), 100);
      }
      setTimeout(onRefresh, 500);
    } catch {}
    setTimeout(() => { setClicking(false); setLastClick(null); }, 500);
  };

  const handleKey = async (key: string) => {
    try {
      await fetch('/api/screen/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 0, type: 'key', text: key }),
      });
      setTimeout(onRefresh, 300);
    } catch {}
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  const handleShortcut = async (shortcut: string) => {
    try {
      await fetch('/api/screen/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 0, type: 'shortcut', text: shortcut }),
      });
      setTimeout(onRefresh, 300);
    } catch {}
  };

  const handleType = async () => {
    if (!typingText) return;
    try {
      await fetch('/api/screen/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 0, type: 'type', text: typingText }),
      });
      setTypingText('');
      setTimeout(onRefresh, 300);
    } catch {}
  };

  // Direct keyboard capture when interactive mode is on
  useEffect(() => {
    if (!interactMode) return;

    const keyMap: Record<string, string> = {
      Enter: 'return', Backspace: 'delete', Escape: 'escape', Tab: 'tab',
      ArrowUp: 'arrow-up', ArrowDown: 'arrow-down', ArrowLeft: 'arrow-left', ArrowRight: 'arrow-right',
      ' ': 'space',
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const mapped = keyMap[e.key];
      if (mapped) {
        e.preventDefault();
        await fetch('/api/screen/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: 0, y: 0, type: 'key', text: mapped }),
        });
        setTimeout(onRefresh, 400);
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        await fetch('/api/screen/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: 0, y: 0, type: 'type', text: e.key }),
        });
        setTimeout(onRefresh, 800);
      } else if (e.key.length === 1 && e.metaKey) {
        e.preventDefault();
        await fetch('/api/screen/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: 0, y: 0, type: 'shortcut', text: `cmd+${e.key}` }),
        });
        setTimeout(onRefresh, 400);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [interactMode, onRefresh]);

  const handleHiddenInput = async (e: React.FormEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    if (!value) return;
    e.currentTarget.value = '';
    try {
      await fetch('/api/screen/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 0, y: 0, type: 'type', text: value }),
      });
      setTimeout(onRefresh, 800);
    } catch {}
  };

  const handleHiddenKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const keyMap: Record<string, string> = {
      Enter: 'return', Backspace: 'delete', Escape: 'escape', Tab: 'tab',
      ArrowUp: 'arrow-up', ArrowDown: 'arrow-down', ArrowLeft: 'arrow-left', ArrowRight: 'arrow-right',
    };
    const mapped = keyMap[e.key];
    if (mapped) {
      e.preventDefault();
      await handleKey(mapped);
    }
  };

  const btnStyle = "px-2.5 py-1 rounded text-[11px] font-medium transition-all";
  const btnDefault = `${btnStyle} border` ;
  const btnDefaultStyle = { background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)', color: 'var(--text-secondary)' };

  return (
    <div ref={containerRef} className="space-y-2" style={{ background: 'var(--bg-primary)' }}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setInteractMode(!interactMode)}
          className={`${btnStyle} border`}
          style={interactMode ? { background: 'rgba(0,255,200,0.15)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' } : btnDefaultStyle}
        >
          {interactMode ? '◉ INTERACTIVE' : '○ INTERACTIVE'}
        </button>
        {interactMode && (
          <>
            <button
              onClick={() => setHoverMode(!hoverMode)}
              className={`${btnStyle} border`}
              style={hoverMode ? { background: 'rgba(255,214,0,0.15)', borderColor: 'var(--accent-yellow)', color: 'var(--accent-yellow)' } : btnDefaultStyle}
            >
              {hoverMode ? '◉ HOVER' : '○ HOVER'}
            </button>
            <button onClick={() => { setShowTypeBox(!showTypeBox); hiddenInputRef.current?.focus(); }} className={btnDefault} style={btnDefaultStyle}>
              TYPE
            </button>
            <span className="mx-1" style={{ color: 'var(--border-dim)' }}>│</span>
            {['return:↵', 'escape:ESC', 'space:SPC', 'tab:TAB', 'delete:⌫'].map(k => {
              const [key, label] = k.split(':');
              return <button key={key} onClick={() => handleKey(key)} className={btnDefault} style={btnDefaultStyle}>{label}</button>;
            })}
            <span className="mx-1" style={{ color: 'var(--border-dim)' }}>│</span>
            {['cmd+a:⌘A', 'cmd+c:⌘C', 'cmd+v:⌘V'].map(k => {
              const [key, label] = k.split(':');
              return <button key={key} onClick={() => handleShortcut(key)} className={btnDefault} style={btnDefaultStyle}>{label}</button>;
            })}
          </>
        )}
        <div className="ml-auto flex gap-1.5">
          <button onClick={toggleFullscreen} className={btnDefault} style={btnDefaultStyle}>⛶ FULL</button>
          <button onClick={onRefresh} className={btnDefault} style={btnDefaultStyle}>↻ CAPTURE</button>
        </div>
      </div>

      {/* Type Input */}
      {showTypeBox && (
        <div className="flex gap-2">
          <input
            type="text"
            value={typingText}
            onChange={(e) => setTypingText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleType()}
            placeholder="Type text and press Enter..."
            className="flex-1 rounded px-3 py-1.5 text-sm"
            autoFocus
          />
          <button onClick={handleType} className={btnDefault} style={{ background: 'rgba(0,255,200,0.1)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}>
            SEND
          </button>
        </div>
      )}

      {/* Screen */}
      <div className="relative rounded overflow-hidden border" style={{ borderColor: 'var(--border-dim)' }}>
        {screen ? (
          <>
            <img
              ref={imgRef}
              src={screen}
              alt="Screen"
              className={`w-full h-auto ${interactMode ? (hoverMode ? 'cursor-pointer' : 'cursor-crosshair') : ''}`}
              style={interactMode ? { touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' } : undefined}
              onClick={handleClick}
              onTouchEnd={(e) => { if (interactMode) e.preventDefault(); }}
              draggable={false}
            />
            {clicking && lastClick && (
              <div
                className={`absolute w-5 h-5 rounded-full border -translate-x-1/2 -translate-y-1/2 animate-ping pointer-events-none`}
                style={{
                  left: lastClick.x,
                  top: lastClick.y,
                  borderColor: hoverMode ? 'var(--accent-yellow)' : 'var(--accent-cyan)',
                  background: hoverMode ? 'rgba(255,214,0,0.3)' : 'rgba(0,255,200,0.3)',
                }}
              />
            )}
            {interactMode && (
              <>
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded text-[10px]" style={{ background: 'rgba(0,0,0,0.8)', color: 'var(--accent-cyan)' }}>
                  {hoverMode ? 'TAP → HOVER · SHIFT+TAP → CLICK' : 'TAP → CLICK · SHIFT+TAP → HOVER'}
                </div>
                <input
                  ref={hiddenInputRef}
                  type="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 opacity-[0.01] text-[1px]"
                  onInput={handleHiddenInput}
                  onKeyDown={handleHiddenKeyDown}
                />
              </>
            )}
          </>
        ) : (
          <div className="h-96 flex items-center justify-center" style={{ color: 'var(--text-dim)' }}>
            <span className="animate-pulse-glow">◈ Capturing screen...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

type TabId = 'overview' | 'memory' | 'logs' | 'screen' | 'network' | 'terminal' | 'sessions' | 'cron' | 'files' | 'expenses' | 'tasks' | 'subclawds' | 'health';
const VALID_TABS: TabId[] = ['overview', 'memory', 'logs', 'screen', 'network', 'terminal', 'sessions', 'cron', 'files', 'expenses', 'tasks', 'subclawds', 'health'];

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#050508', color: '#00ffc8' }}>Loading...</div>}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  // URL-based tab routing
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const initialTab: TabId = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'overview';

  // State
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [gateway, setGateway] = useState<GatewayStatus | null>(null);
  const [tailscale, setTailscale] = useState<TailscaleStatus | null>(null);
  const [processes, setProcesses] = useState<PM2Process[]>([]);
  const [weather] = useState<Weather | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [screen, setScreen] = useState<string>('');
  const [screenDims, setScreenDims] = useState<ScreenInfo | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeTab, setActiveTabState] = useState<TabId>(initialTab);
  
  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    router.push(`?tab=${tab}`, { scroll: false });
  }, [router]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Health data
  const [healthData, setHealthData] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<any>(null);
  const [selectedMarker, setSelectedMarker] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [expandedThrive, setExpandedThrive] = useState<number | null>(null);
  const [expandedSupplement, setExpandedSupplement] = useState<string | null>(null);
  const [allProcesses, setAllProcesses] = useState<ProcessInfo[]>([]);
  const [usageData, setUsageData] = useState<any>(null);
  const [processFilter, setProcessFilter] = useState('');
  const [killing, setKilling] = useState<string | null>(null);
  const [processSort, setProcessSort] = useState<{ key: 'rss' | 'cpuPercent' | 'name'; dir: 'asc' | 'desc' }>({ key: 'rss', dir: 'desc' });
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  // Sparkline history
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  // New features state
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Health dashboard state
  const [healthTimeRange, setHealthTimeRange] = useState<string>('ALL');
  const [hoveredTooltip, setHoveredTooltip] = useState<any>(null);
  const [cronJobs, setCronJobs] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [subclawds, setSubclawds] = useState<any>(null);
  const [selectedAgentLogs, setSelectedAgentLogs] = useState<any>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [filesPath, setFilesPath] = useState('os.homedir()');
  const [filesData, setFilesData] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [claudeUsage, setClaudeUsage] = useState<any>(null);
  const [aranet, setAranet] = useState<any>(null);

  // Fetchers
  const fetchAll = useCallback(async () => {
    const fetches = [
      fetch('/api/system').then(r => r.json()).then(data => {
        setSystem(data);
        setCpuHistory(prev => [...prev.slice(-59), data.cpu.load]);
        setMemHistory(prev => [...prev.slice(-59), data.memory.usedPercent]);
      }).catch(() => {}),
      fetch('/api/gateway/status').then(r => r.json()).then(setGateway).catch(() => {}),
      fetch('/api/tailscale').then(r => r.json()).then(setTailscale).catch(() => {}),
      fetch('/api/processes').then(r => r.json()).then(d => setProcesses(d.pm2 || [])).catch(() => {}),
      fetch('/api/claude-usage').then(r => r.json()).then(setClaudeUsage).catch(() => {}),
      fetch('/api/aranet').then(r => r.json()).then(setAranet).catch(() => {}),
    ];
    await Promise.all(fetches);
    setLastUpdate(new Date());
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

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/gateway/logs?lines=100');
      const data = await res.json();
      setLogs(data.logs || '');
    } catch {}
  }, []);

  const fetchScreen = useCallback(async () => {
    try {
      const res = await fetch('/api/screen');
      const data = await res.json();
      if (data.image) setScreen(data.image);
      if (data.screenDims) setScreenDims(data.screenDims);
    } catch {}
  }, []);

  const restartGateway = async () => {
    if (!confirm('Restart OpenClaw gateway?')) return;
    setRestarting(true);
    try {
      await fetch('/api/gateway/restart', { method: 'POST' });
      setActionResult('Gateway restarting...');
      setTimeout(() => { fetchAll(); setRestarting(false); setActionResult(null); }, 5000);
    } catch { setRestarting(false); }
  };

  const doAction = async (action: string, target?: string) => {
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target }),
      });
      const data = await res.json();
      setActionResult(data.message || data.error || 'Done');
      setTimeout(() => setActionResult(null), 3000);
      fetchAll();
    } catch {}
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      setMessage('');
      setActionResult('Message sent');
      setTimeout(() => setActionResult(null), 2000);
    } catch {}
    setSending(false);
  };

  // New features fetch functions
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
      // Add optimistic message
      setChatMessages(prev => [...prev, { role: 'user', text: msg, timestamp: new Date().toISOString() }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      // Refresh after a delay to get the response
      setTimeout(refreshChat, 5000);
    } catch {}
    setChatSending(false);
  }, [chatInput, selectedSession, chatSending, refreshChat]);

  const fetchCron = useCallback(async () => {
    try {
      const res = await fetch('/api/cron');
      const data = await res.json();
      setCronJobs(data.jobs || []);
    } catch {}
  }, []);

  const fetchExpenses = useCallback(async (quarter?: string) => {
    try {
      const q = quarter || selectedQuarter;
      const url = q ? `/api/expenses?quarter=${q}` : '/api/expenses';
      const res = await fetch(url);
      const data = await res.json();
      setExpenses(data);
      // Set selectedQuarter from response if not already set
      if (!selectedQuarter && data.currentQuarter) {
        setSelectedQuarter(data.currentQuarter);
      }
    } catch {}
  }, [selectedQuarter]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch {}
  }, []);

  const fetchSubclawds = useCallback(async () => {
    try {
      // Archive any completed runs first
      await fetch('/api/subclawds/history', { method: 'POST' }).catch(() => {});
      
      const res = await fetch('/api/subclawds');
      const data = await res.json();
      setSubclawds(data);
    } catch {}
  }, []);

  const fetchHealth = useCallback(async (timeRange = healthTimeRange) => {
    setLoadingHealth(true);
    try {
      const res = await fetch(`/api/health-data?timeRange=${timeRange}`);
      const data = await res.json();
      setHealthData(data);
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    } finally {
      setLoadingHealth(false);
    }
  }, [healthTimeRange]);

  const fetchFiles = useCallback(async (path?: string) => {
    const targetPath = path || filesPath;
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      setFilesData(data);
      setFilesPath(targetPath);
      setSelectedFile(null);
    } catch {}
  }, [filesPath]);

  const readFile = async (filePath: string) => {
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setSelectedFile({ path: filePath, ...data });
    } catch {}
  };

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
      }
    } catch {}
  };

  // Effects
  useEffect(() => {
    fetchAll();
    fetchLogs();
    fetchScreen();
    fetchProcesses();

    if (!autoRefresh) return;
    const systemInterval = setInterval(fetchAll, 5000);
    const logsInterval = setInterval(fetchLogs, 10000);
    const screenInterval = setInterval(fetchScreen, 30000);
    const processInterval = setInterval(fetchProcesses, 10000);
    return () => { clearInterval(systemInterval); clearInterval(logsInterval); clearInterval(screenInterval); clearInterval(processInterval); };
  }, [autoRefresh, fetchAll, fetchLogs, fetchScreen, fetchProcesses]);

  // Fetch data when tabs become active
  useEffect(() => {
    if (activeTab === 'sessions') { fetchSessions(); fetchUsage(); }
    if (activeTab === 'cron') fetchCron();
    if (activeTab === 'files') fetchFiles();
    if (activeTab === 'expenses') fetchExpenses();
    if (activeTab === 'tasks') fetchTasks();
    if (activeTab === 'subclawds') fetchSubclawds();
    if (activeTab === 'health') fetchHealth();
  }, [activeTab, fetchSessions, fetchCron, fetchFiles, fetchExpenses, fetchTasks, fetchSubclawds]);

  const mainDisk = system?.disk.find(d => d.mount === '/' || d.mount.includes('Data'));

  // CPU color
  const cpuColor = system && system.cpu.load > 80 ? 'var(--accent-red)' : system && system.cpu.load > 50 ? 'var(--accent-yellow)' : 'var(--accent-cyan)';
  const memColor = system && system.memory.usedPercent > 85 ? 'var(--accent-red)' : system && system.memory.usedPercent > 65 ? 'var(--accent-yellow)' : 'var(--accent-purple)';

  const tabs = [
    { id: 'overview' as const, label: 'OVERVIEW', icon: '◆' },
    { id: 'memory' as const, label: 'MEMORY', icon: '◈' },
    { id: 'screen' as const, label: 'SCREEN', icon: '◧' },
    { id: 'logs' as const, label: 'LOGS', icon: '◫' },
    { id: 'network' as const, label: 'NETWORK', icon: '◎' },
    { id: 'terminal' as const, label: 'TERMINAL', icon: '▸' },
    { id: 'sessions' as const, label: 'SESSIONS', icon: '◉' },
    { id: 'cron' as const, label: 'CRON', icon: '◷' },
    { id: 'expenses' as const, label: 'EXPENSES', icon: '€' },
    { id: 'tasks' as const, label: 'TASKS', icon: '▤' },
    { id: 'subclawds' as const, label: 'SUBCLAWDS', icon: '🤖' },
    { id: 'health' as const, label: 'HEALTH', icon: '♡' },
    { id: 'files' as const, label: 'FILES', icon: '◫' },
  ];

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-dim)' }}>
        <div className="max-w-[1400px] mx-auto px-4 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center text-lg" style={{ background: 'rgba(0,255,200,0.1)', border: '1px solid rgba(0,255,200,0.2)' }}>
              👾
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-orbitron)', color: 'var(--accent-cyan)' }}>
                MIKEY NOVA
              </h1>
              <p className="text-[10px] tracking-wider" style={{ color: 'var(--text-dim)' }}>
                {tailscale?.self?.dnsName || 'CONTROL CENTER'} · {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {actionResult && (
              <span className="text-[10px] px-2 py-0.5 rounded animate-pulse-glow" style={{ background: 'rgba(0,255,106,0.15)', color: 'var(--accent-green)' }}>
                {actionResult}
              </span>
            )}
            <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: 'var(--text-dim)' }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-3 h-3 rounded accent-[#00ffc8]"
              />
              AUTO
            </label>
            <button
              onClick={() => { fetchAll(); fetchLogs(); fetchScreen(); }}
              className="px-2.5 py-1 rounded text-[10px] tracking-wider border transition-colors"
              style={{ borderColor: 'var(--border-accent)', color: 'var(--accent-cyan)', background: 'rgba(0,255,200,0.05)' }}
            >
              ↻ REFRESH
            </button>
          </div>
        </div>

        {/* Mobile: Current tab + hamburger */}
        <div className="md:hidden max-w-[1400px] mx-auto px-4 py-2 flex justify-between items-center border-t" style={{ borderColor: 'var(--border-dim)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--accent-cyan)' }}>{tabs.find(t => t.id === activeTab)?.icon}</span>
            <span className="text-[10px] tracking-[0.15em] font-medium" style={{ color: 'var(--accent-cyan)' }}>{tabs.find(t => t.id === activeTab)?.label}</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-8 h-8 rounded border transition-colors flex items-center justify-center"
            style={{ borderColor: 'var(--border-accent)', color: 'var(--accent-cyan)', background: 'rgba(0,255,200,0.05)' }}
          >
            <span className="text-sm">{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 border-b z-50" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-dim)' }}>
            <div className="max-w-[1400px] mx-auto p-2 grid grid-cols-2 gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                    if (tab.id === 'screen') fetchScreen();
                    if (tab.id === 'logs') fetchLogs();
                    if (tab.id === 'memory') fetchProcesses();
                    if (tab.id === 'expenses') fetchExpenses();
                  }}
                  className="px-3 py-2.5 rounded text-left transition-colors"
                  style={activeTab === tab.id 
                    ? { background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }
                    : { background: 'var(--bg-secondary)', color: 'var(--text-dim)' }
                  }
                >
                  <span className="mr-2">{tab.icon}</span>
                  <span className="text-[10px] tracking-[0.1em]">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Desktop tabs */}
        <div className="hidden md:flex max-w-[1400px] mx-auto px-4 gap-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'screen') fetchScreen();
                if (tab.id === 'logs') fetchLogs();
                if (tab.id === 'memory') fetchProcesses();
                if (tab.id === 'expenses') fetchExpenses();
              }}
              className={`px-4 py-2 text-[10px] tracking-[0.15em] font-medium transition-all whitespace-nowrap border-b-2 ${
                activeTab === tab.id ? 'tab-active' : ''
              }`}
              style={activeTab === tab.id ? {} : { color: 'var(--text-dim)', borderColor: 'transparent' }}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-[1400px] mx-auto p-4 pt-28 md:pt-24 space-y-3 relative z-10 overflow-x-hidden">

        {/* ════════ OVERVIEW ════════ */}
        {activeTab === 'overview' && (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 animate-fade-in">
              <MetricBlock
                label="CPU LOAD"
                value={system ? `${system.cpu.load.toFixed(1)}%` : '—'}
                sub={system?.cpu.model.split(' ').slice(0, 2).join(' ')}
                accent={cpuColor}
                sparkData={cpuHistory}
              />
              <MetricBlock
                label="MEMORY"
                value={system ? `${system.memory.usedPercent.toFixed(1)}%` : '—'}
                sub={system ? formatBytes(system.memory.used) : undefined}
                accent={memColor}
                sparkData={memHistory}
              />
              <MetricBlock
                label="DISK"
                value={mainDisk ? `${mainDisk.usedPercent.toFixed(0)}%` : '—'}
                sub={mainDisk ? `${formatBytes(mainDisk.available)} free` : undefined}
                accent="var(--accent-yellow)"
              />
              <MetricBlock
                label="UPTIME"
                value={system ? formatUptime(system.uptime) : '—'}
                accent="var(--accent-green)"
              />
            </div>

            {/* Gateway + PM2 Row */}
            <div className="grid md:grid-cols-2 gap-2 animate-fade-in-1">
              {/* Gateway */}
              <Card title="GATEWAY" tag={gateway?.running ? 'ONLINE' : 'OFFLINE'} actions={
                <button
                  onClick={restartGateway}
                  disabled={restarting}
                  className="px-2 py-0.5 rounded text-[10px] tracking-wider border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'rgba(255,138,0,0.3)', color: 'var(--accent-orange)', background: 'rgba(255,138,0,0.05)' }}
                >
                  {restarting ? 'RESTARTING...' : '↻ RESTART'}
                </button>
              }>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIndicator online={gateway?.running || false} />
                      <span className="text-xs font-medium" style={{ color: gateway?.running ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {gateway?.running ? 'Running' : 'Stopped'}
                      </span>
                      {gateway?.version && <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>v{gateway.version}</span>}
                    </div>
                    {gateway?.process && (
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                        PID {gateway.process.pid} · {formatUptime(gateway.process.uptime / 1000)}
                      </span>
                    )}
                  </div>
                  {gateway?.process && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>CPU</div>
                        <div className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{gateway.process.cpu.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>MEM</div>
                        <div className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{formatBytes(gateway.process.memory)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* PM2 Processes */}
              <Card title="PM2 SERVICES" actions={
                <button
                  onClick={() => doAction('pm2-restart', 'all')}
                  className="text-[10px] tracking-wider transition-colors"
                  style={{ color: 'var(--text-dim)' }}
                >
                  RESTART ALL
                </button>
              }>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {processes.map(p => (
                    <div key={p.name} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'var(--border-dim)' }}>
                      <div className="flex items-center gap-2">
                        <StatusIndicator online={p.status === 'online'} />
                        <span className="text-xs font-mono">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                        <span>{formatBytes(p.memory || 0)}</span>
                        <button onClick={() => doAction('pm2-restart', p.name)} className="hover:opacity-80 transition" style={{ color: 'var(--accent-orange)' }}>↻</button>
                      </div>
                    </div>
                  ))}
                  {processes.length === 0 && <div className="text-xs" style={{ color: 'var(--text-dim)' }}>No processes found</div>}
                </div>
              </Card>
            </div>

            {/* Claude Code Usage */}
            <div className="animate-fade-in-2">
              <Card title="CLAUDE MAX USAGE" tag="LIVE">
                {claudeUsage ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* 5-Hour Limit */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>5-HOUR WINDOW</span>
                        {claudeUsage.fiveHour?.resetIn && (
                          <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>resets in {claudeUsage.fiveHour.resetIn}</span>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold tabular-nums" style={{ 
                          color: claudeUsage.fiveHour?.percent >= 90 ? 'var(--accent-red)' : claudeUsage.fiveHour?.percent >= 75 ? 'var(--accent-yellow)' : 'var(--accent-cyan)',
                          fontFamily: 'var(--font-data)' 
                        }}>
                          {claudeUsage.fiveHour?.percent?.toFixed(0) || 0}%
                        </span>
                      </div>
                      <ProgressBar 
                        value={claudeUsage.fiveHour?.percent || 0} 
                        color={claudeUsage.fiveHour?.percent >= 90 ? 'var(--accent-red)' : claudeUsage.fiveHour?.percent >= 75 ? 'var(--accent-yellow)' : 'var(--accent-cyan)'} 
                      />
                    </div>
                    {/* Weekly Limit */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>WEEKLY</span>
                        {claudeUsage.weekly?.resetIn && (
                          <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>resets in {claudeUsage.weekly.resetIn}</span>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold tabular-nums" style={{ 
                          color: claudeUsage.weekly?.percent >= 90 ? 'var(--accent-red)' : claudeUsage.weekly?.percent >= 75 ? 'var(--accent-yellow)' : claudeUsage.weekly?.percent >= 50 ? 'var(--accent-purple)' : 'var(--accent-green)',
                          fontFamily: 'var(--font-data)' 
                        }}>
                          {claudeUsage.weekly?.percent?.toFixed(0) || 0}%
                        </span>
                      </div>
                      <ProgressBar 
                        value={claudeUsage.weekly?.percent || 0} 
                        color={claudeUsage.weekly?.percent >= 90 ? 'var(--accent-red)' : claudeUsage.weekly?.percent >= 75 ? 'var(--accent-yellow)' : claudeUsage.weekly?.percent >= 50 ? 'var(--accent-purple)' : 'var(--accent-green)'} 
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Loading usage data...</div>
                )}
                </Card>
              </div>

            {/* Aranet Air Quality */}
            {aranet && !aranet.error && (
              <div className="animate-fade-in-2">
                <Card title="AIR QUALITY" tag={aranet.stale ? 'STALE' : aranet.status}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* CO2 */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>CO₂</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tabular-nums" style={{ 
                          color: aranet.co2 >= 2000 ? 'var(--accent-red)' : aranet.co2 >= 1400 ? 'var(--accent-orange)' : aranet.co2 >= 1000 ? 'var(--accent-yellow)' : 'var(--accent-green)',
                          fontFamily: 'var(--font-data)' 
                        }}>
                          {aranet.co2}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>ppm</span>
                      </div>
                      <div className="text-[9px]" style={{ color: aranet.level === 'excellent' ? 'var(--accent-green)' : aranet.level === 'good' ? 'var(--accent-cyan)' : aranet.level === 'fair' ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
                        {aranet.level?.toUpperCase()}
                      </div>
                    </div>
                    {/* Temperature */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>TEMP</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-data)' }}>
                          {aranet.temperature}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>°C</span>
                      </div>
                    </div>
                    {/* Humidity */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>HUMIDITY</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-data)' }}>
                          {aranet.humidity}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>%</span>
                      </div>
                    </div>
                    {/* Battery */}
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>BATTERY</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tabular-nums" style={{ 
                          color: aranet.battery < 20 ? 'var(--accent-red)' : aranet.battery < 50 ? 'var(--accent-yellow)' : 'var(--accent-green)',
                          fontFamily: 'var(--font-data)' 
                        }}>
                          {aranet.battery}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>%</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-[9px]" style={{ color: 'var(--text-dim)' }}>
                    Updated {aranet.ageMinutes}m ago · Pressure {aranet.pressure} hPa
                  </div>
                </Card>
              </div>
            )}

            {/* Resources + Activity */}
            <div className="grid md:grid-cols-3 gap-2 animate-fade-in-2 overflow-hidden">
              {/* System Resources */}
              <Card title="RESOURCES" className="min-w-0">
                <div className="space-y-3">
                  {[
                    { label: 'CPU', value: system?.cpu.load || 0, color: cpuColor },
                    { label: 'MEM', value: system?.memory.usedPercent || 0, color: memColor },
                    { label: 'DISK', value: mainDisk?.usedPercent || 0, color: 'var(--accent-yellow)' },
                  ].map(r => (
                    <div key={r.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>{r.label}</span>
                        <span className="text-[11px] font-mono" style={{ color: r.color }}>{r.value.toFixed(1)}%</span>
                      </div>
                      <ProgressBar value={r.value} color={r.color} />
                    </div>
                  ))}
                </div>
              </Card>

              {/* Activity Feed */}
              <div className="md:col-span-2 min-w-0 overflow-hidden">
                <Card title="ACTIVITY FEED" tag="LIVE">
                  <ActivityFeed logs={logs} />
                </Card>
              </div>
            </div>

            {/* Tailscale Devices */}
            <div className="animate-fade-in-3">
              <Card title="TAILSCALE MESH">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {tailscale?.peers.map(p => (
                    <div key={p.hostname} className="flex items-center gap-2 p-2 rounded" style={{ background: p.online ? 'rgba(0,255,106,0.05)' : 'var(--bg-secondary)' }}>
                      <StatusIndicator online={p.online} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono truncate">{p.hostname}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{p.os} · {p.online ? 'online' : timeAgo(p.lastSeen)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Quick Actions + Message */}
            <div className="grid md:grid-cols-2 gap-2 animate-fade-in-4">
              <Card title="QUICK ACTIONS">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'GIT PULL', action: 'git-pull', icon: '↓', desc: 'Pull latest code' },
                    { label: 'CLEAR LOGS', action: 'clear-logs', icon: '✕', desc: 'Flush PM2 logs' },
                    { label: 'UPDATE', action: 'openclaw-update', icon: '↑', desc: 'Update OpenClaw' },
                    { label: 'SCREEN', action: 'screen', icon: '◧', desc: 'Remote screen' },
                  ].map(a => (
                    <button
                      key={a.action}
                      onClick={() => a.action === 'screen' ? (setActiveTab('screen'), fetchScreen()) : doAction(a.action)}
                      className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded border transition-all hover:scale-[1.02] active:scale-95"
                      style={{ borderColor: 'var(--border-dim)', color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
                    >
                      <span className="text-lg">{a.icon}</span>
                      <span className="text-[11px] tracking-wider font-medium">{a.label}</span>
                      <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{a.desc}</span>
                    </button>
                  ))}
                </div>
              </Card>

              <Card title="MESSAGE">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Send to Telegram..."
                    className="flex-1 rounded px-3 py-1.5 text-xs"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !message.trim()}
                    className="px-3 py-1.5 rounded text-[10px] tracking-wider font-medium border transition-all disabled:opacity-30"
                    style={{ borderColor: 'var(--border-accent)', color: 'var(--accent-cyan)', background: 'rgba(0,255,200,0.05)' }}
                  >
                    {sending ? '···' : 'SEND'}
                  </button>
                </div>
              </Card>
            </div>

            {/* Expenses moved to dedicated tab */}
          </>
        )}

        {/* ════════ MEMORY ════════ */}
        {activeTab === 'memory' && (
          <div className="space-y-3">
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
                      setTimeout(() => { setActionResult(null); fetchAll(); fetchProcesses(); }, 5000);
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
        )}

        {/* ════════ SCREEN ════════ */}
        {activeTab === 'screen' && (
          <Card title="REMOTE SCREEN" tag="INTERACTIVE">
            <InteractiveScreen screen={screen} onRefresh={fetchScreen} externalScreenInfo={screenDims} />
          </Card>
        )}

        {/* ════════ LOGS ════════ */}
        {activeTab === 'logs' && (
          <Card title="GATEWAY LOGS" actions={
            <button onClick={fetchLogs} className="text-[10px] tracking-wider transition-colors" style={{ color: 'var(--text-dim)' }}>
              ↻ REFRESH
            </button>
          }>
            <LogsView logs={logs} />
          </Card>
        )}

        {/* ════════ NETWORK ════════ */}
        {activeTab === 'network' && (
          <div className="space-y-3">
            <Card title="TAILSCALE" className="animate-fade-in">
              {tailscale?.self && (
                <div className="mb-3 p-3 rounded border" style={{ background: 'rgba(0,255,200,0.03)', borderColor: 'var(--border-accent)' }}>
                  <div className="flex items-center gap-2">
                    <StatusIndicator online={tailscale.self.online} />
                    <span className="font-mono text-sm" style={{ color: 'var(--accent-cyan)' }}>{tailscale.self.hostname}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}>
                      THIS NODE
                    </span>
                  </div>
                  <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--text-dim)' }}>
                    {tailscale.self.ip} · {tailscale.self.dnsName}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                {tailscale?.peers.map(p => (
                  <div key={p.hostname} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border-dim)' }}>
                    <div className="flex items-center gap-2">
                      <StatusIndicator online={p.online} />
                      <div>
                        <div className="text-xs font-mono">{p.hostname}</div>
                        <div className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>{p.ip}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{p.os}</div>
                      <div className="text-[10px]" style={{ color: p.online ? 'var(--accent-green)' : 'var(--text-dim)' }}>
                        {p.online ? 'online' : timeAgo(p.lastSeen)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Weather removed */}
          </div>
        )}

        {/* ════════ TERMINAL ════════ */}
        {activeTab === 'terminal' && (
          <div className="animate-fade-in">
            <div className="card-base overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
              <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border-dim)' }}>
                <div className="flex items-center gap-2">
                  <h2 className="text-[11px] font-medium uppercase tracking-widest" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-orbitron)' }}>
                    TERMINAL
                  </h2>
                  <span className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}>
                    PTY
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const iframe = document.getElementById('terminal-frame') as HTMLIFrameElement;
                      if (iframe) iframe.src = iframe.src;
                    }}
                    className="px-2 py-0.5 rounded text-[10px] border transition-colors"
                    style={{ borderColor: 'var(--border-dim)', color: 'var(--text-dim)', background: 'transparent' }}
                  >
                    ↻ NEW SHELL
                  </button>
                </div>
              </div>
              <iframe
                id="terminal-frame"
                src={typeof window !== 'undefined' ? `http://${window.location.hostname}:7682/` : 'http://localhost:7682/'}
                className="w-full border-none"
                style={{ height: 'calc(100% - 40px)', background: '#0c0c12' }}
                allow="clipboard-read; clipboard-write"
              />
            </div>
          </div>
        )}

        {/* ════════ SESSIONS ════════ */}
        {activeTab === 'sessions' && (
          <div className="animate-fade-in">
            {/* Chat Panel */}
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
                            {msg.role === 'user' ? 'you' : 'mikey'}
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
              /* Session List */
              <>
              {usageData?.totals && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <MetricBlock label="TOTAL COST" value={`$${usageData.totals.totalCost.toFixed(2)}`} accent="var(--accent-yellow)" />
                  <MetricBlock label="API CALLS" value={`${usageData.totals.apiCalls.toLocaleString()}`} accent="var(--accent-cyan)" />
                  <MetricBlock label="TOKENS" value={`${(usageData.totals.totalTokens / 1_000_000).toFixed(1)}M`} accent="var(--accent-purple)" />
                  <MetricBlock label="CACHE COST" value={`$${usageData.totals.cacheCost.toFixed(2)}`} sub={`${((usageData.totals.cacheCost / usageData.totals.totalCost) * 100).toFixed(0)}% of total`} accent="var(--accent-orange)" />
                </div>
              )}
              <Card title="OPENCLAW SESSIONS" actions={
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
                                {session.lastMessages[session.lastMessages.length - 1]?.role === 'user' ? 'you: ' : 'mikey: '}
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
        )}

        {/* ════════ CRON ════════ */}
        {activeTab === 'cron' && (
          <div className="space-y-3 animate-fade-in">
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
        )}

        {/* ════════ EXPENSES ════════ */}
        {activeTab === 'expenses' && (
          <div className="space-y-3 animate-fade-in">
            {/* Quarter Selector */}
            {expenses?.availableQuarters && expenses.availableQuarters.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Quarter:</span>
                {expenses.availableQuarters.map((q: string) => (
                  <button
                    key={q}
                    onClick={() => {
                      setSelectedQuarter(q);
                      fetchExpenses(q);
                    }}
                    className="px-3 py-1.5 rounded text-[10px] font-medium transition-all border"
                    style={
                      (selectedQuarter || expenses.currentQuarter) === q
                        ? { background: 'rgba(0,255,200,0.15)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }
                        : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-secondary)' }
                    }
                  >
                    {q.replace('-', ' ')}
                  </button>
                ))}
              </div>
            )}

            {/* Quarterly Chart */}
            {expenses?.quarterlyHistory && expenses.quarterlyHistory.length > 0 && (
              <Card title="QUARTERLY SPENDING">
                <div className="flex items-end gap-2 h-32 px-2">
                  {expenses.quarterlyHistory.map((q: any) => {
                    const maxTotal = Math.max(...expenses.quarterlyHistory.map((x: any) => x.total));
                    const heightPercent = maxTotal > 0 ? (q.total / maxTotal) * 100 : 0;
                    const dedPercent = q.total > 0 ? (q.deductible / q.total) * 100 : 0;
                    return (
                      <div key={q.quarter} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex flex-col justify-end" style={{ height: '90px' }}>
                          <div 
                            className="w-full rounded-t relative overflow-hidden transition-all"
                            style={{ height: `${heightPercent}%`, minHeight: q.total > 0 ? '8px' : '0', background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)' }}
                          >
                            <div 
                              className="absolute bottom-0 left-0 right-0 transition-all"
                              style={{ height: `${dedPercent}%`, background: 'rgba(0,255,106,0.3)' }}
                            />
                          </div>
                        </div>
                        <div className="text-[8px] text-center" style={{ color: 'var(--text-dim)' }}>{q.quarter.replace('-', ' ')}</div>
                        <div className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--accent-cyan)' }}>€{q.total.toFixed(0)}</div>
                        <div className="text-[8px] tabular-nums" style={{ color: 'var(--accent-green)' }}>€{q.deductible.toFixed(0)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-4 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <div className="w-3 h-3 rounded" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)' }}></div>
                    <span style={{ color: 'var(--text-dim)' }}>Total Spent</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px]">
                    <div className="w-3 h-3 rounded" style={{ background: 'rgba(0,255,106,0.3)' }}></div>
                    <span style={{ color: 'var(--text-dim)' }}>Deductible</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Summary Cards Row */}
            {expenses?.quarterSummary && (
              <div className="grid md:grid-cols-3 gap-3">
                <Card title="SUBSCRIPTIONS">
                  <div className="space-y-2">
                    <div className="text-center mb-2">
                      <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent-purple)', fontFamily: 'var(--font-data)' }}>
                        €{expenses.subscriptions?.totalMonthly || 0}/mo
                      </div>
                    </div>
                    {expenses.subscriptions?.tracked
                      ?.filter((sub: any) => {
                        // Only show subs that were active in at least one month of this quarter
                        return sub.monthsInQuarter?.some((m: any) => m.active);
                      })
                      .map((sub: any) => {
                        // Count active months and found invoices
                        const activeMonths = sub.monthsInQuarter?.filter((m: any) => m.active) || [];
                        const foundCount = activeMonths.filter((m: any) => m.found).length;
                        const allFound = activeMonths.length > 0 && foundCount === activeMonths.length;
                        const noneFound = foundCount === 0;
                        
                        return (
                          <div key={`${sub.vendor}-${sub.description}`} className="flex justify-between items-center text-[10px]">
                            <span className="capitalize" style={{ color: sub.isActive === false ? 'var(--text-dim)' : 'var(--text-secondary)' }}>
                              {sub.vendor}
                              {sub.isActive === false && <span className="ml-1 text-[8px]">(ended)</span>}
                            </span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: 'var(--text-dim)' }}>€{sub.amount}</span>
                              <span style={{ color: allFound ? 'var(--accent-green)' : noneFound ? 'var(--accent-yellow)' : 'var(--accent-cyan)' }}>
                                {allFound ? '✓' : `${foundCount}/${activeMonths.length}`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    {expenses.subscriptions?.missing?.length > 0 && (
                      <div className="mt-2 p-2 rounded border" style={{ background: 'rgba(255,214,0,0.05)', borderColor: 'rgba(255,214,0,0.2)' }}>
                        <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--accent-yellow)' }}>Missing invoices</div>
                        {expenses.subscriptions.missing.map((m: any) => (
                          <div key={`${m.vendor}-${m.description}`} className="text-[10px] capitalize" style={{ color: 'var(--accent-yellow)' }}>
                            {m.vendor} — {m.missingMonths?.map((month: string) => {
                              const [,mo] = month.split('-');
                              const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                              return monthNames[parseInt(mo)];
                            }).join(', ')}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>

                <Card title="MISSING PAYMENT">
                  <div className="space-y-1.5 max-h-40 overflow-auto">
                    {expenses.quarterSummary.missingPayment?.length > 0 ? (
                      expenses.quarterSummary.missingPayment.map((item: any, i: number) => (
                        <div key={i} className="text-[10px] p-2 rounded" style={{ background: 'rgba(255,214,0,0.05)' }}>
                          <div className="flex justify-between">
                            <span>
                              <span style={{ color: 'var(--accent-yellow)' }}>{item.date}</span>
                              <span className="ml-2 capitalize" style={{ color: 'var(--text-secondary)' }}>{item.vendor}</span>
                            </span>
                            {item.amount > 0 && <span style={{ color: 'var(--text-dim)' }}>€{item.amount}</span>}
                          </div>
                          {item.files?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.files.map((f: any, fi: number) => (
                                <a
                                  key={fi}
                                  href={`/api/expenses/file?path=${encodeURIComponent(f.path)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] px-1.5 py-0.5 rounded underline hover:no-underline transition-colors"
                                  style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}
                                >
                                  {f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-[10px]" style={{ color: 'var(--accent-green)' }}>✓ All have payment proof</div>
                    )}
                  </div>
                </Card>

                <Card title="MISSING FACTURA">
                  <div className="space-y-1.5 max-h-40 overflow-auto">
                    {expenses.quarterSummary.missingFactura?.length > 0 ? (
                      expenses.quarterSummary.missingFactura.map((item: any, i: number) => (
                        <div key={i} className="text-[10px] p-2 rounded" style={{ background: 'rgba(255,59,92,0.05)' }}>
                          <div className="flex justify-between">
                            <span>
                              <span style={{ color: 'var(--accent-red)' }}>{item.date}</span>
                              <span className="ml-2 capitalize" style={{ color: 'var(--text-secondary)' }}>{item.vendor}</span>
                            </span>
                            {item.amount > 0 && <span style={{ color: 'var(--text-dim)' }}>€{item.amount}</span>}
                          </div>
                          {item.files?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.files.map((f: any, fi: number) => (
                                <a
                                  key={fi}
                                  href={`/api/expenses/file?path=${encodeURIComponent(f.path)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9px] px-1.5 py-0.5 rounded underline hover:no-underline transition-colors"
                                  style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}
                                >
                                  {f.name.length > 25 ? f.name.slice(0, 22) + '...' : f.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-[10px]" style={{ color: 'var(--accent-green)' }}>✓ All have facturas</div>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* Two Column Layout: Expenses & Income */}
            <div className="grid md:grid-cols-2 gap-3">
              {/* EXPENSES Column */}
              <Card title={`${expenses?.quarterSummary?.label || ''} EXPENSES`} actions={
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `/api/files/zip?path=${encodeURIComponent('os.homedir()/expenses')}`;
                      link.download = 'expenses.zip';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="text-[10px] tracking-wider transition-colors hover:opacity-70"
                    style={{ color: 'var(--accent-cyan)' }}
                  >
                    ↓ ZIP
                  </button>
                  <button onClick={() => fetchExpenses()} className="text-[10px] tracking-wider transition-colors" style={{ color: 'var(--text-dim)' }}>↻</button>
                </div>
              }>
                <div className="space-y-3">
                  {/* Summary */}
                  <div className="flex justify-center items-center gap-4 pb-3 border-b" style={{ borderColor: 'var(--border-dim)' }}>
                    <div className="text-center">
                      <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-data)' }}>
                        €{expenses?.quarterSummary?.total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                      </div>
                      <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>SPENT</div>
                    </div>
                    {expenses?.quarterSummary?.deductible > 0 && (
                      <>
                        <div className="text-sm" style={{ color: 'var(--text-dim)' }}>→</div>
                        <div className="text-center">
                          <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-data)' }}>
                            €{expenses.quarterSummary.deductible?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                          </div>
                          <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>DEDUCTIBLE</div>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Expense List */}
                  <div className="space-y-1 max-h-[45vh] overflow-auto" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                    {expenses?.quarterSummary?.expenses?.map((exp: any) => (
                      <div key={exp.id} className="flex items-center gap-2 p-2 rounded transition-colors text-[10px]" style={{ background: 'var(--bg-secondary)' }}>
                        <span className="tabular-nums shrink-0" style={{ color: 'var(--text-dim)', width: '68px' }}>{exp.date}</span>
                        <span className="capitalize truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
                          {exp.vendor}{exp.description !== exp.vendor ? ` — ${exp.description}` : ''}
                        </span>
                        <span className="font-semibold tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
                          €{exp.amount?.toFixed(2) || '0'}
                        </span>
                        <div className="flex gap-0.5 shrink-0">
                          <span title={exp.hasFactura ? 'Has factura' : 'Missing factura'} className="px-1 py-0.5 rounded" style={{ 
                            background: exp.hasFactura ? 'rgba(0,255,200,0.1)' : 'rgba(255,59,92,0.1)',
                            color: exp.hasFactura ? 'var(--accent-cyan)' : 'var(--accent-red)'
                          }}>📄</span>
                          <span title={exp.hasPayment ? 'Has payment' : 'Missing payment'} className="px-1 py-0.5 rounded" style={{ 
                            background: exp.hasPayment ? 'rgba(0,255,106,0.1)' : 'rgba(255,214,0,0.1)',
                            color: exp.hasPayment ? 'var(--accent-green)' : 'var(--accent-yellow)'
                          }}>💳</span>
                        </div>
                      </div>
                    ))}
                    {(!expenses?.quarterSummary?.expenses || expenses.quarterSummary.expenses.length === 0) && (
                      <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No expenses</div>
                    )}
                  </div>
                </div>
              </Card>

              {/* INCOME Column */}
              <Card title={`${expenses?.quarterSummary?.label || ''} INCOME`}>
                <div className="space-y-3">
                  {/* Summary */}
                  <div className="flex justify-center items-center gap-4 pb-3 border-b" style={{ borderColor: 'var(--border-dim)' }}>
                    {expenses?.quarterSummary?.incomeUSD > 0 && (
                      <div className="text-center">
                        <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-data)' }}>
                          ${expenses.quarterSummary.incomeUSD?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                        </div>
                        <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>EARNED</div>
                      </div>
                    )}
                    {expenses?.quarterSummary?.incomeUSD > 0 && expenses?.quarterSummary?.incomeEUR > 0 && (
                      <div className="text-sm" style={{ color: 'var(--text-dim)' }}>→</div>
                    )}
                    {expenses?.quarterSummary?.incomeEUR > 0 && (
                      <div className="text-center">
                        <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-data)' }}>
                          €{expenses.quarterSummary.incomeEUR?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                        </div>
                        <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>RECEIVED</div>
                      </div>
                    )}
                    {!expenses?.quarterSummary?.incomeUSD && !expenses?.quarterSummary?.incomeEUR && (
                      <div className="text-center">
                        <div className="text-xl font-bold" style={{ color: 'var(--text-dim)' }}>—</div>
                        <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>NO DATA</div>
                      </div>
                    )}
                  </div>
                  {expenses?.quarterSummary?.incomeUSD > 0 && expenses?.quarterSummary?.incomeEUR > 0 && (
                    <div className="text-center text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      avg rate: {(expenses.quarterSummary.incomeEUR / expenses.quarterSummary.incomeUSD).toFixed(4)} EUR/USD
                    </div>
                  )}
                  {/* Income List */}
                  <div className="space-y-1 max-h-[45vh] overflow-auto" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                    {expenses?.quarterSummary?.income?.map((inc: any) => (
                      <div key={inc.id} className="flex items-center gap-2 p-2 rounded text-[10px]" style={{ background: 'var(--bg-secondary)' }}>
                        <span className="tabular-nums shrink-0" style={{ color: 'var(--text-dim)', width: '68px' }}>{inc.date}</span>
                        <span className="capitalize truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{inc.source}</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded capitalize shrink-0" style={{ 
                          background: inc.type === 'paystub' ? 'rgba(0,255,106,0.1)' : inc.type === 'conversion' ? 'rgba(0,255,200,0.1)' : 'rgba(136,136,136,0.1)',
                          color: inc.type === 'paystub' ? 'var(--accent-green)' : inc.type === 'conversion' ? 'var(--accent-cyan)' : 'var(--text-dim)'
                        }}>
                          {inc.type}
                        </span>
                        <span className="font-semibold tabular-nums shrink-0" style={{ color: inc.currency === 'USD' ? 'var(--accent-green)' : 'var(--accent-cyan)' }}>
                          {inc.currency === 'EUR' ? '€' : '$'}{inc.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                        </span>
                      </div>
                    ))}
                    {(!expenses?.quarterSummary?.income || expenses.quarterSummary.income.length === 0) && (
                      <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>No income</div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ════════ FILES ════════ */}
        {activeTab === 'files' && (
          <div className="space-y-3 animate-fade-in">
            {!selectedFile ? (
              <Card title="FILE BROWSER" actions={
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `/api/files/zip?path=${encodeURIComponent(filesPath)}`;
                      link.download = `${filesPath.split('/').pop() || 'export'}.zip`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="text-[10px] tracking-wider transition-colors hover:opacity-70"
                    style={{ color: 'var(--accent-cyan)' }}
                  >
                    ↓ ZIP
                  </button>
                  <button onClick={() => fetchFiles()} className="text-[10px] tracking-wider transition-colors" style={{ color: 'var(--text-dim)' }}>
                    ↻ REFRESH
                  </button>
                </div>
              }>
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => {
                        const parentPath = filesPath.split('/').slice(0, -1).join('/') || 'os.homedir()';
                        fetchFiles(parentPath);
                      }}
                      disabled={filesPath === 'os.homedir()'}
                      className="px-2 py-1 rounded text-[9px] border transition-colors disabled:opacity-30"
                      style={{ borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }}
                    >
                      ← BACK
                    </button>
                    <div className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                      {filesPath}
                    </div>
                  </div>
                </div>
                
                <div className="space-y-1 max-h-[60vh] overflow-auto" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                  {filesData?.entries?.map((entry: any) => (
                    <div
                      key={entry.name}
                      onClick={() => {
                        const fullPath = `${filesPath}/${entry.name}`;
                        if (entry.type === 'directory') {
                          fetchFiles(fullPath);
                        } else {
                          readFile(fullPath);
                        }
                      }}
                      className="flex items-center gap-3 p-2 rounded hover:bg-opacity-50 cursor-pointer transition-colors"
                      style={{ background: 'var(--bg-secondary)' }}
                    >
                      <div className="text-[12px]">
                        {entry.type === 'directory' ? '📁' : '📄'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
                          {entry.name}
                        </div>
                        <div className="text-[8px]" style={{ color: 'var(--text-dim)' }}>
                          {entry.type === 'file' && `${formatBytes(entry.size)} • `}
                          {entry.modified && timeAgo(entry.modified)}
                        </div>
                      </div>
                      {entry.type === 'directory' && (
                        <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>→</div>
                      )}
                    </div>
                  ))}
                </div>
                
                {filesData?.entries?.length === 0 && (
                  <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                    <div className="text-2xl mb-2">📂</div>
                    <div>Empty directory</div>
                  </div>
                )}
              </Card>
            ) : (
              <Card title="FILE VIEWER">
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="px-2 py-1 rounded text-[9px] border transition-colors"
                      style={{ borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }}
                    >
                      ← BACK
                    </button>
                    <div className="text-[10px] truncate" style={{ color: 'var(--accent-cyan)' }}>
                      {selectedFile.path}
                    </div>
                  </div>
                  <div className="text-[8px] ml-[52px]" style={{ color: 'var(--text-dim)' }}>
                    {formatBytes(selectedFile.size)} • {selectedFile.modified && new Date(selectedFile.modified).toLocaleString()}
                  </div>
                </div>
                
                {selectedFile.type === 'text' && selectedFile.content && (
                  <div className="rounded p-3 max-h-[60vh] overflow-auto font-mono text-[10px] leading-relaxed" style={{ background: 'var(--bg-secondary)', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                    <pre className="whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                      {selectedFile.content}
                    </pre>
                  </div>
                )}
                
                {selectedFile.type === 'image' && selectedFile.content && (
                  <div className="text-center">
                    <img src={selectedFile.content} alt="File content" className="max-w-full h-auto rounded" />
                  </div>
                )}

                {selectedFile.type === 'pdf' && selectedFile.content && (
                  <div className="w-full" style={{ height: '70vh' }}>
                    <iframe 
                      src={selectedFile.content} 
                      className="w-full h-full rounded border"
                      style={{ borderColor: 'var(--border-dim)' }}
                      title="PDF Viewer"
                    />
                  </div>
                )}
                
                {selectedFile.tooLarge && (
                  <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                    <div className="text-2xl mb-2">⚠️</div>
                    <div>File too large to display</div>
                    <div className="text-[10px] mt-1">Size: {formatBytes(selectedFile.size)}</div>
                  </div>
                )}
                
                {selectedFile.type === 'binary' && (
                  <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                    <div className="text-2xl mb-2">📄</div>
                    <div>Binary file - cannot display content</div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ════════ TASKS (Kanban) ════════ */}
        {activeTab === 'tasks' && (
          <div className="space-y-3 animate-fade-in">
            {/* Project Filter Bar */}
            {tasks?.projects && tasks.projects.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Filter:</span>
                <button
                  onClick={() => setTasks({ ...tasks, filterProject: null })}
                  className="px-2 py-1 rounded text-[10px] border transition-all"
                  style={!tasks.filterProject 
                    ? { background: 'rgba(0,255,200,0.15)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }
                    : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }
                  }
                >
                  All
                </button>
                {tasks.projects.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setTasks({ ...tasks, filterProject: tasks.filterProject === p.id ? null : p.id })}
                    className="px-2 py-1 rounded text-[10px] border transition-all"
                    style={tasks.filterProject === p.id
                      ? { background: `${p.color}22`, borderColor: p.color, color: p.color }
                      : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }
                    }
                  >
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            )}

            <Card title="KANBAN BOARD" actions={
              <div className="flex gap-3">
                <button 
                  onClick={async () => {
                    const title = prompt('New task title:');
                    if (title) {
                      const projectList = tasks?.projects?.map((p: any) => `${p.emoji} ${p.name}`).join(', ') || '';
                      const projectInput = prompt(`Project? (${projectList}) - or leave empty:`);
                      const project = tasks?.projects?.find((p: any) => 
                        projectInput && (p.name.toLowerCase().includes(projectInput.toLowerCase()) || p.emoji === projectInput)
                      )?.id || null;
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'create', title, status: 'backlog', project })
                      });
                      fetchTasks();
                    }
                  }}
                  className="text-[10px] tracking-wider transition-colors hover:opacity-70"
                  style={{ color: 'var(--accent-cyan)' }}
                >
                  + ADD
                </button>
                <button onClick={() => fetchTasks()} className="text-[10px] tracking-wider transition-colors" style={{ color: 'var(--text-dim)' }}>↻</button>
              </div>
            }>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-h-[50vh]">
                {['backlog', 'in-progress', 'in-review', 'done'].map(status => {
                  const allColumnTasks = tasks?.tasks?.filter((t: any) => t.status === status) || [];
                  const columnTasks = tasks?.filterProject 
                    ? allColumnTasks.filter((t: any) => t.project === tasks.filterProject)
                    : allColumnTasks;
                  const columnLabels: Record<string, { label: string; color: string }> = {
                    'backlog': { label: 'BACKLOG', color: 'var(--text-dim)' },
                    'in-progress': { label: 'IN PROGRESS', color: 'var(--accent-cyan)' },
                    'in-review': { label: 'IN REVIEW', color: 'var(--accent-purple)' },
                    'done': { label: 'DONE', color: 'var(--accent-green)' },
                  };
                  const col = columnLabels[status];
                  
                  return (
                    <div key={status} className="flex flex-col rounded p-2" style={{ background: 'var(--bg-secondary)', minHeight: '200px' }}>
                      <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--border-dim)' }}>
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)' }}>
                          {columnTasks.length}
                        </span>
                      </div>
                      <div className="flex-1 space-y-2 overflow-auto">
                        {columnTasks.map((task: any) => {
                          const taskProject = tasks?.projects?.find((p: any) => p.id === task.project);
                          const taskTags = task.tags?.map((tagId: string) => tasks?.tags?.find((t: any) => t.id === tagId)).filter(Boolean) || [];
                          return (
                            <div 
                              key={task.id} 
                              onClick={() => setSelectedTask(task)}
                              className="group p-2 rounded border transition-all hover:border-opacity-100 cursor-pointer"
                              style={{ 
                                background: 'var(--bg-elevated)', 
                                borderColor: 'var(--border-dim)',
                                borderLeftColor: taskProject?.color || 'var(--border-dim)',
                                borderLeftWidth: taskProject ? '3px' : '1px'
                              }}
                            >
                              {taskProject && (
                                <div className="text-[8px] mb-1 flex items-center gap-1" style={{ color: taskProject.color }}>
                                  {taskProject.emoji} {taskProject.name}
                                </div>
                              )}
                              <div className="text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>{task.title}</div>
                              {task.description && (
                                <div className="text-[9px] mb-2 line-clamp-2" style={{ color: 'var(--text-dim)' }}>{task.description}</div>
                              )}
                              <div className="flex flex-wrap gap-1 mb-2">
                                {task.pr && (
                                  <a 
                                    href={task.pr} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(136,71,255,0.1)', color: 'var(--accent-purple)' }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    🔗 PR
                                  </a>
                                )}
                                {taskTags.map((tag: any) => (
                                  <span key={tag.id} className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: `${tag.color}22`, color: tag.color }}>
                                    {tag.name}
                                  </span>
                                ))}
                              </div>
                              {/* Due Date */}
                              {task.dueDate && (() => {
                                const now = Date.now();
                                const dueDate = task.dueDate;
                                const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
                                const isOverdue = daysUntilDue < 0;
                                const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 3;
                                const dueDateColor = isOverdue ? 'var(--accent-red)' : isDueSoon ? 'var(--accent-yellow)' : 'var(--text-dim)';
                                const formattedDate = new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                return (
                                  <div className="flex items-center gap-1 mb-2 text-[9px]" style={{ color: dueDateColor }}>
                                    📅 {formattedDate} {isOverdue ? '(overdue!)' : isDueSoon ? `(${daysUntilDue}d left)` : ''}
                                  </div>
                                );
                              })()}
                              {/* Assignee */}
                              {task.assignee && (() => {
                                const assignee = tasks?.agents?.find((a: any) => a.id === task.assignee);
                                return assignee ? (
                                  <div className="flex items-center gap-1 mb-2 text-[9px]" style={{ color: assignee.color }}>
                                    {assignee.emoji} {assignee.name}
                                  </div>
                                ) : null;
                              })()}
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {status !== 'backlog' && (
                                  <button
                                    onClick={async () => {
                                      const statuses = ['backlog', 'in-progress', 'in-review', 'done'];
                                      const currentIdx = statuses.indexOf(status);
                                      if (currentIdx > 0) {
                                        await fetch('/api/tasks', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ action: 'move', id: task.id, status: statuses[currentIdx - 1] })
                                        });
                                        fetchTasks();
                                      }
                                    }}
                                    className="text-[8px] px-1.5 py-0.5 rounded"
                                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}
                                  >
                                    ←
                                  </button>
                                )}
                                {status !== 'done' && (
                                  <button
                                    onClick={async () => {
                                      const statuses = ['backlog', 'in-progress', 'in-review', 'done'];
                                      const currentIdx = statuses.indexOf(status);
                                      let pr = task.pr;
                                      if (statuses[currentIdx + 1] === 'in-review' && !task.pr) {
                                        pr = prompt('PR URL (optional):') || null;
                                      }
                                      await fetch('/api/tasks', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'move', id: task.id, status: statuses[currentIdx + 1], pr })
                                      });
                                      fetchTasks();
                                    }}
                                    className="text-[8px] px-1.5 py-0.5 rounded"
                                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}
                                  >
                                    →
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    if (confirm('Delete this task?')) {
                                      await fetch('/api/tasks', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'delete', id: task.id })
                                      });
                                      fetchTasks();
                                    }
                                  }}
                                  className="text-[8px] px-1.5 py-0.5 rounded ml-auto"
                                  style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ════════ SUBCLAWDS ════════ */}
        {activeTab === 'subclawds' && (
          <div className="space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-orbitron)' }}>
                  🤖 SUBCLAWD REGISTRY
                </h2>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-dim)' }}>
                  Persistent AI agents with specialized roles
                </p>
              </div>
              <button
                onClick={fetchSubclawds}
                className="px-3 py-1.5 rounded text-[10px] uppercase tracking-wider"
                style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}
              >
                Refresh
              </button>
            </div>

            {/* Coordinator Card */}
            {subclawds?.coordinator && (
              <Card>
                <div className="flex items-center gap-3 p-4">
                  <span className="text-3xl">{subclawds.coordinator.emoji}</span>
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--accent-cyan)' }}>{subclawds.coordinator.name}</h3>
                    <p className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{subclawds.coordinator.role} · {subclawds.coordinator.model}</p>
                  </div>
                  <div className="ml-auto px-2 py-1 rounded text-[10px]" style={{ background: 'rgba(0,255,200,0.15)', color: 'var(--accent-cyan)' }}>
                    COORDINATOR
                  </div>
                </div>
              </Card>
            )}

            {/* Agents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {subclawds?.agents?.map((agent: any) => (
                <Card key={agent.id}>
                  <div className="p-4">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">{agent.emoji}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold" style={{ color: agent.color }}>{agent.name}</h3>
                        <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{agent.role}</p>
                      </div>
                      <div 
                        className="px-2 py-1 rounded text-[9px] uppercase"
                        style={{ 
                          background: agent.status === 'working' ? 'rgba(250,204,21,0.15)' : 'rgba(100,100,100,0.15)',
                          color: agent.status === 'working' ? 'var(--accent-yellow)' : 'var(--text-dim)'
                        }}
                      >
                        {agent.status}
                      </div>
                    </div>

                    {/* Model Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[9px] px-2 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: 'var(--accent-purple)' }}>
                        {agent.model.split('/').pop()}
                      </span>
                      {agent.persistent && (
                        <span className="text-[9px] px-2 py-0.5 rounded" style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}>
                          persistent
                        </span>
                      )}
                    </div>

                    {/* Focus Areas */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {agent.focus?.map((f: string) => (
                        <span key={f} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {f}
                        </span>
                      ))}
                    </div>

                    {/* Current Task */}
                    <div className="p-2 rounded mb-3" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="text-[9px] uppercase mb-1" style={{ color: 'var(--text-dim)' }}>Current Task</div>
                      <div className="text-[11px]" style={{ color: agent.status === 'working' ? 'var(--accent-yellow)' : 'var(--text-dim)' }}>
                        {agent.currentTask || 'Idle'}
                      </div>
                    </div>

                    {/* Last Active */}
                    {agent.lastActive && (
                      <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                        Last active: {new Date(agent.lastActive).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                      <button
                        onClick={async () => {
                          const task = prompt(`Dispatch task to ${agent.name}:`);
                          if (task) {
                            await fetch('/api/subclawds', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'dispatch', agentId: agent.id, task })
                            });
                            fetchSubclawds();
                          }
                        }}
                        className="flex-1 px-2 py-1.5 rounded text-[10px]"
                        style={{ background: `${agent.color}22`, color: agent.color, border: `1px solid ${agent.color}` }}
                      >
                        Dispatch Task
                      </button>
                      <button
                        onClick={async () => {
                          const res = await fetch(`/api/subclawds/history?label=${agent.id}&limit=30`);
                          const data = await res.json();
                          setSelectedAgentLogs({ agent, ...data });
                        }}
                        className="px-2 py-1.5 rounded text-[10px]"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-dim)' }}
                      >
                        Logs
                      </button>
                      {agent.status === 'working' && (
                        <button
                          onClick={async () => {
                            await fetch('/api/subclawds', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'clear', agentId: agent.id })
                            });
                            fetchSubclawds();
                          }}
                          className="px-2 py-1.5 rounded text-[10px]"
                          style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Costs Summary - fetched on load */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                    💰 Cost Tracking
                  </h3>
                  <button
                    onClick={async () => {
                      const res = await fetch('/api/subclawds/costs');
                      const data = await res.json();
                      alert(`Total: $${data.totalCost}\nTasks: ${data.totalTasks}\nAvg: $${data.avgCostPerTask}/task`);
                    }}
                    className="text-[9px] px-2 py-1 rounded"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}
                  >
                    View Details
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {subclawds?.agents?.slice(0, 4).map((agent: any) => (
                    <div key={agent.id} className="p-2 rounded" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="text-lg">{agent.emoji}</div>
                      <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{agent.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Pending Comms */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                    📡 Agent Communications
                  </h3>
                  <button
                    onClick={async () => {
                      const res = await fetch('/api/subclawds/comms');
                      const data = await res.json();
                      if (data.requests?.length > 0) {
                        alert(`Pending requests:\n${data.requests.map((r: any) => `${r.from} → ${r.to}: ${r.task}`).join('\n')}`);
                      } else {
                        alert('No pending communication requests');
                      }
                    }}
                    className="text-[9px] px-2 py-1 rounded"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-dim)' }}
                  >
                    Check Queue
                  </button>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Agents can request help from each other via ~/memory/comms/
                </div>
              </div>
            </Card>

            {/* Architecture Info */}
            <Card>
              <div className="p-4">
                <h3 className="text-[12px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                  Architecture
                </h3>
                <div className="text-[11px] space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <div>• <strong>Coordinator (Mikey)</strong> dispatches tasks and reviews work</div>
                  <div>• <strong>Subclawds</strong> have persistent memory in ~/memory/[agent]/</div>
                  <div>• <strong>Models</strong> matched to task type (Codex for coding, Opus for research)</div>
                  <div>• <strong>Communication</strong> subclawds report to Mikey only</div>
                </div>
              </div>
            </Card>

            {/* Agent Runs Modal */}
            <Dialog open={!!selectedAgentLogs} onOpenChange={(open) => !open && setSelectedAgentLogs(null)}>
              <DialogContent className="flex flex-col p-0" style={{ maxWidth: '56rem' }} showCloseButton={true}>
                {selectedAgentLogs && (
                  <>
                    {/* Header */}
                    <DialogHeader className="p-4 border-b shrink-0" style={{ borderColor: 'var(--border-dim)' }}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{selectedAgentLogs.agent?.emoji}</span>
                        <div>
                          <DialogTitle style={{ color: selectedAgentLogs.agent?.color }}>
                            {selectedAgentLogs.agent?.name} Run History
                          </DialogTitle>
                          <DialogDescription>
                            {selectedAgentLogs.totalRuns || 0} task run(s)
                          </DialogDescription>
                        </div>
                      </div>
                    </DialogHeader>

                    {/* Runs Content */}
                    <div 
                      className="flex-1 overflow-auto p-4 space-y-3"
                      style={{ 
                        WebkitOverflowScrolling: 'touch',
                        overscrollBehavior: 'contain',
                        maxHeight: 'calc(100dvh - 12rem)',
                      }}
                    >
                      {selectedAgentLogs.runs?.length > 0 ? (
                        selectedAgentLogs.runs.map((run: any) => {
                          const isExpanded = expandedRuns.has(run.runId);
                          const taskPreview = run.task?.length > 100 ? run.task.slice(0, 100) + '...' : run.task;
                          
                          const toggleExpanded = () => {
                            setExpandedRuns(prev => {
                              const next = new Set(prev);
                              if (next.has(run.runId)) {
                                next.delete(run.runId);
                              } else {
                                next.add(run.runId);
                              }
                              return next;
                            });
                          };
                          
                          return (
                            <div 
                              key={run.runId} 
                              className="rounded-lg cursor-pointer transition-all hover:opacity-90"
                              style={{ 
                                background: 'var(--bg-secondary)',
                                borderLeft: `3px solid ${run.status === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)'}`
                              }}
                              onClick={toggleExpanded}
                            >
                              {/* Run Header - Always visible */}
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span 
                                      className="text-[10px] px-2 py-0.5 rounded font-medium uppercase"
                                      style={{ 
                                        background: run.status === 'ok' ? 'rgba(0,255,106,0.15)' : 'rgba(255,59,92,0.15)',
                                        color: run.status === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)'
                                      }}
                                    >
                                      {run.status}
                                    </span>
                                    <span className="text-[11px] font-medium" style={{ color: selectedAgentLogs.agent?.color }}>
                                      {run.label}
                                    </span>
                                    {run.durationFormatted && (
                                      <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                                        ⏱ {run.durationFormatted}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                                      {run.createdAt && new Date(run.createdAt).toLocaleString('en-US', { 
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                                      })}
                                    </span>
                                    <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                                      {isExpanded ? '▼' : '▶'}
                                    </span>
                                  </div>
                                </div>
                                
                                {/* Task Preview (collapsed) or Full (expanded) */}
                                <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                                  {isExpanded ? run.task : taskPreview}
                                </div>
                              </div>
                              
                              {/* Expanded Details */}
                              {isExpanded && (
                                <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                                  <div className="pt-3 space-y-2">
                                    <div className="flex gap-2 text-[10px]">
                                      <span style={{ color: 'var(--text-dim)' }}>Session:</span>
                                      <span className="font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{run.sessionKey}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px]">
                                      <span style={{ color: 'var(--text-dim)' }}>Requester:</span>
                                      <span className="font-mono break-all" style={{ color: 'var(--text-secondary)' }}>{run.requesterSessionKey}</span>
                                    </div>
                                    {run.startedAt && run.endedAt && (
                                      <div className="flex gap-2 text-[10px]">
                                        <span style={{ color: 'var(--text-dim)' }}>Duration:</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                          {new Date(run.startedAt).toLocaleTimeString()} → {new Date(run.endedAt).toLocaleTimeString()} ({run.durationFormatted})
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-8" style={{ color: 'var(--text-dim)' }}>
                          No task runs found for this agent yet.
                          <br />
                          <span className="text-[11px]">Dispatch a task to see history here.</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}
        {activeTab === 'health' && (
          <div className="space-y-4 animate-fade-in pt-4 md:pt-0">
            {loadingHealth ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--accent-cyan)' }}></div>
              </div>
            ) : healthData ? (
              <>
                {/* NEW: DAILY HEALTH SCORE & BIOLOGICAL AGE */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Daily Health Score */}
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>DAILY HEALTH SCORE</div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-3xl font-bold tabular-nums" style={{ color: healthData.dailyHealthScore?.totalScore >= 80 ? 'var(--accent-green)' : healthData.dailyHealthScore?.totalScore >= 65 ? 'var(--accent-yellow)' : 'var(--accent-red)', fontFamily: 'var(--font-data)' }}>
                        {healthData.dailyHealthScore?.totalScore || 0}
                        <span className="text-lg ml-1" style={{ color: 'var(--text-dim)' }}>/100</span>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            // Copy sharable summary to clipboard
                            const text = healthData.sharableCard?.shareUrl.replace('data:text/plain;charset=utf-8,', '');
                            await navigator.clipboard.writeText(decodeURIComponent(text || ''));
                            setActionResult('Health summary copied to clipboard!');
                            setTimeout(() => setActionResult(null), 2000);
                          } catch {
                            setActionResult('Failed to copy summary');
                            setTimeout(() => setActionResult(null), 2000);
                          }
                        }}
                        className="px-3 py-1.5 rounded text-[10px] font-medium border transition-colors"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)', color: 'var(--accent-cyan)' }}
                      >
                        📤 SHARE
                      </button>
                    </div>
                    
                    {/* Score Breakdown */}
                    <div className="space-y-2">
                      {healthData.dailyHealthScore?.breakdown?.map((comp: any, i: number) => {
                        const color = comp.score >= 80 ? 'var(--accent-green)' : comp.score >= 65 ? 'var(--accent-yellow)' : 'var(--accent-red)';
                        return (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span style={{ color: 'var(--text-secondary)' }}>{comp.name}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                                <div 
                                  className="h-full transition-all duration-700" 
                                  style={{ width: `${comp.score}%`, background: color }}
                                />
                              </div>
                              <span className="text-xs w-8 text-right tabular-nums" style={{ color }}>{comp.score}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Daily Recommendations */}
                    {healthData.dailyHealthScore?.recommendations?.length > 0 && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                        <div className="text-[9px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>TODAY'S FOCUS</div>
                        {healthData.dailyHealthScore.recommendations.map((rec: string, i: number) => (
                          <div key={i} className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{rec}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Biological Age */}
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>BIOLOGICAL AGE</div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="text-3xl font-bold tabular-nums" style={{ color: healthData.biologicalAge?.biologicalAge < healthData.biologicalAge?.chronologicalAge ? 'var(--accent-green)' : 'var(--accent-yellow)', fontFamily: 'var(--font-data)' }}>
                        {Math.round(healthData.biologicalAge?.biologicalAge || 30)}
                        <span className="text-lg ml-1" style={{ color: 'var(--text-dim)' }}>years</span>
                      </div>
                      <div className="text-sm">
                        <div style={{ color: 'var(--text-secondary)' }}>vs {healthData.biologicalAge?.chronologicalAge} chronological</div>
                        <div className="text-xs" style={{ color: healthData.biologicalAge?.agingVelocity === 'slower' ? 'var(--accent-green)' : healthData.biologicalAge?.agingVelocity === 'faster' ? 'var(--accent-red)' : 'var(--text-dim)' }}>
                          Aging {healthData.biologicalAge?.agingVelocity}
                        </div>
                      </div>
                    </div>

                    {/* Top Aging Factors */}
                    {healthData.biologicalAge?.topFactors?.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[9px] tracking-wider uppercase" style={{ color: 'var(--text-dim)' }}>KEY FACTORS</div>
                        {healthData.biologicalAge.topFactors.slice(0, 4).map((factor: any, i: number) => {
                          const impact = factor.impact > 0 ? 'aging' : factor.impact < 0 ? 'youthful' : 'neutral';
                          const color = impact === 'youthful' ? 'var(--accent-green)' : impact === 'aging' ? 'var(--accent-red)' : 'var(--text-dim)';
                          return (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span style={{ color: 'var(--text-secondary)' }}>{factor.name}</span>
                              <span style={{ color }}>{impact === 'youthful' ? '↓' : impact === 'aging' ? '↑' : '='} {Math.abs(factor.impact).toFixed(1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* NEW: METABOLIC HEALTH SCORE */}
                {healthData.metabolicScore && (
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>METABOLIC HEALTH SCORE</div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="text-3xl font-bold" style={{ color: healthData.metabolicScore.score >= 80 ? 'var(--accent-green)' : healthData.metabolicScore.score >= 70 ? 'var(--accent-yellow)' : 'var(--accent-red)', fontFamily: 'var(--font-data)' }}>
                        {healthData.metabolicScore.score}
                        <span className="text-lg ml-2" style={{ color: 'var(--text-dim)' }}>Grade {healthData.metabolicScore.grade}</span>
                      </div>
                    </div>
                    
                    {/* Metabolic Markers */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                      {healthData.metabolicScore.details?.map((marker: any, i: number) => {
                        const color = marker.score >= 90 ? 'var(--accent-green)' : 'var(--accent-yellow)';
                        return (
                          <div key={i} className="text-xs">
                            <div style={{ color: 'var(--text-dim)' }}>{marker.name}</div>
                            <div style={{ color }} className="font-medium">{marker.value} <span style={{ color: 'var(--text-dim)' }}>({marker.score}%)</span></div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Metabolic Insights */}
                    {healthData.metabolicScore.insights?.length > 0 && (
                      <div className="pt-3 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                        <div className="text-[9px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>INSIGHTS</div>
                        {healthData.metabolicScore.insights.map((insight: string, i: number) => (
                          <div key={i} className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{insight}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* DAILY METRICS — single section, no duplication */}
                <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--text-dim)' }}>DAILY METRICS</div>
                      <button
                        onClick={async () => {
                          const scrollY = window.scrollY;
                          await fetchHealth();
                          requestAnimationFrame(() => window.scrollTo(0, scrollY));
                        }}
                        disabled={loadingHealth}
                        className="text-[9px] px-1.5 py-0.5 rounded border hover:opacity-80 transition-opacity"
                        style={{ borderColor: 'var(--border-dim)', color: 'var(--text-dim)', background: 'transparent' }}
                        title="Re-fetch health data from server"
                      >
                        {loadingHealth ? '⟳' : '↻'} refresh
                      </button>
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                      {healthData.wearables?.current?.lastSynced ? (() => {
                        const ago = Math.round((Date.now() - new Date(healthData.wearables.current.lastSynced).getTime()) / 60000);
                        const metricDate = healthData.wearables?.current?.metricDates?.steps;
                        const dataDate = metricDate ? (() => { const d = new Date(metricDate.replace(' +', '+').replace(' -', '-').replace(/\s/, 'T')); return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); })() : null;
                        return `synced ${ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago/60)}h ago` : `${Math.round(ago/1440)}d ago`}${dataDate ? ` · data from ${dataDate}` : ''}`;
                      })() : 'no sync data'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { 
                        key: 'sleep', 
                        label: 'Sleep', 
                        value: healthData.oura?.avgSleep7d || healthData.wearables?.current?.sleepHours, 
                        unit: 'hrs', 
                        target: '>7.5', 
                        good: (v: number) => v > 7.5,
                        trend: healthData.wearables?.trends?.sleep || [],
                        explanation: 'Sleep duration affects recovery, hormone production, and cognitive function. Quality matters more than quantity.',
                        tips: 'Consistent bedtime, cool dark room, no screens 1hr before bed, magnesium glycinate 400mg'
                      },
                      { 
                        key: 'hrv', 
                        label: 'HRV', 
                        value: healthData.wearables?.current?.hrv || healthData.oura?.avgHrv7d, 
                        unit: 'ms', 
                        target: '>80', 
                        good: (v: number) => v > 80,
                        trend: healthData.wearables?.trends?.hrv || [],
                        explanation: 'Heart Rate Variability indicates autonomic nervous system health and recovery status.',
                        tips: 'Improve with: deep breathing, cold exposure, consistent sleep, stress management, avoid overtraining'
                      },
                      { 
                        key: 'readiness', 
                        label: 'Readiness', 
                        value: healthData.oura?.avgReadiness7d, 
                        unit: '', 
                        target: '>75', 
                        good: (v: number) => v > 75,
                        trend: [],
                        explanation: 'Oura composite score of recovery readiness based on HRV, temperature, and sleep.',
                        tips: 'Use to guide training intensity. <70 = rest day, 70-85 = light activity, >85 = normal training'
                      },
                      { 
                        key: 'restingHR', 
                        label: 'Resting HR', 
                        value: healthData.wearables?.current?.restingHR, 
                        unit: 'bpm', 
                        target: '<52', 
                        good: (v: number) => v < 52,
                        trend: healthData.wearables?.trends?.restingHR || [],
                        explanation: 'Lower resting heart rate indicates better cardiovascular fitness.',
                        tips: 'Improve with: cardio training, lose body fat, manage stress, avoid stimulants before bed'
                      },
                      { 
                        key: 'steps', 
                        label: 'Steps', 
                        value: healthData.wearables?.current?.steps, 
                        unit: '', 
                        target: '>8000', 
                        good: (v: number) => v > 8000,
                        trend: healthData.wearables?.trends?.steps || [],
                        explanation: 'Daily movement indicator. More important than gym sessions for metabolic health.',
                        tips: 'Walk to meetings, take stairs, park far away, walking meetings, set hourly movement alarms'
                      },
                      { 
                        key: 'respiratoryRate', 
                        label: 'Respiratory Rate', 
                        value: healthData.wearables?.current?.respiratoryRate, 
                        unit: 'breaths/min', 
                        target: '12-18', 
                        good: (v: number) => v >= 12 && v <= 18,
                        trend: [],
                        explanation: 'Breathing rate during sleep. Changes can indicate illness or stress.',
                        tips: 'Practice slow breathing exercises. 4-7-8 technique: inhale 4, hold 7, exhale 8'
                      }
                    ].map((m, i) => {
                      const val = m.value;
                      const isGood = val != null && m.good(val);
                      const color = val == null ? 'var(--text-dim)' : isGood ? 'var(--accent-green)' : 'var(--accent-yellow)';
                      return (
                        <div 
                          key={i} 
                          className="p-3 rounded border cursor-pointer hover:border-opacity-50 transition-colors" 
                          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}
                          onClick={() => setSelectedMetric(m)}
                        >
                          <div className="text-[9px] tracking-wider uppercase" style={{ color: 'var(--text-dim)' }}>{m.label}</div>
                          <div className="text-xl font-bold tabular-nums mt-1" style={{ color, fontFamily: 'var(--font-data)' }}>
                            {val != null ? (m.label === 'Steps' ? Math.round(val).toLocaleString() : Number(val).toFixed(1)) : '—'}
                            <span className="text-[9px] ml-1 font-normal" style={{ color: 'var(--text-dim)' }}>{m.unit}</span>
                          </div>
                          <div className="text-[8px] mt-1" style={{ color: 'var(--text-dim)' }}>target: {m.target}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* BODY COMPOSITION & FITNESS */}
                <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                  <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>BODY COMPOSITION & FITNESS</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { 
                        key: 'weight', 
                        label: 'Weight', 
                        value: healthData.wearables?.current?.weight, 
                        unit: 'kg', 
                        target: '72-74', 
                        good: (v: number) => v >= 72 && v <= 74,
                        trend: healthData.wearables?.trends?.weight || [],
                        explanation: 'Body weight fluctuates daily due to hydration, food, waste. Track weekly averages.',
                        tips: 'Weigh at same time daily (morning, after bathroom). Focus on 7-day average, not daily changes'
                      },
                      { 
                        key: 'bodyFat', 
                        label: 'Body Fat', 
                        value: healthData.wearables?.current?.bodyFat, 
                        unit: '%', 
                        target: '<16', 
                        good: (v: number) => v < 16,
                        trend: [],
                        explanation: 'Body fat percentage. Apple Watch estimates are unreliable - get DEXA scan for accuracy.',
                        tips: 'Reduce with: calorie deficit, strength training, adequate protein (1.6g/kg), patience'
                      },
                      { 
                        key: 'vo2Max', 
                        label: 'VO2 Max', 
                        value: healthData.wearables?.current?.vo2Max, 
                        unit: 'ml/kg/min', 
                        target: '>45', 
                        good: (v: number) => v > 45,
                        trend: healthData.wearables?.trends?.vo2Max || [],
                        explanation: 'Maximum oxygen consumption. Strong predictor of longevity and cardiovascular health.',
                        tips: 'Improve with: interval training, Zone 2 cardio (180-age HR), lose body fat, consistency over intensity'
                      }
                    ].map((m, i) => {
                      const val = m.value;
                      const isGood = val != null && m.good(val);
                      const color = val == null ? 'var(--text-dim)' : isGood ? 'var(--accent-green)' : 'var(--accent-yellow)';
                      return (
                        <div 
                          key={i} 
                          className="p-3 rounded border cursor-pointer hover:border-opacity-50 transition-colors" 
                          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}
                          onClick={() => setSelectedMetric(m)}
                        >
                          <div className="text-[9px] tracking-wider uppercase" style={{ color: 'var(--text-dim)' }}>{m.label}</div>
                          <div className="text-xl font-bold tabular-nums mt-1" style={{ color, fontFamily: 'var(--font-data)' }}>
                            {val != null ? Number(val).toFixed(1) : '—'}
                            <span className="text-[9px] ml-1 font-normal" style={{ color: 'var(--text-dim)' }}>{m.unit}</span>
                          </div>
                          <div className="text-[8px] mt-1" style={{ color: 'var(--text-dim)' }}>target: {m.target}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* TREND CHARTS WITH TIME RANGE SELECTOR */}
                <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--text-dim)' }}>
                      📈 TRENDS · {healthData.timeRange === 'ALL' ? '12 MONTHS' : healthData.timeRange}
                    </div>
                    <div className="flex items-center gap-1">
                      {['3M', '6M', '1Y', 'ALL'].map(range => (
                        <button
                          key={range}
                          onClick={async () => {
                            const scrollY = window.scrollY;
                            setHealthTimeRange(range);
                            await fetchHealth(range);
                            requestAnimationFrame(() => window.scrollTo(0, scrollY));
                          }}
                          className="px-2 py-1 rounded text-[9px] font-medium transition-all border"
                          style={healthTimeRange === range
                            ? { background: 'rgba(0,255,200,0.15)', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }
                            : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-secondary)' }
                          }
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { name: 'VO2 Max', data: healthData.wearables?.trends?.vo2Max || [], color: 'var(--accent-red)', unit: 'ml/kg/min', optimal: '>45' },
                      { name: 'Resting HR', data: healthData.wearables?.trends?.restingHR || [], color: 'var(--accent-cyan)', unit: 'bpm', optimal: '<52' },
                      { name: 'HRV', data: healthData.wearables?.trends?.hrv || [], color: 'var(--accent-green)', unit: 'ms', optimal: '>80' },
                      { name: 'Weight', data: healthData.wearables?.trends?.weight || [], color: 'var(--accent-purple)', unit: 'kg', optimal: '72-74' },
                      { name: 'Steps', data: healthData.wearables?.trends?.steps || [], color: 'var(--accent-yellow)', unit: '/day', optimal: '>8000' },
                      { name: 'Sleep', data: healthData.wearables?.trends?.sleep || [], color: 'var(--accent-cyan)', unit: 'hrs', optimal: '>7.5' },
                    ].filter(chart => chart.data && chart.data.length > 0).map((chart, i) => {
                      const data = chart.data.filter((p: any) => p.value != null && !isNaN(p.value));
                      if (data.length < 2) return null;
                      const values = data.map((p: any) => p.value);
                      const min = Math.min(...values);
                      const max = Math.max(...values);
                      const padding = (max - min) * 0.15 || max * 0.05;
                      const vMin = min - padding;
                      const vMax = max + padding;
                      const vRange = vMax - vMin || 1;
                      const w = 300;
                      const h = 80;
                      const points = data.map((p: any, j: number) => {
                        const x = (j / (data.length - 1)) * (w - 16) + 8;
                        const y = h - ((p.value - vMin) / vRange) * (h - 8) - 4;
                        return { x, y, month: p.month, value: p.value };
                      });
                      
                      // Create supplement timeline overlay (purple dashed lines)
                      // Map chart names to relevant supplement targets
                      const chartTargetMap: Record<string, string[]> = {
                        'VO2 Max': ['VO2 Max'],
                        'Resting HR': ['Resting HR', 'Cardiovascular'],
                        'HRV': ['HRV', 'Sleep'],
                        'Weight': ['Weight'],
                        'Steps': [],
                        'Sleep': ['Sleep', 'Magnesium', 'Mg Erythrocyte'],
                      };
                      const relevantTargets = chartTargetMap[chart.name] || [];
                      const supplementLines = (healthData.supplementTimeline || [])
                        .filter((supplement: any) => {
                          if (relevantTargets.length === 0) return false;
                          const suppTargets = supplement.targets || [];
                          return suppTargets.some((t: string) => relevantTargets.includes(t));
                        })
                        .map((supplement: any) => {
                        const supplementDate = new Date(supplement.date);
                        const firstDataDate = new Date(data[0].month + '-15'); // Add day to month string
                        const lastDataDate = new Date(data[data.length - 1].month + '-15');
                        
                        // Check if supplement date falls within chart time range
                        if (supplementDate >= firstDataDate && supplementDate <= lastDataDate) {
                          const monthsSinceStart = (supplementDate.getTime() - firstDataDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
                          const totalMonths = (lastDataDate.getTime() - firstDataDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
                          const x = (monthsSinceStart / totalMonths) * (w - 16) + 8;
                          
                          return { x, supplement };
                        }
                        return null;
                      }).filter(Boolean);
                      
                      const linePath = points.map((p: any, j: number) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                      const areaPath = linePath + ` L${points[points.length-1].x},${h} L${points[0].x},${h} Z`;
                      const latest = values[values.length - 1];
                      const first = values[0];
                      const rawDir = latest > first ? 'up' : latest < first ? 'down' : 'flat';
                      // Define whether "up" is good or bad for each metric
                      const upIsGood: Record<string, boolean> = { 'VO2 Max': true, 'HRV': true, 'Steps': true, 'Sleep': true, 'Resting HR': false, 'Weight': false };
                      const isGood = rawDir === 'flat' ? null : (upIsGood[chart.name] ?? true) === (rawDir === 'up');
                      const trendDir = rawDir === 'up' ? '↑' : rawDir === 'down' ? '↓' : '→';
                      const trendColor = rawDir === 'flat' ? 'var(--text-dim)' : isGood ? 'var(--accent-green)' : 'var(--accent-red)';
                      
                      return (
                        <div key={i} className="relative">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] tracking-wider" style={{ color: 'var(--text-secondary)' }}>{chart.name}</span>
                            <span className="text-[10px] tabular-nums" style={{ color: chart.color, fontFamily: 'var(--font-data)' }}>
                              {latest.toFixed(chart.name === 'Steps' ? 0 : 1)} {chart.unit} <span style={{ color: trendColor }}>{trendDir}</span>
                            </span>
                          </div>
                          
                          {/* ✅ Interactive SVG with Tooltips */}
                          <div className="relative">
                            <svg viewBox={`0 0 ${w} ${h + 16}`} style={{ width: '100%', height: '96px' }}>
                              <defs>
                                <linearGradient id={`tg-${i}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={chart.color} stopOpacity="0.25" />
                                  <stop offset="100%" stopColor={chart.color} stopOpacity="0.02" />
                                </linearGradient>
                              </defs>
                              <path d={areaPath} fill={`url(#tg-${i})`} />
                              <path d={linePath} fill="none" stroke={chart.color} strokeWidth="1.5" strokeLinejoin="round" />
                              
                              {/* ✅ Supplement Timeline Overlay (Purple Dashed Lines) */}
                              {supplementLines.map((line: any, idx: number) => (
                                <g key={idx}>
                                  <line
                                    x1={line.x}
                                    y1="0"
                                    x2={line.x}
                                    y2={h}
                                    stroke="#a855f7"
                                    strokeWidth="1"
                                    strokeDasharray="3,3"
                                    opacity="0.7"
                                  />
                                  <text
                                    x={line.x}
                                    y="12"
                                    textAnchor="middle"
                                    fill="#a855f7"
                                    fontSize="6"
                                    fontWeight="bold"
                                  >
                                    {line.supplement.name}
                                  </text>
                                </g>
                              ))}
                              
                              {/* ✅ Interactive Data Points with Hover */}
                              {points.map((p: any, j: number) => (
                                <g key={j}>
                                  {/* Invisible larger circle for better hover detection */}
                                  <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="8"
                                    fill="transparent"
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoveredTooltip({
                                      x: p.x,
                                      y: p.y,
                                      value: p.value,
                                      month: p.month,
                                      chart: chart.name,
                                      unit: chart.unit,
                                      optimal: chart.optimal
                                    })}
                                    onMouseLeave={() => setHoveredTooltip(null)}
                                  />
                                  {/* Visible data point */}
                                  <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r="2"
                                    fill="var(--bg-primary)"
                                    stroke={chart.color}
                                    strokeWidth="1"
                                    className="pointer-events-none"
                                  />
                                  {j % 2 === 0 && <text x={p.x} y={h + 12} textAnchor="middle" fill="var(--text-dim)" fontSize="7">{p.month?.slice(5)}</text>}
                                </g>
                              ))}
                            </svg>
                            
                            {/* ✅ Interactive Tooltip */}
                            {hoveredTooltip && hoveredTooltip.chart === chart.name && (
                              <div
                                className="absolute z-10 p-2 rounded border text-[10px]"
                                style={{
                                  left: `${(hoveredTooltip.x / w) * 100}%`,
                                  top: `${(hoveredTooltip.y / (h + 16)) * 100 - 15}%`,
                                  transform: 'translate(-50%, -100%)',
                                  background: 'var(--bg-card)',
                                  borderColor: chart.color,
                                  color: 'var(--text-primary)',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                }}
                              >
                                <div className="font-medium" style={{ color: chart.color }}>{hoveredTooltip.chart}</div>
                                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{hoveredTooltip.month}</div>
                                <div className="font-mono font-bold">
                                  {hoveredTooltip.value.toFixed(hoveredTooltip.chart === 'Steps' ? 0 : 1)} {hoveredTooltip.unit}
                                </div>
                                <div className="text-[8px]" style={{ color: 'var(--text-dim)' }}>
                                  Optimal: {hoveredTooltip.optimal}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* THRIVE · OPTIMIZATION PRIORITIES */}
                {/* NEW: STRAIN & RECOVERY INSIGHTS (Whoop inspired) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Strain Analysis */}
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>STRAIN ANALYSIS</div>
                    <div className="space-y-3">
                      {/* Cardiovascular Strain */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span style={{ color: 'var(--text-secondary)' }}>Cardiovascular</span>
                          <span style={{ color: healthData.wearables?.current?.restingHR < 52 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                            {healthData.wearables?.current?.restingHR ? 
                              (healthData.wearables.current.restingHR < 52 ? 'Low' : healthData.wearables.current.restingHR < 65 ? 'Moderate' : 'High') 
                              : 'Unknown'}
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          RHR: {healthData.wearables?.current?.restingHR || '—'} bpm
                        </div>
                      </div>
                      
                      {/* Metabolic Strain */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span style={{ color: 'var(--text-secondary)' }}>Metabolic</span>
                          <span style={{ color: healthData.metabolicScore?.score >= 80 ? 'var(--accent-green)' : healthData.metabolicScore?.score >= 70 ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
                            {healthData.metabolicScore?.grade || 'Unknown'}
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          Score: {healthData.metabolicScore?.score || '—'}/100
                        </div>
                      </div>
                      
                      {/* Activity Strain */}
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span style={{ color: 'var(--text-secondary)' }}>Activity</span>
                          <span style={{ color: (healthData.wearables?.current?.steps || 0) > 8000 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                            {(healthData.wearables?.current?.steps || 0) > 10000 ? 'High' : 
                             (healthData.wearables?.current?.steps || 0) > 8000 ? 'Moderate' : 'Low'}
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                          Steps: {healthData.wearables?.current?.steps?.toLocaleString() || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recovery Status */}
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>RECOVERY STATUS</div>
                    <div className="space-y-3">
                      {/* Overall Recovery */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Overall Recovery</span>
                          <span className="text-2xl font-bold" style={{ 
                            color: (healthData.oura?.avgReadiness7d || 0) >= 75 ? 'var(--accent-green)' : 
                                  (healthData.oura?.avgReadiness7d || 0) >= 65 ? 'var(--accent-yellow)' : 'var(--accent-red)',
                            fontFamily: 'var(--font-data)' 
                          }}>
                            {healthData.oura?.avgReadiness7d ? Math.round(healthData.oura.avgReadiness7d) : '—'}%
                          </span>
                        </div>
                        
                        {/* Recovery Indicators */}
                        <div className="space-y-2">
                          {[
                            { label: 'Sleep Quality', value: healthData.oura?.avgSleep7d, unit: 'hrs', optimal: 7.5, good: (v: number) => v >= 7.5 },
                            { label: 'HRV Status', value: healthData.wearables?.current?.hrv || healthData.oura?.avgHrv7d, unit: 'ms', optimal: 80, good: (v: number) => v >= 80 },
                            { label: 'Temperature', value: healthData.wearables?.current?.temperature, unit: '°C', optimal: 36.5, good: (v: number) => v >= 35.5 && v <= 37.5 },
                          ].map((indicator, i) => {
                            const val = indicator.value;
                            const isGood = val != null && indicator.good(val);
                            const color = val == null ? 'var(--text-dim)' : isGood ? 'var(--accent-green)' : 'var(--accent-yellow)';
                            return (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span style={{ color: 'var(--text-secondary)' }}>{indicator.label}</span>
                                <span style={{ color }} className="tabular-nums">
                                  {val != null ? `${val.toFixed(1)} ${indicator.unit}` : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Training Recommendation */}
                      <div className="pt-3 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                        <div className="text-[9px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>TRAINING RECOMMENDATION</div>
                        <div className="text-sm font-medium" style={{ 
                          color: (healthData.oura?.avgReadiness7d || 0) >= 75 ? 'var(--accent-green)' : 
                                (healthData.oura?.avgReadiness7d || 0) >= 65 ? 'var(--accent-yellow)' : 'var(--accent-red)' 
                        }}>
                          {(healthData.oura?.avgReadiness7d || 0) >= 75 ? '🟢 READY FOR TRAINING' :
                           (healthData.oura?.avgReadiness7d || 0) >= 65 ? '🟡 LIGHT ACTIVITY ONLY' : '🔴 REST DAY RECOMMENDED'}
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                          {(healthData.oura?.avgReadiness7d || 0) >= 75 ? 'Your body is well-recovered. Good time for intense training.' :
                           (healthData.oura?.avgReadiness7d || 0) >= 65 ? 'Moderate recovery. Consider yoga, walking, or light weights.' : 
                           'Low recovery. Focus on sleep, nutrition, and stress management.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NEW: HEALTH INSIGHTS & ALERTS */}
                <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                  <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>HEALTH INSIGHTS & ALERTS</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Risk Indicators */}
                    <div>
                      <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>⚠️ Risk Indicators</div>
                      <div className="space-y-1">
                        {(() => {
                          const risks = [];
                          
                          // Check bloodwork risks
                          const apoBMarker = healthData.bloodwork?.markers?.find((m: any) => m.name.includes('ApoB'));
                          if (apoBMarker?.values?.length) {
                            const latestApoB = apoBMarker.values[apoBMarker.values.length - 1]?.value;
                            if (latestApoB > 80) {
                              risks.push({ text: `ApoB elevated (${latestApoB} mg/dL) - cardiovascular risk`, color: 'var(--accent-red)' });
                            }
                          }
                          
                          // Check days since last bloodwork
                          if ((healthData.bloodwork?.daysSinceLastTest || 0) > 180) {
                            risks.push({ text: `Bloodwork overdue (${healthData.bloodwork?.daysSinceLastTest} days)`, color: 'var(--accent-yellow)' });
                          }
                          
                          // Check HRV trends
                          if ((healthData.wearables?.current?.hrv || 0) < 50) {
                            risks.push({ text: `Low HRV (${healthData.wearables?.current?.hrv} ms) - possible overtraining`, color: 'var(--accent-yellow)' });
                          }
                          
                          if (risks.length === 0) {
                            risks.push({ text: 'No immediate risk indicators detected', color: 'var(--accent-green)' });
                          }
                          
                          return risks.map((risk, i) => (
                            <div key={i} className="text-xs" style={{ color: risk.color }}>{risk.text}</div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Positive Trends */}
                    <div>
                      <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>✅ Positive Trends</div>
                      <div className="space-y-1">
                        {(() => {
                          const positives = [];
                          
                          // Check biological age
                          if ((healthData.biologicalAge?.biologicalAge || 30) < (healthData.biologicalAge?.chronologicalAge || 30)) {
                            const diff = (healthData.biologicalAge?.chronologicalAge || 30) - (healthData.biologicalAge?.biologicalAge || 30);
                            positives.push({ text: `Biological age ${diff.toFixed(1)}y younger than chronological`, color: 'var(--accent-green)' });
                          }
                          
                          // Check daily health score
                          if ((healthData.dailyHealthScore?.totalScore || 0) >= 80) {
                            positives.push({ text: `Excellent health score (${healthData.dailyHealthScore?.totalScore}/100)`, color: 'var(--accent-green)' });
                          }
                          
                          // Check activity level
                          if ((healthData.wearables?.current?.steps || 0) > 10000) {
                            positives.push({ text: `High activity level (${healthData.wearables?.current?.steps?.toLocaleString()} steps)`, color: 'var(--accent-green)' });
                          }
                          
                          // Check supplement compliance
                          positives.push({ text: 'Comprehensive supplement protocol active', color: 'var(--accent-green)' });
                          
                          if (positives.length === 0) {
                            positives.push({ text: 'Continue current health practices', color: 'var(--text-dim)' });
                          }
                          
                          return positives.map((positive, i) => (
                            <div key={i} className="text-xs" style={{ color: positive.color }}>{positive.text}</div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {healthData.thriveList && healthData.thriveList.length > 0 && (
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>THRIVE · OPTIMIZATION PRIORITIES</div>
                    <div className="space-y-3">
                      {healthData.thriveList.map((item: any, i: number) => {
                        const isExpanded = expandedThrive === i;
                        const evidenceColor = item.evidence === 'strong' ? '#22c55e'
                          : item.evidence === 'moderate' ? '#eab308'
                          : '#06b6d4';
                        const statusColor = item.status === 'active' ? '#22c55e'
                          : item.status === 'pending' ? '#eab308'
                          : '#6b7280';
                        const categoryIcon = item.category === 'exercise' ? '🏃'
                          : item.category === 'supplement' ? '💊'
                          : '🌙';

                        return (
                          <div key={i} className="p-3 rounded border cursor-pointer transition-all hover:bg-opacity-80" 
                               style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}
                               onClick={() => setExpandedThrive(isExpanded ? null : i)}>
                            <div className="flex items-center gap-3">
                              {/* Rank */}
                              <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-data)' }}>
                                {item.rank}
                              </div>
                              
                              {/* Main Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs">{categoryIcon}</span>
                                  <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                                </div>
                                
                                {/* Impact bar */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>IMPACT:</span>
                                  <div className="flex gap-1">
                                    {[...Array(10)].map((_: any, j: number) => (
                                      <div key={j} className="w-1.5 h-1.5 rounded-full" 
                                           style={{ background: j < item.impact ? 'var(--accent-green)' : 'var(--bg-secondary)' }} />
                                    ))}
                                  </div>
                                  <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-data)' }}>
                                    {item.impact}/10
                                  </span>
                                </div>
                                
                                {/* Badges */}
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 text-[8px] font-medium rounded border" 
                                        style={{ borderColor: evidenceColor, color: evidenceColor, background: `${evidenceColor}15` }}>
                                    {item.evidence.toUpperCase()}
                                  </span>
                                  <span className="px-1.5 py-0.5 text-[8px] font-medium rounded border" 
                                        style={{ borderColor: statusColor, color: statusColor, background: `${statusColor}15` }}>
                                    {item.status === 'active' ? '● ACTIVE' : item.status === 'pending' ? '◐ PENDING' : '○ NOT STARTED'}
                                  </span>
                                </div>
                                
                                {/* Target markers */}
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {item.targets.map((target: string, k: number) => (
                                    <button key={k} className="px-1.5 py-0.5 text-[8px] rounded border cursor-pointer hover:border-cyan-500 transition-all" 
                                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-secondary)' }}
                                          onClick={(e: any) => {
                                            e.stopPropagation();
                                            const marker = healthData?.bloodwork?.markers?.find((m: any) => m.name === target);
                                            if (marker) setSelectedMarker(marker);
                                          }}>
                                      {target}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Expand icon */}
                              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                                {isExpanded ? '▲' : '▼'}
                              </div>
                            </div>
                            
                            {/* Expanded description */}
                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: 'var(--border-dim)', color: 'var(--text-secondary)' }}>
                                {item.description}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* HEALTH CATEGORY SCORES */}
                {healthData.categories && healthData.categories.length > 0 && (
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>HEALTH CATEGORY SCORES</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {healthData.categories.map((category: any, i: number) => {
                        const scoreColor = category.score >= 90 ? 'var(--accent-green)' 
                          : category.score >= 70 ? 'var(--accent-cyan)'
                          : category.score >= 50 ? 'var(--accent-yellow)'
                          : 'var(--accent-red)';

                        return (
                          <div
                            key={i}
                            className="p-4 rounded border cursor-pointer transition-all hover:scale-105 hover:border-opacity-60"
                            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}
                            onClick={() => setSelectedCategory(category)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xl">{category.emoji}</span>
                              <div className="relative w-12 h-12">
                                {/* Score Ring */}
                                <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                                  <circle
                                    cx="18"
                                    cy="18"
                                    r="15.5"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.1)"
                                    strokeWidth="2"
                                  />
                                  <circle
                                    cx="18"
                                    cy="18"
                                    r="15.5"
                                    fill="none"
                                    stroke={scoreColor}
                                    strokeWidth="2"
                                    strokeDasharray={`${(category.score / 100) * 97.4} 97.4`}
                                    strokeLinecap="round"
                                    className="transition-all duration-1000"
                                  />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-xs font-bold tabular-nums" style={{ color: scoreColor, fontFamily: 'var(--font-data)' }}>
                                    {Math.round(category.score)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                {category.name}
                              </div>
                              <div className="text-[9px]" style={{ color: scoreColor }}>
                                {category.label}
                              </div>
                              {category.history && category.history.length > 1 && (() => {
                                const current = category.score;
                                const previous = category.history[category.history.length - 2]?.score;
                                const trend = current > previous ? '↑' : current < previous ? '↓' : '→';
                                const trendColor = current > previous ? 'var(--accent-green)' : current < previous ? 'var(--accent-red)' : 'var(--text-dim)';
                                return (
                                  <div className="text-[8px] mt-1" style={{ color: trendColor }}>
                                    {trend} {Math.abs(current - previous).toFixed(1)}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ✅ 4. HEALTH SCORE HISTORY */}
                {healthData.categories && healthData.categories.some((cat: any) => cat.history && cat.history.length > 0) && (
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>
                      📊 HEALTH SCORE HISTORY · CATEGORY TRENDS
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {healthData.categories
                        .filter((cat: any) => cat.history && cat.history.length > 0)
                        .slice(0, 6) // Show top 6 categories
                        .map((category: any, i: number) => {
                          const scoreColor = category.score >= 90 ? 'var(--accent-green)' 
                            : category.score >= 70 ? 'var(--accent-cyan)'
                            : category.score >= 50 ? 'var(--accent-yellow)'
                            : 'var(--accent-red)';
                          
                          const historyData = category.history || [];
                          if (historyData.length < 2) return null;
                          
                          const scores = historyData.map((h: any) => h.score);
                          const min = Math.min(...scores) - 5;
                          const max = Math.max(...scores) + 5;
                          const range = max - min || 1;
                          
                          const w = 200;
                          const h = 60;
                          const points = historyData.map((entry: any, j: number) => {
                            const x = historyData.length === 1 ? w / 2 : (j / (historyData.length - 1)) * (w - 20) + 10;
                            const y = h - ((entry.score - min) / range) * (h - 10) - 5;
                            return { x, y, date: entry.date, score: entry.score };
                          });
                          
                          const linePath = points.map((p: any, j: number) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                          const areaPath = linePath + ` L${points[points.length-1].x},${h} L${points[0].x},${h} Z`;
                          
                          const currentScore = scores[scores.length - 1];
                          const previousScore = scores[scores.length - 2];
                          const change = currentScore - previousScore;
                          const changeColor = change > 0 ? 'var(--accent-green)' : change < 0 ? 'var(--accent-red)' : 'var(--text-dim)';
                          
                          return (
                            <div key={i} className="p-3 rounded border cursor-pointer transition-all hover:border-opacity-60" 
                                 style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}
                                 onClick={() => setSelectedCategory(category)}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{category.emoji}</span>
                                  <div>
                                    <div className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                      {category.name}
                                    </div>
                                    <div className="text-[8px]" style={{ color: 'var(--text-dim)' }}>
                                      {historyData.length} months tracked
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold tabular-nums" style={{ color: scoreColor, fontFamily: 'var(--font-data)' }}>
                                    {Math.round(currentScore)}
                                  </div>
                                  <div className="text-[8px]" style={{ color: changeColor }}>
                                    {change > 0 ? '+' : ''}{change.toFixed(0)}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="relative">
                                <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '40px' }}>
                                  <defs>
                                    <linearGradient id={`score-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={scoreColor} stopOpacity="0.2" />
                                      <stop offset="100%" stopColor={scoreColor} stopOpacity="0.05" />
                                    </linearGradient>
                                  </defs>
                                  <path d={areaPath} fill={`url(#score-grad-${i})`} />
                                  <path d={linePath} fill="none" stroke={scoreColor} strokeWidth="1.5" strokeLinejoin="round" />
                                  {points.map((p: any, j: number) => (
                                    <circle
                                      key={j}
                                      cx={p.x}
                                      cy={p.y}
                                      r="1.5"
                                      fill={scoreColor}
                                      className="cursor-pointer"
                                      onMouseEnter={() => setHoveredTooltip({
                                        x: p.x,
                                        y: p.y,
                                        value: p.score,
                                        month: p.date,
                                        chart: category.name,
                                        unit: '/100'
                                      })}
                                      onMouseLeave={() => setHoveredTooltip(null)}
                                    />
                                  ))}
                                </svg>
                                
                                {/* Tooltip for score history */}
                                {hoveredTooltip && hoveredTooltip.chart === category.name && (
                                  <div
                                    className="absolute z-10 p-2 rounded border text-[9px] whitespace-nowrap"
                                    style={{
                                      left: `${(hoveredTooltip.x / w) * 100}%`,
                                      top: `${(hoveredTooltip.y / h) * 100 - 10}%`,
                                      transform: 'translate(-50%, -100%)',
                                      background: 'var(--bg-card)',
                                      borderColor: scoreColor,
                                      color: 'var(--text-primary)',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                    }}
                                  >
                                    <div className="font-medium" style={{ color: scoreColor }}>{category.name}</div>
                                    <div className="text-[8px]" style={{ color: 'var(--text-dim)' }}>{hoveredTooltip.month}</div>
                                    <div className="font-mono font-bold">
                                      {hoveredTooltip.value}/100
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* BLOODWORK */}
                {healthData.bloodwork?.markers && (
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--text-dim)' }}>BLOODWORK</div>
                      <div className="text-[9px]" style={{ color: healthData.bloodwork.daysSinceLastTest > 180 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                        Last test: {healthData.bloodwork.lastTestDate} ({healthData.bloodwork.daysSinceLastTest}d ago)
                      </div>
                    </div>
                    {(() => {
                      const categories: Record<string, string[]> = {
                        'Blood Count': ['Hemoglobin', 'Hematocrit', 'MCV', 'MCH', 'MCHC', 'RBC', 'WBC', 'Platelet', 'RDW'],
                        'Lipids & CVD': ['Cholesterol', 'LDL', 'HDL', 'Triglyceride', 'ApoB', 'Lp(a)'],
                        'Metabolic': ['Glucose', 'HbA1c', 'Insulin', 'Uric'],
                        'Hormones': ['Testosterone', 'TSH', 'T3', 'T4', 'Cortisol', 'DHEA', 'Estradiol', 'SHBG', 'LH', 'Prolactin'],
                        'Vitamins & Minerals': ['Vitamin', 'B12', 'Folate', 'Zinc', 'Magnesium', 'Calcium', 'Mg Erythrocyte'],
                        'Iron Panel': ['Ferritin', 'Iron', 'Transferrin', 'TIBC'],
                        'Liver & Kidney': ['ALT', 'AST', 'GGT', 'Bilirubin', 'Albumin', 'Creatinine', 'Urea', 'LDH', 'Creatine Kinase', 'Total Protein'],
                        'Inflammation': ['CRP', 'hsCRP', 'Homocysteine'],
                      };
                      const getCat = (name: string) => {
                        for (const [cat, markers] of Object.entries(categories)) {
                          if (markers.some(m => name.toLowerCase().includes(m.toLowerCase()))) return cat;
                        }
                        return 'Other';
                      };
                      const grouped: Record<string, any[]> = {};
                      healthData.bloodwork.markers.forEach((m: any) => {
                        const cat = getCat(m.name);
                        if (!grouped[cat]) grouped[cat] = [];
                        grouped[cat].push(m);
                      });
                      return Object.entries(grouped).map(([cat, markers]) => (
                        <div key={cat} className="mb-4">
                          <div className="text-[9px] tracking-[0.15em] uppercase mb-2 pb-1 border-b" style={{ color: 'var(--accent-cyan)', borderColor: 'var(--border-dim)' }}>{cat}</div>
                          <div className="space-y-1">
                            {markers.map((m: any, j: number) => {
                              const latestVal = m.values?.filter((v: any) => v.value !== null).pop();
                              const statusColor = m.status === 'genetic' ? 'var(--text-dim)' 
                                : m.status === 'optimal' ? 'var(--accent-green)' 
                                : m.status === 'watch' ? 'var(--accent-yellow)' 
                                : m.status === 'flag' ? 'var(--accent-red)' : 'var(--text-secondary)';
                              return (
                                <div 
                                  key={j} 
                                  className="flex items-center gap-2 text-[10px] py-1 cursor-pointer hover:bg-opacity-50 transition-colors rounded px-2"
                                  style={{ background: 'transparent' }}
                                  onClick={() => setSelectedMarker(m)}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
                                  <div className="truncate" style={{ flex: '1 1 0', minWidth: 0, color: m.status === 'genetic' ? 'var(--text-dim)' : 'var(--text-secondary)' }}>
                                    {m.name}
                                    {m.status === 'genetic' && <span className="ml-1 text-[8px]">(genetic)</span>}
                                  </div>
                                  <div className="tabular-nums font-medium shrink-0 text-right" style={{ width: '3rem', color: statusColor, fontFamily: 'var(--font-data)' }}>
                                    {latestVal ? latestVal.value : '—'}
                                  </div>
                                  <div className="text-[8px] shrink-0 text-right" style={{ width: '3.5rem', color: 'var(--text-dim)' }}>{m.unit}</div>
                                  <div className="text-[8px] shrink-0 text-right" style={{ width: '4rem', color: 'var(--text-dim)' }}>{m.optimalRange}</div>
                                  <div className="text-[8px] shrink-0 text-right whitespace-nowrap" style={{ width: '5.5rem', color: 'var(--text-dim)' }}>{m.trend}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}

                {/* NEXT TESTS */}
                {healthData.nextTests && (
                  <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>NEXT TESTS</div>
                    <div className="space-y-4">
                      {/* Bloodwork */}
                      <div className="p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Bloodwork (Full Panel)</span>
                          <span className="text-[8px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,59,92,0.15)', color: 'var(--accent-red)' }}>🟡 Emailed, awaiting response</span>
                        </div>
                        <div className="text-[9px] mb-2" style={{ color: 'var(--text-dim)' }}>Provider: tumedico.es (€200-300)</div>
                        <div className="text-[9px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                          <strong>Instructions:</strong> Already emailed. When confirming, request: hemograma completo, glucosa, HbA1c, insulina en ayunas, colesterol total, HDL, LDL, triglicéridos, ApoB, Lp(a), ferritina, hierro, transferrina, saturación de transferrina, creatinina, urea, ácido úrico, GOT, GPT, GGT, bilirrubina, proteínas totales, albúmina, CK, LDH, sodio, potasio, calcio, cloruros, magnesio, magnesio eritrocitario, homocisteína, PCR, vitamina D, vitamina B12, ácido fólico, zinc, testosterona total, SHBG, cortisol, DHEA-S, estradiol, TSH, T4, T3, índice omega-3. Morning, fasted, before 9am (or noon if waking at 10-11am).
                        </div>
                      </div>

                      {/* DEXA */}
                      <div className="p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>DEXA Body Composition Scan</span>
                          <span className="text-[8px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,255,200,0.1)', color: 'var(--accent-cyan)' }}>recommended</span>
                        </div>
                        <div className="text-[9px] mb-2" style={{ color: 'var(--text-dim)' }}>Provider: Grup Manchón via ClinicPoint (€128) • Adeslas: No</div>
                        <div className="text-[9px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                          <strong>Instructions:</strong> Book at clinicpoint.com → search 'DEXA Barcelona' → Grup Manchón Meridiana. Make sure to select 'composición corporal' (body composition), NOT 'densitometría ósea' (bone density). They're different scans on the same machine.
                        </div>
                        <div className="text-[9px]" style={{ color: 'var(--accent-cyan)' }}>clinicpoint.com</div>
                      </div>

                      {/* Other tests */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                          <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Dermatologist (Skin Check)</div>
                          <div className="text-[9px] mb-1" style={{ color: 'var(--text-dim)' }}>Adeslas • Free</div>
                          <div className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Open Adeslas app → Cuadro Médico → Dermatología → Barcelona. Book 'revisión de lunares' (mole check).</div>
                        </div>

                        <div className="p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                          <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Ophthalmologist (Eye Exam)</div>
                          <div className="text-[9px] mb-1" style={{ color: 'var(--text-dim)' }}>Adeslas • Free</div>
                          <div className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Open Adeslas app → Cuadro Médico → Oftalmología. Or book at VERTE Oftalmología (verte.es).</div>
                        </div>

                        <div className="p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                          <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Dentist (Cleaning)</div>
                          <div className="text-[9px] mb-1" style={{ color: 'var(--text-dim)' }}>Adeslas Dental Poblenou • Free</div>
                          <div className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Call Adeslas dental or book through the Adeslas app. Mon-Fri 9-14 / 16-21 by appointment.</div>
                        </div>

                        <div className="p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                          <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Coronary Calcium Score</div>
                          <div className="text-[9px] mb-1" style={{ color: 'var(--text-dim)' }}>CETIR/Creu Blanca • ~€100-150</div>
                          <div className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Book via smartsalus.com or creu-blanca.es. Quick CT scan (~10 min). Worth doing after bloodwork.</div>
                        </div>

                        <div className="p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                          <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>DNA Test</div>
                          <div className="text-[9px] mb-1" style={{ color: 'var(--text-dim)' }}>Dante Labs • €399</div>
                          <div className="text-[9px]" style={{ color: 'var(--accent-green)' }}>✅ Ordered! Kit will arrive in 1-2 weeks. Results in 6-8 weeks (~late March).</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUPPLEMENTS · PROTOCOL */}
                {healthData.supplementDetails && healthData.supplementDetails.length > 0 && (() => {
                  const timingOrder = ['Breakfast 12pm', 'Lunch 3-4pm', 'Breakfast + Dinner', 'Dinner 9-10pm', 'Before sleep', 'DROP'];
                  const groupedByTiming: Record<string, any[]> = {};
                  
                  // Group supplements by timing
                  healthData.supplementDetails.forEach((supp: any) => {
                    if (!groupedByTiming[supp.timing]) {
                      groupedByTiming[supp.timing] = [];
                    }
                    groupedByTiming[supp.timing].push(supp);
                  });
                  
                  return (
                    <div className="p-4 rounded border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}>
                      <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--text-dim)' }}>SUPPLEMENTS · PROTOCOL</div>
                      
                      {/* Priority Changes */}
                      <div className="mb-4 p-3 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}>
                        <div className="text-[9px] tracking-wider uppercase mb-2" style={{ color: 'var(--accent-yellow)' }}>PRIORITY CHANGES</div>
                        <div className="space-y-2">
                          {healthData.supplementDetails.filter((s: any) => s.status === 'increase' || s.status === 'drop').map((supp: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[10px]">
                              <span className="px-1.5 py-0.5 text-[8px] font-medium rounded" style={{ 
                                background: supp.status === 'increase' ? 'var(--accent-cyan)' : 'var(--accent-red)', 
                                color: 'var(--bg-primary)' 
                              }}>
                                {supp.status === 'increase' ? 'INCREASE' : 'DROP'}
                              </span>
                              <span style={{ color: 'var(--text-primary)' }}>{supp.name}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>({supp.dose})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Grouped by timing */}
                      {timingOrder.map((timing: string) => {
                        const supplements = groupedByTiming[timing] || [];
                        if (supplements.length === 0) return null;
                        
                        return (
                          <div key={timing} className="mb-4">
                            <div className="text-[9px] tracking-[0.15em] uppercase mb-2 pb-1 border-b" style={{ color: 'var(--accent-cyan)', borderColor: 'var(--border-dim)' }}>
                              {timing}
                            </div>
                            <div className="space-y-2">
                              {supplements.map((supp: any, i: number) => {
                                const suppKey = `${timing}-${i}`;
                                const isExpanded = expandedSupplement === suppKey;
                                const statusColor = supp.status === 'keep' ? 'var(--accent-green)'
                                  : supp.status === 'add' ? '#a855f7'
                                  : supp.status === 'increase' ? 'var(--accent-cyan)'
                                  : supp.status === 'optional' ? 'var(--accent-yellow)'
                                  : 'var(--accent-red)';
                                const isDropped = supp.status === 'drop';

                                return (
                                  <div key={i} className={`p-2 rounded border cursor-pointer transition-all hover:bg-opacity-80 ${isDropped ? 'opacity-60' : ''}`} 
                                       style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-dim)' }}
                                       onClick={() => setExpandedSupplement(isExpanded ? null : suppKey)}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 flex-1">
                                        <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                                        <div className={isDropped ? 'line-through' : ''}>
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                              {supp.name}
                                            </span>
                                            {supp.status !== 'keep' && (
                                              <span className="text-[10px] px-1 py-0.5 rounded border" style={{ 
                                                borderColor: statusColor, 
                                                color: statusColor,
                                                background: 'transparent'
                                              }}>
                                                {supp.status.toUpperCase()}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                            {supp.dose} • Started {supp.startedApprox}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                                        {isExpanded ? '▲' : '▼'}
                                      </div>
                                    </div>
                                    
                                    {/* Target markers */}
                                    <div className="flex flex-wrap gap-1 mt-2 mb-2">
                                      {supp.targets.map((target: string, k: number) => {
                                        const marker = healthData?.bloodwork?.markers?.find((m: any) => m.name === target);
                                        if (!marker) {
                                          return (
                                            <span key={k} className="px-1.5 py-0.5 text-[8px] rounded border opacity-50"
                                                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }}>
                                              {target}
                                            </span>
                                          );
                                        }
                                        const vals = marker.history?.filter((h: any) => h.value != null) || [];
                                        const latest = vals[vals.length - 1];
                                        const statusColor = marker.status?.includes('✅') ? 'var(--accent-green)' : marker.status?.includes('🟡') ? 'var(--accent-yellow)' : marker.status?.includes('⚠️') ? 'var(--accent-red)' : 'var(--accent-cyan)';
                                        return (
                                          <button key={k} 
                                                  className="px-1.5 py-0.5 text-[8px] rounded border transition-all hover:opacity-80 cursor-pointer flex items-center gap-1"
                                                  style={{ background: 'var(--bg-secondary)', borderColor: statusColor, color: statusColor }}
                                                  onClick={(e: any) => {
                                                    e.stopPropagation();
                                                    setSelectedMarker(marker);
                                                  }}>
                                            {target}{latest ? `: ${latest.value}` : ''}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    
                                    {/* Expanded details with linked biomarkers */}
                                    {isExpanded && (
                                      <div className="mt-3 pt-3 border-t text-[10px] space-y-3" style={{ borderColor: 'var(--border-dim)', color: 'var(--text-secondary)' }}>
                                        <div>
                                          <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Why:</div>
                                          {supp.why}
                                        </div>
                                        {/* Show linked biomarkers with latest values */}
                                        {(() => {
                                          const linkedMarkers = supp.targets
                                            .map((t: string) => healthData?.bloodwork?.markers?.find((m: any) => m.name === t))
                                            .filter(Boolean);
                                          if (linkedMarkers.length === 0) return null;
                                          return (
                                            <div>
                                              <div className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Related Biomarkers:</div>
                                              <div className="space-y-1.5">
                                                {linkedMarkers.map((m: any, mi: number) => {
                                                  const vals = m.history?.filter((h: any) => h.value != null) || [];
                                                  const latest = vals[vals.length - 1];
                                                  const prev = vals.length > 1 ? vals[vals.length - 2] : null;
                                                  const trend = latest && prev ? (latest.value > prev.value ? '↑' : latest.value < prev.value ? '↓' : '→') : '';
                                                  const trendColor = m.status?.includes('✅') ? 'var(--accent-green)' : m.status?.includes('🟡') ? 'var(--accent-yellow)' : m.status?.includes('⚠️') ? 'var(--accent-red)' : 'var(--text-secondary)';
                                                  return (
                                                    <button key={mi} 
                                                            className="w-full flex items-center justify-between p-2 rounded border cursor-pointer hover:border-cyan-500 transition-all"
                                                            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)' }}
                                                            onClick={(e: any) => { e.stopPropagation(); setSelectedMarker(m); }}>
                                                      <span style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                                                      <div className="flex items-center gap-2">
                                                        {latest && <span className="tabular-nums" style={{ color: trendColor, fontFamily: 'var(--font-data)' }}>{latest.value} {m.unit}</span>}
                                                        {trend && <span style={{ color: trendColor }}>{trend}</span>}
                                                        <span className="text-[8px]" style={{ color: 'var(--text-dim)' }}>
                                                          optimal: {m.optimalRange || '—'}
                                                        </span>
                                                        <span style={{ color: 'var(--text-dim)' }}>→</span>
                                                      </div>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      
                      <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                        <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                          {healthData.supplementDetails.filter((s: any) => s.status === 'keep').length} active • 
                          {healthData.supplementDetails.filter((s: any) => s.status === 'drop').length} to drop • 
                          {healthData.supplementDetails.filter((s: any) => s.status === 'optional').length} optional
                        </div>
                        <div className="text-[9px]" style={{ color: 'var(--accent-cyan)' }}>Click targets to view trends</div>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="text-center py-12 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                No health data available. Check API endpoint.
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-3" style={{ color: 'var(--text-dim)' }}>
        <div className="text-[9px] tracking-[0.3em] uppercase" style={{ fontFamily: 'var(--font-orbitron)' }}>
          MIKEY NOVA 👾 · MAC MINI M4 · {tailscale?.magicDNS || 'TAILSCALE'}
        </div>
      </footer>

      {/* ════════ TASK MODAL ════════ */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="flex flex-col p-0" style={{ maxWidth: '42rem' }} showCloseButton={true}>
          {selectedTask && (
            <>
              {/* Header */}
              <DialogHeader className="p-4 border-b shrink-0 flex flex-row items-center gap-3" style={{ borderColor: 'var(--border-dim)' }}>
                {(() => {
                  const project = tasks?.projects?.find((p: any) => p.id === selectedTask.project);
                  return project ? (
                    <span className="text-[10px] px-2 py-1 rounded" style={{ background: `${project.color}22`, color: project.color }}>
                      {project.emoji} {project.name}
                    </span>
                  ) : null;
                })()}
                <select
                  value={selectedTask.status}
                  onChange={async (e) => {
                    await fetch('/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'move', id: selectedTask.id, status: e.target.value })
                    });
                    fetchTasks();
                    setSelectedTask({ ...selectedTask, status: e.target.value });
                  }}
                  className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                >
                  <option value="backlog">Backlog</option>
                  <option value="in-progress">In Progress</option>
                  <option value="in-review">In Review</option>
                  <option value="done">Done</option>
                </select>
              </DialogHeader>

              {/* Content */}
              <div 
                className="p-4 overflow-auto flex-1"
                style={{ 
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  maxHeight: 'calc(100dvh - 14rem)',
                }}
              >
              {/* Title */}
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{selectedTask.title}</h2>
              
              {/* Description */}
              <div className="mb-4">
                <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Description</label>
                <textarea
                  value={selectedTask.description || ''}
                  onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                  onBlur={async () => {
                    await fetch('/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { description: selectedTask.description } })
                    });
                    fetchTasks();
                  }}
                  className="w-full p-2 rounded border text-[12px] resize-none"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-secondary)', minHeight: '80px' }}
                  placeholder="Add a description..."
                />
              </div>

              {/* Assignee & PR Row */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Assignee</label>
                  <select
                    value={selectedTask.assignee || ''}
                    onChange={async (e) => {
                      const newAssignee = e.target.value || null;
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'assign', id: selectedTask.id, assignee: newAssignee })
                      });
                      fetchTasks();
                      setSelectedTask({ ...selectedTask, assignee: newAssignee });
                    }}
                    className="w-full p-2 rounded border text-[12px] cursor-pointer"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Unassigned</option>
                    {tasks?.agents?.map((agent: any) => (
                      <option key={agent.id} value={agent.id}>{agent.emoji} {agent.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>PR Link</label>
                  <input
                    type="text"
                    value={selectedTask.pr || ''}
                    onChange={(e) => setSelectedTask({ ...selectedTask, pr: e.target.value })}
                    onBlur={async () => {
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { pr: selectedTask.pr || null } })
                      });
                      fetchTasks();
                    }}
                    className="w-full p-2 rounded border text-[12px]"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                    placeholder="https://github.com/..."
                  />
                </div>
              </div>

              {/* Due Date */}
              <div className="mb-4">
                <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Due Date</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().split('T')[0] : ''}
                    onChange={async (e) => {
                      const newDueDate = e.target.value ? new Date(e.target.value).getTime() : null;
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { dueDate: newDueDate } })
                      });
                      fetchTasks();
                      setSelectedTask({ ...selectedTask, dueDate: newDueDate });
                    }}
                    className="p-2 rounded border text-[12px]"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                  />
                  {selectedTask.dueDate && (
                    <>
                      <button
                        onClick={async () => {
                          await fetch('/api/tasks', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { dueDate: null } })
                          });
                          fetchTasks();
                          setSelectedTask({ ...selectedTask, dueDate: null });
                        }}
                        className="text-[10px] px-2 py-1 rounded"
                        style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}
                      >
                        Clear
                      </button>
                      {(() => {
                        const now = Date.now();
                        const daysUntilDue = Math.ceil((selectedTask.dueDate - now) / (1000 * 60 * 60 * 24));
                        const isOverdue = daysUntilDue < 0;
                        const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 3;
                        const statusColor = isOverdue ? 'var(--accent-red)' : isDueSoon ? 'var(--accent-yellow)' : 'var(--accent-green)';
                        const statusText = isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : daysUntilDue === 0 ? 'Due today!' : `${daysUntilDue} days left`;
                        return (
                          <span className="text-[10px]" style={{ color: statusColor }}>
                            {statusText}
                          </span>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>

              {/* Project & Tags Row */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Project</label>
                  <select
                    value={selectedTask.project || ''}
                    onChange={async (e) => {
                      const newProject = e.target.value || null;
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { project: newProject } })
                      });
                      fetchTasks();
                      setSelectedTask({ ...selectedTask, project: newProject });
                    }}
                    className="w-full p-2 rounded border text-[12px] cursor-pointer"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                  >
                    <option value="">No Project</option>
                    {tasks?.projects?.map((project: any) => (
                      <option key={project.id} value={project.id}>{project.emoji} {project.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-dim)' }}>Tags</label>
                  <div className="flex flex-wrap gap-1">
                    {tasks?.tags?.map((tag: any) => {
                      const isSelected = selectedTask.tags?.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={async () => {
                            const newTags = isSelected 
                              ? (selectedTask.tags || []).filter((t: string) => t !== tag.id)
                              : [...(selectedTask.tags || []), tag.id];
                            await fetch('/api/tasks', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'update', id: selectedTask.id, updates: { tags: newTags } })
                            });
                            fetchTasks();
                            setSelectedTask({ ...selectedTask, tags: newTags });
                          }}
                          className="text-[10px] px-2 py-1 rounded border transition-all"
                          style={isSelected 
                            ? { background: `${tag.color}22`, borderColor: tag.color, color: tag.color }
                            : { background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-dim)' }
                          }
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Activity Section */}
              <div>
                <label className="text-[10px] uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-dim)' }}>Activity</label>
                <div className="space-y-2 mb-3 max-h-40 overflow-auto">
                  {(selectedTask.activity || []).slice().reverse().map((act: any) => {
                    const agent = tasks?.agents?.find((a: any) => a.id === act.agentId);
                    return (
                      <div key={act.id} className="flex gap-2 text-[11px]">
                        <span style={{ color: agent?.color || 'var(--text-dim)' }}>{agent?.emoji || '•'}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{act.content}</span>
                        <span className="ml-auto text-[9px]" style={{ color: 'var(--text-dim)' }}>
                          {new Date(act.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                  {(!selectedTask.activity || selectedTask.activity.length === 0) && (
                    <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>No activity yet</div>
                  )}
                </div>
                {/* Add Comment */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    className="flex-1 p-2 rounded border text-[12px]"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-dim)', color: 'var(--text-primary)' }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                        const comment = (e.target as HTMLInputElement).value.trim();
                        await fetch('/api/tasks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'comment', id: selectedTask.id, comment, agentId: 'mikey' })
                        });
                        (e.target as HTMLInputElement).value = '';
                        const res = await fetch('/api/tasks');
                        const data = await res.json();
                        setTasks(data);
                        const updated = data.tasks.find((t: any) => t.id === selectedTask.id);
                        if (updated) setSelectedTask(updated);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border-dim)' }}>
                <button
                  onClick={async () => {
                    if (confirm('Delete this task?')) {
                      await fetch('/api/tasks', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'delete', id: selectedTask.id })
                      });
                      fetchTasks();
                      setSelectedTask(null);
                    }
                  }}
                  className="text-[10px] px-3 py-1.5 rounded"
                  style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}
                >
                  Delete Task
                </button>
                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                  Created {new Date(selectedTask.createdAt).toLocaleDateString()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════ METRIC DETAIL MODAL ════════ */}
      <Dialog open={!!selectedMetric} onOpenChange={(open) => !open && setSelectedMetric(null)}>
        <DialogContent className="flex flex-col p-0" style={{ maxWidth: '42rem' }} showCloseButton={true}>
          {selectedMetric && (
            <>
              {/* Header */}
              <DialogHeader className="p-4 border-b shrink-0" style={{ borderColor: 'var(--border-dim)' }}>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedMetric.label}</h2>
                <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  Current: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-data)' }}>
                    {selectedMetric.value ? (selectedMetric.label === 'Steps' ? Math.round(selectedMetric.value).toLocaleString() : Number(selectedMetric.value).toFixed(1)) : '—'} {selectedMetric.unit}
                  </span> • Target: {selectedMetric.target}
                </div>
              </DialogHeader>

              {/* Content */}
              <div className="p-4 overflow-auto flex-1" style={{ maxHeight: 'calc(100dvh - 14rem)' }}>
                {/* Trend Chart */}
                {selectedMetric.trend && selectedMetric.trend.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-[10px] tracking-wider uppercase mb-3" style={{ color: 'var(--text-dim)' }}>12-MONTH TREND</h3>
                    <div style={{ width: '100%', height: '140px', position: 'relative' }}>
                      {(() => {
                        const data = selectedMetric.trend.filter((p: any) => p.value != null && !isNaN(p.value));
                        if (data.length < 2) return null;
                        const values = data.map((p: any) => p.value);
                        const min = Math.min(...values);
                        const max = Math.max(...values);
                        const padding = (max - min) * 0.15 || max * 0.05;
                        const vMin = min - padding;
                        const vMax = max + padding;
                        const vRange = vMax - vMin || 1;
                        const w = 400;
                        const h = 120;
                        const points = data.map((p: any, i: number) => {
                          const x = (i / (data.length - 1)) * (w - 20) + 10;
                          const y = h - ((p.value - vMin) / vRange) * (h - 10) - 5;
                          return { x, y, month: p.month, value: p.value };
                        });
                        const linePath = points.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                        const areaPath = linePath + ` L${points[points.length-1].x},${h} L${points[0].x},${h} Z`;
                        return (
                          <svg viewBox={`0 0 ${w} ${h + 20}`} style={{ width: '100%', height: '100%' }}>
                            <defs>
                              <linearGradient id={`grad-${selectedMetric.label}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.02" />
                              </linearGradient>
                            </defs>
                            <path d={areaPath} fill={`url(#grad-${selectedMetric.label})`} />
                            <path d={linePath} fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinejoin="round" />
                            {points.map((p: any, i: number) => (
                              <g key={i}>
                                <circle cx={p.x} cy={p.y} r="3" fill="var(--bg-primary)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
                                <text x={p.x} y={h + 14} textAnchor="middle" fill="var(--text-dim)" fontSize="8">{p.month?.slice(5)}</text>
                              </g>
                            ))}
                          </svg>
                        );
                      })()}
                    </div>
                    
                    {(() => {
                      const values = selectedMetric.trend.map((p: any) => p.value);
                      const min = Math.min(...values);
                      const max = Math.max(...values);
                      const avg = values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
                      const recent = values.slice(-3);
                      const older = values.slice(0, 3);
                      const recentAvg = recent.reduce((sum: number, v: number) => sum + v, 0) / recent.length;
                      const olderAvg = older.length > 0 ? older.reduce((sum: number, v: number) => sum + v, 0) / older.length : recentAvg;
                      const trend = recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'declining' : 'stable';
                      const trendColor = trend === 'improving' ? 'var(--accent-green)' : trend === 'declining' ? 'var(--accent-red)' : 'var(--accent-yellow)';
                      
                      return (
                        <div className="grid grid-cols-4 gap-4 text-[10px]">
                          <div>
                            <div style={{ color: 'var(--text-dim)' }}>Min</div>
                            <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)' }}>{min.toFixed(1)}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-dim)' }}>Max</div>
                            <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)' }}>{max.toFixed(1)}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-dim)' }}>Average</div>
                            <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)' }}>{avg.toFixed(1)}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--text-dim)' }}>Trend</div>
                            <div style={{ color: trendColor, fontFamily: 'var(--font-data)' }}>{trend}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* What it means */}
                <div className="mb-4">
                  <h3 className="text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>WHAT IT MEANS</h3>
                  <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{selectedMetric.explanation}</p>
                </div>

                {/* How to improve */}
                <div className="mb-4">
                  <h3 className="text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>HOW TO IMPROVE</h3>
                  <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{selectedMetric.tips}</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ════════ BLOODWORK MARKER MODAL ════════ */}
      <Dialog open={!!selectedMarker} onOpenChange={(open) => !open && setSelectedMarker(null)}>
        <DialogContent className="flex flex-col p-0" style={{ maxWidth: '42rem', maxHeight: 'calc(100dvh - 2rem)' }} showCloseButton={true}>
          {selectedMarker && (() => {
            // Explanations for ALL markers
            const markerExplanations: Record<string, any> = {
              'Glucose': { what: 'Blood sugar level. Fasting glucose shows how well your body manages sugar overnight. Elevated = insulin resistance risk.', thalNote: null, action: 'Target 70-90 mg/dL fasting. Pair with HbA1c and fasting insulin for full picture.', supplements: 'HELPFUL: Chromium, berberine, low refined carbs, exercise' },
              'HbA1c': { what: '3-month average blood sugar. Unlike glucose (snapshot), this shows your average over time. Gold standard for metabolic health.', thalNote: 'Thalassemia trait can falsely LOWER HbA1c because your red blood cells turn over faster. Your true average may be slightly higher.', action: 'Target <5.2% for optimal. Tested once at 5.1 — good but retest to confirm.', supplements: 'HELPFUL: Chromium, cinnamon, low glycemic diet' },
              'Insulin': { what: 'How much insulin your pancreas needs to keep blood sugar normal. LOW insulin + normal glucose = excellent insulin sensitivity. High insulin + normal glucose = early insulin resistance (glucose still OK but your body is working harder).', thalNote: null, action: 'Never tested — adding to next bloodwork. Target <6 µIU/mL fasting.', supplements: 'HELPFUL: Chromium, berberine, low refined carbs, exercise' },
              'Hemoglobin': { what: 'Oxygen-carrying protein in red blood cells. Yours is low due to beta-thalassemia trait (genetic) — your red blood cells are smaller than normal, so each carries less hemoglobin. Your body compensates by making MORE red blood cells (hence high RBC count).', thalNote: 'This is NOT iron deficiency anemia. Do NOT supplement iron.', action: 'Monitor regularly but no intervention needed. This is your normal.', supplements: 'AVOID: Iron supplements (dangerous with thalassemia)' },
              'Hematocrit': { what: 'Percentage of your blood volume that is red blood cells. Low in thalassemia trait because each cell is smaller, so they take up less volume even though you have more of them.', thalNote: 'Low hematocrit is expected with thalassemia trait. Not a problem.', action: 'No intervention needed. Genetic.', supplements: 'AVOID: Iron supplements' },
              'MCV': { what: 'Mean Corpuscular Volume — average size of your red blood cells. Low because of thalassemia trait — your cells are microcytic (small). This is the #1 thalassemia giveaway.', thalNote: 'Normal range doesn\'t apply to you. Your cells will always be smaller (~65-70 fL vs normal 80-100).', action: 'No action needed. Genetic and permanent.', supplements: 'AVOID: Iron supplements' },
              'MCH': { what: 'Mean Corpuscular Hemoglobin — average amount of hemoglobin per red blood cell. Low because your cells are small (thalassemia), so each one carries less hemoglobin.', thalNote: 'Expected to be low with thal trait. Not a problem.', action: 'No action needed. Genetic.', supplements: 'AVOID: Iron supplements' },
              'MCHC': { what: 'Mean Corpuscular Hemoglobin Concentration — how densely packed the hemoglobin is within each red blood cell. Usually normal or slightly low in thal trait.', thalNote: 'Can be normal even with thal — it\'s the concentration per cell, not total amount.', action: 'No action needed.', supplements: 'None needed' },
              'RBC': { what: 'Red Blood Cell count — total number of red blood cells. Yours is HIGH because your body compensates for small thal cells by producing more of them. Classic thal pattern: low MCV + high RBC.', thalNote: 'High RBC is your body\'s smart compensation for small cells. Not a problem.', action: 'No action needed. This is your body adapting well.', supplements: 'None needed' },
              'RDW': { what: 'Red cell Distribution Width — measures variation in red blood cell size. Higher = more size variation. In thalassemia trait, RDW is usually NORMAL (all cells are uniformly small), unlike iron deficiency where RDW is high (mixed sizes).', thalNote: 'Normal RDW + low MCV = classic thal trait pattern. If RDW were high, it might suggest iron deficiency ON TOP of thal.', action: 'Useful for distinguishing thal from iron deficiency. Monitor stays normal.', supplements: 'None needed' },
              'Ferritin': { what: 'Iron storage protein — shows how much iron your body has banked. Unlike serum iron (fluctuates hourly), ferritin reflects long-term iron status.', thalNote: 'With thalassemia, iron can accumulate dangerously because your body absorbs more iron to compensate. Ferritin >200 is concerning for thal carriers.', action: 'NEVER supplement iron. Monitor ferritin stays 50-200.', supplements: 'AVOID: Iron supplements (dangerous with thalassemia)' },
              'Iron': { what: 'Serum iron — amount of iron currently circulating in blood. Fluctuates a LOT based on meals and time of day, so less reliable than ferritin.', thalNote: 'Do NOT supplement iron regardless of this number. Thal carriers absorb excess iron naturally.', action: 'Look at ferritin + transferrin saturation for the real picture, not serum iron alone.', supplements: 'AVOID: Iron supplements' },
              'TIBC': { what: 'Total Iron Binding Capacity — measures how much transferrin (iron taxi) is available. High TIBC = your body wants more iron (iron deficiency). Normal/low = adequate iron.', thalNote: 'In thal trait, TIBC is usually normal because iron stores are fine — the issue is hemoglobin production, not iron.', action: 'Helps confirm iron status. Normal TIBC + low MCV = thal, not iron deficiency.', supplements: 'None needed' },
              'Transferrin Sat': { what: 'Transferrin Saturation — percentage of iron-carrying proteins that are loaded with iron. Like checking how full the delivery trucks are.', thalNote: 'Normal or high in thal trait (plenty of iron, just can\'t use it efficiently for hemoglobin).', action: 'Target 20-45%. If >45%, iron overload risk.', supplements: 'AVOID: Iron supplements' },
              'Transferrin': { what: 'The protein that transports iron through your blood — like a delivery truck for iron. Your body makes more transferrin when iron stores are low.', thalNote: 'Usually normal in thal trait since iron stores are adequate.', action: 'Monitor alongside ferritin and TIBC for complete iron picture.', supplements: 'None needed' },
              'Total Cholesterol': { what: 'Sum of all cholesterol (LDL + HDL + VLDL). Less useful than individual components — a high total could be high HDL (good) or high LDL (bad).', thalNote: null, action: 'Focus on ApoB and HDL instead. Total cholesterol alone is outdated.', supplements: 'See ApoB and HDL recommendations' },
              'LDL': { what: 'Low-Density Lipoprotein — often called "bad" cholesterol. But LDL-C (what\'s measured) counts cholesterol MASS, not particle NUMBER. ApoB is better because it counts particles directly.', thalNote: null, action: 'ApoB is more actionable. If ApoB is <80, LDL doesn\'t matter much.', supplements: 'HELPFUL: Omega-3, plant sterols, fiber, cardio' },
              'HDL': { what: 'High-Density Lipoprotein — "good" cholesterol that removes LDL from artery walls and carries it to the liver for disposal. Higher = better cardiovascular protection.', thalNote: null, action: 'Target >55 mg/dL. Best lever: cardio exercise (30+ min sustained), lose visceral fat.', supplements: 'HELPFUL: Regular cardio, moderate red wine, niacin' },
              'Triglycerides': { what: 'Fat in your blood from recent meals. Spikes after eating, so must be measured fasting. High triglycerides + low HDL = metabolic syndrome pattern.', thalNote: null, action: 'Target <100 mg/dL fasting. Reduce refined carbs/sugar, increase omega-3.', supplements: 'HELPFUL: Omega-3 fish oil, reduce sugar/alcohol' },
              'ApoB': { what: 'Number of atherogenic lipoprotein particles in your blood. THE single best predictor of cardiovascular risk — better than LDL-C. Each ApoB particle can penetrate artery walls and start plaque formation.', thalNote: null, action: 'Target <80 mg/dL for longevity. Currently 89-92 (slightly elevated).', supplements: 'HELPFUL: Omega-3 fish oil (2g+ EPA/DHA), reduce refined carbs, add cardio' },
              'Testosterone': { what: 'Primary male sex hormone. Affects muscle mass, energy, mood, libido, bone density, and cognitive function. Yours is near top of range (796 ng/dL) — excellent.', thalNote: null, action: 'No intervention needed. Maintain with good sleep, exercise, low stress.', supplements: 'HELPFUL: Zinc, vitamin D, adequate sleep, resistance training' },
              'Free Testosterone': { what: 'The unbound, active form of testosterone — only 2-3% of total T is free. This is what your cells can actually USE. More important than total T for symptoms.', thalNote: null, action: 'Should be proportional to total T. If total T is high but free T is low, check SHBG.', supplements: 'HELPFUL: Zinc, magnesium, boron (may lower SHBG)' },
              'Estradiol': { what: 'Primary estrogen. Men need some — it\'s important for bone health, brain function, and libido. Too high = water retention, gynecomastia. Too low = joint pain, low libido.', thalNote: null, action: 'Target 20-35 pg/mL for men. Made from testosterone via aromatase enzyme.', supplements: 'IF HIGH: Lose body fat (fat cells make aromatase), DIM supplement' },
              'SHBG': { what: 'Sex Hormone Binding Globulin — a protein that binds testosterone, making it inactive. Higher SHBG = less free testosterone available. Like a parking lot for hormones.', thalNote: null, action: 'Sweet spot: 20-50 nmol/L. Too high = low free T symptoms despite good total T.', supplements: 'IF HIGH: Boron 6-10mg may lower SHBG' },
              'Cortisol': { what: 'Primary stress hormone from adrenal glands. Peaks 30min after waking (cortisol awakening response), then declines all day. Essential for energy and immune function — but chronic elevation damages everything.', thalNote: null, action: 'Your 7.9 was drawn ~1-2hrs post-wake, so already past peak. Not concerning with normal TSH/DHEA-S.', supplements: 'HELPFUL: Stress management, consistent sleep, magnesium, ashwagandha' },
              'TSH': { what: 'Thyroid Stimulating Hormone — your brain\'s signal to the thyroid. HIGH TSH = thyroid underperforming (hypothyroid). LOW TSH = thyroid overactive. It\'s an inverse signal.', thalNote: null, action: 'Target 1.0-2.0 mIU/L for optimal (not just "normal"). Check with T3/T4 for full picture.', supplements: 'IF HIGH: Selenium, iodine (careful), check T3/T4' },
              'T3': { what: 'Triiodothyronine — the ACTIVE thyroid hormone. This is what actually speeds up your metabolism. T4 converts to T3 in tissues. Low T3 = low energy, cold intolerance, brain fog.', thalNote: null, action: 'Should be mid-to-upper range. If low with normal TSH, check reverse T3.', supplements: 'HELPFUL: Selenium (helps T4→T3 conversion), zinc, adequate calories' },
              'T4': { what: 'Thyroxine — the STORAGE form of thyroid hormone. Your thyroid mostly makes T4, which gets converted to active T3 in your tissues. Think of T4 as the raw material.', thalNote: null, action: 'Should be mid-range. High T4 + low T3 = conversion problem.', supplements: 'HELPFUL: Selenium, zinc for T4→T3 conversion' },
              'Reverse T3': { what: 'An inactive form of T3 that blocks T3 receptors. Your body makes more rT3 during stress, illness, or calorie restriction as a "brake" on metabolism. High rT3 = your body is in conservation mode.', thalNote: null, action: 'rT3/T3 ratio matters more than absolute rT3. High ratio = poor thyroid function at tissue level.', supplements: 'HELPFUL: Reduce stress, adequate calories, selenium' },
              'Vitamin D': { what: 'Actually a hormone, not a vitamin. Affects immune function, mood, bone health, muscle strength, and gene expression. Your levels have been borderline (34-51) despite supplementation — may indicate VDR gene variants (Dante DNA test will confirm).', thalNote: null, action: 'Target 50-60 ng/mL. Increase to 8000IU daily Nov-Mar. Barcelona winter + indoor lifestyle = low sun.', supplements: 'CURRENT: Vitamin D3 8000IU (winter), 4000IU (summer). Take with fat for absorption.' },
              'Vitamin B12': { what: 'Essential for nerve function, DNA synthesis, and red blood cell formation. Deficiency causes fatigue, numbness, and cognitive issues. Stored in liver — takes years to deplete.', thalNote: null, action: 'Target >500 pg/mL for optimal neurological function (not just >200 "normal").', supplements: 'CURRENT: Methylcobalamin (active B12). Check methylmalonic acid if B12 seems adequate but symptoms persist.' },
              'Folate': { what: 'Vitamin B9 — critical for DNA synthesis, methylation, and preventing neural tube defects. Works with B12 in the methylation cycle. Low folate + high homocysteine = MTHFR issues.', thalNote: null, action: 'Your homocysteine is 9.46 (good), suggesting adequate methylation.', supplements: 'CURRENT: Methylfolate 400mcg (active form, bypasses MTHFR)' },
              'CRP': { what: 'C-Reactive Protein — general inflammation marker made by the liver. Spikes dramatically with infection/injury. For cardiovascular risk, use hsCRP (high-sensitivity version).', thalNote: null, action: 'Yours is 0.5 — excellent. Under 1 = low systemic inflammation.', supplements: 'HELPFUL: Omega-3, anti-inflammatory foods, regular exercise' },
              'hsCRP': { what: 'High-Sensitivity CRP — same protein as CRP but measured with greater precision. THE inflammation marker for cardiovascular risk assessment. <1 = low risk, 1-3 = moderate, >3 = high.', thalNote: null, action: 'Target <1.0 mg/L. Yours is excellent.', supplements: 'HELPFUL: Omega-3, turmeric/curcumin, exercise' },
              'Magnesium': { what: 'Essential mineral for 300+ enzyme reactions. Serum magnesium is a POOR test — only 1% of body Mg is in blood. You can be severely deficient with normal serum levels. Erythrocyte Mg is better.', thalNote: null, action: 'Check Mg Erythrocyte for true status. Most people are deficient.', supplements: 'CURRENT: Magnesium glycinate/threonate before bed' },
              'Mg Erythrocyte': { what: 'Magnesium inside red blood cells — MUCH better indicator of true magnesium status than serum Mg. Reflects intracellular stores where Mg actually works.', thalNote: 'RBC Mg may be slightly affected by thal trait (different cell size/turnover), but still more reliable than serum.', action: 'Target upper half of range. Essential for sleep, stress, muscle recovery, heart rhythm.', supplements: 'CURRENT: Magnesium glycinate/threonate before bed' },
              'Calcium': { what: 'Most abundant mineral in your body. 99% is in bones/teeth. Blood calcium is tightly regulated — if abnormal, it\'s usually parathyroid or vitamin D issue, not dietary.', thalNote: null, action: 'Should be mid-range. Check with vitamin D and PTH for full picture.', supplements: 'Usually adequate from diet. Excess supplementation may increase cardiovascular risk.' },
              'Sodium': { what: 'Primary electrolyte that regulates fluid balance and blood pressure. Tightly controlled by kidneys — abnormal values usually indicate kidney or hormonal issues, not diet.', thalNote: null, action: 'Should be 136-145 mEq/L. Abnormal values are clinically significant.', supplements: 'Adequate from diet. Athletes may need extra during heavy sweating.' },
              'Potassium': { what: 'Critical electrolyte for heart rhythm, muscle contraction, and nerve signals. Too high or too low can cause dangerous heart arrhythmias.', thalNote: null, action: 'Should be 3.5-5.0 mEq/L. Tightly regulated by kidneys.', supplements: 'Adequate from diet (bananas, avocado, leafy greens). Don\'t supplement without medical guidance.' },
              'ALT': { what: 'Alanine Aminotransferase — liver enzyme. Rises when liver cells are damaged. Most specific liver marker. Elevated by alcohol, medications, fatty liver, or intense exercise.', thalNote: null, action: 'Target <25 U/L for optimal (not just under lab "normal" of 40). Heavy lifting can temporarily spike ALT.', supplements: 'IF ELEVATED: Reduce alcohol, check for fatty liver, NAC, milk thistle' },
              'AST': { what: 'Aspartate Aminotransferase — found in liver AND muscles/heart. Less specific than ALT for liver. Elevated after intense workouts (muscle damage releases AST).', thalNote: null, action: 'If AST > ALT, may be muscle-related (exercise) rather than liver. Check with CK.', supplements: 'IF ELEVATED: Same as ALT. Consider if recent intense exercise.' },
              'GGT': { what: 'Gamma-Glutamyl Transferase — liver enzyme very sensitive to alcohol and medications. Often the first liver marker to rise with drinking.', thalNote: null, action: 'Target <20 U/L for optimal. If elevated with normal ALT/AST, check alcohol intake.', supplements: 'HELPFUL: NAC, milk thistle, reduce alcohol' },
              'Creatine Kinase': { what: 'Enzyme released when muscles are damaged. Spikes after intense exercise (especially eccentric/downhill). Very high levels can indicate rhabdomyolysis (dangerous).', thalNote: null, action: 'Expected to be elevated if you\'ve trained recently. Draw blood on rest day for accurate baseline.', supplements: 'None needed — just time blood draw 48hrs after heavy training' },
              'Creatinine': { what: 'Waste product from muscle metabolism, filtered by kidneys. Higher with more muscle mass. Used to estimate kidney function (eGFR).', thalNote: null, action: 'Higher values expected with creatine supplementation (10-12g/day) and good muscle mass. Not a concern if eGFR is normal.', supplements: 'NOTE: Creatine supplementation will raise creatinine. This is expected and not harmful.' },
              'Albumin': { what: 'Main protein made by the liver. Reflects liver synthetic function and nutritional status. Low albumin = liver disease, malnutrition, or chronic inflammation.', thalNote: null, action: 'Should be 4.0-5.0 g/dL. Low values warrant investigation.', supplements: 'Adequate protein intake. Low albumin needs medical evaluation.' },
              'WBC': { what: 'White Blood Cell count — your immune army. Rises with infection, stress, inflammation. Low = immunocompromised. Differential (neutrophils, lymphocytes, etc.) tells more.', thalNote: null, action: 'Normal 4-11 K/µL. Mild elevation during illness/stress is normal.', supplements: 'HELPFUL: Vitamin C, zinc, adequate sleep for immune function' },
              'Homocysteine': { what: 'Amino acid from protein metabolism. High levels damage blood vessel walls and are linked to heart disease, stroke, and Alzheimer\'s. Controlled by B12, folate, and B6 through methylation.', thalNote: null, action: 'Yours is 9.46 — good (target <10). Keep supplementing methylfolate.', supplements: 'CURRENT: Methylfolate 400mcg. IF HIGH: Add B6, increase B12.' },
              'DHEA-S': { what: 'Dehydroepiandrosterone Sulfate — precursor hormone from adrenal glands. Your body converts it into testosterone and estrogen. Declines with age. Marker of adrenal health and biological aging.', thalNote: null, action: 'Higher = younger biological age. Declines ~2% per year after 25.', supplements: 'HELPFUL: Stress management, sleep, exercise. DHEA supplements only if clearly low.' },
              'Prolactin': { what: 'Hormone mainly known for milk production, but men have it too. Elevated by stress, medications (especially SSRIs/antipsychotics), or pituitary tumors. High prolactin suppresses testosterone.', thalNote: null, action: 'Should be <15 ng/mL in men. If elevated, check medications and retest.', supplements: 'IF HIGH: Vitamin B6 (P-5-P form), zinc, vitamin E' },
              'LH': { what: 'Luteinizing Hormone — brain signal telling testes to produce testosterone. High LH + low T = testes failing. Low LH + low T = brain not signaling. Helps diagnose cause of low T.', thalNote: null, action: 'With your excellent T (796), LH should be normal/low — your system works well.', supplements: 'None needed with good testosterone levels' },
              'Vitamin C': { what: 'Antioxidant and cofactor for collagen synthesis, immune function, and iron absorption. Water-soluble — excess is urinated out, so you need daily intake.', thalNote: 'Be careful with vitamin C + thalassemia — it increases iron absorption, which can worsen iron overload.', action: 'Adequate from diet. Don\'t mega-dose given thal trait (iron absorption risk).', supplements: 'CAUTION: High-dose vitamin C increases iron absorption — avoid mega-dosing with thal trait' },
              'Vitamin B1': { what: 'Thiamine — essential for energy metabolism and nerve function. Deficiency causes beriberi and Wernicke\'s encephalopathy. Rarely deficient in developed world with normal diet.', thalNote: null, action: 'Your supplement provides 8000% RDA — unnecessary. Drop it.', supplements: 'DROP: No bloodwork reason for supplementation' },
              'Copper': { what: 'Trace mineral essential for iron metabolism, nerve function, and immune health. Works in balance with zinc — too much of one depletes the other.', thalNote: null, action: 'Check copper:zinc ratio. Target ~0.7-1.0. Too much copper = oxidative stress.', supplements: 'NOTE: If supplementing zinc, monitor copper levels. They compete for absorption.' },
              'Uric Acid': { what: 'Waste product from purine metabolism (found in red meat, organ meats, beer). High levels = gout risk and kidney stones. Also an independent cardiovascular risk factor.', thalNote: null, action: 'Target 4-6 mg/dL. High = reduce purines, increase hydration.', supplements: 'IF HIGH: Tart cherry extract, reduce red meat/beer, increase water' },
              'Zinc': { what: 'Essential trace mineral for immune function, testosterone production, wound healing, and taste/smell. Competes with copper for absorption. Athletes lose zinc through sweat.', thalNote: null, action: 'Target mid-to-upper range. Zinc supports testosterone production.', supplements: 'HELPFUL: Zinc picolinate/glycinate 15-30mg. Take away from copper and iron.' },
              'LDH': { what: 'Lactate Dehydrogenase — enzyme found in almost all tissues. Non-specific damage marker. Elevated by hemolysis (red blood cell breakdown), liver disease, or intense exercise.', thalNote: 'Can be slightly elevated in thal trait due to increased red blood cell turnover (mild ineffective erythropoiesis).', action: 'Mildly elevated LDH with thal trait is expected. Significant elevation needs investigation.', supplements: 'None needed if mildly elevated with thal trait' },
              'Bilirubin': { what: 'Yellow pigment from red blood cell breakdown. Processed by liver. High = liver issue OR excess RBC destruction (hemolysis). Gilbert\'s syndrome causes benign mild elevation.', thalNote: 'Can be mildly elevated in thal trait due to increased RBC turnover. Usually indirect (unconjugated) bilirubin.', action: 'Mild elevation expected. If >2.0, investigate further.', supplements: 'None needed for mild elevation' },
              'Urea': { what: 'Waste product from protein metabolism, filtered by kidneys. High = kidney issues or high protein diet. Low = low protein intake or liver problems.', thalNote: null, action: 'Interpret with creatinine for kidney function. High with high-protein diet is expected.', supplements: 'Stay hydrated. Monitor with creatinine.' },
              'Total Protein': { what: 'Sum of albumin + globulins in blood. Reflects nutritional status and immune/liver function. Abnormal values suggest liver, kidney, or immune issues.', thalNote: null, action: 'Should be 6.0-8.3 g/dL. Dehydration falsely elevates it.', supplements: 'Adequate protein intake from diet.' },
            };
            
            const info = markerExplanations[selectedMarker.name] || {
              what: 'Marker information not available.',
              thalNote: null,
              action: 'Consult with healthcare provider for interpretation.',
              supplements: 'No specific recommendations available.'
            };
            
            return (
              <>
                {/* Header */}
                <DialogHeader className="p-4 border-b shrink-0" style={{ borderColor: 'var(--border-dim)' }}>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedMarker.name}</h2>
                  <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                    Latest: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-data)' }}>
                      {selectedMarker.values?.filter((v: any) => v.value !== null).pop()?.value || '—'} {selectedMarker.unit}
                    </span> • <span style={{ color: 'var(--accent-green)' }}>Optimal: {selectedMarker.optimalRange}</span>{selectedMarker.goodRange && <span style={{ color: 'var(--accent-yellow)' }}> • Good: {selectedMarker.goodRange}</span>}
                  </div>
                </DialogHeader>

                {/* Content */}
                <div className="p-4 overflow-auto flex-1" style={{ maxHeight: 'calc(100dvh - 8rem)' }}>
                  {/* Historical Chart & Values */}
                  {selectedMarker.values && selectedMarker.values.length > 0 && (() => {
                    const validValues = selectedMarker.values.filter((v: any) => v.value !== null && v.value !== undefined);
                    
                    return (
                      <div className="mb-6">
                        <h3 className="text-[10px] tracking-wider uppercase mb-3" style={{ color: 'var(--text-dim)' }}>HISTORICAL VALUES</h3>
                        
                        {/* Line Chart (if more than 1 data point) */}
                        {validValues.length >= 1 && (() => {
                          const values = validValues.map((v: any) => v.value);
                          const min = Math.min(...values);
                          const max = Math.max(...values);
                          
                          // Parse range helper
                          const parseRng = (r: string) => {
                            let lo: number | null = null, hi: number | null = null;
                            if (!r) return { lo, hi };
                            if (r.includes('-') && !r.startsWith('<') && !r.startsWith('>')) {
                              const pp = r.split('-').map((s: string) => parseFloat(s.replace(/[<>%]/g, '')));
                              if (!isNaN(pp[0]) && !isNaN(pp[1])) { lo = pp[0]; hi = pp[1]; }
                            } else if (r.startsWith('<')) { hi = parseFloat(r.replace(/[<≤]/g, '')); }
                            else if (r.startsWith('>')) { lo = parseFloat(r.replace(/[>≥]/g, '')); }
                            return { lo, hi };
                          };
                          const { lo: optMin, hi: optMax } = parseRng(selectedMarker.optimalRange || '');
                          const { lo: goodMin, hi: goodMax } = parseRng(selectedMarker.goodRange || '');
                          
                          // Chart bounds include both ranges
                          const allBounds = [min, max, optMin, optMax, goodMin, goodMax].filter((v): v is number => v !== null);
                          const cMin = Math.min(...allBounds) * 0.92;
                          const cMax = Math.max(...allBounds) * 1.08;
                          const cRange = cMax - cMin || 1;
                          
                          const w = 400;
                          const h = 120;
                          const pad = { l: 40, r: 35, t: 5, b: 25 };
                          const cw = w - pad.l - pad.r;
                          const ch = h - pad.t - pad.b;
                          
                          // Parse dates to timestamps for proportional spacing
                          const parseDate = (d: string) => {
                            if (!d || typeof d !== 'string') return 0;
                            const months: Record<string,number> = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
                            const parts = d.trim().split(' ');
                            if (parts.length < 2) return 0;
                            return new Date(parseInt(parts[1]), months[parts[0]] || 0, 15).getTime();
                          };
                          const timestamps = validValues.map((v: any) => parseDate(v.date));
                          const tMin = Math.min(...timestamps);
                          const tMax = Math.max(...timestamps);
                          const tRange = tMax - tMin || 1;
                          
                          const pts = validValues.map((v: any, i: number) => ({
                            x: pad.l + (validValues.length === 1 ? cw / 2 : ((timestamps[i] - tMin) / tRange) * cw),
                            y: pad.t + ch - ((v.value - cMin) / cRange) * ch,
                            date: v.date,
                            value: v.value,
                          }));
                          const linePath = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                          const areaPath = linePath + ` L${pts[pts.length-1].x},${pad.t + ch} L${pts[0].x},${pad.t + ch} Z`;
                          
                          // Range band Y coords
                          const optMinY = optMin !== null ? pad.t + ch - ((optMin - cMin) / cRange) * ch : null;
                          const optMaxY = optMax !== null ? pad.t + ch - ((optMax - cMin) / cRange) * ch : null;
                          const goodMinY = goodMin !== null ? pad.t + ch - ((goodMin - cMin) / cRange) * ch : null;
                          const goodMaxY = goodMax !== null ? pad.t + ch - ((goodMax - cMin) / cRange) * ch : null;
                          
                          const latest = values[values.length - 1];
                          const first = values[0];
                          const changePct = first !== 0 ? ((latest - first) / first * 100) : 0;
                          
                          return (
                            <div className="mb-4">
                              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '140px', background: 'var(--bg-elevated)', borderRadius: '4px' }}>
                                {/* Good range band (wider, dimmer yellow) */}
                                {goodMinY !== null && goodMaxY !== null && (
                                  <rect x={pad.l} y={Math.min(goodMinY, goodMaxY)} width={cw} height={Math.abs(goodMinY - goodMaxY)} fill="rgba(255,214,0,0.04)" rx="2" />
                                )}
                                {goodMaxY !== null && (
                                  <line x1={pad.l} y1={goodMaxY} x2={pad.l + cw} y2={goodMaxY} stroke="rgba(255,214,0,0.2)" strokeWidth="0.5" strokeDasharray="3,3" />
                                )}
                                {goodMinY !== null && (
                                  <line x1={pad.l} y1={goodMinY} x2={pad.l + cw} y2={goodMinY} stroke="rgba(255,214,0,0.2)" strokeWidth="0.5" strokeDasharray="3,3" />
                                )}
                                {/* Optimal range band (narrower, brighter green) */}
                                {optMinY !== null && optMaxY !== null && (
                                  <rect x={pad.l} y={Math.min(optMinY, optMaxY)} width={cw} height={Math.abs(optMinY - optMaxY)} fill="rgba(0,255,106,0.1)" rx="2" />
                                )}
                                {optMaxY !== null && (
                                  <line x1={pad.l} y1={optMaxY} x2={pad.l + cw} y2={optMaxY} stroke="rgba(0,255,106,0.4)" strokeWidth="1" strokeDasharray="4,4" />
                                )}
                                {optMinY !== null && (
                                  <line x1={pad.l} y1={optMinY} x2={pad.l + cw} y2={optMinY} stroke="rgba(0,255,106,0.4)" strokeWidth="1" strokeDasharray="4,4" />
                                )}
                                {/* Y axis labels */}
                                <text x={pad.l - 4} y={pad.t + 4} textAnchor="end" fill="var(--text-dim)" fontSize="8">{cMax.toFixed(0)}</text>
                                <text x={pad.l - 4} y={pad.t + ch} textAnchor="end" fill="var(--text-dim)" fontSize="8">{cMin.toFixed(0)}</text>
                                {optMax !== null && <text x={pad.l - 4} y={(optMaxY ?? 0) + 3} textAnchor="end" fill="rgba(0,255,106,0.7)" fontSize="7">{optMax}</text>}
                                {optMin !== null && <text x={pad.l - 4} y={(optMinY ?? 0) + 3} textAnchor="end" fill="rgba(0,255,106,0.7)" fontSize="7">{optMin}</text>}
                                {goodMax !== null && goodMax !== optMax && <text x={pad.l + cw + 4} y={(goodMaxY ?? 0) + 3} textAnchor="start" fill="rgba(255,214,0,0.5)" fontSize="6">{goodMax}</text>}
                                {goodMin !== null && goodMin !== optMin && <text x={pad.l + cw + 4} y={(goodMinY ?? 0) + 3} textAnchor="start" fill="rgba(255,214,0,0.5)" fontSize="6">{goodMin}</text>}
                                {/* Area + Line */}
                                <defs>
                                  <linearGradient id="bw-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.02" />
                                  </linearGradient>
                                </defs>
                                <path d={areaPath} fill="url(#bw-grad)" />
                                <path d={linePath} fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinejoin="round" />
                                {/* Points + labels */}
                                {pts.map((p: any, i: number) => {
                                  const inOptimal = (optMin === null || p.value >= optMin) && (optMax === null || p.value <= optMax);
                                  const inGood = (goodMin === null || p.value >= goodMin) && (goodMax === null || p.value <= goodMax);
                                  const inRange = inOptimal; // for backwards compat
                                  return (
                                    <g key={i}>
                                      <circle cx={p.x} cy={p.y} r="4" fill={inOptimal ? 'var(--accent-green)' : inGood ? 'var(--accent-yellow)' : 'var(--accent-red)'} stroke="var(--bg-primary)" strokeWidth="1.5" />
                                      <text x={p.x} y={p.y - 8} textAnchor="middle" fill="var(--text-primary)" fontSize="9" fontFamily="var(--font-data)">{p.value}</text>
                                      <text x={p.x} y={pad.t + ch + 14} textAnchor="middle" fill="var(--text-dim)" fontSize="8">{p.date?.replace(/^(Nov|Sep|Feb|May|Jan|Oct|Dec|Mar|Apr|Jun|Jul|Aug)\s/, '$1 ')}</text>
                                    </g>
                                  );
                                })}
                              </svg>
                              {/* Range legend */}
                              <div className="flex gap-4 text-[9px] mt-1 mb-1">
                                <div className="flex items-center gap-1">
                                  <div style={{ width: 10, height: 10, background: 'rgba(0,255,106,0.15)', border: '1px solid rgba(0,255,106,0.4)', borderRadius: 2 }} />
                                  <span style={{ color: 'rgba(0,255,106,0.7)' }}>Optimal {selectedMarker.optimalRange}</span>
                                </div>
                                {selectedMarker.goodRange && (
                                  <div className="flex items-center gap-1">
                                    <div style={{ width: 10, height: 10, background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.3)', borderRadius: 2 }} />
                                    <span style={{ color: 'rgba(255,214,0,0.6)' }}>Good {selectedMarker.goodRange}</span>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-[10px]">
                                <div>
                                  <div style={{ color: 'var(--text-dim)' }}>Range</div>
                                  <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)' }}>{min.toFixed(1)} – {max.toFixed(1)}</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--text-dim)' }}>Latest</div>
                                  <div style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)' }}>{latest}</div>
                                </div>
                                <div>
                                  <div style={{ color: 'var(--text-dim)' }}>Change</div>
                                  <div style={{ color: changePct > 0 ? 'var(--accent-green)' : changePct < 0 ? 'var(--accent-red)' : 'var(--text-dim)', fontFamily: 'var(--font-data)' }}>
                                    {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Values table */}
                        <div className="space-y-2">
                          {[...validValues].reverse().map((value: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{ background: 'var(--bg-elevated)' }}>
                              <span style={{ color: 'var(--text-dim)' }}>{value.date}</span>
                              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-data)' }}>{value.value} {selectedMarker.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* What it is */}
                  <div className="mb-4">
                    <h3 className="text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>WHAT IT IS</h3>
                    <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{info.what}</p>
                  </div>

                  {/* Thalassemia note */}
                  {info.thalNote && (
                    <div className="mb-4 p-3 rounded border" style={{ background: 'rgba(255,59,92,0.05)', borderColor: 'rgba(255,59,92,0.2)' }}>
                      <h3 className="text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--accent-red)' }}>⚠️ THALASSEMIA TRAIT</h3>
                      <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{info.thalNote}</p>
                    </div>
                  )}

                  {/* What you can do */}
                  <div className="mb-4">
                    <h3 className="text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>WHAT YOU CAN DO</h3>
                    <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{info.action}</p>
                  </div>

                  {/* Related supplements */}
                  <div className="mb-4">
                    <h3 className="text-[10px] tracking-wider uppercase mb-2" style={{ color: 'var(--text-dim)' }}>RELATED SUPPLEMENTS</h3>
                    <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{info.supplements}</p>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ════════ HEALTH CATEGORY DETAIL MODAL ════════ */}
      <Dialog open={!!selectedCategory} onOpenChange={(open) => !open && setSelectedCategory(null)}>
        <DialogContent className="flex flex-col p-0" style={{ maxWidth: '56rem' }} showCloseButton={true}>
          {selectedCategory && (
            <>
              {/* Header */}
              <DialogHeader className="p-4 border-b shrink-0" style={{ borderColor: 'var(--border-dim)' }}>
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{selectedCategory.emoji}</span>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedCategory.name}</h2>
                    <div className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      {selectedCategory.markers.length} markers • Score based on latest values
                    </div>
                  </div>
                  <div className="relative w-16 h-16">
                    {/* Large Score Ring */}
                    <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="15.5"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="3"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.5"
                        fill="none"
                        stroke={
                          selectedCategory.score >= 90 ? 'var(--accent-green)' 
                          : selectedCategory.score >= 70 ? 'var(--accent-cyan)'
                          : selectedCategory.score >= 50 ? 'var(--accent-yellow)'
                          : 'var(--accent-red)'
                        }
                        strokeWidth="3"
                        strokeDasharray={`${(selectedCategory.score / 100) * 97.4} 97.4`}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold tabular-nums" style={{ 
                        color: selectedCategory.score >= 90 ? 'var(--accent-green)' 
                          : selectedCategory.score >= 70 ? 'var(--accent-cyan)'
                          : selectedCategory.score >= 50 ? 'var(--accent-yellow)'
                          : 'var(--accent-red)',
                        fontFamily: 'var(--font-data)' 
                      }}>
                        {selectedCategory.score}
                      </span>
                      <span className="text-[8px]" style={{ color: 'var(--text-dim)' }}>{selectedCategory.label}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  {selectedCategory.description}
                </div>
              </DialogHeader>

              {/* Content */}
              <div className="flex-1 overflow-auto p-4" style={{ maxHeight: 'calc(100dvh - 16rem)' }}>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left Column: Donut Chart + Score History */}
                  <div className="space-y-4">
                    {/* Donut Chart showing marker contributions */}
                    <div>
                      <h3 className="text-[10px] tracking-wider uppercase mb-3" style={{ color: 'var(--text-dim)' }}>MARKER CONTRIBUTIONS</h3>
                      <div className="relative w-48 h-48 mx-auto">
                        {(() => {
                          const markers = selectedCategory.markers;
                          const totalWeight = markers.reduce((sum: number, m: any) => sum + m.weight, 0);
                          let currentAngle = 0;
                          
                          const segments = markers.map((marker: any) => {
                            const percentage = (marker.weight / totalWeight);
                            const angle = percentage * 360;
                            const startAngle = currentAngle;
                            const endAngle = currentAngle + angle;
                            currentAngle += angle;
                            
                            const color = marker.status === 'optimal' ? 'var(--accent-green)'
                              : marker.status === 'good' ? 'var(--accent-cyan)'
                              : marker.status === 'fair' ? 'var(--accent-yellow)'
                              : 'var(--accent-red)';
                            
                            return { marker, startAngle, endAngle, color, percentage };
                          });
                          
                          const createPath = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) => {
                            const start = {
                              x: 96 + outerRadius * Math.cos((startAngle - 90) * Math.PI / 180),
                              y: 96 + outerRadius * Math.sin((startAngle - 90) * Math.PI / 180)
                            };
                            const end = {
                              x: 96 + outerRadius * Math.cos((endAngle - 90) * Math.PI / 180),
                              y: 96 + outerRadius * Math.sin((endAngle - 90) * Math.PI / 180)
                            };
                            const innerStart = {
                              x: 96 + innerRadius * Math.cos((startAngle - 90) * Math.PI / 180),
                              y: 96 + innerRadius * Math.sin((startAngle - 90) * Math.PI / 180)
                            };
                            const innerEnd = {
                              x: 96 + innerRadius * Math.cos((endAngle - 90) * Math.PI / 180),
                              y: 96 + innerRadius * Math.sin((endAngle - 90) * Math.PI / 180)
                            };
                            
                            const largeArc = endAngle - startAngle > 180 ? 1 : 0;
                            
                            return [
                              'M', start.x, start.y,
                              'A', outerRadius, outerRadius, 0, largeArc, 1, end.x, end.y,
                              'L', innerEnd.x, innerEnd.y,
                              'A', innerRadius, innerRadius, 0, largeArc, 0, innerStart.x, innerStart.y,
                              'Z'
                            ].join(' ');
                          };
                          
                          return (
                            <svg viewBox="0 0 192 192" className="w-48 h-48">
                              {segments.map((segment: any, i: number) => (
                                <path
                                  key={i}
                                  d={createPath(segment.startAngle, segment.endAngle, 50, 85)}
                                  fill={segment.color}
                                  stroke="var(--bg-primary)"
                                  strokeWidth="1"
                                  className="transition-all duration-300 hover:opacity-80"
                                />
                              ))}
                              {/* Center score */}
                              <text x="96" y="90" textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="bold" fontFamily="var(--font-data)">
                                {selectedCategory.score}
                              </text>
                              <text x="96" y="105" textAnchor="middle" fill="var(--text-dim)" fontSize="10">
                                {selectedCategory.label}
                              </text>
                            </svg>
                          );
                        })()}
                      </div>
                      
                      {/* Legend */}
                      <div className="grid grid-cols-2 gap-1 mt-3 text-[9px]">
                        {selectedCategory.markers.map((marker: any, i: number) => {
                          const color = marker.status === 'optimal' ? 'var(--accent-green)'
                            : marker.status === 'good' ? 'var(--accent-cyan)'
                            : marker.status === 'fair' ? 'var(--accent-yellow)'
                            : 'var(--accent-red)';
                          
                          return (
                            <div key={i} className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{marker.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Score History (if available) */}
                    {selectedCategory.history && selectedCategory.history.length > 1 && (
                      <div>
                        <h3 className="text-[10px] tracking-wider uppercase mb-3" style={{ color: 'var(--text-dim)' }}>SCORE HISTORY</h3>
                        <div className="h-24 w-full">
                          {/* Simple line chart */}
                          {(() => {
                            const history = selectedCategory.history;
                            const scores = history.map((h: any) => h.score);
                            const min = Math.min(...scores, 0);
                            const max = Math.max(...scores, 100);
                            const range = max - min || 1;
                            const w = 300;
                            const h = 80;
                            
                            const points = history.map((item: any, i: number) => ({
                              x: (i / (history.length - 1)) * w,
                              y: h - ((item.score - min) / range) * h,
                              date: item.date,
                              score: item.score
                            }));
                            
                            const linePath = points.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                            
                            return (
                              <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
                                <path d={linePath} fill="none" stroke="var(--accent-cyan)" strokeWidth="2" />
                                {points.map((p: any, i: number) => (
                                  <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--accent-cyan)" />
                                ))}
                              </svg>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Markers + Recommendations */}
                  <div className="space-y-4">
                    {/* Markers List (sorted worst-first) */}
                    <div>
                      <h3 className="text-[10px] tracking-wider uppercase mb-3" style={{ color: 'var(--text-dim)' }}>MARKERS (WORST FIRST)</h3>
                      <div className="space-y-2">
                        {selectedCategory.markers
                          .sort((a: any, b: any) => a.score - b.score)
                          .map((marker: any, i: number) => {
                            const statusColor = marker.status === 'optimal' ? 'var(--accent-green)'
                              : marker.status === 'good' ? 'var(--accent-cyan)'
                              : marker.status === 'fair' ? 'var(--accent-yellow)'
                              : 'var(--accent-red)';
                            
                            return (
                              <div 
                                key={i}
                                className="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-opacity-50 transition-colors"
                                style={{ background: 'var(--bg-secondary)' }}
                                onClick={() => {
                                  setSelectedCategory(null);
                                  const actualMarker = healthData.bloodwork?.markers?.find((m: any) => m.name === marker.name);
                                  if (actualMarker) setSelectedMarker(actualMarker);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                                  <div>
                                    <div className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{marker.name}</div>
                                    <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                                      Weight: {marker.weight}x
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[11px] font-bold tabular-nums" style={{ color: statusColor, fontFamily: 'var(--font-data)' }}>
                                    {marker.score}
                                  </div>
                                  <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                                    {marker.value} {marker.unit}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div>
                      <h3 className="text-[10px] tracking-wider uppercase mb-3" style={{ color: 'var(--text-dim)' }}>TOP RECOMMENDATIONS</h3>
                      <div className="space-y-2">
                        {selectedCategory.topRecommendations.map((rec: any, i: number) => {
                          const impactColor = rec.impact >= 8 ? 'var(--accent-green)'
                            : rec.impact >= 6 ? 'var(--accent-cyan)'
                            : 'var(--accent-yellow)';
                          
                          return (
                            <div key={i} className="p-3 rounded" style={{ background: 'var(--bg-secondary)' }}>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {rec.title}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[9px]" style={{ color: impactColor }}>
                                    {rec.impact}/10
                                  </span>
                                  <div className="w-2 h-2 rounded-full" style={{ background: impactColor }} />
                                </div>
                              </div>
                              <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                                Targets: {rec.targets.join(', ')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
