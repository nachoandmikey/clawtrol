import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { action, target } = await request.json();
    
    switch (action) {
      case 'pm2-restart':
        await execAsync(`pm2 restart ${target || 'all'}`, { timeout: 30000 });
        return NextResponse.json({ success: true, message: `Restarted ${target || 'all'}` });
        
      case 'pm2-stop':
        await execAsync(`pm2 stop ${target}`, { timeout: 30000 });
        return NextResponse.json({ success: true, message: `Stopped ${target}` });
        
      case 'pm2-start':
        await execAsync(`pm2 start ${target}`, { timeout: 30000 });
        return NextResponse.json({ success: true, message: `Started ${target}` });
        
      case 'clear-logs':
        await execAsync('pm2 flush', { timeout: 10000 });
        return NextResponse.json({ success: true, message: 'Logs cleared' });
        
      case 'git-pull':
        const { stdout } = await execAsync('cd os.homedir() && git pull 2>&1', { timeout: 60000 });
        return NextResponse.json({ success: true, message: stdout });
        
      case 'openclaw-update':
        await execAsync('openclaw update', { timeout: 120000 });
        return NextResponse.json({ success: true, message: 'OpenClaw updated' });
        
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Action error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
