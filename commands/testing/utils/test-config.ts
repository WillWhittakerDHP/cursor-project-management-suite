/**
 * Global Test Configuration
 * 
 * Centralized test configuration with environment variable overrides.
 * This allows fine-grained control over test behavior across all commands.
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

// Load from environment variables with defaults
export const TEST_CONFIG: TestConfig = {
  enabled: process.env.CURSOR_TESTS_ENABLED !== 'false',
  defaultRunTests: process.env.CURSOR_TESTS_DEFAULT !== 'false',
  validateGoals: process.env.CURSOR_TESTS_VALIDATE_GOALS !== 'false',
  analyzeErrors: process.env.CURSOR_TESTS_ANALYZE_ERRORS !== 'false',
  allowTestFileFixes: process.env.CURSOR_TESTS_ALLOW_FIXES !== 'false',
  blocking: process.env.CURSOR_TESTS_BLOCKING !== 'false',
  catchUpEnabled: process.env.CURSOR_TESTS_CATCHUP !== 'false',
  defaultTarget: (process.env.CURSOR_TESTS_TARGET as any) || 'vue',
  
  // Watch mode configuration
  watchMode: {
    enabled: isNonInteractive ? false : process.env.CURSOR_TESTS_WATCH_ENABLED !== 'false',
    smartDetection: process.env.CURSOR_TESTS_WATCH_SMART_DETECTION !== 'false',
    detectionWindow: parseInt(process.env.CURSOR_TESTS_WATCH_DETECTION_WINDOW || '5', 10),
    foregroundOnFailure: process.env.CURSOR_TESTS_WATCH_FOREGROUND_ON_FAILURE !== 'false',
    autoRestartAfterFix: process.env.CURSOR_TESTS_WATCH_AUTO_RESTART !== 'false',
  },
  
  // Prompt-driven resolution configuration
  promptResolution: {
    enabled: isNonInteractive ? false : process.env.CURSOR_TESTS_PROMPT_RESOLUTION !== 'false',
    autoFixTestCode: process.env.CURSOR_TESTS_AUTO_FIX_TEST_CODE === 'true',
    autoFixAppCode: process.env.CURSOR_TESTS_AUTO_FIX_APP_CODE === 'true',
  },
};

