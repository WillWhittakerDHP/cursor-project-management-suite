/**
 * Shared utility: check whether the dev app is running (server + client ports).
 *
 * When auto-start is enabled (see `harnessAutoStartDevEnabled`), a failed first check
 * triggers one attempt to spawn `npm run start:dev` from the repo root, then polls
 * until both ports respond or a timeout is reached.
 *
 * Called by tier orchestrators (tier-start, tier-end) when the tier config
 * declares `preflight.ensureAppRunning`. Individual tier impls should NOT
 * import this directly — that keeps infrastructure concerns out of business logic.
 */

import { spawn } from 'child_process';
import * as net from 'net';
import { PROJECT_ROOT } from './utils';

const SERVER_PORT = 3001;
const CLIENT_PORT = 3002;

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_AFTER_SPAWN_MS = 120_000;
const INITIAL_SPAWN_SETTLE_MS = 3000;

/**
 * Auto-start is off when explicitly disabled, or in CI unless explicitly enabled.
 * Local default: on (matches dual-port verify + `npm run start:dev`).
 */
export function harnessAutoStartDevEnabled(): boolean {
  const explicit = process.env.HARNESS_AUTO_START_DEV?.trim().toLowerCase();
  if (explicit === '0' || explicit === 'false') {
    return false;
  }
  if (explicit === '1' || explicit === 'true') {
    return true;
  }
  const ci = process.env.CI?.trim().toLowerCase();
  if (ci === 'true' || ci === '1') {
    return false;
  }
  return true;
}

/**
 * Try a single TCP connect to host:port. Resolves true on success, false on
 * error or timeout.
 */
function checkPortOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);

    socket.once('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Connect-based port check: resolves true if something is accepting connections.
 * Tries IPv4 first, then falls back to IPv6 so it works regardless of whether
 * the service bound to 127.0.0.1, 0.0.0.0, ::1, or ::.
 */
async function checkPort(port: number): Promise<boolean> {
  if (await checkPortOnHost(port, '127.0.0.1')) return true;
  return checkPortOnHost(port, '::1');
}

export interface AppStatus {
  running: boolean;
  serverUp: boolean;
  clientUp: boolean;
  serverPort: number;
  clientPort: number;
}

/**
 * Check-only: returns which ports are responding.
 * No side-effects — never spawns or kills anything.
 */
export async function checkAppRunning(): Promise<AppStatus> {
  const [serverUp, clientUp] = await Promise.all([
    checkPort(SERVER_PORT),
    checkPort(CLIENT_PORT),
  ]);
  return {
    running: serverUp && clientUp,
    serverUp,
    clientUp,
    serverPort: SERVER_PORT,
    clientPort: CLIENT_PORT,
  };
}

export interface VerifyAppResult {
  success: boolean;
  output: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function spawnStartDev(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: { ok: boolean; error?: string }): void => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    try {
      const child = spawn('npm', ['run', 'start:dev'], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      child.on('error', (err: Error) => {
        finish({ ok: false, error: err.message });
      });
      child.unref();
      queueMicrotask(() => finish({ ok: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      finish({ ok: false, error: msg });
    }
  });
}

async function waitForAppUp(deadlineMs: number): Promise<AppStatus> {
  for (;;) {
    const status = await checkAppRunning();
    if (status.running) {
      return status;
    }
    if (Date.now() >= deadlineMs) {
      return status;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * Verify the app is running. Returns a structured result for tier orchestrators.
 * If the app is not fully up, returns a failure with an actionable message.
 * May spawn `npm run start:dev` once when `harnessAutoStartDevEnabled()` is true.
 */
export async function verifyApp(): Promise<VerifyAppResult> {
  let status = await checkAppRunning();

  if (status.running) {
    return {
      success: true,
      output: `App running (server :${SERVER_PORT} ✓, client :${CLIENT_PORT} ✓).`,
    };
  }

  const downParts = [
    !status.serverUp ? `server :${SERVER_PORT}` : null,
    !status.clientUp ? `client :${CLIENT_PORT}` : null,
  ].filter(Boolean) as string[];

  if (harnessAutoStartDevEnabled()) {
    const spawnResult = await spawnStartDev();
    if (!spawnResult.ok) {
      return {
        success: false,
        output: [
          `App not fully running — ${downParts.join(', ')} not responding.`,
          `Auto-start failed: ${spawnResult.error ?? 'unknown error'}`,
          'Start manually: `npm run start:dev`',
        ].join('\n'),
      };
    }
    await sleep(INITIAL_SPAWN_SETTLE_MS);
    const deadline = Date.now() + MAX_WAIT_AFTER_SPAWN_MS;
    status = await waitForAppUp(deadline);
    if (status.running) {
      return {
        success: true,
        output: `App running after auto-start (server :${SERVER_PORT} ✓, client :${CLIENT_PORT} ✓).`,
      };
    }
    const stillDown = [
      !status.serverUp ? `server :${SERVER_PORT}` : null,
      !status.clientUp ? `client :${CLIENT_PORT}` : null,
    ].filter(Boolean) as string[];
    return {
      success: false,
      output: [
        `App still not fully running after auto-start (${MAX_WAIT_AFTER_SPAWN_MS / 1000}s) — ${stillDown.join(', ')} not responding.`,
        'Check terminal output from `npm run start:dev`, or start the stack manually and re-run the command.',
        'To skip auto-start: `HARNESS_AUTO_START_DEV=0`',
      ].join('\n'),
    };
  }

  const autoHint =
    process.env.HARNESS_AUTO_START_DEV?.trim().toLowerCase() === '0' ||
    process.env.HARNESS_AUTO_START_DEV?.trim().toLowerCase() === 'false'
      ? 'Auto-start was disabled via `HARNESS_AUTO_START_DEV=0`.'
      : 'Auto-start is off in CI unless you set `HARNESS_AUTO_START_DEV=1`.';
  return {
    success: false,
    output: [
      `App not fully running — ${downParts.join(', ')} not responding.`,
      'Start the dev environment in a terminal: `npm run start:dev`',
      'Then re-run the command.',
      autoHint,
    ].join('\n'),
  };
}
