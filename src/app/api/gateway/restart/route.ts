import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Kill the gateway process and let the watchdog/launchd restart it
    await execAsync("pkill -f 'openclaw-gateway' || true", { timeout: 10000 });
    
    return NextResponse.json({ success: true, message: 'Gateway killed (should auto-restart)' });
  } catch (error) {
    console.error('Gateway restart error:', error);
    return NextResponse.json({ error: 'Failed to restart gateway' }, { status: 500 });
  }
}
