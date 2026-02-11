import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

async function getScreenDimensions(): Promise<{ logicalWidth: number; logicalHeight: number }> {
  // Primary: use CoreGraphics via swift (works with or without monitor)
  try {
    const { stdout } = await execAsync(
      `swift -e 'import CoreGraphics; let id = CGMainDisplayID(); print("\\(CGDisplayPixelsWide(id)) \\(CGDisplayPixelsHigh(id))")'`,
      { timeout: 5000 }
    );
    const parts = stdout.trim().split(' ');
    if (parts.length === 2) {
      return { logicalWidth: parseInt(parts[0]), logicalHeight: parseInt(parts[1]) };
    }
  } catch {}
  
  // Fallback: Finder bounds
  try {
    const { stdout } = await execAsync(`osascript -e 'tell application "Finder" to get bounds of window of desktop'`);
    const parts = stdout.trim().split(',').map(s => parseInt(s.trim()));
    return { logicalWidth: parts[2] || 1920, logicalHeight: parts[3] || 1080 };
  } catch {}
  
  return { logicalWidth: 1920, logicalHeight: 1080 };
}

export async function GET() {
  const tempRaw = join(tmpdir(), `screen-raw-${Date.now()}.png`);
  const tempOut = join(tmpdir(), `screen-${Date.now()}.jpg`);
  
  try {
    // Capture screen and get dimensions in parallel
    const [, screenDims] = await Promise.all([
      execAsync(`screencapture -x -t png -C ${tempRaw}`, { timeout: 10000 }),
      getScreenDimensions(),
    ]);
    
    // Resize to max 1280px wide and compress to JPEG quality 60
    await execAsync(`sips --resampleWidth 1280 -s format jpeg -s formatOptions 60 ${tempRaw} --out ${tempOut}`, { timeout: 10000 });
    
    const imageBuffer = await readFile(tempOut);
    const base64 = imageBuffer.toString('base64');
    
    // Cleanup
    await Promise.all([unlink(tempRaw).catch(() => {}), unlink(tempOut).catch(() => {})]);
    
    return NextResponse.json({
      image: `data:image/jpeg;base64,${base64}`,
      screenDims,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Screen capture error:', error);
    await Promise.all([unlink(tempRaw).catch(() => {}), unlink(tempOut).catch(() => {})]);
    return NextResponse.json({ error: 'Failed to capture screen' }, { status: 500 });
  }
}
