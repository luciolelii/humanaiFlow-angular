import { FieldState } from "@angular/forms/signals";

/**
 * Utility class for Angular signal-based form validation.
 * Extend or inject in components that need field-level validation checks.
 */
export class FormUtility {
  /**
   * Returns `true` when the field has been touched, modified, and is currently invalid.
   * Use this to conditionally show validation messages in templates.
   */
  isInvalid(input: FieldState<any>) {
    if (input.touched() && input.dirty() && input.invalid()) {
      return true;
    }
    return false;
  }
}
