import { NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const MEMORY_BASE = 'os.homedir()/memory';
const COMMS_DIR = 'os.homedir()/memory/comms';
const REGISTRY_FILE = 'os.homedir()/agents/registry.json';

interface WakeCheck {
  agentId: string;
  hasPendingTask: boolean;
  hasCommRequest: boolean;
  taskContent?: string;
  commRequest?: string;
}

// GET - Check which agents need to wake up
// Called by cron to see if any agents have pending work
export async function GET() {
  try {
    const registryData = await readFile(REGISTRY_FILE, 'utf-8');
    const registry = JSON.parse(registryData);
    
    const wakeChecks: WakeCheck[] = [];
    
    for (const [agentId, agent] of Object.entries(registry.agents) as [string, any][]) {
      const check: WakeCheck = {
        agentId,
        hasPendingTask: false,
        hasCommRequest: false
      };
      
      // Check current-task.md for pending tasks
      try {
        const taskFile = join(MEMORY_BASE, agentId, 'current-task.md');
        const content = await readFile(taskFile, 'utf-8');
        
        // Has a real task (not "No active task" and not complete)
        if (!content.includes('No active task') && 
            !content.includes('Status: ✅ COMPLETE') &&
            !content.includes('Status: COMPLETE')) {
          check.hasPendingTask = true;
          check.taskContent = content.slice(0, 500);
        }
      } catch {}
      
      // Check for communication requests
      try {
        const commFile = join(COMMS_DIR, `request-${agentId}.md`);
        const content = await readFile(commFile, 'utf-8');
        if (content.trim()) {
          check.hasCommRequest = true;
          check.commRequest = content.slice(0, 300);
        }
      } catch {}
      
      wakeChecks.push(check);
    }
    
    const needsWake = wakeChecks.filter(c => c.hasPendingTask || c.hasCommRequest);
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      totalAgents: wakeChecks.length,
      needsWake: needsWake.length,
      checks: wakeChecks,
      agentsToWake: needsWake.map(c => c.agentId)
    });
  } catch (error) {
    console.error('Wake check error:', error);
    return NextResponse.json({ error: 'Wake check failed' }, { status: 500 });
  }
}

// POST - Trigger wake for specific agent
export async function POST(request: Request) {
  try {
    const { agentId } = await request.json();
    
    if (!agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }
    
    // This returns the info needed to spawn the agent
    // The actual spawning is done by Mikey via sessions_spawn
    const registryData = await readFile(REGISTRY_FILE, 'utf-8');
    const registry = JSON.parse(registryData);
    const agent = registry.agents[agentId];
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    // Get task content
    let taskContent = '';
    try {
      const taskFile = join(MEMORY_BASE, agentId, 'current-task.md');
      taskContent = await readFile(taskFile, 'utf-8');
    } catch {}
    
    // Get comm request if any
    let commRequest = '';
    try {
      const commFile = join(COMMS_DIR, `request-${agentId}.md`);
      commRequest = await readFile(commFile, 'utf-8');
    } catch {}
    
    return NextResponse.json({
      ok: true,
      agent: {
        id: agentId,
        name: agent.name,
        emoji: agent.emoji,
        model: agent.model,
        sessionLabel: agent.sessionLabel
      },
      pendingTask: taskContent || null,
      commRequest: commRequest || null,
      message: `Wake data ready for ${agent.name}. Use sessions_spawn to wake.`
    });
  } catch (error) {
    return NextResponse.json({ error: 'Wake trigger failed' }, { status: 500 });
  }
}
