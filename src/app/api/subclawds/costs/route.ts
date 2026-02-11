import { NextResponse } from 'next/server';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const COSTS_FILE = 'os.homedir()/memory/costs/agent-costs.json';
const SESSIONS_DIR = 'os.homedir()/.openclaw/sessions';

interface SessionCost {
  sessionId: string;
  cost: number;
  tokens: number;
  timestamp: string;
}

interface AgentCosts {
  totalCost: number;
  taskCount: number;
  sessions: SessionCost[];
}

interface CostsData {
  agents: Record<string, AgentCosts>;
  lastUpdated: string;
}

async function loadCosts(): Promise<CostsData> {
  try {
    const data = await readFile(COSTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      agents: {},
      lastUpdated: new Date().toISOString()
    };
  }
}

async function saveCosts(data: CostsData): Promise<void> {
  data.lastUpdated = new Date().toISOString();
  await writeFile(COSTS_FILE, JSON.stringify(data, null, 2));
}

// GET - Get cost summary for all agents
export async function GET() {
  try {
    const costs = await loadCosts();
    
    // Calculate totals
    let totalCost = 0;
    let totalTasks = 0;
    const agentSummaries: any[] = [];
    
    for (const [agentId, agentCosts] of Object.entries(costs.agents)) {
      totalCost += agentCosts.totalCost;
      totalTasks += agentCosts.taskCount;
      agentSummaries.push({
        agentId,
        totalCost: agentCosts.totalCost.toFixed(4),
        taskCount: agentCosts.taskCount,
        avgCostPerTask: agentCosts.taskCount > 0 
          ? (agentCosts.totalCost / agentCosts.taskCount).toFixed(4)
          : '0',
        recentSessions: agentCosts.sessions.slice(-5)
      });
    }
    
    // Sort by cost descending
    agentSummaries.sort((a, b) => parseFloat(b.totalCost) - parseFloat(a.totalCost));
    
    return NextResponse.json({
      totalCost: totalCost.toFixed(4),
      totalTasks,
      avgCostPerTask: totalTasks > 0 ? (totalCost / totalTasks).toFixed(4) : '0',
      lastUpdated: costs.lastUpdated,
      agents: agentSummaries
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load costs' }, { status: 500 });
  }
}

// POST - Record a cost for an agent
export async function POST(request: Request) {
  try {
    const { agentId, sessionId, cost, tokens } = await request.json();
    
    if (!agentId || cost === undefined) {
      return NextResponse.json({ error: 'agentId and cost required' }, { status: 400 });
    }
    
    const costs = await loadCosts();
    
    if (!costs.agents[agentId]) {
      costs.agents[agentId] = { totalCost: 0, taskCount: 0, sessions: [] };
    }
    
    costs.agents[agentId].totalCost += cost;
    costs.agents[agentId].taskCount += 1;
    costs.agents[agentId].sessions.push({
      sessionId: sessionId || 'unknown',
      cost,
      tokens: tokens || 0,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 sessions per agent
    if (costs.agents[agentId].sessions.length > 50) {
      costs.agents[agentId].sessions = costs.agents[agentId].sessions.slice(-50);
    }
    
    await saveCosts(costs);
    
    return NextResponse.json({
      ok: true,
      agentId,
      newTotal: costs.agents[agentId].totalCost.toFixed(4),
      taskCount: costs.agents[agentId].taskCount
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to record cost' }, { status: 500 });
  }
}
