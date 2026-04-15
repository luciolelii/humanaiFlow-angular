import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field, form, minLength, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormUtility } from '@utilities/form-utility';
import { hasValidPasswordComplexity, evaluatePasswordChecks, PASSWORD_MIN_LENGTH } from '@utilities/password-validation';

@Component({
  selector: 'app-admin-reset-password-dialog',
  imports: [FormsModule, Field, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './admin-reset-password-dialog.html',
  styleUrl: './admin-reset-password-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
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
    minLength(model.newPassword, PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` });
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
  readonly newPasswordChecks = computed(() => evaluatePasswordChecks(this.model().newPassword));

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
