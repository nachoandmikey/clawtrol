import { NextResponse } from 'next/server';
import os from 'os';
import { execSafe, validateInput, SAFE_NAME } from '@/lib/security';

export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS = new Set([
  'pm2-restart',
  'pm2-stop',
  'pm2-start',
  'clear-logs',
  'git-pull',
  'openclaw-update',
]);

export async function POST(request: Request) {
  try {
    const { action, target } = await request.json();

    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    switch (action) {
      case 'pm2-restart': {
        const t = target ? validateInput(target, SAFE_NAME, 'target') : 'all';
        await execSafe('pm2', ['restart', t], { timeout: 30000 });
        return NextResponse.json({ success: true, message: `Restarted ${t}` });
      }

      case 'pm2-stop': {
        const t = validateInput(target, SAFE_NAME, 'target');
        await execSafe('pm2', ['stop', t], { timeout: 30000 });
        return NextResponse.json({ success: true, message: `Stopped ${t}` });
      }

      case 'pm2-start': {
        const t = validateInput(target, SAFE_NAME, 'target');
        await execSafe('pm2', ['start', t], { timeout: 30000 });
        return NextResponse.json({ success: true, message: `Started ${t}` });
      }

      case 'clear-logs':
        await execSafe('pm2', ['flush'], { timeout: 10000 });
        return NextResponse.json({ success: true, message: 'Logs cleared' });

      case 'git-pull': {
        const { stdout } = await execSafe('git', ['-C', os.homedir(), 'pull'], { timeout: 60000 });
        return NextResponse.json({ success: true, message: stdout });
      }

      case 'openclaw-update':
        await execSafe('openclaw', ['update'], { timeout: 120000 });
        return NextResponse.json({ success: true, message: 'OpenClaw updated' });

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Action error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
