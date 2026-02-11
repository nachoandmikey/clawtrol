import { NextResponse } from 'next/server';
import si from 'systeminformation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [networkInterfaces, networkStats, networkConnections] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats(),
      si.networkConnections(),
    ]);

    return NextResponse.json({
      interfaces: (networkInterfaces as si.Systeminformation.NetworkInterfacesData[])
        .filter(i => i.ip4 && i.ip4 !== '127.0.0.1')
        .map(i => ({
          name: i.iface,
          ip: i.ip4,
          mac: i.mac,
          type: i.type,
          speed: i.speed,
        })),
      stats: (networkStats as si.Systeminformation.NetworkStatsData[]).map(s => ({
        iface: s.iface,
        rx: s.rx_bytes,
        tx: s.tx_bytes,
        rxSec: s.rx_sec,
        txSec: s.tx_sec,
      })),
      connections: networkConnections.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Network error:', error);
    return NextResponse.json({ error: 'Failed to get network info' }, { status: 500 });
  }
}
