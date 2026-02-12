import { NextResponse } from 'next/server';
import { execSafe } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Kill the gateway process and let the watchdog/launchd restart it
    await execSafe('pkill', ['-f', 'openclaw-gateway'], { timeout: 10000 }).catch(() => {});
    
    return NextResponse.json({ success: true, message: 'Gateway killed (should auto-restart)' });
  } catch (error) {
    console.error('Gateway restart error:', error);
    return NextResponse.json({ error: 'Failed to restart gateway' }, { status: 500 });
  }
}
