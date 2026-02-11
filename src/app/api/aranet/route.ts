import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const LATEST_FILE = 'os.homedir()/.openclaw/aranet-latest.json';
const STATE_FILE = 'os.homedir()/.openclaw/aranet-state.json';

export async function GET() {
  try {
    // Check if latest reading exists
    if (!existsSync(LATEST_FILE)) {
      return NextResponse.json({
        error: 'No Aranet data yet',
        hint: 'Waiting for first reading from monitor script',
      }, { status: 404 });
    }

    const latestData = JSON.parse(await readFile(LATEST_FILE, 'utf-8'));
    
    // Get alert state
    let alertState = { alerted_1000: false, alerted_1400: false, alerted_2000: false };
    if (existsSync(STATE_FILE)) {
      alertState = JSON.parse(await readFile(STATE_FILE, 'utf-8'));
    }

    // Calculate age of reading
    const ageMs = Date.now() - latestData.timestamp;
    const ageMinutes = Math.floor(ageMs / 60000);

    // Determine CO2 level category
    let level: 'excellent' | 'good' | 'fair' | 'poor' | 'bad' = 'excellent';
    if (latestData.co2 >= 2000) level = 'bad';
    else if (latestData.co2 >= 1400) level = 'poor';
    else if (latestData.co2 >= 1000) level = 'fair';
    else if (latestData.co2 >= 800) level = 'good';

    return NextResponse.json({
      ...latestData,
      level,
      ageMinutes,
      stale: ageMinutes > 10, // Mark as stale if older than 10 min
      alerts: alertState,
    });
  } catch (error) {
    console.error('Aranet error:', error);
    return NextResponse.json({ error: 'Failed to get Aranet data' }, { status: 500 });
  }
}
