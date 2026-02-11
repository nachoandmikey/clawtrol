import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = 'os.homedir()/.openclaw/control-center';
const ALERT_STATE_FILE = join(DATA_DIR, 'usage-alerts.json');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const ALERT_CHAT_ID = 'GROUP_ID';
const ALERT_TOPIC_ID = 342;

// Thresholds for alerts
const FIVE_HOUR_THRESHOLDS = [75, 90, 95, 100];
const WEEKLY_THRESHOLDS = [50, 75, 90, 95, 100];

interface AlertState {
  fiveHourAlerted: number[];
  weeklyAlerted: number[];
  fiveHourResetAt: number | null;
  weeklyResetAt: number | null;
  lastCheck: number;
  lastAuthError: number | null;
  authErrorAlerted: boolean;
}

async function loadAlertState(): Promise<AlertState> {
  try {
    const data = await readFile(ALERT_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      fiveHourAlerted: [],
      weeklyAlerted: [],
      fiveHourResetAt: null,
      weeklyResetAt: null,
      lastCheck: 0,
      lastAuthError: null,
      authErrorAlerted: false,
    };
  }
}

async function saveAlertState(state: AlertState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ALERT_STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendTelegramAlert(message: string): Promise<boolean> {
  try {
    const config = JSON.parse(
      await readFile('os.homedir()/.openclaw/openclaw.json', 'utf-8')
    );
    const botToken = config?.channels?.telegram?.botToken || TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      console.error('No Telegram bot token found');
      return false;
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ALERT_CHAT_ID,
        message_thread_id: ALERT_TOPIC_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    return res.ok;
  } catch (error) {
    console.error('Failed to send Telegram alert:', error);
    return false;
  }
}

function getAlertEmoji(percent: number): string {
  if (percent >= 100) return '🔴';
  if (percent >= 95) return '🟠';
  if (percent >= 90) return '🟡';
  if (percent >= 75) return '🟡';
  return '⚠️';
}

function formatResetTime(resetAt: string | null): { time: string; relative: string } | null {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  const now = new Date();
  
  const time = date.toLocaleString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Madrid'
  });
  
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return { time, relative: 'now' };
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  let relative: string;
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    relative = `in ${diffDays}d ${remainingHours}h`;
  } else if (diffHours > 0) {
    const remainingMins = diffMins % 60;
    relative = `in ${diffHours}h ${remainingMins}m`;
  } else {
    relative = `in ${diffMins}m`;
  }
  
  return { time, relative };
}

function getCredentials(): { accessToken: string | null; expiresAt: number | null } {
  try {
    const creds = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    const parsed = JSON.parse(creds);
    return {
      accessToken: parsed?.claudeAiOauth?.accessToken || null,
      expiresAt: parsed?.claudeAiOauth?.expiresAt || null,
    };
  } catch {
    return { accessToken: null, expiresAt: null };
  }
}

function refreshToken(): boolean {
  try {
    // Run a simple claude command to trigger token refresh
    // The CLI automatically refreshes expired tokens
    console.log('[claude-usage] Refreshing token via CLI...');
    execSync('echo "hi" | claude --print --max-turns 1 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log('[claude-usage] Token refresh triggered');
    return true;
  } catch (error) {
    console.error('[claude-usage] Token refresh failed:', error);
    return false;
  }
}

export async function GET() {
  const state = await loadAlertState();
  
  try {
    // Get credentials
    let { accessToken, expiresAt } = getCredentials();
    
    // Check if token is expired or will expire in next 5 minutes
    const now = Date.now();
    const tokenExpired = expiresAt && now > expiresAt - 5 * 60 * 1000;
    
    if (!accessToken || tokenExpired) {
      console.log(`[claude-usage] Token ${!accessToken ? 'missing' : 'expired'}, attempting refresh...`);
      
      // Try to refresh
      const refreshed = refreshToken();
      
      if (refreshed) {
        // Re-read credentials after refresh
        const newCreds = getCredentials();
        accessToken = newCreds.accessToken;
        expiresAt = newCreds.expiresAt;
      }
      
      if (!accessToken) {
        // Still no token - alert if we haven't recently
        if (!state.authErrorAlerted) {
          await sendTelegramAlert(
            '⚠️ <b>Claude Max Usage Monitor Auth Failed</b>\n\n' +
            'Token expired and auto-refresh failed.\n' +
            'Run <code>claude /login</code> to fix.'
          );
          state.authErrorAlerted = true;
          state.lastAuthError = now;
          await saveAlertState(state);
        }
        return NextResponse.json({ error: 'No OAuth token after refresh attempt' }, { status: 401 });
      }
    }

    // Make API request
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    });

    if (!response.ok) {
      // API error - might be token issue even if not expired
      if (response.status === 401 || response.status === 403) {
        console.log('[claude-usage] API returned auth error, attempting refresh...');
        
        const refreshed = refreshToken();
        if (refreshed) {
          const newCreds = getCredentials();
          if (newCreds.accessToken) {
            // Retry with new token
            const retryResponse = await fetch('https://api.anthropic.com/api/oauth/usage', {
              headers: {
                'Authorization': `Bearer ${newCreds.accessToken}`,
                'anthropic-beta': 'oauth-2025-04-20',
              },
            });
            
            if (retryResponse.ok) {
              // Success after refresh - continue with this response
              const usage = await retryResponse.json();
              return processUsageResponse(usage, state);
            }
          }
        }
        
        // Refresh didn't help - alert
        if (!state.authErrorAlerted) {
          await sendTelegramAlert(
            '⚠️ <b>Claude Max Usage Monitor Auth Failed</b>\n\n' +
            `API returned ${response.status} and refresh didn't help.\n` +
            'Run <code>claude /login</code> to fix.'
          );
          state.authErrorAlerted = true;
          state.lastAuthError = now;
          await saveAlertState(state);
        }
      }
      return NextResponse.json({ error: 'API error', status: response.status }, { status: response.status });
    }

    // Success - clear any auth error state
    if (state.authErrorAlerted) {
      state.authErrorAlerted = false;
      state.lastAuthError = null;
    }

    const usage = await response.json();
    return processUsageResponse(usage, state);
    
  } catch (error) {
    console.error('Alert check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function processUsageResponse(usage: any, state: AlertState) {
  const fiveHourPercent = Math.round(usage.five_hour?.utilization ?? 0);
  const weeklyPercent = Math.round(usage.seven_day?.utilization ?? 0);
  const fiveHourResetAt = usage.five_hour?.resets_at ? new Date(usage.five_hour.resets_at).getTime() : null;
  const weeklyResetAt = usage.seven_day?.resets_at ? new Date(usage.seven_day.resets_at).getTime() : null;

  const alerts: string[] = [];

  // Reset alerted thresholds if we're in a new window
  if (fiveHourResetAt && state.fiveHourResetAt && fiveHourResetAt !== state.fiveHourResetAt) {
    state.fiveHourAlerted = [];
  }
  if (weeklyResetAt && state.weeklyResetAt && weeklyResetAt !== state.weeklyResetAt) {
    state.weeklyAlerted = [];
  }

  // Check 5-hour thresholds
  for (const threshold of FIVE_HOUR_THRESHOLDS) {
    if (fiveHourPercent >= threshold && !state.fiveHourAlerted.includes(threshold)) {
      const emoji = getAlertEmoji(threshold);
      const reset = formatResetTime(usage.five_hour?.resets_at);
      const resetStr = reset ? `${reset.time} (${reset.relative})` : '?';
      alerts.push(`${emoji} <b>5-Hour Usage: ${fiveHourPercent}%</b>\nResets: ${resetStr}`);
      state.fiveHourAlerted.push(threshold);
    }
  }

  // Check weekly thresholds
  for (const threshold of WEEKLY_THRESHOLDS) {
    if (weeklyPercent >= threshold && !state.weeklyAlerted.includes(threshold)) {
      const emoji = getAlertEmoji(threshold);
      const reset = formatResetTime(usage.seven_day?.resets_at);
      const resetStr = reset ? `${reset.time} (${reset.relative})` : '?';
      alerts.push(`${emoji} <b>Weekly Usage: ${weeklyPercent}%</b>\nResets: ${resetStr}`);
      state.weeklyAlerted.push(threshold);
    }
  }

  // Update state
  state.fiveHourResetAt = fiveHourResetAt;
  state.weeklyResetAt = weeklyResetAt;
  state.lastCheck = Date.now();
  await saveAlertState(state);

  // Send alerts
  let alertsSent = 0;
  for (const alert of alerts) {
    const sent = await sendTelegramAlert(alert);
    if (sent) alertsSent++;
  }

  return NextResponse.json({
    checked: true,
    fiveHourPercent,
    weeklyPercent,
    alertsTriggered: alerts.length,
    alertsSent,
    state,
    timestamp: Date.now(),
  });
}
