import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check if openclaw-gateway process is running (it's standalone, not PM2)
    let running = false;
    let pid: string | null = null;
    let memory = 0;
    let cpuUsage = 0;

    try {
      const { stdout } = await execAsync("ps -eo pid,rss,%cpu,comm | grep 'openclaw-gateway' | grep -v grep");
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 3) {
        pid = parts[0];
        memory = parseInt(parts[1]) * 1024; // RSS is in KB, convert to bytes
        cpuUsage = parseFloat(parts[2]);
        running = true;
      }
    } catch {
      // Process not found
    }

    // Get uptime from process start time
    let uptime = 0;
    if (pid) {
      try {
        const { stdout } = await execAsync(`ps -p ${pid} -o lstart=`);
        const startDate = new Date(stdout.trim());
        uptime = Date.now() - startDate.getTime();
      } catch {}
    }

    // Try to read gateway version/config info
    let version = null;
    try {
      const pkg = await readFile('os.homedir()/node_modules/openclaw/package.json', 'utf-8');
      version = JSON.parse(pkg).version;
    } catch {
      try {
        const pkg = await readFile('os.homedir()/.openclaw/package.json', 'utf-8');
        version = JSON.parse(pkg).version;
      } catch {}
    }

    return NextResponse.json({
      running,
      process: running ? {
        pid,
        memory,
        cpu: cpuUsage,
        uptime,
      } : null,
      version,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Gateway status error:', error);
    return NextResponse.json({ error: 'Failed to get gateway status' }, { status: 500 });
  }
}
