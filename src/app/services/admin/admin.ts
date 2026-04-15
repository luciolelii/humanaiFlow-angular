import { Injectable } from '@angular/core';
import {
  AdminChangeRoleRequest,
  AdminCreateUserRequest,
  AdminResetPasswordRequest,
  OperationsStatistics,
  UserStatistics
} from '@models/user';
import { environment } from '@environment';
import { take } from 'rxjs';
import { AdminCallServiceBase } from './admin-call.base';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  adminCall: AdminCallServiceBase = new environment.adminCallService();

  listAdminUsers() {
    return this.adminCall.listAdminUsers().pipe(
      take(1)
    );
  }

  createAdminUser(request: AdminCreateUserRequest) {
    return this.adminCall.createAdminUser(request).pipe(
      take(1)
    );
  }

  changeAdminUserPassword(username: string, request: AdminResetPasswordRequest) {
    return this.adminCall.changeAdminUserPassword(username, request).pipe(
      take(1)
    );
  }

  changeAdminUserRole(username: string, request: AdminChangeRoleRequest) {
    return this.adminCall.changeAdminUserRole(username, request).pipe(
      take(1)
    );
  }

  deleteAdminUser(username: string) {
    return this.adminCall.deleteAdminUser(username).pipe(
      take(1)
    );
  }

  getOperationsStatistics() {
    return this.adminCall.getOperationsStatistics().pipe(
      take(1)
    );
  }

  listStatisticsUsers() {
    return this.adminCall.listStatisticsUsers().pipe(
      take(1)
    );
  }

  getUserStatistics(username: string) {
    return this.adminCall.getUserStatistics(username).pipe(
      take(1)
    );
  }
}
