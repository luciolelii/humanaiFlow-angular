import { Injectable, signal } from '@angular/core';
import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  ChangePasswordRequest,
  OperationsStatistics,
  User,
  UserRegistration,
  UserStatistics
} from '@models/user';
import { AuthorizationCallServiceBase } from './authorization-call.base';
import { environment } from '@environment';
import { Observable, catchError, take, tap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Authorization {
  static readonly USER_STORAGE_KEY = 'loggedInUser';

  private user = signal<User | null>(null);

  authCall: AuthorizationCallServiceBase = new environment.authorizationCallService();

  loggedInUser = this.user.asReadonly();

  login(username: string, password: string) {
    return this.authCall.login(username, password).pipe(
      take(1),
      tap(res => {
        const normalizedUser = this.normalizeUser(res);
        this.user.set(normalizedUser);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(Authorization.USER_STORAGE_KEY, JSON.stringify(normalizedUser));
          }
        } catch {
          // Ignore storage errors (e.g. quota exceeded, private browsing).
        }
      }),
      catchError((err) => {
        console.error('Login failed', err);
        return throwError(() => err);
      })
    );
  }

  signup(userRegistration: UserRegistration) {
    return this.authCall.register(userRegistration).pipe(
      take(1)
    );
  }

  changePassword(request: ChangePasswordRequest) {
    return this.authCall.changePassword(request).pipe(
      take(1)
    );
  }

  listAdminUsers() {
    return this.authCall.listAdminUsers().pipe(
      take(1)
    );
  }

  createAdminUser(request: AdminCreateUserRequest) {
    return this.authCall.createAdminUser(request).pipe(
      take(1)
    );
  }

  changeAdminUserPassword(username: string, request: AdminResetPasswordRequest) {
    return this.authCall.changeAdminUserPassword(username, request).pipe(
      take(1)
    );
  }

  changeAdminUserRole(username: string, request: AdminChangeRoleRequest) {
    return this.authCall.changeAdminUserRole(username, request).pipe(
      take(1)
    );
  }

  deleteAdminUser(username: string) {
    return this.authCall.deleteAdminUser(username).pipe(
      take(1)
    );
  }

  getOperationsStatistics() {
    return this.authCall.getOperationsStatistics().pipe(
      take(1)
    );
  }

  listStatisticsUsers() {
    return this.authCall.listStatisticsUsers().pipe(
      take(1)
    );
  }

  getUserStatistics(username: string) {
    return this.authCall.getUserStatistics(username).pipe(
      take(1)
    );
  }

  logout(): Observable<void> {
    return this.authCall.logout().pipe(
      take(1),
      tap(() => {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(Authorization.USER_STORAGE_KEY);
          }
        } catch {
          // Ignore storage errors.
        }
        this.user.set(null);
      })
    );
  }

  isLoggedIn(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const storedUser = localStorage.getItem(Authorization.USER_STORAGE_KEY);
    const normalizedUser = storedUser != null ? this.normalizeUser(JSON.parse(storedUser) as User) : null;
    this.user.set(normalizedUser);
    return storedUser != null;
  }

  isAdmin(): boolean {
    const currentUser = this.loggedInUser() ?? (this.isLoggedIn() ? this.loggedInUser() : null);
    return currentUser?.role === 'ADMIN';
  }

  private normalizeUser(user: User | null): User | null {
    if (!user) return null;
    return {
      username: String(user.username ?? ''),
      email: typeof user.email === 'string' ? user.email : null,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'USER'
    };
  }

}
