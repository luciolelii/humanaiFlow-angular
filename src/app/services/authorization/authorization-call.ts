import { AuthorizationCallServiceBase } from "./authorization-call.base";
import {
  ChangePasswordRequest,
  User,
  UserRegistration,
  UserRole
} from "@models/user";
import { catchError, map, Observable, of, throwError } from "rxjs";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";

export class AuthorizationCallService extends AuthorizationCallServiceBase {
    private readonly http = inject(HttpClient);

    override login(username: string, password: string): Observable<User> {
         return this.http
            .post<unknown>(`${environment.apiUrl}/auth/login`, { username, password })
            .pipe(
                map((raw) => this.userFromApi(raw, username)),
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

    override currentUser(): Observable<User> {
      return this.http
        .get<unknown>(`${environment.apiUrl}/auth/me`)
        .pipe(
          map((raw) => this.userFromApi(raw)),
          catchError((error: unknown) => this.toHttpError(error, {
            401: 'Unauthenticated'
          }))
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

    private userFromApi(raw: unknown, fallbackUsername?: string): User {
      const payload = (raw ?? {}) as Record<string, unknown>;
      const userSource =
        (payload["user"] as Record<string, unknown> | undefined)
        ?? (payload["profile"] as Record<string, unknown> | undefined)
        ?? payload;

      return {
        username: String(userSource["username"] ?? fallbackUsername ?? ''),
        email: typeof userSource["email"] === "string" ? String(userSource["email"]) : null,
        role: this.normalizeRole(userSource["role"])
      } satisfies User;
    }

    private normalizeRole(value: unknown): UserRole {
      return String(value ?? '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
    }

    override logout(): Observable<void> {
      return this.http
        .post<void>(`${environment.apiUrl}/auth/logout`, {})
        .pipe(
          map(() => undefined),
          catchError(() => of(undefined))
        );
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
