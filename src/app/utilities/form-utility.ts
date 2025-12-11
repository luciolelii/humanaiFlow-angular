import { NgModel } from "@angular/forms";

export class FormUtility {
  isInvalid(formControl: NgModel) {
    return formControl.touched && formControl.dirty && formControl.invalid;
  }
}
