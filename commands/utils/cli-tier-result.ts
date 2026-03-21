/**
 * Stable JSON emission for tier command CLI entrypoints (npx tsx …-impl.ts).
 * Always prints one JSON object to stdout so agents can parse even on throw or stringify failure.
 */

export function stringifyCliResult(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    return JSON.stringify(
      {
        success: false,
        cliSerializationFailed: true,
        error: e instanceof Error ? e.message : String(e),
      },
      null,
      2
    );
  }
}

export function buildCliUnhandledErrorEnvelope(err: unknown): Record<string, unknown> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  return {
    success: false,
    unhandledError: true,
    message,
    ...(stack ? { stack } : {}),
    outcome: {
      status: 'failed',
      reasonCode: 'unhandled_error',
      nextAction: 'See message/stack; fix and retry the tier command.',
    },
  };
}

export function buildCliValidationErrorEnvelope(message: string): Record<string, unknown> {
  return {
    success: false,
    cliValidationError: true,
    message,
  };
}
