'use client';

import { useState, useEffect, useCallback } from 'react';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string | null;
  permissions: string | null;
}

interface FileContent {
  type: 'text' | 'image' | 'binary';
  mime?: string;
  extension?: string;
  size: number;
  modified: string;
  encoding: string;
  content: string | null;
  tooLarge?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getFileIcon(name: string, type: string): string {
  if (type === 'directory') return '📁';

  const ext = name.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, string> = {
    ts: '📜', tsx: '📜', js: '📜', jsx: '📜', mjs: '📜', cjs: '📜',
    py: '🐍', rb: '💎', go: '🔷', rs: '🦀', swift: '🐦',
    json: '📦', yaml: '📦', yml: '📦', toml: '📦',
    md: '📝', mdx: '📝', txt: '📝',
    css: '🎨', scss: '🎨', less: '🎨',
    html: '🌐', xml: '🌐', svg: '🌐',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', ico: '🖼️', bmp: '🖼️',
    sh: '⚙️', bash: '⚙️', zsh: '⚙️',
    env: '🔒', lock: '🔒',
    log: '📋',
    csv: '📊', tsv: '📊',
    sql: '🗄️',
    docker: '🐳',
    git: '🔀', gitignore: '🔀',
  };

  // Check for special filenames
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return '🐳';
  if (lower === 'makefile') return '⚙️';
  if (lower === 'license') return '📄';
  if (lower === 'readme.md') return '📖';
  if (lower.includes('package.json')) return '📦';

  return iconMap[ext] || '📄';
}

export default function FileBrowser() {
  const [currentPath, setCurrentPath] = useState('os.homedir()');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // File viewer state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [showHidden, setShowHidden] = useState(false);

  const fetchDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load directory');
      setCurrentPath(data.path);
      setEntries(data.entries);
      setSelectedFile(null);
      setFileContent(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFileContent = useCallback(async (path: string) => {
    setFileLoading(true);
    setFileError(null);
    setFileContent(null);
    try {
      const res = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read file');
      setFileContent(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setFileError(msg);
    } finally {
      setFileLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory(currentPath);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = (path: string) => {
    fetchDirectory(path);
  };

  const openFile = (entry: FileEntry) => {
    if (entry.type === 'directory') {
      navigateTo(`${currentPath}/${entry.name}`);
    } else {
      const fullPath = `${currentPath}/${entry.name}`;
      setSelectedFile(fullPath);
      fetchFileContent(fullPath);
    }
  };

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    if (parent.startsWith('os.homedir()') || parent === 'os.homedir()') {
      navigateTo(parent);
    }
  };

  // Breadcrumb segments
  const pathSegments = currentPath.split('/').filter(Boolean);

  const filteredEntries = showHidden
    ? entries
    : entries.filter((e) => !e.name.startsWith('.'));

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={goUp}
          disabled={currentPath === 'os.homedir()'}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          ⬆️ Up
        </button>
        <button
          onClick={() => navigateTo('os.homedir()')}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
        >
          🏠 Home
        </button>
        <button
          onClick={() => fetchDirectory(currentPath)}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
        >
          ↻ Refresh
        </button>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="w-3 h-3 rounded"
          />
          Hidden files
        </label>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm mb-3 overflow-x-auto pb-1 flex-shrink-0">
        <span className="text-gray-500">/</span>
        {pathSegments.map((segment, i) => {
          const segPath = '/' + pathSegments.slice(0, i + 1).join('/');
          const isLast = i === pathSegments.length - 1;
          const isSafe = segPath.startsWith('os.homedir()');
          return (
            <span key={segPath} className="flex items-center gap-1 whitespace-nowrap">
              {isSafe && !isLast ? (
                <button
                  onClick={() => navigateTo(segPath)}
                  className="text-blue-400 hover:text-blue-300 hover:underline transition"
                >
                  {segment}
                </button>
              ) : (
                <span className={isLast ? 'text-white font-medium' : 'text-gray-500'}>
                  {segment}
                </span>
              )}
              {!isLast && <span className="text-gray-600">/</span>}
            </span>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm mb-3">
          {error}
        </div>
      )}

      {/* Content area - split view */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* File list */}
        <div
          className={`${
            selectedFile ? 'w-2/5 hidden md:block' : 'w-full'
          } bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden flex flex-col`}
        >
          {/* List header */}
          <div className="flex items-center px-4 py-2.5 border-b border-white/10 text-xs text-gray-500 bg-white/[0.02]">
            <span className="flex-1">Name</span>
            <span className="w-20 text-right hidden sm:block">Size</span>
            <span className="w-24 text-right hidden sm:block">Modified</span>
          </div>

          {/* Entries */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                Loading...
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                Empty directory
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const fullPath = `${currentPath}/${entry.name}`;
                const isSelected = selectedFile === fullPath;
                return (
                  <button
                    key={entry.name}
                    onClick={() => openFile(entry)}
                    className={`w-full flex items-center px-4 py-2 text-left hover:bg-white/[0.06] transition border-b border-white/[0.04] last:border-0 group ${
                      isSelected ? 'bg-blue-500/10 border-blue-500/20' : ''
                    }`}
                  >
                    <span className="mr-2.5 text-base flex-shrink-0">
                      {getFileIcon(entry.name, entry.type)}
                    </span>
                    <span
                      className={`flex-1 text-sm truncate ${
                        entry.type === 'directory'
                          ? 'text-blue-300 group-hover:text-blue-200'
                          : 'text-gray-300 group-hover:text-white'
                      }`}
                    >
                      {entry.name}
                      {entry.type === 'directory' && (
                        <span className="text-gray-600 ml-1">/</span>
                      )}
                    </span>
                    <span className="w-20 text-right text-xs text-gray-500 hidden sm:block flex-shrink-0">
                      {entry.type === 'file' ? formatBytes(entry.size) : '—'}
                    </span>
                    <span className="w-24 text-right text-xs text-gray-600 hidden sm:block flex-shrink-0">
                      {formatDate(entry.modified)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/10 text-xs text-gray-600 bg-white/[0.02]">
            {filteredEntries.length} items
            {!showHidden && entries.length > filteredEntries.length && (
              <span> ({entries.length - filteredEntries.length} hidden)</span>
            )}
          </div>
        </div>

        {/* File viewer panel */}
        {selectedFile && (
          <div className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden flex flex-col min-w-0">
            {/* Viewer header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">
                  {getFileIcon(selectedFile.split('/').pop() || '', 'file')}
                </span>
                <span className="text-sm font-medium truncate">
                  {selectedFile.split('/').pop()}
                </span>
                {fileContent && (
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {formatBytes(fileContent.size)}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setFileContent(null);
                }}
                className="px-2 py-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition text-sm flex-shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {fileLoading ? (
                <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                  Loading file...
                </div>
              ) : fileError ? (
                <div className="p-4 text-red-400 text-sm">{fileError}</div>
              ) : fileContent?.tooLarge ? (
                <div className="p-4 text-center text-gray-400">
                  <div className="text-4xl mb-3">📦</div>
                  <div className="text-sm">File too large to preview</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatBytes(fileContent.size)}
                  </div>
                </div>
              ) : fileContent?.type === 'image' && fileContent.content ? (
                <div className="p-4 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileContent.content}
                    alt={selectedFile.split('/').pop() || 'image'}
                    className="max-w-full max-h-[60vh] object-contain rounded"
                  />
                </div>
              ) : fileContent?.type === 'text' && fileContent.content !== null ? (
                <div className="relative">
                  <pre className="p-4 text-sm font-mono text-gray-300 whitespace-pre overflow-x-auto leading-relaxed">
                    {fileContent.content.split('\n').map((line, i) => (
                      <div key={i} className="flex hover:bg-white/[0.03]">
                        <span className="inline-block w-12 text-right mr-4 text-gray-600 select-none flex-shrink-0 text-xs leading-relaxed">
                          {i + 1}
                        </span>
                        <span className="flex-1">{line || ' '}</span>
                      </div>
                    ))}
                  </pre>
                </div>
              ) : fileContent?.type === 'binary' ? (
                <div className="p-4 text-center text-gray-400">
                  <div className="text-4xl mb-3">📎</div>
                  <div className="text-sm">Binary file — cannot preview</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {fileContent.extension} • {formatBytes(fileContent.size)}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Viewer footer */}
            {fileContent && (
              <div className="px-4 py-2 border-t border-white/10 text-xs text-gray-600 bg-white/[0.02] flex justify-between">
                <span>
                  {fileContent.type}
                  {fileContent.extension ? ` (${fileContent.extension})` : ''}
                </span>
                <span>{fileContent.modified ? formatDate(fileContent.modified) : ''}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
