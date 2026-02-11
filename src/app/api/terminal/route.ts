import { NextResponse } from 'next/server';
import { exec } from 'child_process';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { command } = await request.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'No command provided' }, { status: 400 });
    }

    // Safety: block extremely dangerous commands
    const blocked = ['rm -rf /', 'mkfs', ':(){', 'dd if='];
    if (blocked.some(b => command.includes(b))) {
      return NextResponse.json({ error: 'Command blocked for safety' }, { status: 403 });
    }

    return new Promise<NextResponse>((resolve) => {
      const child = exec(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH}` },
        cwd: 'os.homedir()',
      }, (error, stdout, stderr) => {
        resolve(NextResponse.json({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? error.code || 1 : 0,
          command,
          timestamp: Date.now(),
        }));
      });
    });
  } catch (error) {
    console.error('Terminal error:', error);
    return NextResponse.json({ error: 'Failed to execute command' }, { status: 500 });
  }
}
