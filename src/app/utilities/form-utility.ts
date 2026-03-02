import { FieldState } from "@angular/forms/signals";

export class FormUtility {
  isInvalid(input: FieldState<any>) {
    if (input.touched() && input.dirty() && input.invalid()) {
      return true;
    }
    return false;
  }
}
