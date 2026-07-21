import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { applyConfirmPasswordValidators, applyNewPasswordValidators } from './password-form-validators';

describe('password-form-validators', () => {
  function buildForm() {
    return TestBed.runInInjectionContext(() => {
      const model = signal({ newPassword: '', confirmNewPassword: '' });
      return form(model, (f) => {
        applyNewPasswordValidators(f.newPassword);
        applyConfirmPasswordValidators(f.confirmNewPassword, f.newPassword);
      });
    });
  }

  it('requires a new password', () => {
    const passwordForm = buildForm();
    expect(passwordForm.newPassword().errors().some((e) => e.kind === 'required')).toBe(true);
  });

  it('flags a new password that is too short', () => {
    const passwordForm = buildForm();
    passwordForm.newPassword().value.set('Ab1!');
    expect(passwordForm.newPassword().errors().some((e) => e.kind === 'minLength')).toBe(true);
  });

  it('flags a new password missing complexity (upper/lower/digit/special)', () => {
    const passwordForm = buildForm();
    passwordForm.newPassword().value.set('alllowercase');
    expect(passwordForm.newPassword().errors().some((e) => e.kind === 'passwordComplexity')).toBe(true);
  });

  it('accepts a new password satisfying length and complexity', () => {
    const passwordForm = buildForm();
    passwordForm.newPassword().value.set('Str0ng!Pass');
    expect(passwordForm.newPassword().errors().length).toBe(0);
  });

  it('requires the confirmation field and flags a mismatch', () => {
    const passwordForm = buildForm();
    passwordForm.newPassword().value.set('Str0ng!Pass');
    expect(passwordForm.confirmNewPassword().errors().some((e) => e.kind === 'required')).toBe(true);

    passwordForm.confirmNewPassword().value.set('Different1!');
    expect(passwordForm.confirmNewPassword().errors().some((e) => e.kind === 'passwordMismatch')).toBe(true);
  });

  it('clears the mismatch error once both passwords match', () => {
    const passwordForm = buildForm();
    passwordForm.newPassword().value.set('Str0ng!Pass');
    passwordForm.confirmNewPassword().value.set('Str0ng!Pass');
    expect(passwordForm.confirmNewPassword().errors().length).toBe(0);
  });
});
