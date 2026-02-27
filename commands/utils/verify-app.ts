/**
 * Shared utility: check whether the dev app is running (server + client ports).
 *
 * This is a CHECK-ONLY utility — it never spawns processes or kills ports.
 * Spawning belongs in the developer's terminal (`npm run start:dev`),
 * not in the tier command pipeline.
 *
 * Called by tier orchestrators (tier-start, tier-end) when the tier config
 * declares `preflight.ensureAppRunning`. Individual tier impls should NOT
 * import this directly — that keeps infrastructure concerns out of business logic.
 */

import * as net from 'net';

const SERVER_PORT = 3001;
const CLIENT_PORT = 3002;

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

/**
 * Verify the app is running. Returns a structured result for tier orchestrators.
 * If the app is not fully up, returns a failure with an actionable message.
 */
export async function verifyApp(): Promise<VerifyAppResult> {
  const status = await checkAppRunning();

  if (status.running) {
    return {
      success: true,
      output: `App running (server :${SERVER_PORT} ✓, client :${CLIENT_PORT} ✓).`,
    };
  }

  const down = [
    !status.serverUp ? `server :${SERVER_PORT}` : null,
    !status.clientUp ? `client :${CLIENT_PORT}` : null,
  ].filter(Boolean).join(', ');

  return {
    success: false,
    output: [
      `App not fully running — ${down} not responding.`,
      'Start the dev environment in a terminal: `npm run start:dev`',
      'Then re-run the command.',
    ].join('\n'),
  };
}
