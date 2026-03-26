import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { Field, form, minLength, required, validate } from '@angular/forms/signals';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AdminCreateUserRequest, UserRole } from '@models/user';
import { Router } from '@angular/router';
import { Authorization } from '@services/authorization/authorization';
import { FormUtility } from '@utilities/form-utility';

function hasValidPasswordComplexity(value: string): boolean {
  return /^\S+$/.test(value)
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

@Component({
  selector: 'app-admin-create-user-page',
  imports: [
    CommonModule,
    FormsModule,
    Field,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './admin-create-user.html',
  styleUrl: './admin-create-user.css'
})
export class AdminCreateUserPage extends FormUtility {
  private authorization = inject(Authorization);
  private router = inject(Router);

  readonly createError = signal<string | null>(null);
  readonly createEmailError = signal<string | null>(null);
  readonly createPasswordError = signal<string | null>(null);
  readonly createSaving = signal(false);
  readonly successMessage = signal<string | null>(null);

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
      return { kind: 'invalidEmail', message: 'Invalid email address' };
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

  setCreateRole(role: UserRole) {
    this.createModel.update((current) => ({ ...current, role }));
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
        setTimeout(() => this.successMessage.set(null), 3000);
      },
      error: (error) => {
        if (this.redirectOnAdminAccessDenied(error)) return;
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

  private redirectOnAdminAccessDenied(error: unknown): boolean {
    const message = error instanceof Error ? error.message : '';
    if (message !== 'Admin access required.') return false;

    this.createSaving.set(false);
    this.router.navigateByUrl('/editor');
    return true;
  }
}
