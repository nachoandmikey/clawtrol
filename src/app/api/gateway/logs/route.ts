import { NextResponse } from 'next/server';
import os from 'os';
import path from 'path';
import { execSafe, validateInput, NUMERIC } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const linesParam = searchParams.get('lines') || '100';
    const logType = searchParams.get('type') || 'all'; // 'out', 'err', 'all'
    
    // Validate lines is numeric
    validateInput(linesParam, NUMERIC, 'lines');
    const lines = Math.min(parseInt(linesParam), 500).toString();
    
    const logDir = path.join(os.homedir(), '.openclaw', 'logs');
    let logs = '';

    if (logType === 'err' || logType === 'all') {
      try {
        const { stdout } = await execSafe('tail', ['-n', lines, path.join(logDir, 'gateway.err.log')]);
        if (logType === 'all') logs += '=== STDERR ===\n';
        logs += stdout;
      } catch {}
    }

    if (logType === 'out' || logType === 'all') {
      try {
        const { stdout } = await execSafe('tail', ['-n', lines, path.join(logDir, 'gateway.log')]);
        if (logType === 'all') logs += '\n=== STDOUT ===\n';
        logs += stdout;
      } catch {}
    }

    return NextResponse.json({
      logs: logs || 'No logs found',
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Gateway logs error:', error);
    return NextResponse.json({ error: 'Failed to get gateway logs' }, { status: 500 });
  }
}
