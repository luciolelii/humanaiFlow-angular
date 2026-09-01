import { HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { extractHttpErrorMessage, toHttpError } from './http-error.util';

describe('extractHttpErrorMessage', () => {
  it('reads a plain string error body', () => {
    const error = new HttpErrorResponse({ error: 'Something broke', status: 400 });
    expect(extractHttpErrorMessage(error)).toBe('Something broke');
  });

  it('prefers message, then error, then details from an object body', () => {
    expect(extractHttpErrorMessage(new HttpErrorResponse({ error: { message: 'msg' }, status: 400 }))).toBe('msg');
    expect(extractHttpErrorMessage(new HttpErrorResponse({ error: { error: 'err' }, status: 400 }))).toBe('err');
    expect(extractHttpErrorMessage(new HttpErrorResponse({ error: { details: 'det' }, status: 400 }))).toBe('det');
    expect(extractHttpErrorMessage(new HttpErrorResponse({ error: { detail: 'problem detail' }, status: 400 }))).toBe('problem detail');
  });

  it('returns null when nothing usable is present', () => {
    expect(extractHttpErrorMessage(new HttpErrorResponse({ error: {}, status: 500 }))).toBeNull();
    expect(extractHttpErrorMessage(new HttpErrorResponse({ error: null, status: 500 }))).toBeNull();
  });
});

describe('toHttpError', () => {
  it('prefers the backend message over the status fallback', async () => {
    const error = new HttpErrorResponse({ error: { message: 'Backend said no' }, status: 400 });
    await expect(lastValueFrom(toHttpError(error, { 400: 'Fallback message' }))).rejects.toThrow('Backend said no');
  });

  it('falls back to the status-keyed message when the backend gives nothing usable', async () => {
    const error = new HttpErrorResponse({ error: {}, status: 403 });
    await expect(lastValueFrom(toHttpError(error, { 403: 'Admin access required.' }))).rejects.toThrow('Admin access required.');
  });

  it('falls back to a generic message when the status is not mapped', async () => {
    const error = new HttpErrorResponse({ error: {}, status: 418 });
    await expect(lastValueFrom(toHttpError(error, {}))).rejects.toThrow('Request failed.');
  });

  it('passes an existing Error straight through', async () => {
    await expect(lastValueFrom(toHttpError(new Error('boom'), {}))).rejects.toThrow('boom');
  });

  it('wraps a non-Error, non-HttpErrorResponse value in a generic error', async () => {
    await expect(lastValueFrom(toHttpError('a raw string', {}))).rejects.toThrow('Request failed.');
  });
});
