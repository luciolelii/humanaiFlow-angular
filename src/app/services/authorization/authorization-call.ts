import { AuthorizationCallServiceBase } from "./authorization-call.base";
import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  AdminUser,
  ChangePasswordRequest,
  User,
  UserRegistration,
  UserRole
} from "@models/user";
import { catchError, map, Observable, throwError } from "rxjs";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";

export class AuthorizationCallService extends AuthorizationCallServiceBase {
    private readonly http = inject(HttpClient);

    override login(username: string, password: string): Observable<User> {
         return this.http
            .post<unknown>(`${environment.apiUrl}/auth/login`, { username, password })
            .pipe(
                map((raw) => {
                    const payload = (raw ?? {}) as Record<string, unknown>;
                    const userSource =
                      (payload["user"] as Record<string, unknown> | undefined)
                      ?? (payload["profile"] as Record<string, unknown> | undefined)
                      ?? payload;
                    const token = this.extractToken(payload, userSource);

                    return {
                        username: String(userSource["username"] ?? username),
                        email: typeof userSource["email"] === "string" ? String(userSource["email"]) : null,
                        role: this.normalizeRole(userSource["role"]),
                        token: typeof token === "string" && token.length > 0 ? token : undefined
                    } satisfies User;
                }),
                catchError((error: unknown) => {
                  if (error instanceof HttpErrorResponse && error.status === 404) {
                    return throwError(() => new Error('User not found'));
                  }
                  if (error instanceof HttpErrorResponse && error.status === 401) {
                    return throwError(() => new Error('Invalid password'));
                  }
                  return throwError(() => error);
                })
            );
    }
    override register(userRegistration: UserRegistration): Observable<void> {
         return this.http.post<void>(`${environment.apiUrl}/auth/register`, userRegistration)
           .pipe(
             catchError((error: unknown) => this.toHttpError(error, {
               400: 'Unable to register user.'
             }))
           );
    }

    override changePassword(request: ChangePasswordRequest): Observable<void> {
         return this.http
            .post(`${environment.apiUrl}/auth/change-password`, request, { responseType: 'text' })
            .pipe(
                map(() => undefined),
                catchError((error: unknown) => {
                  if (error instanceof HttpErrorResponse) {
                    const message = this.extractHttpErrorMessage(error)
                      ?? (error.status === 400 ? 'Missing required fields.' : null)
                      ?? (error.status === 401 ? 'Current password is invalid' : null)
                      ?? (error.status === 404 ? 'User not found' : null)
                      ?? 'Unable to change password.';
                    return throwError(() => new Error(message));
                  }
                  return throwError(() => error);
                })
            );
    }

    override listAdminUsers(): Observable<AdminUser[]> {
      return this.http
        .get<unknown[]>(`${environment.apiUrl}/auth/admin/users`)
        .pipe(
          map((raw) => Array.isArray(raw) ? raw.map((item) => this.adminUserFromApi(item)) : []),
          catchError((error: unknown) => this.toHttpError(error, {
            403: 'Admin access required.'
          }))
        );
    }

    override createAdminUser(request: AdminCreateUserRequest): Observable<void> {
      return this.http
        .post<void>(`${environment.apiUrl}/auth/admin/users`, request)
        .pipe(
          catchError((error: unknown) => this.toHttpError(error, {
            400: 'Unable to create user.',
            403: 'Admin access required.'
          }))
        );
    }

    override changeAdminUserPassword(username: string, request: AdminResetPasswordRequest): Observable<void> {
      return this.http
        .put<void>(`${environment.apiUrl}/auth/admin/users/${encodeURIComponent(username)}/password`, request)
        .pipe(
          catchError((error: unknown) => this.toHttpError(error, {
            400: 'Unable to update password.',
            403: 'Admin access required.',
            404: `User ${username} not found`
          }))
        );
    }

    override changeAdminUserRole(username: string, request: AdminChangeRoleRequest): Observable<void> {
      return this.http
        .put<void>(`${environment.apiUrl}/auth/admin/users/${encodeURIComponent(username)}/role`, request)
        .pipe(
          catchError((error: unknown) => this.toHttpError(error, {
            400: 'Unable to update role.',
            403: 'Admin access required.',
            404: `User ${username} not found`,
            409: 'LAST_ADMIN'
          }))
        );
    }

    override deleteAdminUser(username: string): Observable<void> {
      return this.http
        .delete<void>(`${environment.apiUrl}/auth/admin/users/${encodeURIComponent(username)}`)
        .pipe(
          catchError((error: unknown) => this.toHttpError(error, {
            403: 'Admin access required.',
            404: `User ${username} not found`,
            409: 'LAST_ADMIN'
          }))
        );
    }

    private extractHttpErrorMessage(error: HttpErrorResponse): string | null {
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
      }
      return null;
    }

    private extractToken(...sources: Array<Record<string, unknown> | undefined>): unknown {
      const tokenKeys = ['token', 'accessToken', 'access_token', 'jwt', 'id_token'];
      for (const source of sources) {
        if (!source) continue;
        for (const key of tokenKeys) {
          const value = source[key];
          if (typeof value === 'string' && value.length > 0) {
            return value;
          }
        }
      }
      return undefined;
    }

    private normalizeRole(value: unknown): UserRole {
      return String(value ?? '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
    }

    private adminUserFromApi(raw: unknown): AdminUser {
      const value = (raw ?? {}) as Record<string, unknown>;
      return {
        username: String(value['username'] ?? ''),
        email: typeof value['email'] === 'string' ? value['email'] : null,
        role: this.normalizeRole(value['role'])
      };
    }

    private toHttpError(error: unknown, fallbackByStatus: Record<number, string>): Observable<never> {
      if (error instanceof HttpErrorResponse) {
        const message = this.extractHttpErrorMessage(error)
          ?? fallbackByStatus[error.status]
          ?? 'Request failed.';
        return throwError(() => new Error(message));
      }
      return throwError(() => error);
    }
}
