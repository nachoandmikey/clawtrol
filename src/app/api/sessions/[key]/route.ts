import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

const SESSIONS_INDEX = 'os.homedir()/.openclaw/agents/main/sessions/sessions.json';
const SESSIONS_DIR = 'os.homedir()/.openclaw/agents/main/sessions';

interface SessionMessage {
  role: string;
  text: string;
  timestamp: string;
  id?: string;
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

async function getMessages(sessionFile: string, limit: number): Promise<{ messages: SessionMessage[]; totalMessages: number }> {
  try {
    const data = await readFile(sessionFile, 'utf-8');
    const lines = data.trim().split('\n').filter(Boolean);
    const allMessages: SessionMessage[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'message' && parsed.message) {
          const { role, content } = parsed.message;
          if (role === 'user' || role === 'assistant') {
            const text = extractTextFromContent(content);
            if (text) {
              allMessages.push({
                role,
                text,
                timestamp: parsed.timestamp || '',
                id: parsed.id || undefined,
              });
            }
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }

    const totalMessages = allMessages.length;
    const messages = allMessages.slice(-limit);

    return { messages, totalMessages };
  } catch {
    return { messages: [], totalMessages: 0 };
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const { key: rawKey } = await context.params;
    // Decode the key (it may be URL-encoded, e.g., agent%3Amain%3Amain)
    const key = decodeURIComponent(rawKey);

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10), 1), 100);

    // Read sessions index to find the session
    const raw = await readFile(SESSIONS_INDEX, 'utf-8');
    const sessionsMap: Record<string, Record<string, unknown>> = JSON.parse(raw);

    const session = sessionsMap[key];
    if (!session) {
      return NextResponse.json({ error: 'Session not found', key }, { status: 404 });
    }

    // Support sessionFile (full path), transcriptPath (filename), or derive from sessionId
    const sessionFile = (session.sessionFile as string) 
      || (session.transcriptPath as string)
      || (session.sessionId ? `${session.sessionId}.jsonl` : null);
    const updatedAt = session.updatedAt as number;

    let messages: SessionMessage[] = [];
    let totalMessages = 0;

    if (sessionFile && sessionFile !== 'N/A') {
      // Resolve to full path if it's just a filename
      const resolvedFile = sessionFile.startsWith('/') 
        ? sessionFile 
        : `${SESSIONS_DIR}/${sessionFile}`;
      const result = await getMessages(resolvedFile, limit);
      messages = result.messages;
      totalMessages = result.totalMessages;
    }

    return NextResponse.json({
      key,
      sessionId: session.sessionId || null,
      chatType: session.chatType || null,
      model: session.model || session.modelProvider || null,
      updatedAt,
      lastActivity: new Date(updatedAt).toISOString(),
      isActive: Date.now() - updatedAt < 10 * 60 * 1000,
      totalMessages,
      messages,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Session detail error:', error);
    return NextResponse.json({ error: 'Failed to get session details' }, { status: 500 });
  }
}
