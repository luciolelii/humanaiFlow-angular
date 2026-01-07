import { Injectable, signal } from '@angular/core';
import { User, UserRegistration } from '@models/user';
import { AuthorizationCallServiceBase } from './authorization-call.base';
import { environment } from '@environment';
import { take, tap } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class Authorization {

  private readonly apiUrl = environment.apiUrl + '/auth';


  authCall: AuthorizationCallServiceBase = new environment.authorizationCallService();

  private user = signal<User | null>(null);

  loggedInUser = this.user.asReadonly();

  login(username: string, password: string) {
    return this.authCall.login(username, password).pipe(
      take(1),
      tap(res => {
        this.user.set(res);
      })
    );
  }

  signup(userRegistration: UserRegistration) {
    return this.authCall.register(userRegistration).pipe(
      take(1)
    );
  }

  logout() {
    this.user.set(null);
  }

  isLoggedIn(): boolean {
    return this.user() !== null;
  }

  getUsername(): string | null {
    return this.user()?.email || null;
  }

}
