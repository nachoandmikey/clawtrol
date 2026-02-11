import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

const CONFIG_PATH = 'os.homedir()/.openclaw/openclaw.json';

async function getBotToken(): Promise<string> {
  const raw = await readFile(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);
  return config?.channels?.telegram?.botToken || '';
}

function parseSessionKey(key: string): { chatId: string; topicId?: string } | null {
  // agent:main:main → DM to owner
  if (key === 'agent:main:main') {
    return { chatId: 'CHAT_ID' };
  }

  // agent:main:telegram:group:<id>:topic:<id>
  const topicMatch = key.match(/:group:(-?\d+):topic:(\d+)$/);
  if (topicMatch) {
    return { chatId: topicMatch[1], topicId: topicMatch[2] };
  }

  // agent:main:telegram:group:<id>
  const groupMatch = key.match(/:group:(-?\d+)$/);
  if (groupMatch) {
    return { chatId: groupMatch[1] };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { sessionKey, message } = await request.json();

    if (!sessionKey || !message) {
      return NextResponse.json({ error: 'Missing sessionKey or message' }, { status: 400 });
    }

    const target = parseSessionKey(sessionKey);
    if (!target) {
      return NextResponse.json({ error: 'Cannot send to this session type (only Telegram sessions supported)' }, { status: 400 });
    }

    const botToken = await getBotToken();
    if (!botToken) {
      return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 500 });
    }

    // Send via Telegram Bot API
    const body: Record<string, unknown> = {
      chat_id: target.chatId,
      text: message,
    };
    if (target.topicId) {
      body.message_thread_id = parseInt(target.topicId);
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({ error: `Telegram API error: ${data.description}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: data.result?.message_id,
      chatId: target.chatId,
      topicId: target.topicId,
    });
  } catch (error) {
    console.error('Session send error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
