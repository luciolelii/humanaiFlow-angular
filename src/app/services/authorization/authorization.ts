import { Injectable, signal } from '@angular/core';
import { User, UserRegistration } from '@models/user';
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
        this.user.set(res);
        localStorage.setItem(Authorization.USER_STORAGE_KEY, JSON.stringify(res));
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
    this.user.set(storedUser != null ? JSON.parse(storedUser) : null);
    return storedUser != null;
  }

}
