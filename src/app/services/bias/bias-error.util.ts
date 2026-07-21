import { BiasSideEffectError } from '@models/bias-impact';

/**
 * Extracts a human-readable message for a bias-related request failure.
 * Handles, in order: the typed side-effect conflict shape produced by
 * `TaskExecutionsService.toBiasOperationError` (409s), the backend's
 * `application/problem+json` body (`errors[].message`/`detail`, used by the
 * bias endpoints for 400s), a plain `Error`, then `fallback`.
 */
export function extractBiasErrorMessage(error: unknown, fallback: string): string {
  const sideEffectError = error as Partial<BiasSideEffectError>;
  if (sideEffectError.reason === 'SIDE_EFFECT_BLOCKED' || sideEffectError.reason === 'CONFIRMATION_REQUIRED') {
    return sideEffectError.message ?? fallback;
  }

  const body = (error as { error?: unknown })?.error;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const errors = Array.isArray(record['errors']) ? record['errors'] : [];
    const first = errors[0];
    if (first && typeof first === 'object' && typeof (first as Record<string, unknown>)['message'] === 'string') {
      return (first as Record<string, unknown>)['message'] as string;
    }
    if (typeof record['detail'] === 'string' && record['detail']) return record['detail'];
  }

  return error instanceof Error ? error.message : fallback;
}
