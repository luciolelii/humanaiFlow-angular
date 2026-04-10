export function hasValidPasswordComplexity(value: string): boolean {
  return /^\S+$/.test(value)
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

export type PasswordCheck = { label: string; satisfied: boolean };

export function evaluatePasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', satisfied: password.length >= 8 },
    { label: 'At least one lowercase letter', satisfied: /[a-z]/.test(password) },
    { label: 'At least one uppercase letter', satisfied: /[A-Z]/.test(password) },
    { label: 'At least one number', satisfied: /\d/.test(password) },
    { label: 'At least one special character', satisfied: /[^A-Za-z0-9]/.test(password) },
    { label: 'No spaces', satisfied: /^\S*$/.test(password) }
  ];
}

export function initialPasswordChecks(): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', satisfied: false },
    { label: 'At least one lowercase letter', satisfied: false },
    { label: 'At least one uppercase letter', satisfied: false },
    { label: 'At least one number', satisfied: false },
    { label: 'At least one special character', satisfied: false },
    { label: 'No spaces', satisfied: true }
  ];
}
