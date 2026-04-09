import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  AdminUser,
  ChangePasswordRequest,
  OperationsStatistics,
  User,
  UserRegistration,
  UserStatistics
} from "@models/user";
import { Observable } from "rxjs";

export abstract class AuthorizationCallServiceBase {
   
    abstract login(username: string, password: string): Observable<User>;

    abstract register(userRegistration: UserRegistration): Observable<void>;

    abstract changePassword(request: ChangePasswordRequest): Observable<void>;

    abstract listAdminUsers(): Observable<AdminUser[]>;

    abstract createAdminUser(request: AdminCreateUserRequest): Observable<void>;

    abstract changeAdminUserPassword(username: string, request: AdminResetPasswordRequest): Observable<void>;

    abstract changeAdminUserRole(username: string, request: AdminChangeRoleRequest): Observable<void>;

    abstract deleteAdminUser(username: string): Observable<void>;

    abstract getOperationsStatistics(): Observable<OperationsStatistics>;

    abstract listStatisticsUsers(): Observable<string[]>;

    abstract getUserStatistics(username: string): Observable<UserStatistics>;

    abstract logout(): Observable<void>;

}
