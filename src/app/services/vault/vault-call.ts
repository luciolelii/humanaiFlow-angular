import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@environment';
import { VaultSecret, VaultSecretCreateRequest, VaultSecretUpdateRequest } from '@models/assistant';
import { extractHttpErrorMessage } from '@services/shared/http-error.util';
import { catchError, map, Observable, throwError } from 'rxjs';
import { CREDENTIAL_ERROR_MESSAGES } from './credential-error-messages';
import { mapVaultSecret, mapVaultSecrets, VaultCallServiceBase } from './vault-call.base';

export class VaultCallService extends VaultCallServiceBase {
  private readonly http = inject(HttpClient);

  override listSecrets(): Observable<VaultSecret[]> {
    return this.http.get<unknown>(`${environment.apiUrl}/vault/secrets`).pipe(
      map((raw) => mapVaultSecrets(raw)),
      catchError((error: unknown) => this.vaultError(error))
    );
  }

  override createSecret(request: VaultSecretCreateRequest): Observable<VaultSecret> {
    return this.http.post<unknown>(`${environment.apiUrl}/vault/secrets`, request).pipe(
      map((raw) => mapVaultSecret(raw)),
      catchError((error: unknown) => this.vaultError(error))
    );
  }

  override updateSecret(id: string, request: VaultSecretUpdateRequest): Observable<VaultSecret> {
    return this.http.put<unknown>(`${environment.apiUrl}/vault/secrets/${encodeURIComponent(id)}`, request).pipe(
      map((raw) => mapVaultSecret(raw)),
      catchError((error: unknown) => this.vaultError(error))
    );
  }

  override deleteSecret(id: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/vault/secrets/${encodeURIComponent(id)}`).pipe(
      catchError((error: unknown) => this.vaultError(error))
    );
  }

  private vaultError(error: unknown): Observable<never> {
    const response = error as { status?: unknown; error?: unknown };
    const message = extractHttpErrorMessage(response as any)
      ?? CREDENTIAL_ERROR_MESSAGES[Number(response?.status)]
      ?? 'Unable to update provider credentials.';
    return throwError(() => new Error(message));
  }
}
