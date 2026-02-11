import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const CRON_FILE = 'os.homedir()/.openclaw/cron/jobs.json';

export async function GET() {
  try {
    const raw = await readFile(CRON_FILE, 'utf-8');
    const data = JSON.parse(raw);
    
    return NextResponse.json({
      jobs: data.jobs || [],
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: 'Failed to get cron jobs', jobs: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, id } = await request.json();
    
    if (!action || !id) {
      return NextResponse.json({ error: 'Missing action or id' }, { status: 400 });
    }

    switch (action) {
      case 'toggle': {
        const data = JSON.parse(await readFile(CRON_FILE, 'utf-8'));
        const job = data.jobs.find((j: any) => j.id === id);
        if (job) {
          job.enabled = !job.enabled;
          job.updatedAtMs = Date.now();
          await writeFile(CRON_FILE, JSON.stringify(data, null, 2));
          return NextResponse.json({ success: true, message: `Job ${job.enabled ? 'enabled' : 'disabled'}` });
        }
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      case 'trigger':
        try {
          await execAsync(`openclaw cron run "${id}"`, { timeout: 10000 });
          return NextResponse.json({ success: true, message: 'Job triggered' });
        } catch (error) {
          console.error('Failed to trigger job:', error);
          return NextResponse.json({ error: 'Failed to trigger job' }, { status: 500 });
        }

      case 'delete': {
        const delData = JSON.parse(await readFile(CRON_FILE, 'utf-8'));
        const jobIndex = delData.jobs.findIndex((j: any) => j.id === id);
        if (jobIndex >= 0) {
          delData.jobs.splice(jobIndex, 1);
          await writeFile(CRON_FILE, JSON.stringify(delData, null, 2));
          return NextResponse.json({ success: true, message: 'Job deleted' });
        }
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Cron POST error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
