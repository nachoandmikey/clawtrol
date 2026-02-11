import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { x, y, type = 'click', text } = await request.json();

    switch (type) {
      case 'click':
        await execAsync(`cliclick c:${Math.round(x)},${Math.round(y)}`);
        break;

      case 'hover':
        await execAsync(`cliclick m:${Math.round(x)},${Math.round(y)}`);
        break;

      case 'doubleclick':
        await execAsync(`cliclick dc:${Math.round(x)},${Math.round(y)}`);
        break;

      case 'rightclick':
        await execAsync(`cliclick rc:${Math.round(x)},${Math.round(y)}`);
        break;

      case 'type':
        // Just type text at current cursor position (no click)
        if (text) {
          // Escape special chars for shell
          const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          await execAsync(`cliclick t:"${escaped}"`);
        }
        break;

      case 'clicktype':
        // Click at position then type text
        if (text) {
          await execAsync(`cliclick c:${Math.round(x)},${Math.round(y)}`);
          await new Promise(r => setTimeout(r, 150));
          const esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          await execAsync(`cliclick t:"${esc}"`);
        }
        break;

      case 'key':
        // Send a named key press (return, escape, space, tab, delete, arrow-up, etc.)
        if (text) {
          await execAsync(`cliclick kp:${text}`);
        }
        break;

      case 'shortcut':
        // Keyboard shortcut via AppleScript (e.g. "cmd+a", "cmd+c")
        if (text) {
          const parts = text.split('+');
          const key = parts.pop();
          const modifiers = parts.map((m: string) => {
            const map: Record<string, string> = { cmd: 'command', ctrl: 'control', alt: 'option', shift: 'shift' };
            return map[m.toLowerCase()] || m;
          });
          const modStr = modifiers.map((m: string) => `${m} down`).join(', ');
          const script = modStr
            ? `tell application "System Events" to keystroke "${key}" using {${modStr}}`
            : `tell application "System Events" to keystroke "${key}"`;
          await execAsync(`osascript -e '${script}'`);
        }
        break;

      case 'scroll':
        // Scroll using AppleScript
        if (text) {
          const amount = text === 'up' ? 5 : -5;
          await execAsync(`osascript -e 'tell application "System Events" to key code ${text === 'up' ? 126 : 125}'`);
        }
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Screen interaction error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
