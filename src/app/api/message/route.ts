import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { message, target } = await request.json();
    
    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Send via openclaw CLI
    const escapedMessage = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const targetArg = target ? `--to "${target}"` : '';
    
    await execAsync(`openclaw send ${targetArg} "${escapedMessage}"`, { timeout: 30000 });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
