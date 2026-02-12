import { NextResponse } from 'next/server';
import { execSafe } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { message, target } = await request.json();
    
    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Send via openclaw CLI — using execFile (no shell interpolation)
    const args = ['send'];
    if (target) {
      args.push('--to', target);
    }
    args.push(message);
    
    await execSafe('openclaw', args);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
