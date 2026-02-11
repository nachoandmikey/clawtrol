import { NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const SESSIONS_DIR = 'os.homedir()/.openclaw/agents/main/sessions';
const SESSIONS_INDEX = join(SESSIONS_DIR, 'sessions.json');

const TOPIC_NAMES: Record<string, string> = {
  '1369': '🔖 Bookmarks', '13': '🌴 Bali', '14': '💰 Expenses',
  '60': '🐦 Twitter', '59': '📬 Daily', '342': '🚨 Alerts',
  '12': '💼 Work', '1503': '🔬 Prototyping', '1819': '🇷🇺 Russian',
  '2145': '💡 Ideas', '3414': '🧠 Brain Dump', '2841': '🧠 Trivia',
  '2217': '🎤 Standup', '2154': '📝 Content', '2966': '🏃 Health',
  '4213': '🔧 Fontanero', '4575': '💪 Stronks', '83': '🛠️ Control Center',
  '1': '💬 General',
};

function getLabel(key: string): string {
  if (key === 'agent:main:main') return 'Main DM';
  if (key.includes(':subagent:')) return `Subagent ${key.split(':subagent:')[1]?.slice(0, 8)}`;
  const topicMatch = key.match(/:topic:(\d+)$/);
  if (topicMatch) return TOPIC_NAMES[topicMatch[1]] || `Topic ${topicMatch[1]}`;
  const groupMatch = key.match(/:group:(-?\d+)$/);
  if (groupMatch) return `Group`;
  return key.split(':').pop() || key;
}

interface SessionCost {
  key: string;
  label: string;
  model: string;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  apiCalls: number;
}

async function calculateSessionCost(sessionFile: string, key: string, model: string): Promise<SessionCost> {
  const result: SessionCost = {
    key, label: getLabel(key), model,
    totalCost: 0, inputCost: 0, outputCost: 0, cacheCost: 0,
    totalTokens: 0, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0,
  };

  try {
    const data = await readFile(sessionFile, 'utf-8');
    const lines = data.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const usage = parsed?.message?.usage;
        if (usage) {
          result.apiCalls++;
          result.inputTokens += usage.input || 0;
          result.outputTokens += usage.output || 0;
          result.cacheReadTokens += usage.cacheRead || 0;
          result.cacheWriteTokens += usage.cacheWrite || 0;
          result.totalTokens += usage.totalTokens || 0;

          if (usage.cost) {
            result.totalCost += usage.cost.total || 0;
            result.inputCost += (usage.cost.input || 0);
            result.outputCost += (usage.cost.output || 0);
            result.cacheCost += (usage.cost.cacheRead || 0) + (usage.cost.cacheWrite || 0);
          }
        }
      } catch {}
    }
  } catch {}

  // Round costs
  result.totalCost = Math.round(result.totalCost * 10000) / 10000;
  result.inputCost = Math.round(result.inputCost * 10000) / 10000;
  result.outputCost = Math.round(result.outputCost * 10000) / 10000;
  result.cacheCost = Math.round(result.cacheCost * 10000) / 10000;

  return result;
}

export async function GET() {
  try {
    const raw = await readFile(SESSIONS_INDEX, 'utf-8');
    const sessionsMap: Record<string, Record<string, unknown>> = JSON.parse(raw);

    const costs = await Promise.all(
      Object.entries(sessionsMap).map(async ([key, session]) => {
        const sessionFile = session.sessionFile as string;
        const model = (session.model || session.modelProvider || 'unknown') as string;
        if (!sessionFile || sessionFile === 'N/A') {
          return { key, label: getLabel(key), model, totalCost: 0, inputCost: 0, outputCost: 0, cacheCost: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, apiCalls: 0 };
        }
        const resolvedFile = sessionFile;
        return calculateSessionCost(resolvedFile, key, model);
      })
    );

    // Sort by cost descending
    costs.sort((a, b) => b.totalCost - a.totalCost);

    const grandTotal = {
      totalCost: Math.round(costs.reduce((s, c) => s + c.totalCost, 0) * 10000) / 10000,
      inputCost: Math.round(costs.reduce((s, c) => s + c.inputCost, 0) * 10000) / 10000,
      outputCost: Math.round(costs.reduce((s, c) => s + c.outputCost, 0) * 10000) / 10000,
      cacheCost: Math.round(costs.reduce((s, c) => s + c.cacheCost, 0) * 10000) / 10000,
      totalTokens: costs.reduce((s, c) => s + c.totalTokens, 0),
      apiCalls: costs.reduce((s, c) => s + c.apiCalls, 0),
    };

    // By model
    const byModel: Record<string, { cost: number; tokens: number; calls: number }> = {};
    for (const c of costs) {
      const m = c.model || 'unknown';
      if (!byModel[m]) byModel[m] = { cost: 0, tokens: 0, calls: 0 };
      byModel[m].cost += c.totalCost;
      byModel[m].tokens += c.totalTokens;
      byModel[m].calls += c.apiCalls;
    }

    return NextResponse.json({
      sessions: costs.filter(c => c.totalCost > 0 || c.apiCalls > 0),
      totals: grandTotal,
      byModel,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Usage error:', error);
    return NextResponse.json({ error: 'Failed to calculate usage' }, { status: 500 });
  }
}
