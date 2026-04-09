import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field, form, minLength, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  AdminCreateUserRequest,
  AdminUser,
  UserRole
} from '@models/user';
import { Authorization } from '@services/authorization/authorization';
import { ConfirmDialogService } from '@services/dialogs/confirm-dialog';
import { AdminResetPasswordDialogComponent } from '@shared/admin-reset-password-dialog/admin-reset-password-dialog';
import { FormUtility } from '@utilities/form-utility';

function hasValidPasswordComplexity(value: string): boolean {
  return /^\S+$/.test(value)
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

@Component({
  selector: 'app-admin-users',
  imports: [
    CommonModule,
    FormsModule,
    Field,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    AdminResetPasswordDialogComponent
  ],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUsersPage extends FormUtility {
  private authorization = inject(Authorization);
  private confirmDialog = inject(ConfirmDialogService);

  readonly users = signal<AdminUser[]>([]);
  readonly loading = signal(true);
  readonly pageError = signal<string | null>(null);
  readonly createError = signal<string | null>(null);
  readonly createEmailError = signal<string | null>(null);
  readonly createPasswordError = signal<string | null>(null);
  readonly createSaving = signal(false);
  readonly roleSavingByUser = signal<Record<string, boolean>>({});
  readonly roleErrorByUser = signal<Record<string, string | null>>({});
  readonly deleteBusyByUser = signal<Record<string, boolean>>({});
  readonly resetPasswordDialogUser = signal<AdminUser | null>(null);
  readonly resetPasswordSaving = signal(false);
  readonly resetPasswordError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly roleDraftByUser = signal<Record<string, UserRole>>({});

  readonly createModel = signal<AdminCreateUserRequest>({
    username: '',
    email: '',
    password: '',
    role: 'USER'
  });

  readonly createForm = form(this.createModel, (model) => {
    required(model.username, { message: 'Username is required' });
    minLength(model.username, 3, { message: 'Username must be at least 3 characters' });
    required(model.email, { message: 'Email is required' });
    validate(model.email, ({ value }) => {
      const email = value();
      if (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
      return {
        kind: 'invalidEmail',
        message: 'Invalid email address'
      };
    });
    required(model.password, { message: 'Password is required' });
    minLength(model.password, 8, { message: 'Password must be at least 8 characters long' });
    validate(model.password, ({ value }) => {
      const password = value();
      if (!password || hasValidPasswordComplexity(password)) return null;
      return {
        kind: 'passwordComplexity',
        message: 'Password must include uppercase, lowercase, number and special character, with no spaces.'
      };
    });
  });

  readonly createPasswordChecks = signal([
    { label: 'At least 8 characters', satisfied: false },
    { label: 'At least one lowercase letter', satisfied: false },
    { label: 'At least one uppercase letter', satisfied: false },
    { label: 'At least one number', satisfied: false },
    { label: 'At least one special character', satisfied: false },
    { label: 'No spaces', satisfied: true }
  ]);

  constructor() {
    super();

    effect(() => {
      const password = this.createModel().password;
      this.createPasswordChecks.set([
        { label: 'At least 8 characters', satisfied: password.length >= 8 },
        { label: 'At least one lowercase letter', satisfied: /[a-z]/.test(password) },
        { label: 'At least one uppercase letter', satisfied: /[A-Z]/.test(password) },
        { label: 'At least one number', satisfied: /\d/.test(password) },
        { label: 'At least one special character', satisfied: /[^A-Za-z0-9]/.test(password) },
        { label: 'No spaces', satisfied: /^\S*$/.test(password) }
      ]);
    });
  }

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.pageError.set(null);
    this.authorization.listAdminUsers().subscribe({
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
        this.pageError.set(error instanceof Error ? error.message : 'Unable to load users.');
        this.loading.set(false);
      }
    });
  }

  onCreateUser() {
    if (this.createForm().invalid()) return;

    this.createSaving.set(true);
    this.createError.set(null);
    this.createEmailError.set(null);
    this.createPasswordError.set(null);

    this.authorization.createAdminUser(this.createModel()).subscribe({
      next: () => {
        this.createSaving.set(false);
        this.successMessage.set('User created successfully.');
        this.createModel.set({
          username: '',
          email: '',
          password: '',
          role: 'USER'
        });
        this.loadUsers();
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        this.createSaving.set(false);
        const message = error instanceof Error ? error.message : 'Unable to create user.';
        if (message === 'INVALID_EMAIL') {
          this.createEmailError.set('Invalid email address');
          return;
        }
        if (message === 'INVALID_PASSWORD') {
          this.createPasswordError.set('Password does not satisfy the required policy.');
          return;
        }
        this.createError.set(message);
      }
    });
  }

  roleDraft(username: string): UserRole {
    return this.roleDraftByUser()[username] ?? 'USER';
  }

  setCreateRole(role: UserRole) {
    this.createModel.update((current) => ({
      ...current,
      role
    }));
  }

  setRoleDraft(username: string, role: UserRole) {
    this.roleDraftByUser.update((current) => ({
      ...current,
      [username]: role
    }));
    this.roleErrorByUser.update((current) => ({
      ...current,
      [username]: null
    }));
  }

  saveRole(user: AdminUser) {
    const nextRole = this.roleDraft(user.username);
    if (nextRole === user.role) return;

    this.roleSavingByUser.update((current) => ({ ...current, [user.username]: true }));
    this.roleErrorByUser.update((current) => ({ ...current, [user.username]: null }));
    this.authorization.changeAdminUserRole(user.username, { role: nextRole }).subscribe({
      next: () => {
        this.roleSavingByUser.update((current) => ({ ...current, [user.username]: false }));
        this.successMessage.set(`Role updated for ${user.username}.`);
        this.loadUsers();
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
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
    this.authorization.changeAdminUserPassword(event.username, { newPassword: event.newPassword }).subscribe({
      next: () => {
        this.resetPasswordSaving.set(false);
        this.resetPasswordDialogUser.set(null);
        this.successMessage.set(`Password updated for ${event.username}.`);
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        this.resetPasswordSaving.set(false);
        this.resetPasswordError.set(error instanceof Error ? error.message : 'Unable to update password.');
      }
    });
  }

  async deleteUser(user: AdminUser) {
    const confirmed = await this.confirmDialog.open(`Delete user ${user.username}?`);
    if (!confirmed) return;

    this.deleteBusyByUser.update((current) => ({ ...current, [user.username]: true }));
    this.authorization.deleteAdminUser(user.username).subscribe({
      next: () => {
        this.deleteBusyByUser.update((current) => ({ ...current, [user.username]: false }));
        this.successMessage.set(`User ${user.username} deleted.`);
        this.loadUsers();
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        this.deleteBusyByUser.update((current) => ({ ...current, [user.username]: false }));
        this.roleErrorByUser.update((current) => ({
          ...current,
          [user.username]: error instanceof Error ? error.message : 'Unable to delete user.'
        }));
      }
    });
  }
}
