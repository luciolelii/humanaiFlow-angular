import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field, form, minLength, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormUtility } from '@utilities/form-utility';

function hasValidPasswordComplexity(value: string): boolean {
  return /^\S+$/.test(value)
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

@Component({
  selector: 'app-admin-reset-password-dialog',
  imports: [FormsModule, Field, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './admin-reset-password-dialog.html',
  styleUrl: './admin-reset-password-dialog.css'
})
export class AdminResetPasswordDialogComponent extends FormUtility {
  readonly username = input.required<string>();
  readonly saving = input(false);
  readonly submitError = input<string | null>(null);

  readonly closed = output<void>();
  readonly submitted = output<{ username: string; newPassword: string }>();

  readonly hidePassword = signal(true);
  readonly hideConfirmPassword = signal(true);

  readonly model = signal({
    newPassword: '',
    confirmNewPassword: ''
  });

  readonly passwordForm = form(this.model, (model) => {
    required(model.newPassword, { message: 'New password is required' });
    minLength(model.newPassword, 8, { message: 'Password must be at least 8 characters long' });
    validate(model.newPassword, ({ value }) => {
      const password = value();
      if (!password || hasValidPasswordComplexity(password)) return null;
      return {
        kind: 'passwordComplexity',
        message: 'Password must include uppercase, lowercase, number and special character, with no spaces.'
      };
    });

    required(model.confirmNewPassword, { message: 'Confirm your new password' });
    validate(model.confirmNewPassword, ({ value, valueOf }) => {
      if (value() !== valueOf(model.newPassword)) {
        return {
          kind: 'passwordMismatch',
          message: 'Passwords do not match'
        };
      }
      return null;
    });
  });

  readonly canSubmit = computed(() => !this.passwordForm().invalid() && !this.saving());
  readonly newPasswordChecks = computed(() => {
    const password = this.model().newPassword;
    return [
      { label: 'At least 8 characters', satisfied: password.length >= 8 },
      { label: 'At least one lowercase letter', satisfied: /[a-z]/.test(password) },
      { label: 'At least one uppercase letter', satisfied: /[A-Z]/.test(password) },
      { label: 'At least one number', satisfied: /\d/.test(password) },
      { label: 'At least one special character', satisfied: /[^A-Za-z0-9]/.test(password) },
      { label: 'No spaces', satisfied: /^\S*$/.test(password) }
    ];
  });

  close(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.saving()) return;
    this.closed.emit();
  }

  submit(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canSubmit()) return;

    this.submitted.emit({
      username: this.username(),
      newPassword: this.model().newPassword
    });
  }
}
