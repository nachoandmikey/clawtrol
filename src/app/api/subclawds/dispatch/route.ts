import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const REGISTRY_FILE = 'os.homedir()/agents/registry.json';
const MEMORY_BASE = 'os.homedir()/memory';
const AGENTS_BASE = 'os.homedir()/agents';
const BASE_RULES_FILE = 'os.homedir()/agents/SUBCLAWD_BASE.md';

// This endpoint prepares a task for dispatch and returns the spawn parameters
// The actual spawning happens from the gateway via sessions_spawn

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agentId, task, taskId, priority } = body;
    
    // Load registry
    const registryData = await readFile(REGISTRY_FILE, 'utf-8');
    const registry = JSON.parse(registryData);
    const agent = registry.agents[agentId];
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    // Load global base rules (applies to ALL subclawds)
    let baseRules = '';
    try {
      baseRules = await readFile(BASE_RULES_FILE, 'utf-8');
    } catch {
      baseRules = '# Base Rules\nReport to Mikey only. Never message Telegram directly.';
    }
    
    // Load agent's soul file (agent-specific personality/skills)
    const soulPath = join(AGENTS_BASE, `${agentId}.soul.md`);
    let soulContent = '';
    try {
      soulContent = await readFile(soulPath, 'utf-8');
    } catch {
      soulContent = `You are ${agent.name}, a subclawd. Focus: ${agent.focus.join(', ')}`;
    }
    
    // Update agent's current-task.md
    const taskFile = join(MEMORY_BASE, agentId, 'current-task.md');
    const now = new Date().toISOString();
    const taskContent = `# ${task}

**Task ID:** ${taskId || 'direct-dispatch'}
**Dispatched:** ${now}
**Priority:** ${priority || 'normal'}
**Status:** In Progress

---
Complete this task and update this file when done.
`;
    await writeFile(taskFile, taskContent);
    
    // Build the task prompt for sessions_spawn
    // Base rules come FIRST (global), then agent soul (specific)
    const taskPrompt = `
[SUBCLAWD TASK DISPATCH]

You are ${agent.name} ${agent.emoji}
Role: ${agent.role}

---

${baseRules}

---

## YOUR IDENTITY
${soulContent}

---

## YOUR TASK
${task}

Task ID: ${taskId || 'direct-dispatch'}
Priority: ${priority || 'normal'}

---

Work autonomously. Update your memory when done.
`;

    return NextResponse.json({
      ok: true,
      agent: {
        id: agentId,
        name: agent.name,
        emoji: agent.emoji,
        model: agent.model,
        sessionLabel: agent.sessionLabel
      },
      spawnParams: {
        task: taskPrompt,
        label: `${agent.sessionLabel}-${Date.now()}`,
        model: agent.model,
        cleanup: 'keep'
      },
      message: `Task prepared for ${agent.name}. Use sessions_spawn with the spawnParams.`
    });
  } catch (error) {
    console.error('Dispatch error:', error);
    return NextResponse.json({ error: 'Failed to prepare dispatch' }, { status: 500 });
  }
}
