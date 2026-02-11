import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lines = parseInt(searchParams.get('lines') || '100');
    const logType = searchParams.get('type') || 'all'; // 'out', 'err', 'all'
    
    const logDir = 'os.homedir()/.openclaw/logs';
    let logs = '';

    if (logType === 'err' || logType === 'all') {
      try {
        const { stdout } = await execAsync(`tail -n ${Math.min(lines, 500)} ${logDir}/gateway.err.log`);
        if (logType === 'all') logs += '=== STDERR ===\n';
        logs += stdout;
      } catch {}
    }

    if (logType === 'out' || logType === 'all') {
      try {
        const { stdout } = await execAsync(`tail -n ${Math.min(lines, 500)} ${logDir}/gateway.log`);
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
