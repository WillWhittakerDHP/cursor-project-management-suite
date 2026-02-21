/**
 * Global Test Configuration
 * 
 * Centralized test configuration with environment variable overrides.
 * This allows fine-grained control over test behavior across all commands.
 * 
 * MASTER SWITCH: Set TEST_ENABLED=true to activate all testing.
 * Currently defaults to OFF (tests delayed until Phase 3.0 of the project plan).
 * This same env var is respected by the audit system via isTestingEnabled()
 * in frontend-root/.scripts/shared-audit-utils.mjs, providing a single toggle for
 * both command prompts and audit scripts.
 */

export interface WatchModeConfig {
  enabled: boolean; // Enable watch mode in checkpoints (true)
  smartDetection: boolean; // Enable smart detection (true)
  detectionWindow: number; // File modification window in minutes (5)
  foregroundOnFailure: boolean; // Stay in foreground on failure (true)
  autoRestartAfterFix: boolean; // Restart watch after fix (true)
}

export interface PromptResolutionConfig {
  enabled: boolean; // Enable prompt-driven resolution (true)
  autoFixTestCode: boolean; // Auto-fix test code errors (false, requires permission)
  autoFixAppCode: boolean; // Auto-fix app code errors (false, requires user action)
}

export interface TestConfig {
  // Master switches
  enabled: boolean; // Master test enable/disable
  defaultRunTests: boolean; // Default for runTests parameter (true)
  
  // Feature toggles
  validateGoals: boolean; // Run goal validation (true)
  analyzeErrors: boolean; // Run error analysis (true)
  allowTestFileFixes: boolean; // Allow test file modifications (true)
  
  // Behavior
  blocking: boolean; // Block workflow on test failure (true)
  catchUpEnabled: boolean; // Enable catch-up test flow (true)
  
  // Targets
  defaultTarget: 'vue' | 'server' | 'all'; // Default test target
  
  // Watch mode settings
  watchMode: WatchModeConfig;
  
  // Prompt-driven resolution
  promptResolution: PromptResolutionConfig;
}

// Check if running in non-interactive environment
const isNonInteractive = process.env.CI === 'true' || 
                         process.env.CURSOR_NON_INTERACTIVE === 'true';

// Master switch: tests default to OFF until TEST_ENABLED=true
const testsEnabled = process.env.TEST_ENABLED === 'true';

// Load from environment variables with defaults
// When testsEnabled is false, all sub-features also default to false.
// Individual sub-features can still be overridden via their own env vars.
export const TEST_CONFIG: TestConfig = {
  enabled: testsEnabled,
  defaultRunTests: testsEnabled && process.env.CURSOR_TESTS_DEFAULT !== 'false',
  validateGoals: testsEnabled && process.env.CURSOR_TESTS_VALIDATE_GOALS !== 'false',
  analyzeErrors: testsEnabled && process.env.CURSOR_TESTS_ANALYZE_ERRORS !== 'false',
  allowTestFileFixes: testsEnabled && process.env.CURSOR_TESTS_ALLOW_FIXES !== 'false',
  blocking: testsEnabled && process.env.CURSOR_TESTS_BLOCKING !== 'false',
  catchUpEnabled: testsEnabled && process.env.CURSOR_TESTS_CATCHUP !== 'false',
  defaultTarget: (process.env.CURSOR_TESTS_TARGET as 'vue' | 'server' | 'all') || 'vue',
  
  // Watch mode configuration
  watchMode: {
    enabled: testsEnabled && !isNonInteractive && process.env.CURSOR_TESTS_WATCH_ENABLED !== 'false',
    smartDetection: testsEnabled && process.env.CURSOR_TESTS_WATCH_SMART_DETECTION !== 'false',
    detectionWindow: parseInt(process.env.CURSOR_TESTS_WATCH_DETECTION_WINDOW || '5', 10),
    foregroundOnFailure: testsEnabled && process.env.CURSOR_TESTS_WATCH_FOREGROUND_ON_FAILURE !== 'false',
    autoRestartAfterFix: testsEnabled && process.env.CURSOR_TESTS_WATCH_AUTO_RESTART !== 'false',
  },
  
  // Prompt-driven resolution configuration
  promptResolution: {
    enabled: testsEnabled && !isNonInteractive && process.env.CURSOR_TESTS_PROMPT_RESOLUTION !== 'false',
    autoFixTestCode: testsEnabled && process.env.CURSOR_TESTS_AUTO_FIX_TEST_CODE === 'true',
    autoFixAppCode: testsEnabled && process.env.CURSOR_TESTS_AUTO_FIX_APP_CODE === 'true',
  },
};

