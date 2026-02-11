import { NextResponse } from 'next/server';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const SESSIONS_INDEX = 'os.homedir()/.openclaw/agents/main/sessions/sessions.json';
const SESSIONS_DIR = 'os.homedir()/.openclaw/agents/main/sessions';

// Topic name mapping for friendly labels
const TOPIC_NAMES: Record<string, string> = {
  '1369': '🔖 Bookmarks',
  '13': '🌴 Bali Trip',
  '14': '💰 Expenses',
  '60': '🐦 Bird (Twitter)',
  '59': '📬 Daily Briefing',
  '342': '🚨 Alerts',
  '12': '💼 Work',
  '1503': '🔬 Prototyping',
  '1819': '🇷🇺 Russian',
  '2145': '💡 Ideas',
  '3414': '🧠 Brain Dump',
  '2841': '🧠 Trivia',
  '2217': '🎤 Standup',
  '2154': '📝 Content Ideas',
  '2966': '🏃 Health',
  '4213': '🔧 Fontanero',
  '4575': '💪 Stronks',
  '83': '🛠️ Dev / Control Center',
  '1': '💬 General',
};

interface SessionMessage {
  role: string;
  text: string;
  timestamp: string;
}

function getSessionKind(key: string): string {
  if (key.includes(':subagent:')) return 'subagent';
  if (key === 'agent:main:main') return 'main';
  if (key.includes(':telegram:')) return 'telegram';
  return 'channel';
}

function getSessionLabel(key: string, origin?: Record<string, string>): string {
  if (key === 'agent:main:main') return 'Main Session (DM)';

  // Subagent
  if (key.includes(':subagent:')) {
    const uuid = key.split(':subagent:')[1] || '';
    return `Subagent ${uuid.slice(0, 8)}`;
  }

  // Telegram topic
  const topicMatch = key.match(/:topic:(\d+)$/);
  if (topicMatch) {
    const topicId = topicMatch[1];
    return TOPIC_NAMES[topicId] || `Topic ${topicId}`;
  }

  // Telegram group without topic
  if (key.includes(':telegram:group:')) {
    const groupId = key.match(/:group:(-?\d+)/)?.[1] || '';
    return `Group ${groupId}`;
  }

  return origin?.label || key.split(':').pop() || key;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: Record<string, unknown>) => p.type === 'text' && p.text)
      .map((p: Record<string, unknown>) => p.text as string)
      .join(' ');
  }
  return '';
}

async function getLastMessages(sessionFile: string, count: number): Promise<SessionMessage[]> {
  try {
    const data = await readFile(sessionFile, 'utf-8');
    const lines = data.trim().split('\n').filter(Boolean);
    const messages: SessionMessage[] = [];

    // Parse from the end for efficiency
    for (let i = lines.length - 1; i >= 0 && messages.length < count; i--) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.type === 'message' && parsed.message) {
          const { role, content } = parsed.message;
          if (role === 'user' || role === 'assistant') {
            const text = extractTextFromContent(content);
            if (text) {
              messages.unshift({
                role,
                text: text.slice(0, 300),
                timestamp: parsed.timestamp || '',
              });
            }
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return messages;
  } catch {
    return [];
  }
}

async function getMessageCount(sessionFile: string): Promise<number> {
  try {
    const data = await readFile(sessionFile, 'utf-8');
    const lines = data.trim().split('\n').filter(Boolean);
    let count = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'message' && parsed.message?.role) {
          count++;
        }
      } catch {
        // skip
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function readSessionsFromIndex() {
  const raw = await readFile(SESSIONS_INDEX, 'utf-8');
  const sessionsMap: Record<string, Record<string, unknown>> = JSON.parse(raw);

  const sessions = await Promise.all(
    Object.entries(sessionsMap).map(async ([key, session]) => {
      const kind = getSessionKind(key);
      const label = getSessionLabel(key, session.origin as Record<string, string>);
      // Support sessionFile (full path), transcriptPath (filename), or derive from sessionId
      const sessionId = session.sessionId as string | undefined;
      const sessionFile = (session.sessionFile as string) 
        || (session.transcriptPath as string)
        || (sessionId ? `${sessionId}.jsonl` : null);
      const updatedAt = session.updatedAt as number;

      // Determine if active (updated in last 10 minutes)
      const isActive = Date.now() - updatedAt < 10 * 60 * 1000;

      // Get last 3 messages and message count in parallel (only for non-subagents with session files)
      let lastMessages: SessionMessage[] = [];
      let messageCount = 0;

      if (sessionFile && sessionFile !== 'N/A') {
        // Resolve to full path if it's just a filename
        const resolvedFile = sessionFile.startsWith('/') 
          ? sessionFile 
          : `${SESSIONS_DIR}/${sessionFile}`;
        const [msgs, count] = await Promise.all([
          getLastMessages(resolvedFile, 3),
          getMessageCount(resolvedFile),
        ]);
        lastMessages = msgs;
        messageCount = count;
      }

      const totalTokens = (session.totalTokens as number) || 0;
      const inputTokens = (session.inputTokens as number) || 0;
      const outputTokens = (session.outputTokens as number) || 0;
      const contextTokens = (session.contextTokens as number) || 0;
      const modelName = (session.model || session.modelProvider || '') as string;

      // Estimate cost based on model
      // Opus: $15/M in, $75/M out; Sonnet: $3/M in, $15/M out
      const isOpus = modelName.includes('opus');
      const inputRate = isOpus ? 15 : 3;
      const outputRate = isOpus ? 75 : 15;
      const estimatedCost = (inputTokens / 1_000_000 * inputRate) + (outputTokens / 1_000_000 * outputRate);

      return {
        key,
        label,
        kind,
        chatType: session.chatType || null,
        sessionId: session.sessionId || null,
        model: modelName,
        updatedAt,
        lastActivity: new Date(updatedAt).toISOString(),
        isActive,
        messageCount,
        lastMessages,
        totalTokens,
        inputTokens,
        outputTokens,
        contextTokens,
        estimatedCost: Math.round(estimatedCost * 10000) / 10000,
      };
    })
  );

  // Sort by updatedAt descending (most recent first)
  sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return sessions;
}

export async function GET() {
  try {
    // Try openclaw CLI first
    try {
      const { stdout } = await execAsync('openclaw sessions --json 2>/dev/null', { timeout: 5000 });
      const data = JSON.parse(stdout);
      
      // CLI returns {path, count, activeMinutes, sessions: [...]} or just an array
      const sessionsArray = Array.isArray(data) ? data : (data.sessions || []);
      
      if (sessionsArray.length > 0) {
        // Add friendly labels and enrich the data
        const enrichedSessions = await Promise.all(sessionsArray.map(async (session: any) => {
          let messageCount = session.messageCount || 0;
          let lastMessages = session.lastMessages || [];
          
          // If messageCount is missing/null, try to read from file
          // Support transcriptPath or derive from sessionId
          const transcriptFile = session.transcriptPath 
            || (session.sessionId ? `${session.sessionId}.jsonl` : null);
          
          if (!session.messageCount && transcriptFile) {
            try {
              const filePath = transcriptFile.startsWith('/') 
                ? transcriptFile 
                : `${SESSIONS_DIR}/${transcriptFile}`;
              const [msgs, count] = await Promise.all([
                getLastMessages(filePath, 3),
                getMessageCount(filePath),
              ]);
              messageCount = count;
              lastMessages = msgs;
            } catch {
              // Ignore read errors
            }
          }
          
          return {
            ...session,
            label: getSessionLabel(session.key),
            kind: getSessionKind(session.key),
            lastActivity: new Date(session.updatedAt).toISOString(),
            isActive: Date.now() - session.updatedAt < 10 * 60 * 1000,
            messageCount,
            lastMessages,
          };
        }));
        
        return NextResponse.json({
          sessions: enrichedSessions,
          source: 'cli',
          timestamp: Date.now(),
        });
      }
    } catch {
      // CLI not available, fall through to file-based approach
    }

    // Fallback: read from sessions index file
    const sessions = await readSessionsFromIndex();

    return NextResponse.json({
      sessions,
      source: 'file',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Sessions error:', error);

    // Last resort: try to list session files directly
    try {
      const files = await readdir(SESSIONS_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.') && !f.includes('.lock'));
      const sessions = await Promise.all(
        jsonlFiles.map(async (file) => {
          const filePath = join(SESSIONS_DIR, file);
          const fileStat = await stat(filePath);
          const msgs = await getLastMessages(filePath, 3);
          return {
            key: file.replace('.jsonl', ''),
            label: file.replace('.jsonl', '').slice(0, 8),
            kind: 'unknown',
            chatType: null,
            sessionId: file.replace('.jsonl', ''),
            model: null,
            updatedAt: fileStat.mtimeMs,
            lastActivity: fileStat.mtime.toISOString(),
            isActive: Date.now() - fileStat.mtimeMs < 10 * 60 * 1000,
            messageCount: msgs.length,
            lastMessages: msgs,
          };
        })
      );
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return NextResponse.json({ sessions, source: 'fallback', timestamp: Date.now() });
    } catch {
      return NextResponse.json({ error: 'Failed to get sessions', sessions: [] }, { status: 500 });
    }
  }
}
