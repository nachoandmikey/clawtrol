import { NextRequest, NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import { join, resolve, normalize } from 'path';

export const dynamic = 'force-dynamic';

const BASE_DIR = 'os.homedir()';

function isPathSafe(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath));
  return resolved.startsWith(BASE_DIR);
}

export async function GET(request: NextRequest) {
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

    const entries = await readdir(resolvedPath, { withFileTypes: true });

    const results = await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map(async (entry) => {
          const fullPath = join(resolvedPath, entry.name);
          try {
            const stats = await stat(fullPath);
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime.toISOString(),
              permissions: (stats.mode & 0o777).toString(8),
            };
          } catch {
            return {
              name: entry.name,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: 0,
              modified: null,
              permissions: null,
            };
          }
        })
    );

    // Sort: directories first, then files, alphabetical within each group
    results.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      path: resolvedPath,
      entries: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNotFound =
      error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
    return NextResponse.json(
      { error: isNotFound ? 'Directory not found' : `Failed to list directory: ${message}` },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
