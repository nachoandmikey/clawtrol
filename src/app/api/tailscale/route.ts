import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

interface TailscalePeer {
  TailscaleIPs?: string[];
  HostName?: string;
  DNSName?: string;
  OS?: string;
  Online?: boolean;
  LastSeen?: string;
  Active?: boolean;
}

interface TailscaleStatus {
  Self?: TailscalePeer;
  Peer?: Record<string, TailscalePeer>;
  MagicDNSSuffix?: string;
}

export async function GET() {
  try {
    const { stdout } = await execAsync('tailscale status --json 2>/dev/null', { timeout: 10000 });
    const status: TailscaleStatus = JSON.parse(stdout);
    
    return NextResponse.json({
      self: {
        ip: status.Self?.TailscaleIPs?.[0],
        hostname: status.Self?.HostName,
        dnsName: status.Self?.DNSName?.replace(/\.$/, ''),
        os: status.Self?.OS,
        online: status.Self?.Online,
      },
      peers: Object.values(status.Peer || {}).map((p) => ({
        ip: p.TailscaleIPs?.[0],
        hostname: p.HostName,
        dnsName: p.DNSName?.replace(/\.$/, ''),
        os: p.OS,
        online: p.Online,
        lastSeen: p.LastSeen,
        active: p.Active,
      })),
      magicDNS: status.MagicDNSSuffix,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Tailscale status error:', error);
    return NextResponse.json({ error: 'Failed to get tailscale status' }, { status: 500 });
  }
}
