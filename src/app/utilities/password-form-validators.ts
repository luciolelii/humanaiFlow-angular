import { minLength, PathKind, required, SchemaPath, SchemaPathRules, validate } from '@angular/forms/signals';
import { hasValidPasswordComplexity, PASSWORD_MIN_LENGTH } from './password-validation';

type PasswordFieldPath = SchemaPath<string, SchemaPathRules.Supported, PathKind.Root>;

/**
 * Shared "new password" schema rules (required, min length, complexity) for the
 * signal-forms `form()` callback. Used by both the self-service change-password
 * dialog and the admin reset-password dialog, which otherwise duplicated this
 * validator chain verbatim.
 */
export function applyNewPasswordValidators(field: PasswordFieldPath): void {
  required(field, { message: 'New password is required' });
  minLength(field, PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` });
  validate(field, ({ value }) => {
    const password = value();
    if (!password || hasValidPasswordComplexity(password)) return null;
    return {
      kind: 'passwordComplexity',
      message: 'Password must include uppercase, lowercase, number and special character, with no spaces.'
    };
  });
}

/** Shared "confirm new password" schema rules (required, must match `newPasswordField`). */
export function applyConfirmPasswordValidators(confirmField: PasswordFieldPath, newPasswordField: PasswordFieldPath): void {
  required(confirmField, { message: 'Confirm your new password' });
  validate(confirmField, ({ value, valueOf }) => {
    if (value() !== valueOf(newPasswordField)) {
      return {
        kind: 'passwordMismatch',
        message: 'Passwords do not match'
      };
    }
    return null;
  });
}
