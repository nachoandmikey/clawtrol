import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { stdout: pm2Output } = await execAsync('pm2 jlist 2>/dev/null || echo "[]"');
    const processes = JSON.parse(pm2Output);
    
    // Get top processes by CPU/memory
    const { stdout: topOutput } = await execAsync('ps aux --sort=-%cpu | head -10 2>/dev/null || ps aux | head -10');
    
    return NextResponse.json({
      pm2: processes.map((p: Record<string, unknown>) => ({
        name: p.name,
        status: (p.pm2_env as Record<string, unknown>)?.status,
        cpu: (p.monit as Record<string, unknown>)?.cpu,
        memory: (p.monit as Record<string, unknown>)?.memory,
        uptime: (p.pm2_env as Record<string, unknown>)?.pm_uptime,
        restarts: (p.pm2_env as Record<string, unknown>)?.restart_time,
        pid: p.pid,
      })),
      top: topOutput,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Processes error:', error);
    return NextResponse.json({ error: 'Failed to get processes' }, { status: 500 });
  }
}
