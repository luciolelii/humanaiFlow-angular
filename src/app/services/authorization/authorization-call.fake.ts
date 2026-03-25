import { Observable } from "rxjs";
import { AuthorizationCallServiceBase } from "./authorization-call.base";
import { ChangePasswordRequest, User, UserRegistration } from "@models/user";

export class AuthorizationCallFakeService extends AuthorizationCallServiceBase {


    private users: UserRegistration[] = [
        { username: 'testuser', email: 'testuser@example.com', password: 'password123', fullname: 'Test User' },
    ];

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
            observer.next(user);
            observer.complete();
        });
    }

    register(userRegistration: UserRegistration): Observable<void> {
        return new Observable<void>((observer) => {
            setTimeout(() => {
                // Simulate a successful registration response
                if (this.users.find(user => user.email === userRegistration.email)) {
                    observer.error(new Error('Email already exists'));
                    return;
                }
                this.users.push(userRegistration);
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
}
