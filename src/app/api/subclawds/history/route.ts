import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUBAGENTS_FILE = 'os.homedir()/.openclaw/subagents/runs.json';
const HISTORY_FILE = 'os.homedir()/.openclaw/subagents/history.json';

// GET - Get run history for a specific agent
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('label');
  const limit = parseInt(searchParams.get('limit') || '50');
  
  if (!agentId) {
    return NextResponse.json({ error: 'Agent label required' }, { status: 400 });
  }
  
  try {
    const { readFile } = await import('fs/promises');
    
    const allRuns: any[] = [];
    
    // 1. Get active runs from runs.json
    try {
      const runsData = await readFile(SUBAGENTS_FILE, 'utf-8');
      const runs = JSON.parse(runsData);
      
      for (const [runId, run] of Object.entries(runs.runs || {}) as [string, any][]) {
        const sessionKey = run.childSessionKey || '';
        const agentMatch = sessionKey.startsWith(`agent:${agentId}:`);
        const labelMatch = run.label?.startsWith(agentId);
        
        if (agentMatch || labelMatch) {
          allRuns.push(formatRun(runId, run));
        }
      }
    } catch {}
    
    // 2. Get archived runs from history.json
    try {
      const historyData = await readFile(HISTORY_FILE, 'utf-8');
      const history = JSON.parse(historyData);
      
      for (const run of (history.runs || [])) {
        const sessionKey = run.sessionKey || run.childSessionKey || '';
        const agentMatch = sessionKey.startsWith(`agent:${agentId}:`);
        const labelMatch = run.label?.startsWith(agentId);
        
        // Avoid duplicates (check by runId)
        if ((agentMatch || labelMatch) && !allRuns.some(r => r.runId === run.runId)) {
          allRuns.push(run);
        }
      }
    } catch {}
    
    // Sort by createdAt descending (most recent first)
    allRuns.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    return NextResponse.json({
      agentId,
      runs: allRuns.slice(0, limit),
      totalRuns: allRuns.length,
    });
  } catch (error) {
    console.error('History error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

// POST - Archive runs from active to history (call periodically)
export async function POST(request: Request) {
  try {
    const { readFile, writeFile } = await import('fs/promises');
    
    // Read active runs
    let activeRuns: Record<string, any> = {};
    try {
      const runsData = await readFile(SUBAGENTS_FILE, 'utf-8');
      const runs = JSON.parse(runsData);
      activeRuns = runs.runs || {};
    } catch {}
    
    // Read existing history
    let history: { version: number; runs: any[] } = { version: 1, runs: [] };
    try {
      const historyData = await readFile(HISTORY_FILE, 'utf-8');
      history = JSON.parse(historyData);
    } catch {}
    
    // Archive completed runs
    let archived = 0;
    const existingIds = new Set(history.runs.map(r => r.runId));
    
    for (const [runId, run] of Object.entries(activeRuns)) {
      // Archive runs that are completed (have endedAt) and not already archived
      if (run.endedAt && !existingIds.has(runId)) {
        history.runs.push(formatRun(runId, run));
        archived++;
      }
    }
    
    if (archived > 0) {
      // Sort history by createdAt descending
      history.runs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      // Keep last 500 runs max
      if (history.runs.length > 500) {
        history.runs = history.runs.slice(0, 500);
      }
      
      await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
    }
    
    return NextResponse.json({ 
      archived, 
      totalHistory: history.runs.length,
      message: archived > 0 ? `Archived ${archived} run(s)` : 'No new runs to archive'
    });
  } catch (error) {
    console.error('Archive error:', error);
    return NextResponse.json({ error: 'Failed to archive runs' }, { status: 500 });
  }
}

function formatRun(runId: string, run: any) {
  const durationMs = run.endedAt && run.createdAt ? run.endedAt - run.createdAt : null;
  
  return {
    runId,
    label: run.label,
    sessionKey: run.childSessionKey,
    task: run.task,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs,
    durationFormatted: durationMs ? formatDuration(durationMs) : null,
    status: run.outcome?.status || 'unknown',
    requesterSessionKey: run.requesterDisplayKey || run.requesterSessionKey,
    cleanup: run.cleanup,
  };
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
