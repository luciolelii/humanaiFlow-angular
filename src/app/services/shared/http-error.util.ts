import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

/**
 * Reads a human-readable message out of a backend error body, trying the
 * conventional `message`/`error`/`details`/`detail` string fields in that order.
 */
export function extractHttpErrorMessage(error: HttpErrorResponse): string | null {
  const payload = error.error;
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const directMessage = record['message'];
    if (typeof directMessage === 'string' && directMessage.trim().length > 0) {
      return directMessage.trim();
    }
    const errorMessage = record['error'];
    if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
      return errorMessage.trim();
    }
    const details = record['details'];
    if (typeof details === 'string' && details.trim().length > 0) {
      return details.trim();
    }
    // RFC 7807 ProblemDetail, which the execution endpoints answer with.
    const detail = record['detail'];
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail.trim();
    }
  }
  return null;
}

/**
 * Converts any thrown/caught value into an `Observable` error carrying a
 * human-readable `Error`: prefers the backend's own message, falls back to
 * a status-keyed message, then a generic one. Existing `Error`s pass through.
 */
export function toHttpError(error: unknown, fallbackByStatus: Record<number, string>): Observable<never> {
  if (error instanceof HttpErrorResponse) {
    const message = extractHttpErrorMessage(error)
      ?? fallbackByStatus[error.status]
      ?? 'Request failed.';
    return throwError(() => new Error(message));
  }
  if (error instanceof Error) {
    return throwError(() => error);
  }
  return throwError(() => new Error('Request failed.'));
}
