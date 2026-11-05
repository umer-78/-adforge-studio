import { AppError } from '@adforge/core';
import { PlatformError, ProviderNotConfiguredError } from '@adforge/core/server';

/** Thrown inside a handler when the job was canceled or the worker is shutting down. */
export class JobAborted extends Error {
  constructor(readonly reason: 'canceled' | 'shutdown' | 'lease_lost') {
    super(reason === 'canceled' ? 'Canceled' : reason === 'shutdown' ? 'Worker shutting down' : 'Lost the job lease');
    this.name = 'JobAborted';
  }
}

/** A failure that will not go away on retry (bad input, missing configuration, policy). */
export class PermanentError extends AppError {
  constructor(message: string, code = 'job_failed') {
    super(code, message, 422);
    this.name = 'PermanentError';
  }
}

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT']);
const TRANSIENT_APP_CODES = new Set(['fetch_timeout', 'fetch_failed', 'provider_unavailable', 'provider_rate_limited', 'mux_error']);

export function isRetryable(err: unknown): boolean {
  if (err instanceof JobAborted || err instanceof PermanentError || err instanceof ProviderNotConfiguredError) return false;
  if (err instanceof PlatformError) return err.retryable && !err.authExpired;
  if (err instanceof AppError) return err.status >= 500 || err.status === 429 || TRANSIENT_APP_CODES.has(err.code);
  const e = err as { code?: string; cause?: { code?: string }; message?: string };
  if (TRANSIENT_CODES.has(e.code ?? '') || TRANSIENT_CODES.has(e.cause?.code ?? '')) return true;
  if (/fetch failed|socket hang up|network|timed? ?out/i.test(e.message ?? '')) return true;
  // Unknown errors (renderer crashes, provider hiccups) get the job's normal retry budget.
  return !(err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError);
}

/** A message safe to show to the user; internal details stay in the logs. */
export function userMessage(err: unknown): string {
  if (err instanceof AppError || err instanceof ProviderNotConfiguredError || err instanceof JobAborted) return err.message;
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 600 ? `${message.slice(0, 600)}…` : message;
}
