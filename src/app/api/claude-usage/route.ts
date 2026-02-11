import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

function formatResetTime(resetAt: string | null): string | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'now';
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays}d ${remainingHours}h`;
  }
  if (diffHours > 0) {
    const remainingMins = diffMins % 60;
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}

export async function GET() {
  try {
    // Get OAuth token from macOS Keychain
    const creds = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    
    const parsed = JSON.parse(creds);
    const token = parsed?.claudeAiOauth?.accessToken;
    
    if (!token) {
      return NextResponse.json({ error: 'No OAuth token found' }, { status: 401 });
    }

    // Fetch usage from Anthropic API
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `API error: ${response.status}` },
        { status: response.status }
      );
    }

    const usage = await response.json();
    
    // Format for dashboard (matching expected structure)
    return NextResponse.json({
      fiveHour: {
        percent: Math.round(usage.five_hour?.utilization ?? 0),
        resetIn: formatResetTime(usage.five_hour?.resets_at),
        resetAt: usage.five_hour?.resets_at ? new Date(usage.five_hour.resets_at).getTime() : null,
      },
      weekly: {
        percent: Math.round(usage.seven_day?.utilization ?? 0),
        resetIn: formatResetTime(usage.seven_day?.resets_at),
        resetAt: usage.seven_day?.resets_at ? new Date(usage.seven_day.resets_at).getTime() : null,
      },
      opus: usage.seven_day_opus ? {
        percent: Math.round(usage.seven_day_opus.utilization ?? 0),
        resetIn: formatResetTime(usage.seven_day_opus.resets_at),
      } : null,
      sonnet: usage.seven_day_sonnet ? {
        percent: Math.round(usage.seven_day_sonnet.utilization ?? 0),
        resetIn: formatResetTime(usage.seven_day_sonnet.resets_at),
      } : null,
      extraUsage: usage.extra_usage?.is_enabled ? {
        used: usage.extra_usage.used_credits,
        limit: usage.extra_usage.monthly_limit,
        percent: Math.round(usage.extra_usage.utilization ?? 0),
      } : null,
      timestamp: Date.now(),
      source: 'live',
    });
  } catch (error) {
    console.error('Claude usage error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
