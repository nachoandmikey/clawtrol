import { NextResponse } from 'next/server';
import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

async function getMacMemory() {
  try {
    const { stdout } = await execAsync('vm_stat');
    const pageSize = 16384;
    const stats: Record<string, number> = {};
    
    for (const line of stdout.trim().split('\n').slice(1)) {
      const parts = line.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const val = parseInt(parts[1].trim().replace('.', '')) * pageSize;
        stats[key] = val;
      }
    }
    
    const total = 16 * 1024 ** 3; // 16GB Mac mini
    const free = stats['Pages free'] || 0;
    const speculative = stats['Pages speculative'] || 0;
    const active = stats['Pages active'] || 0;
    const wired = stats['Pages wired down'] || 0;
    const inactive = stats['Pages inactive'] || 0;
    const purgeable = stats['Pages purgeable'] || 0;
    
    const actuallyUsed = active + wired;
    const available = free + speculative + inactive + purgeable;
    
    return {
      total,
      used: actuallyUsed,
      free: available,
      usedPercent: (actuallyUsed / total) * 100,
      // Detailed breakdown
      active,
      wired,
      inactive,
      purgeable,
      rawFree: free + speculative,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [cpu, mem, disk, osInfo, time, load, temp] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.time(),
      si.currentLoad(),
      si.cpuTemperature(),
    ]);

    // Use accurate macOS memory stats
    const macMem = await getMacMemory();
    const memory = macMem || {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      usedPercent: (mem.used / mem.total) * 100,
    };

    return NextResponse.json({
      cpu: {
        model: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed,
        load: load.currentLoad,
      },
      memory,
      disk: disk.map(d => ({
        fs: d.fs,
        size: d.size,
        used: d.used,
        available: d.available,
        usedPercent: d.use,
        mount: d.mount,
      })),
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        hostname: osInfo.hostname,
        arch: osInfo.arch,
      },
      uptime: time.uptime,
      temperature: temp.main,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('System info error:', error);
    return NextResponse.json({ error: 'Failed to get system info' }, { status: 500 });
  }
}
