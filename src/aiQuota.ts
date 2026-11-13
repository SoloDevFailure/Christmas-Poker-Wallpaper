// Retry delays come from the database's server clock, not the phone's wall clock.
export function retryDelay(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 86400 ? Math.ceil(value) : undefined;
}
export class AiConversionError extends Error {
  constructor(message: string, public retryable: boolean, public requestId: string, public ambiguous = false, public retryAfterSeconds?: number) { super(message); }
}
export type AiAllowance = { available: boolean; message?: string; retryable?: boolean; retryAfterSeconds?: number };
export function allowanceResult(result: Record<string, unknown>, ok: boolean): AiAllowance {
  return { available: ok && result.available === true,
    message: typeof result.error === 'string' ? result.error : 'AI conversion is unavailable. Your original photo is still here.',
    retryable: result.retryable === true, retryAfterSeconds: retryDelay(result.retry_after_seconds) };
}
export function waitMessage(seconds: number): string {
  return seconds > 0 ? 'Next allowance in about ' + Math.ceil(seconds / 60) + ' min.' : 'Checking your AI allowance…';
}
