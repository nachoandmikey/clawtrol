import { NextRequest, NextResponse } from 'next/server';
import { resolve, normalize, basename } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const BASE_DIR = 'os.homedir()';

function isPathSafe(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath));
  return resolved.startsWith(BASE_DIR);
}

export async function GET(request: NextRequest) {
  let tmpZipPath: string | null = null;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedPath = searchParams.get('path') || BASE_DIR;
    const resolvedPath = resolve(normalize(requestedPath));

    if (!isPathSafe(resolvedPath)) {
      return NextResponse.json(
        { error: 'Access denied: path outside allowed directory' },
        { status: 403 }
      );
    }

    // Check if path exists
    try {
      await stat(resolvedPath);
    } catch {
      return NextResponse.json(
        { error: 'Path not found' },
        { status: 404 }
      );
    }

    // Create temp zip file
    const dirName = basename(resolvedPath) || 'export';
    const timestamp = Date.now();
    tmpZipPath = join(tmpdir(), `${dirName}-${timestamp}.zip`);

    // Use system zip command (available on macOS)
    // -r = recursive, -q = quiet
    await execAsync(`cd "${resolvedPath}" && zip -rq "${tmpZipPath}" .`, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    // Read the zip file
    const zipBuffer = await readFile(tmpZipPath);

    // Clean up temp file
    await unlink(tmpZipPath);
    tmpZipPath = null;

    // Return as download
    const filename = `${dirName}.zip`;
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error: unknown) {
    // Clean up temp file on error
    if (tmpZipPath) {
      try {
        await unlink(tmpZipPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Zip error:', message);
    return NextResponse.json(
      { error: `Failed to create zip: ${message}` },
      { status: 500 }
    );
  }
}
