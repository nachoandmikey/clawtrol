import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { pid, signal = 'TERM' } = await request.json();

    if (!pid) {
      return NextResponse.json({ error: 'PID required' }, { status: 400 });
    }

    // Safety: don't kill PID 1 or critical system processes
    const pidNum = parseInt(pid);
    if (pidNum <= 1) {
      return NextResponse.json({ error: 'Cannot kill system processes' }, { status: 400 });
    }

    const sig = signal === 'KILL' ? '-9' : '-15';
    await execAsync(`kill ${sig} ${pidNum}`, { timeout: 5000 });

    return NextResponse.json({ success: true, message: `Sent ${signal} to PID ${pid}` });
  } catch (error) {
    console.error('Kill process error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
