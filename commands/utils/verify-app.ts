/**
 * Atomic Command: /verify-app
 * Verify app starts on port 3002
 */

import { runCommand } from './utils';
import { spawn } from 'child_process';
import { createServer } from 'net';

/**
 * Check if a port is listening
 */
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Port is in use, which means something is listening
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    
    server.listen(port);
  });
}

/**
 * Verify app starts successfully
 * 
 * NOTE: This function requires 'all' permissions to:
 * - Access node_modules directory
 * - Execute npm commands
 * - Spawn child processes
 * 
 * When called from session-end command, permissions should be automatically granted.
 */
export async function verifyApp(): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    // Start the app in background with full restart (kills existing processes first)
    // NOTE: Requires 'all' permissions for file system access and process spawning
    const child = spawn('npm', ['run', 'restart:dev:vue'], {
      cwd: process.cwd(),
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
    
    // Wait 10 seconds for startup
    setTimeout(async () => {
      try {
        // Check if port 3002 is listening
        const isListening = await checkPort(3002);
        
        // Kill the process
        try {
          if (child.pid) {
            process.kill(-child.pid);
          }
        } catch (killError) {
          console.warn(
            `WARNING: Could not kill child process\n` +
            `PID: ${child.pid}\n` +
            `Error: ${killError instanceof Error ? killError.message : String(killError)}\n`
          );
        }
        
        if (isListening) {
          resolve({
            success: true,
            output: 'App started successfully on port 3002',
          });
        } else {
          resolve({
            success: false,
            output: 'Port 3002 is not responding. App may not have started correctly.',
          });
        }
      } catch (error: any) {
        // Kill the process
        try {
          if (child.pid) {
            process.kill(-child.pid);
          }
        } catch (killError) {
          console.warn(
            `WARNING: Could not kill child process\n` +
            `PID: ${child.pid}\n` +
            `Error: ${killError instanceof Error ? killError.message : String(killError)}\n`
          );
        }
        
        resolve({
          success: false,
          output: `ERROR: Failed to verify app\n` +
            `Port: 3002\n` +
            `Error Details: ${error.message || 'Port 3002 not responding'}\n` +
            `Suggestion: Check if port 3002 is available and app can start correctly`,
        });
      }
    }, 10000);
  });
}

