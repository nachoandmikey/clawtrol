import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get all processes sorted by memory, with user-friendly output
    const { stdout } = await execAsync(
      `ps -eo pid,rss,%mem,%cpu,comm -r | head -50`,
      { timeout: 10000 }
    );

    const lines = stdout.trim().split('\n');
    const header = lines[0];
    const processes = lines.slice(1).map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[0];
      const rssKB = parseInt(parts[1]);
      const memPercent = parseFloat(parts[2]);
      const cpuPercent = parseFloat(parts[3]);
      const command = parts.slice(4).join(' ');
      // Get just the binary name from path
      const name = command.split('/').pop() || command;

      return {
        pid,
        rss: rssKB * 1024, // bytes
        memPercent,
        cpuPercent,
        command,
        name,
      };
    }).filter(p => p.rss > 0);

    return NextResponse.json({
      header,
      processes,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Process list error:', error);
    return NextResponse.json({ error: 'Failed to list processes' }, { status: 500 });
  }
}
