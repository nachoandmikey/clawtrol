import { NextResponse } from 'next/server';
import { execSafe, validateInput, NUMERIC } from '@/lib/security';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

/**
 * Run an AppleScript safely via stdin (no shell interpolation).
 */
async function runAppleScript(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile('osascript', ['-'], { timeout: 10000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
    child.stdin?.write(script);
    child.stdin?.end();
  });
}

export async function POST(request: Request) {
  try {
    const { x, y, type = 'click', text } = await request.json();

    // Validate coordinates are numeric when provided
    const safeX = x != null ? Math.round(Number(x)) : 0;
    const safeY = y != null ? Math.round(Number(y)) : 0;
    if ((x != null && isNaN(safeX)) || (y != null && isNaN(safeY))) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    switch (type) {
      case 'click':
        await execSafe('cliclick', [`c:${safeX},${safeY}`]);
        break;

      case 'hover':
        await execSafe('cliclick', [`m:${safeX},${safeY}`]);
        break;

      case 'doubleclick':
        await execSafe('cliclick', [`dc:${safeX},${safeY}`]);
        break;

      case 'rightclick':
        await execSafe('cliclick', [`rc:${safeX},${safeY}`]);
        break;

      case 'type':
        if (text) {
          await execSafe('cliclick', [`t:${text}`]);
        }
        break;

      case 'clicktype':
        if (text) {
          await execSafe('cliclick', [`c:${safeX},${safeY}`]);
          await new Promise(r => setTimeout(r, 150));
          await execSafe('cliclick', [`t:${text}`]);
        }
        break;

      case 'key':
        if (text) {
          // Validate key name is safe (alphanumeric + dashes)
          const safeKey = text.replace(/[^a-zA-Z0-9-]/g, '');
          await execSafe('cliclick', [`kp:${safeKey}`]);
        }
        break;

      case 'shortcut':
        if (text) {
          const parts = text.split('+');
          const key = parts.pop()?.replace(/[^a-zA-Z0-9]/g, '') || '';
          const modifiers = parts.map((m: string) => {
            const map: Record<string, string> = { cmd: 'command', ctrl: 'control', alt: 'option', shift: 'shift' };
            return map[m.toLowerCase()] || '';
          }).filter(Boolean);
          const modStr = modifiers.map((m: string) => `${m} down`).join(', ');
          // Use stdin to avoid shell injection in osascript
          const script = modStr
            ? `tell application "System Events" to keystroke "${key}" using {${modStr}}`
            : `tell application "System Events" to keystroke "${key}"`;
          await runAppleScript(script);
        }
        break;

      case 'scroll':
        if (text) {
          const keyCode = text === 'up' ? '126' : '125';
          await runAppleScript(`tell application "System Events" to key code ${keyCode}`);
        }
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Screen interaction error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
