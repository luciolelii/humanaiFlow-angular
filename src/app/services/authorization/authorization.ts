import { effect, Injectable, signal } from '@angular/core';
import { User, UserRegistration } from '@models/user';
import { AuthorizationCallServiceBase } from './authorization-call.base';
import { environment } from '@environment';
import { take, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Authorization {

  private readonly apiUrl = environment.apiUrl + '/auth';

  private user = signal<User | null>(null);

  authCall: AuthorizationCallServiceBase = new environment.authorizationCallService();

  loggedInUser = this.user.asReadonly();

  login(username: string, password: string) {
    return this.authCall.login(username, password).pipe(
      take(1),
      tap(res => {
        this.user.set(res);
        localStorage.setItem('loggedInUser', JSON.stringify(res));
      })
    );
  }

  signup(userRegistration: UserRegistration) {
    return this.authCall.register(userRegistration).pipe(
      take(1)
    );
  }

  logout() {
    localStorage.removeItem('loggedInUser');
    this.user.set(null);
  }

  isLoggedIn(): boolean {
    const storedUser = localStorage.getItem('loggedInUser');
    this.user.set(storedUser != null ? JSON.parse(storedUser) : null);
    return storedUser != null;
  }

}
