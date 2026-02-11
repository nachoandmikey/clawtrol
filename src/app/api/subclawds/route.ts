import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const REGISTRY_FILE = 'os.homedir()/agents/registry.json';
const MEMORY_BASE = 'os.homedir()/memory';

interface Agent {
  name: string;
  emoji: string;
  role: string;
  model: string;
  focus: string[];
  color: string;
  memoryDir: string;
  soulFile: string;
  sessionLabel: string;
  persistent: boolean;
}

interface Registry {
  agents: Record<string, Agent>;
  coordinator: {
    name: string;
    emoji: string;
    model: string;
    role: string;
  };
  communication: {
    method: string;
    taskQueue: string;
    reportTo: string;
  };
}

async function loadRegistry(): Promise<Registry> {
  try {
    const data = await readFile(REGISTRY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      agents: {},
      coordinator: { name: 'Mikey', emoji: '👾', model: 'opus', role: 'Orchestrator' },
      communication: { method: 'sessions_send', taskQueue: 'kanban', reportTo: 'telegram' }
    };
  }
}

async function loadAgentMemory(agentId: string): Promise<{ currentTask: string; lastActive: string | null }> {
  try {
    const taskFile = join(MEMORY_BASE, agentId, 'current-task.md');
    const content = await readFile(taskFile, 'utf-8');
    const hasTask = !content.includes('No active task');
    
    // Try to get last modified time
    const { stat } = await import('fs/promises');
    const stats = await stat(taskFile);
    
    return {
      currentTask: hasTask ? content.split('\n').find(l => l.startsWith('#'))?.replace('# ', '') || 'Working...' : 'Idle',
      lastActive: stats.mtime.toISOString()
    };
  } catch {
    return { currentTask: 'Idle', lastActive: null };
  }
}

// GET - List all subclawds with status
export async function GET() {
  try {
    const registry = await loadRegistry();
    
    const agentsWithStatus = await Promise.all(
      Object.entries(registry.agents).map(async ([id, agent]) => {
        const memory = await loadAgentMemory(id);
        return {
          id,
          ...agent,
          status: memory.currentTask === 'Idle' ? 'idle' : 'working',
          currentTask: memory.currentTask,
          lastActive: memory.lastActive
        };
      })
    );
    
    return NextResponse.json({
      agents: agentsWithStatus,
      coordinator: registry.coordinator,
      communication: registry.communication
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load registry' }, { status: 500 });
  }
}

// POST - Dispatch task to subclawd
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, agentId, task, taskId } = body;
    
    if (action === 'dispatch') {
      const registry = await loadRegistry();
      const agent = registry.agents[agentId];
      
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
      
      // Update agent's current-task.md
      const taskFile = join(MEMORY_BASE, agentId, 'current-task.md');
      const taskContent = `# ${task}

Task ID: ${taskId || 'direct-dispatch'}
Dispatched: ${new Date().toISOString()}
Status: In Progress

---
Instructions: Complete this task and report back to Mikey.
`;
      await writeFile(taskFile, taskContent);
      
      return NextResponse.json({ 
        ok: true, 
        message: `Task dispatched to ${agent.name}`,
        agent: agentId,
        sessionLabel: agent.sessionLabel
      });
    }
    
    if (action === 'clear') {
      const taskFile = join(MEMORY_BASE, agentId, 'current-task.md');
      await writeFile(taskFile, `# Current Task

*No active task*

---
Last updated: ${new Date().toISOString().split('T')[0]}
`);
      return NextResponse.json({ ok: true, message: 'Task cleared' });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
