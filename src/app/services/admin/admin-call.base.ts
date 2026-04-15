import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  AdminUser,
  OperationsStatistics,
  UserStatistics
} from "@models/user";
import { Observable } from "rxjs";

export abstract class AdminCallServiceBase {
  abstract listAdminUsers(): Observable<AdminUser[]>;

  abstract createAdminUser(request: AdminCreateUserRequest): Observable<void>;

  abstract changeAdminUserPassword(username: string, request: AdminResetPasswordRequest): Observable<void>;

  abstract changeAdminUserRole(username: string, request: AdminChangeRoleRequest): Observable<void>;

  abstract deleteAdminUser(username: string): Observable<void>;

  abstract getOperationsStatistics(): Observable<OperationsStatistics>;

  abstract listStatisticsUsers(): Observable<string[]>;

  abstract getUserStatistics(username: string): Observable<UserStatistics>;
}
