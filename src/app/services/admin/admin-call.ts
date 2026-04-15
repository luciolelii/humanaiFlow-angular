import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  AdminUser,
  OperationsStatistics,
  UserStatistics,
  UserRole
} from "@models/user";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { environment } from "@environment";
import { catchError, map, Observable, throwError } from "rxjs";
import { AdminCallServiceBase } from "./admin-call.base";

export class AdminCallService extends AdminCallServiceBase {
  private readonly http = inject(HttpClient);

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

  override getOperationsStatistics(): Observable<OperationsStatistics> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/stats`)
      .pipe(
        map((raw) => this.operationsStatisticsFromApi(raw)),
        catchError((error: unknown) => this.toHttpError(error, {
          401: 'Unauthenticated',
          403: 'You are not allowed to view user statistics'
        }))
      );
  }

  override listStatisticsUsers(): Observable<string[]> {
    return this.http
      .get<unknown[]>(`${environment.apiUrl}/stats/users`)
      .pipe(
        map((raw) => Array.isArray(raw)
          ? raw.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter((item) => item.length > 0)
          : []),
        catchError((error: unknown) => this.toHttpError(error, {
          401: 'Unauthenticated',
          403: 'You are not allowed to view user statistics'
        }))
      );
  }

  override getUserStatistics(username: string): Observable<UserStatistics> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/stats/users/${encodeURIComponent(username)}`)
      .pipe(
        map((raw) => this.userStatisticsFromApi(raw, username)),
        catchError((error: unknown) => this.toHttpError(error, {
          401: 'Unauthenticated',
          403: 'You are not allowed to view user statistics',
          404: 'User not found'
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

  private userStatisticsFromApi(raw: unknown, username: string): UserStatistics {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      username: String(value['username'] ?? username),
      flowsCreated: Number(value['flowsCreated'] ?? 0),
      flowsPublished: Number(value['flowsPublished'] ?? 0),
      flowsFinalized: Number(value['flowsFinalized'] ?? 0),
      executionsCreated: Number(value['executionsCreated'] ?? 0),
      executionsRunning: Number(value['executionsRunning'] ?? 0),
      executionsSucceeded: Number(value['executionsSucceeded'] ?? 0),
      executionsFailed: Number(value['executionsFailed'] ?? 0),
      simulationsStarted: Number(value['simulationsStarted'] ?? 0),
      loginCount: Number(value['loginCount'] ?? 0),
      avgSessionDurationSeconds: Number(value['avgSessionDurationSeconds'] ?? 0),
      lastLoginAt: typeof value['lastLoginAt'] === 'string' ? value['lastLoginAt'] : null,
      lastFlowUpdateAt: typeof value['lastFlowUpdateAt'] === 'string' ? value['lastFlowUpdateAt'] : null,
      lastExecutionAt: typeof value['lastExecutionAt'] === 'number' ? value['lastExecutionAt'] : null
    };
  }

  private operationsStatisticsFromApi(raw: unknown): OperationsStatistics {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      usersCount: Number(value['usersCount'] ?? 0),
      flowsCreated: Number(value['flowsCreated'] ?? 0),
      flowsPublished: Number(value['flowsPublished'] ?? 0),
      flowsFinalized: Number(value['flowsFinalized'] ?? 0),
      executionsCreated: Number(value['executionsCreated'] ?? 0),
      executionsRunning: Number(value['executionsRunning'] ?? 0),
      executionsSucceeded: Number(value['executionsSucceeded'] ?? 0),
      executionsFailed: Number(value['executionsFailed'] ?? 0),
      simulationsStarted: Number(value['simulationsStarted'] ?? 0),
      lastFlowUpdateAt: typeof value['lastFlowUpdateAt'] === 'string' ? value['lastFlowUpdateAt'] : null,
      lastExecutionAt: typeof value['lastExecutionAt'] === 'number' ? value['lastExecutionAt'] : null
    };
  }

  private toHttpError(error: unknown, fallbackByStatus: Record<number, string>): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      const message = this.extractHttpErrorMessage(error)
        ?? fallbackByStatus[error.status]
        ?? 'Request failed.';
      return throwError(() => new Error(message));
    }
    if (error instanceof Error) {
      return throwError(() => error);
    }
    return throwError(() => new Error('Request failed.'));
  }
}
