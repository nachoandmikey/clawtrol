import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { resolve, normalize, extname } from 'path';

export const dynamic = 'force-dynamic';

const BASE_DIR = 'os.homedir()';
const MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1MB

function isPathSafe(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath));
  return resolved.startsWith(BASE_DIR);
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.scss',
  '.html', '.xml', '.svg', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.conf', '.sh', '.bash', '.zsh', '.fish', '.py', '.rb', '.go',
  '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.lua', '.sql', '.graphql', '.env', '.gitignore',
  '.dockerignore', '.editorconfig', '.prettierrc', '.eslintrc',
  '.babelrc', '.log', '.csv', '.tsv', '.lock', '.prisma',
  '.mdx', '.astro', '.vue', '.svelte', '.mjs', '.cjs',
]);

const IMAGE_EXTENSIONS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
};

const PDF_EXTENSION = '.pdf';

function isTextFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Check for common extensionless text files
  const base = filename.toLowerCase();
  return ['makefile', 'dockerfile', 'readme', 'license', 'changelog', 'procfile'].includes(base);
}

function isImageFile(filename: string): string | null {
  const ext = extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS[ext] || null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedPath = searchParams.get('path');

    if (!requestedPath) {
      return NextResponse.json(
        { error: 'Missing required query parameter: path' },
        { status: 400 }
      );
    }

    const resolvedPath = resolve(normalize(requestedPath));

    if (!isPathSafe(resolvedPath)) {
      return NextResponse.json(
        { error: 'Access denied: path outside allowed directory' },
        { status: 403 }
      );
    }

    const fileStats = await stat(resolvedPath);

    if (fileStats.isDirectory()) {
      return NextResponse.json(
        { error: 'Path is a directory, not a file' },
        { status: 400 }
      );
    }

    const filename = resolvedPath.split('/').pop() || '';
    const ext = extname(filename).toLowerCase();

    // Check if it's an image
    const imageMime = isImageFile(filename);
    if (imageMime) {
      if (fileStats.size > 10 * 1024 * 1024) {
        return NextResponse.json({
          type: 'image',
          mime: imageMime,
          size: fileStats.size,
          modified: fileStats.mtime.toISOString(),
          encoding: 'none',
          content: null,
          tooLarge: true,
        });
      }
      const buffer = await readFile(resolvedPath);
      const base64 = buffer.toString('base64');
      return NextResponse.json({
        type: 'image',
        mime: imageMime,
        size: fileStats.size,
        modified: fileStats.mtime.toISOString(),
        encoding: 'base64',
        content: `data:${imageMime};base64,${base64}`,
      });
    }

    // Check if it's a PDF
    if (ext === PDF_EXTENSION) {
      if (fileStats.size > 20 * 1024 * 1024) { // 20MB limit for PDFs
        return NextResponse.json({
          type: 'pdf',
          mime: 'application/pdf',
          size: fileStats.size,
          modified: fileStats.mtime.toISOString(),
          encoding: 'none',
          content: null,
          tooLarge: true,
        });
      }
      const buffer = await readFile(resolvedPath);
      const base64 = buffer.toString('base64');
      return NextResponse.json({
        type: 'pdf',
        mime: 'application/pdf',
        size: fileStats.size,
        modified: fileStats.mtime.toISOString(),
        encoding: 'base64',
        content: `data:application/pdf;base64,${base64}`,
      });
    }

    // Check if it's a text file
    if (isTextFile(filename)) {
      if (fileStats.size > MAX_TEXT_SIZE) {
        return NextResponse.json({
          type: 'text',
          extension: ext,
          size: fileStats.size,
          modified: fileStats.mtime.toISOString(),
          encoding: 'none',
          content: null,
          tooLarge: true,
        });
      }
      const content = await readFile(resolvedPath, 'utf-8');
      return NextResponse.json({
        type: 'text',
        extension: ext,
        size: fileStats.size,
        modified: fileStats.mtime.toISOString(),
        encoding: 'utf-8',
        content,
      });
    }

    // Binary / unknown file - metadata only
    return NextResponse.json({
      type: 'binary',
      extension: ext,
      size: fileStats.size,
      modified: fileStats.mtime.toISOString(),
      encoding: 'none',
      content: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isNotFound =
      error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
    return NextResponse.json(
      { error: isNotFound ? 'File not found' : `Failed to read file: ${message}` },
      { status: isNotFound ? 404 : 500 }
    );
  }
}
