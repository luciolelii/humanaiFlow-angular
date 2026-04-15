import { Observable, of, throwError } from "rxjs";
import { AuthorizationCallServiceBase } from "./authorization-call.base";
import {
  ChangePasswordRequest,
  User,
  UserRegistration,
  UserRole
} from "@models/user";

export class AuthorizationCallFakeService extends AuthorizationCallServiceBase {


    private users: Array<UserRegistration & { role: UserRole }> = [
        { username: 'testuser', email: 'testuser@example.com', password: 'Password123!', role: 'USER' },
        { username: 'adminuser', email: 'admin@example.com', password: 'Adminpass1!', role: 'ADMIN' },
    ];
    private currentUsername: string | null = null;

    login(username: string, password: string): Observable<User> {
        return new Observable<User>((observer) => {
            const user = this.users.find(u => u.username === username);
            if (!user) {
                observer.error(new Error('User not found'));
                return;
            }
            if (password !== user.password) {
                observer.error(new Error(`Invalid password for ${username}`));
                return;
            }
            observer.next({
                username: user.username,
                email: user.email,
                role: user.role
            });
            this.currentUsername = user.username;
            observer.complete();
        });
    }

    currentUser(): Observable<User> {
        const user = this.currentUsername
            ? this.users.find((candidate) => candidate.username === this.currentUsername)
            : null;
        if (!user) {
            return throwError(() => new Error('Unauthenticated'));
        }
        return of({
            username: user.username,
            email: user.email,
            role: user.role
        });
    }

    register(userRegistration: UserRegistration): Observable<void> {
        return new Observable<void>((observer) => {
            setTimeout(() => {
                // Simulate a successful registration response
                if (!userRegistration.username || !userRegistration.password || !userRegistration.email) {
                    observer.error(new Error('Username, password and email are required'));
                    return;
                }
                if (this.users.find(user => user.username === userRegistration.username)) {
                    observer.error(new Error('the user already exists'));
                    return;
                }
                this.users.push({ ...userRegistration, role: 'USER' });
                observer.next();
                observer.complete();
            }, 3000);
        });
    }

    changePassword(request: ChangePasswordRequest): Observable<void> {
        return new Observable<void>((observer) => {
            const user = this.users.find(u => u.username === request.username);
            if (!user) {
                observer.error(new Error('User not found'));
                return;
            }
            if (user.password !== request.oldPassword) {
                observer.error(new Error('Current password is invalid'));
                return;
            }
            user.password = request.newPassword;
            observer.next();
            observer.complete();
        });
    }

    logout(): Observable<void> {
        this.currentUsername = null;
        return of(undefined);
    }
}
