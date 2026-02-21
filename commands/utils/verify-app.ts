/**
 * Atomic Command: /verify-app
 * Verify app is up (server 3001, client 3002). Check first; only start if not listening.
 * Resolves project root by walking up from process.cwd() for package.json with start:dev and
 * scripts/start-dev.mjs, and uses that as cwd for `npm run start:dev`.
 */

import { spawn } from 'child_process';
import * as net from 'net';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/** Ports used by start-dev.mjs: server 3001, client (Vite) 3002 */
const SERVER_PORT = 3001;
const CLIENT_PORT = 3002;

/**
 * Find project root: directory that has package.json with "start:dev" and scripts/start-dev.mjs.
 * Walks up from process.cwd(); returns process.cwd() if none found (no throw).
 */
function getProjectRoot(): string {
  let dir = resolve(process.cwd());
  for (;;) {
    const pkgPath = join(dir, 'package.json');
    const startDevPath = join(dir, 'scripts', 'start-dev.mjs');
    if (existsSync(pkgPath) && existsSync(startDevPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
        if (pkg?.scripts?.['start:dev']) {
          return dir;
        }
      } catch (err) {
        console.warn('Verify app: package.json parse failed', pkgPath, err);
      }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Check if a port has something accepting connections (connect-based).
 * Connects to 127.0.0.1:port; if connect succeeds the port is in use. Works regardless of
 * whether the app bound to 127.0.0.1, 0.0.0.0, or :: (avoids bind-based IPv4/IPv6 mismatch).
 */
function checkPort(port: number): Promise<boolean> {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.once('error', (_err: any) => {
      clearTimeout(timeout);
      resolve(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Consider app "up" if client port is listening (Vite). Optionally require server too.
 */
async function isAppUp(): Promise<boolean> {
  const clientUp = await checkPort(CLIENT_PORT);
  if (!clientUp) return false;
  const serverUp = await checkPort(SERVER_PORT);
  return serverUp;
}

/**
 * Verify app is running. Checks ports first; only runs start:dev if not up.
 * Resolves project root by walking up from process.cwd() for package.json with
 * start:dev and scripts/start-dev.mjs, and uses that as cwd for `npm run start:dev`.
 *
 * NOTE: Requires 'all' permissions when starting the app (node_modules, spawn).
 * When called from session-end, permissions should be automatically granted.
 */
export async function verifyApp(): Promise<{ success: boolean; output: string }> {
  const up = await isAppUp();
  if (up) {
    return {
      success: true,
      output: `App already running (ports ${SERVER_PORT} and ${CLIENT_PORT} responding).`,
    };
  }

  const projectRoot = getProjectRoot();
  const child = spawn('npm', ['run', 'start:dev'], {
    cwd: projectRoot,
    stdio: 'pipe',
    detached: true,
  });

  let output = '';
  let errorOutput = '';

  child.stdout?.on('data', (data) => {
    output += data.toString();
  });
  child.stderr?.on('data', (data) => {
    errorOutput += data.toString();
  });

  const POLL_INTERVAL_MS = 3000;
  const SAFETY_TIMEOUT_MS = 600000;

  const startedAt = Date.now();
  const poll = async (): Promise<{ success: boolean; output: string }> => {
    const upNow = await isAppUp();
    if (upNow) {
      return {
        success: true,
        output: `App started successfully (ports ${SERVER_PORT} and ${CLIENT_PORT} responding). Left running in background.`,
      };
    }
    if (Date.now() - startedAt >= SAFETY_TIMEOUT_MS) {
      // Do not kill the spawned child: it may be the user's app or still starting. Just return failure.
      const errSnippet = errorOutput.trim().slice(-500) || output.trim().slice(-500);
      return {
        success: false,
        output: `Ports ${SERVER_PORT} and/or ${CLIENT_PORT} never came up within ${SAFETY_TIMEOUT_MS / 60000} min. Started \`npm run start:dev\` but it may have failed.${errSnippet ? ` Last output:\n${errSnippet}` : ''} Run \`npm run start:dev\` manually if needed and re-run.`,
      };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    return poll();
  };

  return poll();
}
