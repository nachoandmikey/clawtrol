#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = resolve(__dirname, '..');

// ── Modules ──────────────────────────────────────────────────────────

const ALL_MODULES = [
  { id: 'overview',   label: 'Overview',    desc: 'System stats — CPU, RAM, disk, uptime, weather' },
  { id: 'screen',     label: 'Screen',      desc: 'Remote screen viewer with click interaction' },
  { id: 'terminal',   label: 'Terminal',    desc: 'Web terminal via ttyd PTY' },
  { id: 'files',      label: 'Files',       desc: 'File browser with read & zip' },
  { id: 'sessions',   label: 'Sessions',    desc: 'OpenClaw session viewer & chat' },
  { id: 'tasks',      label: 'Tasks',       desc: 'Kanban task board' },
  { id: 'memory',     label: 'Memory',      desc: 'Memory & markdown file browser' },
  { id: 'cron',       label: 'Cron',        desc: 'Cron job manager' },
  { id: 'logs',       label: 'Logs',        desc: 'Gateway log viewer' },
  { id: 'network',    label: 'Network',     desc: 'Tailscale peers & processes' },
  { id: 'subagents',  label: 'Sub-agents',  desc: 'Sub-agent management' },
];

// ── Helpers ──────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise((res) => rl.question(question, res));
}

function print(msg = '') {
  process.stdout.write(msg + '\n');
}

function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }

// ── Banner ───────────────────────────────────────────────────────────

function showBanner() {
  print();
  print(cyan('   ____  _                   _              _ '));
  print(cyan('  / ___|| |  __ _  __      _| |_  _ __  ___| |'));
  print(cyan(' | |    | | / _` | \\ \\ /\\ / / __|| \'__|/ _ \\ |'));
  print(cyan(' | |___ | || (_| |  \\ V  V /| |_ | |  | (_) | |'));
  print(cyan('  \\____||_| \\__,_|   \\_/\\_/  \\__||_|   \\___/|_|'));
  print();
  print(bold('  Open-source dashboard for OpenClaw AI agents'));
  print(dim('  https://github.com/nachoandmikey/clawtrol'));
  print();
}

// ── Init Command ─────────────────────────────────────────────────────

async function runInit() {
  showBanner();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // 1. Project name
    const projectName = (await ask(rl, `${bold('Project name')} ${dim('(clawtrol)')}: `)).trim() || 'clawtrol';

    // 2. Dashboard title
    const title = (await ask(rl, `${bold('Dashboard title')} ${dim('(Clawtrol Center)')}: `)).trim() || 'Clawtrol Center';

    // 3. Module selection
    print();
    print(bold('Modules') + ' ' + dim('(all enabled by default — type numbers to toggle off)'));
    print();
    const enabled = new Array(ALL_MODULES.length).fill(true);
    ALL_MODULES.forEach((m, i) => {
      print(`  ${green(`[${i + 1}]`)} ${m.label.padEnd(12)} ${dim(m.desc)}`);
    });
    print();
    const toggleInput = (await ask(rl, `${bold('Toggle off')} ${dim('(e.g. 1,3,5 or press Enter for all)')}: `)).trim();
    if (toggleInput) {
      const nums = toggleInput.split(/[\s,]+/).map(Number).filter(n => n >= 1 && n <= ALL_MODULES.length);
      for (const n of nums) enabled[n - 1] = false;
    }
    const selectedModules = ALL_MODULES.filter((_, i) => enabled[i]).map(m => m.id);

    // 4. Theme preset + mode
    print();
    print(bold('Theme preset:'));
    print(`  ${green('1.')} 🟢 Nova ${dim('(cyberpunk command center) — default')}`);
    print(`  ${green('2.')} 🔵 Midnight ${dim('(clean dark minimal)')}`);
    print(`  ${green('3.')} 🟣 Catppuccin ${dim('(warm pastel dark)')}`);
    print(`  ${green('4.')} ☀️ Solar ${dim('(light solarized)')}`);
    const presetInput = (await ask(rl, `${bold('Preset')} ${dim('(1-4, default 1)')}: `)).trim();
    const presetMap = { '1': 'nova', '2': 'midnight', '3': 'catppuccin', '4': 'solar' };
    const themePreset = presetMap[presetInput] || 'nova';

    const themeInput = (await ask(rl, `${bold('Mode')} — ${green('1')} dark ${dim('(default)')} / ${green('2')} light / ${green('3')} system: `)).trim();
    const themeMode = themeInput === '2' ? 'light' : themeInput === '3' ? 'system' : 'dark';

    // 5. OpenClaw API URL
    const apiUrl = (await ask(rl, `${bold('OpenClaw API URL')} ${dim('(http://localhost:3000)')}: `)).trim() || 'http://localhost:3000';

    rl.close();

    // ── Summary ──
    print();
    print(bold('  --- Setup Summary ---'));
    print(`  Project:  ${cyan(projectName)}`);
    print(`  Title:    ${title}`);
    print(`  Modules:  ${selectedModules.length}/${ALL_MODULES.length} enabled`);
    print(`  Theme:    ${themePreset} (${themeMode})`);
    print(`  API URL:  ${apiUrl}`);
    print();

    // ── Scaffold ──
    const dest = resolve(process.cwd(), projectName);

    if (existsSync(dest)) {
      print(yellow(`  Directory "${projectName}" already exists. Aborting.`));
      process.exit(1);
    }

    print(dim('  Scaffolding project...'));
    mkdirSync(dest, { recursive: true });

    // Copy template files (exclude node_modules/, .git/, .next/)
    const SKIP = new Set(['node_modules', '.git', '.next']);
    const entries = readdirSync(PKG_ROOT);
    for (const entry of entries) {
      if (SKIP.has(entry)) continue;
      const src = join(PKG_ROOT, entry);
      const dst = join(dest, entry);

      // Only copy daemon runtime script from bin/ (not the CLI itself)
      if (entry === 'bin') {
        mkdirSync(dst, { recursive: true });
        cpSync(join(src, 'daemon.mjs'), join(dst, 'daemon.mjs'));
        continue;
      }

      cpSync(src, dst, { recursive: true });
    }

    // ── Generate clawtrol.config.ts ──
    const modulesStr = selectedModules.map(m => `    '${m}',`).join('\n');

    // Parse port from apiUrl
    let gatewayPort = 3000;
    try {
      const u = new URL(apiUrl);
      if (u.port) gatewayPort = parseInt(u.port, 10);
    } catch {}

    const configContent = `import type { ClawtrolConfig } from './src/lib/config';

const config: ClawtrolConfig = {
  title: '${title.replace(/'/g, "\\'")}',

  modules: [
${modulesStr}
  ],

  theme: {
    preset: '${themePreset}',
    mode: '${themeMode}',
    accent: '#3b82f6',
  },

  openclaw: {
    gatewayPort: ${gatewayPort},
  },

  port: 4781,
};

export default config;
`;

    writeFileSync(join(dest, 'clawtrol.config.ts'), configContent);

    // ── Install deps ──
    print(dim('  Installing dependencies...'));
    print();
    try {
      execSync('npm install', { cwd: dest, stdio: 'inherit' });
    } catch {
      print(yellow('\n  npm install failed — you can run it manually later.'));
    }

    // ── Success ──
    print();
    print(green('  Done! Your Clawtrol dashboard is ready.'));
    print();
    print(`  ${bold('Next steps:')}`);
    print(`    cd ${projectName}`);
    print(`    npm run dev`);
    print();
    print(dim(`  Then open http://localhost:4781`));
    print();
  } catch (err) {
    rl.close();
    throw err;
  }
}

// ── Dev Command ──────────────────────────────────────────────────────

function runDev() {
  const child = spawn('npx', ['next', 'dev', '--port', '3001'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// ── Build Command ────────────────────────────────────────────────────

function runBuild() {
  const child = spawn('npx', ['next', 'build'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// ── Plugin Commands ──────────────────────────────────────────────────

function readConfigPlugins() {
  const configPath = resolve(process.cwd(), 'clawtrol.config.ts');
  if (!existsSync(configPath)) {
    print(yellow('  No clawtrol.config.ts found in current directory.'));
    process.exit(1);
  }
  const content = readFileSync(configPath, 'utf-8');
  // Extract plugins array from config
  const match = content.match(/plugins\s*:\s*\[([\s\S]*?)\]/);
  if (!match) return [];
  return match[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
}

function writeConfigPlugins(plugins) {
  const configPath = resolve(process.cwd(), 'clawtrol.config.ts');
  let content = readFileSync(configPath, 'utf-8');
  const pluginsStr = plugins.length > 0
    ? plugins.map(p => `    '${p}',`).join('\n')
    : '';
  const pluginsBlock = `plugins: [\n${pluginsStr}\n  ]`;

  if (content.includes('plugins:')) {
    content = content.replace(/plugins\s*:\s*\[[\s\S]*?\]/, pluginsBlock);
  } else {
    // Add plugins before theme
    content = content.replace(
      /(theme\s*:)/,
      `${pluginsBlock},\n\n  $1`
    );
  }
  writeFileSync(configPath, content);
}

function runPluginAdd(name) {
  if (!name) {
    print(yellow('  Usage: clawtrol add <plugin-name>'));
    process.exit(1);
  }

  const pkgName = name.startsWith('clawtrol-plugin-') ? name : `clawtrol-plugin-${name}`;
  const shortName = name.replace(/^clawtrol-plugin-/, '');

  print(dim(`  Installing ${pkgName}...`));
  try {
    execSync(`npm install ${pkgName}`, { cwd: process.cwd(), stdio: 'inherit' });
  } catch {
    print(yellow(`\n  Failed to install ${pkgName}.`));
    process.exit(1);
  }

  // Add to config
  const plugins = readConfigPlugins();
  if (!plugins.includes(shortName)) {
    plugins.push(shortName);
    writeConfigPlugins(plugins);
    print(green(`  Added "${shortName}" to clawtrol.config.ts plugins.`));
  } else {
    print(dim(`  Plugin "${shortName}" already in config.`));
  }

  print();
  print(green(`  Plugin "${shortName}" installed successfully!`));
  print(dim('  Restart the dev server to load the plugin.'));
  print();
}

function runPluginRemove(name) {
  if (!name) {
    print(yellow('  Usage: clawtrol remove <plugin-name>'));
    process.exit(1);
  }

  const pkgName = name.startsWith('clawtrol-plugin-') ? name : `clawtrol-plugin-${name}`;
  const shortName = name.replace(/^clawtrol-plugin-/, '');

  // Remove from config
  const plugins = readConfigPlugins();
  const idx = plugins.indexOf(shortName);
  if (idx !== -1) {
    plugins.splice(idx, 1);
    writeConfigPlugins(plugins);
    print(green(`  Removed "${shortName}" from clawtrol.config.ts plugins.`));
  } else {
    print(dim(`  Plugin "${shortName}" not found in config.`));
  }

  print(dim(`  Uninstalling ${pkgName}...`));
  try {
    execSync(`npm uninstall ${pkgName}`, { cwd: process.cwd(), stdio: 'inherit' });
  } catch {
    print(yellow(`\n  Failed to uninstall ${pkgName}.`));
  }

  print();
  print(green(`  Plugin "${shortName}" removed.`));
  print();
}

function runPluginsList() {
  const plugins = readConfigPlugins();
  print();
  if (plugins.length === 0) {
    print(dim('  No plugins installed.'));
    print();
    print(`  Use ${cyan('clawtrol add <name>')} to install a plugin.`);
  } else {
    print(bold('  Installed plugins:'));
    print();
    for (const p of plugins) {
      const pkgName = `clawtrol-plugin-${p}`;
      let version = '';
      try {
        const pkgPath = resolve(process.cwd(), 'node_modules', pkgName, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          version = dim(` v${pkg.version}`);
        }
      } catch {}
      print(`    ${green('●')} ${p}${version}  ${dim(`(${pkgName})`)}`);
    }
  }
  print();
}

// ── CLI Router ───────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'init':
    runInit().catch((err) => {
      console.error(err);
      process.exit(1);
    });
    break;

  case 'dev':
    runDev();
    break;

  case 'build':
    runBuild();
    break;

  case 'add':
    runPluginAdd(process.argv[3]);
    break;

  case 'remove':
    runPluginRemove(process.argv[3]);
    break;

  case 'plugins':
    runPluginsList();
    break;

  default:
    showBanner();
    print(bold('  Usage:'));
    print(`    clawtrol ${green('init')}              Create a new Clawtrol project`);
    print(`    clawtrol ${green('dev')}               Start the dev server`);
    print(`    clawtrol ${green('build')}             Build for production`);
    print(`    clawtrol ${green('add')} ${dim('<plugin>')}     Install a plugin`);
    print(`    clawtrol ${green('remove')} ${dim('<plugin>')}  Remove a plugin`);
    print(`    clawtrol ${green('plugins')}           List installed plugins`);
    print();
    if (command) {
      print(yellow(`  Unknown command: "${command}"`));
      print();
    }
    break;
}
