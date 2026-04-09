import { Observable, of } from "rxjs";
import { AuthorizationCallServiceBase } from "./authorization-call.base";
import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  AdminUser,
  ChangePasswordRequest,
  OperationsStatistics,
  User,
  UserRegistration,
  UserStatistics,
  UserRole
} from "@models/user";

export class AuthorizationCallFakeService extends AuthorizationCallServiceBase {


    private users: Array<UserRegistration & { role: UserRole }> = [
        { username: 'testuser', email: 'testuser@example.com', password: 'Password123!', role: 'USER' },
        { username: 'adminuser', email: 'admin@example.com', password: 'Adminpass1!', role: 'ADMIN' },
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
            observer.next({
                username: user.username,
                email: user.email,
                role: user.role
            });
            observer.complete();
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

    listAdminUsers(): Observable<AdminUser[]> {
        return new Observable<AdminUser[]>((observer) => {
            observer.next(this.users.map((user) => ({
                username: user.username,
                email: user.email,
                role: user.role
            })));
            observer.complete();
        });
    }

    createAdminUser(request: AdminCreateUserRequest): Observable<void> {
        return new Observable<void>((observer) => {
            if (!request.username || !request.password || !request.email) {
                observer.error(new Error('username, password and email are required'));
                return;
            }
            if (this.users.find((user) => user.username === request.username)) {
                observer.error(new Error('the user already exists'));
                return;
            }
            this.users.push({
                username: request.username,
                password: request.password,
                email: request.email,
                role: request.role === 'ADMIN' ? 'ADMIN' : 'USER'
            });
            observer.next();
            observer.complete();
        });
    }

    changeAdminUserPassword(username: string, request: AdminResetPasswordRequest): Observable<void> {
        return new Observable<void>((observer) => {
            const user = this.users.find((candidate) => candidate.username === username);
            if (!user) {
                observer.error(new Error(`User ${username} not found`));
                return;
            }
            if (!request.newPassword) {
                observer.error(new Error('username and newPassword are required'));
                return;
            }
            user.password = request.newPassword;
            observer.next();
            observer.complete();
        });
    }

    changeAdminUserRole(username: string, request: AdminChangeRoleRequest): Observable<void> {
        return new Observable<void>((observer) => {
            const user = this.users.find((candidate) => candidate.username === username);
            if (!user) {
                observer.error(new Error(`User ${username} not found`));
                return;
            }
            const nextRole: UserRole = request.role === 'ADMIN' ? 'ADMIN' : request.role === 'USER' ? 'USER' : null as never;
            if (!nextRole) {
                observer.error(new Error('INVALID_ROLE'));
                return;
            }
            if (user.role === 'ADMIN' && nextRole !== 'ADMIN' && this.users.filter((candidate) => candidate.role === 'ADMIN').length === 1) {
                observer.error(new Error('LAST_ADMIN'));
                return;
            }
            user.role = nextRole;
            observer.next();
            observer.complete();
        });
    }

    deleteAdminUser(username: string): Observable<void> {
        return new Observable<void>((observer) => {
            const userIndex = this.users.findIndex((candidate) => candidate.username === username);
            if (userIndex < 0) {
                observer.error(new Error(`User ${username} not found`));
                return;
            }
            if (this.users[userIndex].role === 'ADMIN' && this.users.filter((candidate) => candidate.role === 'ADMIN').length === 1) {
                observer.error(new Error('LAST_ADMIN'));
                return;
            }
            this.users.splice(userIndex, 1);
            observer.next();
            observer.complete();
        });
    }

    getOperationsStatistics(): Observable<OperationsStatistics> {
        return new Observable<OperationsStatistics>((observer) => {
            observer.next({
                usersCount: this.users.length,
                flowsCreated: 7,
                flowsPublished: 3,
                flowsFinalized: 0,
                executionsCreated: 0,
                executionsRunning: 0,
                executionsSucceeded: 0,
                executionsFailed: 0,
                simulationsStarted: 0,
                lastFlowUpdateAt: '2026-03-26T12:18:06.100822',
                lastExecutionAt: null
            });
            observer.complete();
        });
    }

    listStatisticsUsers(): Observable<string[]> {
        return new Observable<string[]>((observer) => {
            observer.next(this.users.map((user) => user.username));
            observer.complete();
        });
    }

    getUserStatistics(username: string): Observable<UserStatistics> {
        return new Observable<UserStatistics>((observer) => {
            const user = this.users.find((candidate) => candidate.username === username);
            if (!user) {
                observer.error(new Error('User not found'));
                return;
            }
            observer.next(this.buildStatistics(username));
            observer.complete();
        });
    }

    private buildStatistics(username: string): UserStatistics {
        const base = username.length;
        return {
            username,
            flowsCreated: base + 2,
            flowsPublished: Math.max(0, base - 2),
            flowsFinalized: Math.max(0, base - 4),
            executionsCreated: base * 3,
            executionsRunning: base % 3,
            executionsSucceeded: base * 2,
            executionsFailed: base % 5,
            simulationsStarted: Math.max(0, base - 5),
            lastFlowUpdateAt: '2026-03-26T10:15:30',
            lastExecutionAt: 1774520966139
        };
    }

    logout(): Observable<void> {
        return of(undefined);
    }
}
