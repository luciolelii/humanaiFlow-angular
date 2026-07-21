import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Field, form, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ChangePasswordRequest } from '@models/user';
import { FormUtility } from '@utilities/form-utility';
import { evaluatePasswordChecks } from '@utilities/password-validation';
import { applyConfirmPasswordValidators, applyNewPasswordValidators } from '@utilities/password-form-validators';

@Component({
  selector: 'app-change-password-dialog',
  imports: [FormsModule, Field, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './change-password-dialog.html',
  styleUrl: './change-password-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChangePasswordDialogComponent extends FormUtility {
  readonly username = input.required<string>();
  readonly saving = input(false);
  readonly submitError = input<string | null>(null);

  readonly closed = output<void>();
  readonly submitted = output<ChangePasswordRequest>();

  readonly hideOldPassword = signal(true);
  readonly hideNewPassword = signal(true);
  readonly hideConfirmPassword = signal(true);

  readonly model = signal({
    oldPassword: '',
    newPassword: '',
    confirmNewPassword: ''
  });

  readonly passwordForm = form(this.model, (model) => {
    required(model.oldPassword, { message: 'Current password is required' });
    applyNewPasswordValidators(model.newPassword);
    applyConfirmPasswordValidators(model.confirmNewPassword, model.newPassword);
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
      oldPassword: this.model().oldPassword,
      newPassword: this.model().newPassword
    });
  }
}
