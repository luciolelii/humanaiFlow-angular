import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { AdminUser, UserRole } from '@models/user';
import { Router } from '@angular/router';
import { AdminService } from '@services/admin/admin';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { AdminResetPasswordDialogComponent } from '@shared/admin-reset-password-dialog/admin-reset-password-dialog';

@Component({
  selector: 'app-admin-users-list-page',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    AdminResetPasswordDialogComponent
  ],
  templateUrl: './admin-users-list.html',
  styleUrl: './admin-users-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUsersListPage {
  private adminService = inject(AdminService);
  private confirmDialog = inject(ConfirmDialogService);
  private router = inject(Router);

  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(true);
  readonly pageError = signal<string | null>(null);
  readonly roleSavingByUser = signal<Record<string, boolean>>({});
  readonly roleErrorByUser = signal<Record<string, string | null>>({});
  readonly deleteBusyByUser = signal<Record<string, boolean>>({});
  readonly roleDraftByUser = signal<Record<string, UserRole>>({});
  readonly resetPasswordDialogUser = signal<AdminUser | null>(null);
  readonly resetPasswordSaving = signal(false);
  readonly resetPasswordError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.pageError.set(null);
    this.adminService.listAdminUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.roleDraftByUser.set(
          users.reduce<Record<string, UserRole>>((acc, user) => {
            acc[user.username] = user.role;
            return acc;
          }, {})
        );
        this.loading.set(false);
      },
      error: (error) => {
        if (this.redirectOnAdminAccessDenied(error)) return;
        this.pageError.set(error instanceof Error ? error.message : 'Unable to load users.');
        this.loading.set(false);
      }
    });
  }

  roleDraft(username: string): UserRole {
    return this.roleDraftByUser()[username] ?? 'USER';
  }

  setRoleDraft(username: string, role: UserRole) {
    this.roleDraftByUser.update((current) => ({ ...current, [username]: role }));
    this.roleErrorByUser.update((current) => ({ ...current, [username]: null }));
  }

  saveRole(user: AdminUser) {
    const nextRole = this.roleDraft(user.username);
    if (nextRole === user.role) return;

    this.roleSavingByUser.update((current) => ({ ...current, [user.username]: true }));
    this.roleErrorByUser.update((current) => ({ ...current, [user.username]: null }));
    this.adminService.changeAdminUserRole(user.username, { role: nextRole }).subscribe({
      next: () => {
        this.roleSavingByUser.update((current) => ({ ...current, [user.username]: false }));
        this.successMessage.set(`Role updated for ${user.username}.`);
        this.loadUsers();
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        if (this.redirectOnAdminAccessDenied(error)) return;
        this.roleSavingByUser.update((current) => ({ ...current, [user.username]: false }));
        this.roleErrorByUser.update((current) => ({
          ...current,
          [user.username]: error instanceof Error ? error.message : 'Unable to update role.'
        }));
      }
    });
  }

  openResetPasswordDialog(user: AdminUser) {
    this.resetPasswordError.set(null);
    this.resetPasswordDialogUser.set(user);
  }

  closeResetPasswordDialog() {
    if (this.resetPasswordSaving()) return;
    this.resetPasswordDialogUser.set(null);
    this.resetPasswordError.set(null);
  }

  submitResetPassword(event: { username: string; newPassword: string }) {
    this.resetPasswordSaving.set(true);
    this.resetPasswordError.set(null);
    this.adminService.changeAdminUserPassword(event.username, { newPassword: event.newPassword }).subscribe({
      next: () => {
        this.resetPasswordSaving.set(false);
        this.resetPasswordDialogUser.set(null);
        this.successMessage.set(`Password updated for ${event.username}.`);
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        if (this.redirectOnAdminAccessDenied(error)) return;
        this.resetPasswordSaving.set(false);
        this.resetPasswordError.set(error instanceof Error ? error.message : 'Unable to update password.');
      }
    });
  }

  async deleteUser(user: AdminUser) {
    const confirmed = await this.confirmDialog.open(`Delete user ${user.username}?`);
    if (!confirmed) return;

    this.deleteBusyByUser.update((current) => ({ ...current, [user.username]: true }));
    this.adminService.deleteAdminUser(user.username).subscribe({
      next: () => {
        this.deleteBusyByUser.update((current) => ({ ...current, [user.username]: false }));
        this.successMessage.set(`User ${user.username} deleted.`);
        this.loadUsers();
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        if (this.redirectOnAdminAccessDenied(error)) return;
        this.deleteBusyByUser.update((current) => ({ ...current, [user.username]: false }));
        this.roleErrorByUser.update((current) => ({
          ...current,
          [user.username]: error instanceof Error ? error.message : 'Unable to delete user.'
        }));
      }
    });
  }

  private redirectOnAdminAccessDenied(error: unknown): boolean {
    const message = error instanceof Error ? error.message : '';
    if (message !== 'Admin access required.') return false;

    this.loading.set(false);
    this.resetPasswordSaving.set(false);
    this.router.navigateByUrl('/editor');
    return true;
  }
}
