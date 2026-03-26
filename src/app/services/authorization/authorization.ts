import { Injectable, signal } from '@angular/core';
import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  ChangePasswordRequest,
  User,
  UserRegistration
} from '@models/user';
import { AuthorizationCallServiceBase } from './authorization-call.base';
import { environment } from '@environment';
import { take, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Authorization {
  static readonly USER_STORAGE_KEY = 'loggedInUser';
  static readonly TOKEN_STORAGE_KEY = 'authToken';

  private user = signal<User | null>(null);

  authCall: AuthorizationCallServiceBase = new environment.authorizationCallService();

  loggedInUser = this.user.asReadonly();

  login(username: string, password: string) {
    return this.authCall.login(username, password).pipe(
      take(1),
      tap(res => {
        const normalizedUser = this.normalizeUser(res);
        if (normalizedUser) {
          console.log('[auth] logged user role:', normalizedUser.role);
        }
        this.user.set(normalizedUser);
        localStorage.setItem(Authorization.USER_STORAGE_KEY, JSON.stringify(normalizedUser));
        if (res.token) {
          localStorage.setItem(Authorization.TOKEN_STORAGE_KEY, res.token);
        } else {
          localStorage.removeItem(Authorization.TOKEN_STORAGE_KEY);
        }
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

  logout() {
    localStorage.removeItem(Authorization.USER_STORAGE_KEY);
    localStorage.removeItem(Authorization.TOKEN_STORAGE_KEY);
    this.user.set(null);
  }

  token(): string | null {
    return localStorage.getItem(Authorization.TOKEN_STORAGE_KEY);
  }

  isLoggedIn(): boolean {
    const storedUser = localStorage.getItem(Authorization.USER_STORAGE_KEY);
    const normalizedUser = storedUser != null ? this.normalizeUser(JSON.parse(storedUser) as User) : null;
    if (normalizedUser) {
      console.log('[auth] restored user role:', normalizedUser.role);
    }
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
      role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
      token: user.token
    };
  }

}
