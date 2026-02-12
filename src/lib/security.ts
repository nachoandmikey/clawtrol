import { execFile as nodeExecFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(nodeExecFile);

/**
 * Validate input against a regex pattern. Throws if invalid.
 */
export function validateInput(input: string, pattern: RegExp, label: string): string {
  if (!pattern.test(input)) {
    throw new Error(`Invalid ${label}: ${input}`);
  }
  return input;
}

/** Only alphanumeric, dashes, underscores, dots */
export const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

/** Numeric only */
export const NUMERIC = /^[0-9]+$/;

/** Alphanumeric + dashes (for cron IDs etc.) */
export const ALPHANUM_DASH = /^[a-zA-Z0-9-]+$/;

/**
 * Safe wrapper around child_process.execFile (no shell interpolation).
 */
export function execSafe(binary: string, args: string[], options?: { timeout?: number }) {
  return execFileAsync(binary, args, { timeout: 30000, ...options });
}
