import { Injectable, signal } from '@angular/core';
import {
  ChangePasswordRequest,
  User,
  UserRegistration
} from '@models/user';
import { AuthorizationCallServiceBase } from './authorization-call.base';
import { environment } from '@environment';
import { Observable, catchError, finalize, map, of, shareReplay, take, tap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Authorization {
  static readonly USER_STORAGE_KEY = 'loggedInUser';

  private user = signal<User | null>(null);
  private sessionValidation$: Observable<User | null> | null = null;

  authCall: AuthorizationCallServiceBase = new environment.authorizationCallService();

  loggedInUser = this.user.asReadonly();

  constructor() {
    this.restoreUserFromStorage();
  }

  login(username: string, password: string) {
    return this.authCall.login(username, password).pipe(
      take(1),
      tap(res => {
        this.persistUserState(res);
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

  logout(): Observable<void> {
    return this.authCall.logout().pipe(
      take(1),
      tap(() => this.clearUserState())
    );
  }

  isLoggedIn(): boolean {
    return this.loggedInUser() != null;
  }

  isAdmin(): boolean {
    return this.loggedInUser()?.role === 'ADMIN';
  }

  validateSession(): Observable<User | null> {
    if (this.sessionValidation$) {
      return this.sessionValidation$;
    }

    this.sessionValidation$ = this.authCall.currentUser().pipe(
      take(1),
      map((user) => this.normalizeUser(user)),
      tap((user) => this.persistUserState(user)),
      catchError(() => {
        this.clearUserState();
        return of(null);
      }),
      finalize(() => {
        this.sessionValidation$ = null;
      }),
      shareReplay(1)
    );

    return this.sessionValidation$;
  }

  private normalizeUser(user: User | null): User | null {
    if (!user) return null;
    return {
      username: String(user.username ?? ''),
      email: typeof user.email === 'string' ? user.email : null,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'USER'
    };
  }

  private restoreUserFromStorage() {
    if (typeof localStorage === 'undefined') return;

    try {
      const storedUser = localStorage.getItem(Authorization.USER_STORAGE_KEY);
      if (!storedUser) return;
      this.user.set(this.normalizeUser(JSON.parse(storedUser) as User));
    } catch {
      this.clearUserState();
    }
  }

  private persistUserState(user: User | null) {
    const normalizedUser = this.normalizeUser(user);
    this.user.set(normalizedUser);

    try {
      if (typeof localStorage === 'undefined') return;
      if (normalizedUser) {
        localStorage.setItem(Authorization.USER_STORAGE_KEY, JSON.stringify(normalizedUser));
      } else {
        localStorage.removeItem(Authorization.USER_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors (e.g. quota exceeded, private browsing).
    }
  }

  private clearUserState() {
    this.persistUserState(null);
  }

}
