import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET() {
  // Primary: CoreGraphics via swift (works with or without monitor)
  try {
    const { stdout } = await execAsync(
      `swift -e 'import CoreGraphics; let id = CGMainDisplayID(); print("\\(CGDisplayPixelsWide(id)) \\(CGDisplayPixelsHigh(id))")'`,
      { timeout: 5000 }
    );
    const parts = stdout.trim().split(' ');
    if (parts.length === 2) {
      const logicalWidth = parseInt(parts[0]);
      const logicalHeight = parseInt(parts[1]);
      return NextResponse.json({ logicalWidth, logicalHeight });
    }
  } catch {}

  // Fallback: Finder bounds
  try {
    const { stdout } = await execAsync(`osascript -e 'tell application "Finder" to get bounds of window of desktop'`);
    const parts = stdout.trim().split(',').map(s => parseInt(s.trim()));
    return NextResponse.json({
      logicalWidth: parts[2] || 1920,
      logicalHeight: parts[3] || 1080,
    });
  } catch (error) {
    console.error('Screen info error:', error);
    return NextResponse.json({ logicalWidth: 1920, logicalHeight: 1080 });
  }
}
