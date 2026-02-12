#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createServer } from 'net';
import { existsSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_NAME = 'clawtrol';
const STATE_FILE = resolve(process.cwd(), '.clawtrol.json');
const LEGACY_STATE_FILE = resolve(process.cwd(), '.clawtrol.pid.json');

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    cwd: process.cwd(),
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false,
    encoding: 'utf8',
  });

  if (options.capture) {
    return {
      status: res.status ?? 1,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
    };
  }

  if ((res.status ?? 1) !== 0 && !options.allowFail) {
    process.exit(res.status ?? 1);
  }

  return res;
}

function parsePortFlag() {
  const args = process.argv.slice(3);
  const i = args.findIndex((a) => a === '--port' || a === '-p');
  if (i >= 0 && args[i + 1]) {
    const p = Number(args[i + 1]);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  const long = args.find((a) => a.startsWith('--port='));
  if (long) {
    const p = Number(long.split('=')[1]);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  return null;
}

function readConfigPort() {
  const cfg = resolve(process.cwd(), 'clawtrol.config.ts');
  if (!existsSync(cfg)) return null;
  try {
    const text = readFileSync(cfg, 'utf8');
    const m = text.match(/\bport\s*:\s*(\d{2,5})\b/);
    if (!m) return null;
    const p = Number(m[1]);
    return Number.isInteger(p) && p > 0 && p < 65536 ? p : null;
  } catch {
    return null;
  }
}

function getMtimeSafe(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function shouldBuild() {
  const nextDir = resolve(process.cwd(), '.next');
  const srcDir = resolve(process.cwd(), 'src');
  if (!existsSync(nextDir)) return true;
  if (!existsSync(srcDir)) return false;
  return getMtimeSafe(nextDir) < getMtimeSafe(srcDir);
}

function findFreePort(start = 4781) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(start, () => {
      server.close(() => resolvePort(start));
    });
    server.on('error', () => resolvePort(findFreePort(start + 1)));
  });
}

function readState() {
  for (const file of [STATE_FILE, LEGACY_STATE_FILE]) {
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {}
  }
  return {};
}

function writeState(data) {
  const payload = JSON.stringify(data, null, 2);
  writeFileSync(STATE_FILE, payload + '\n');
  writeFileSync(LEGACY_STATE_FILE, payload + '\n');
}

function cleanupState() {
  for (const file of [STATE_FILE, LEGACY_STATE_FILE]) {
    try {
      rmSync(file);
    } catch {}
  }
}

async function start() {
  if (shouldBuild()) {
    console.log('🔨 Building app (next build)...');
    run('npm', ['run', 'build']);
  } else {
    console.log('✅ Build is up to date, skipping next build');
  }

  const requestedPort = parsePortFlag() ?? readConfigPort() ?? 4781;
  const port = await findFreePort(requestedPort);

  run('pm2', ['delete', APP_NAME], { allowFail: true });
  run('pm2', ['start', 'node', '--name', APP_NAME, '--', 'node_modules/.bin/next', 'start', '-p', String(port)]);

  const pidInfo = run('pm2', ['pid', APP_NAME], { capture: true, allowFail: true });
  const pid = Number(pidInfo.stdout.trim()) || null;

  writeState({
    port,
    pid,
    startedAt: new Date().toISOString(),
  });

  console.log(`✅ Clawtrol running at http://localhost:${port}`);
}

function stop() {
  run('pm2', ['stop', APP_NAME], { allowFail: true });
  run('pm2', ['delete', APP_NAME], { allowFail: true });
  cleanupState();
  console.log('🛑 Clawtrol stopped');
}

async function restart() {
  stop();
  await start();
}

function status() {
  const state = readState();
  const desc = run('pm2', ['describe', APP_NAME], { capture: true, allowFail: true });
  if (desc.status !== 0 || !desc.stdout.trim()) {
    console.log('❌ Clawtrol is not running');
    if (state.port) console.log(`Last known port: ${state.port}`);
    return;
  }

  const out = desc.stdout;
  const uptime = (out.match(/uptime\s*│\s*([^\n]+)/) || [])[1]?.trim();
  const memory = (out.match(/memory\s*│\s*([^\n]+)/) || [])[1]?.trim();
  const pid = Number((out.match(/pid\s*│\s*(\d+)/) || [])[1]) || state.pid || null;

  console.log('✅ Clawtrol is running');
  if (state.port) console.log(`URL: http://localhost:${state.port}`);
  if (pid) console.log(`PID: ${pid}`);
  if (uptime) console.log(`Uptime: ${uptime}`);
  if (memory) console.log(`Memory: ${memory}`);
}

function logs() {
  run('pm2', ['logs', APP_NAME, '--lines', '50']);
}

const cmd = process.argv[2];

switch (cmd) {
  case 'start':
    await start();
    break;
  case 'stop':
    stop();
    break;
  case 'restart':
    await restart();
    break;
  case 'status':
    status();
    break;
  case 'logs':
    logs();
    break;
  default:
    console.log('Usage: node bin/daemon.mjs <start|stop|restart|status|logs> [--port <port>]');
    process.exit(1);
}
